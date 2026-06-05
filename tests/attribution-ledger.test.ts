import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAttributionLedgerData,
  buildAttributionLedgerConversionOnlyDetailData,
  buildAttributionLedgerDetailData,
  buildAttributionLedgerRows,
  type AttributionLedgerConversionRow,
  type AttributionLedgerEventRow,
  type AttributionLedgerSessionRow,
  type AttributionLedgerVisitorRow,
} from "../src/lib/attribution-ledger.ts";
import {
  fetchCustomerJourneyLedgerData,
  fetchCustomerJourneyLedgerDetail,
  normalizeCustomerJourneyLedgerDateRange,
  type CustomerJourneyLedgerClient,
} from "../src/lib/customer-journey-ledger.ts";

describe("attribution ledger row merging", () => {
  it("uses latest conversion booking, customer, and CAPI fields", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          acuity_appointment_id: "1706526506",
          appointment_type: "General Meeting",
          customer_email: "conversion@example.com",
          customer_name: "Conversion Customer",
          customer_phone: "(408) 555-1212",
          meta_capi_status: "sent",
          meta_event_id: "meta-event-1",
          occurred_at: "2026-05-19T18:00:00.000Z",
          session_id: "session-from-conversion",
        }),
      ],
      sessions: [
        sessionRow({
          customer_email: "session@example.com",
          customer_name: "Session Customer",
          session_id: "session-older",
        }),
      ],
      visitors: [
        visitorRow({
          customer_email: "visitor@example.com",
          customer_name: "Visitor Customer",
        }),
      ],
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].customerName, "Conversion Customer");
    assert.equal(rows[0].customerEmail, "conversion@example.com");
    assert.equal(rows[0].customerPhone, "(408) 555-1212");
    assert.equal(rows[0].sessionId, "session-from-conversion");
    assert.equal(rows[0].acuityAppointmentId, "1706526506");
    assert.equal(rows[0].appointmentType, "General Meeting");
    assert.equal(rows[0].bookingTime, "2026-05-19T18:00:00.000Z");
    assert.equal(rows[0].metaEventId, "meta-event-1");
    assert.equal(rows[0].capiStatus, "sent");
    assert.equal(rows[0].hasConversion, true);
  });

  it("surfaces approximate website location in ledger rows and detail", () => {
    const conversion = conversionRow({
      geo_city: "Oakland",
      geo_country: "US",
      geo_region: "CA",
      geo_timezone: "America/Los_Angeles",
    });
    const visitor = visitorRow({
      geo_city: "San Jose",
      geo_country: "US",
      geo_region: "CA",
      geo_timezone: "America/Los_Angeles",
    });
    const session = sessionRow({
      geo_city: "San Francisco",
      geo_country: "US",
      geo_region: "CA",
      geo_timezone: "America/Los_Angeles",
    });

    const rows = buildAttributionLedgerRows({
      conversions: [conversion],
      sessions: [session],
      visitors: [visitor],
    });
    const detail = buildAttributionLedgerDetailData({
      conversions: [conversion],
      events: [],
      sessions: [session],
      visitor,
    });

    assert.equal(rows[0].geoCity, "Oakland");
    assert.equal(rows[0].geoRegion, "CA");
    assert.equal(rows[0].geoCountry, "US");
    assert.equal(rows[0].geoTimezone, "America/Los_Angeles");
    assert.equal(detail.geoCity, "Oakland");
    assert.equal(detail.geoRegion, "CA");
  });

  it("appends conversion-only bookings that have no visitor record", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          acuity_appointment_id: "1709178617",
          appointment_type: "In-Person Custom Design Consultation",
          customer_email: "racelle@example.com",
          customer_name: "Racelle Hong",
          customer_phone: "555-0117",
          event_id: "acuity-1709178617",
          occurred_at: "2026-05-21T22:03:33.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
          source_type: "direct",
          visitor_id: null,
        }),
      ],
      events: [],
      sessions: [],
      visitors: [],
    });

    assert.equal(rows.length, 1);
    assert.equal(rows[0].visitorId, null);
    assert.equal(rows[0].sessionId, null);
    assert.equal(rows[0].conversionEventId, "acuity-1709178617");
    assert.equal(rows[0].acuityAppointmentId, "1709178617");
    assert.equal(rows[0].customerName, "Racelle Hong");
    assert.equal(rows[0].firstPage, "https://www.hungphatusa.com/pages/book-an-appointment");
    assert.equal(rows[0].hasConversion, true);
    assert.equal(rows[0].hasPaidTouch, false);
    assert.equal(rows[0].lastPaidSource, "direct");
  });

  // v3 Phase 2: previously this test asserted rows.length === 0 because
  // the ledger was strictly booking-grain (visitors without conversions
  // were dropped). Track 4a of the spike showed this surfaced as 95%+
  // em-dash rows in /convert and hid browse-but-no-book visitors entirely.
  // The new behavior emits a visitor-only row for each unanchored
  // in-window visitor.
  it("emits a visitor-only row for visitors with no appointment and no conversion", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [],
      sessions: [
        sessionRow({
          customer_email: "session@example.com",
          customer_name: "Session Customer",
          customer_phone: "555-0199",
          last_seen_at: "2026-05-19T19:00:00.000Z",
          session_id: "session-latest",
        }),
      ],
      visitors: [
        visitorRow({
          customer_email: null,
          customer_name: null,
          customer_phone: null,
          first_page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
        }),
      ],
    });

    assert.equal(rows.length, 1, "the unanchored visitor should produce a visitor-only row");
    assert.equal(rows[0].hasConversion, false);
    assert.equal(rows[0].acuityAppointmentId, null);
    assert.equal(rows[0].conversionEventId, null);
    assert.ok(rows[0].visitorId, "visitor-only row must carry visitorId for identification");
    assert.deepEqual(rows[0].stageKeys.includes("visitor_only"), true);
  });

  it("batches related visitor lookups so Supabase request URLs stay bounded", async () => {
    const inFilters: Array<{ table: string; values: unknown[] }> = [];
    const visitors = Array.from({ length: 240 }, (_, index) =>
      visitorRow({
        last_seen_at: `2026-05-19T20:${String(index % 60).padStart(2, "0")}:00.000Z`,
        visitor_id: `visitor-${index}`,
      }),
    );
    const appointments = visitors.map((visitor, index) =>
      appointmentRow({
        appt_id: `acuity:apt-${index}`,
        // The loader windows appointments by booked_at (see
        // fetchCustomerJourneyLedgerData), so booked_at must fall inside the
        // 2026-05-19 range for these to anchor the visitor fan-out.
        booked_at: "2026-05-19T12:00:00.000Z",
        external_booking_id: `apt-${index}`,
        visit_date_time: "2026-05-19T21:00:00.000Z",
      }),
    );
    const conversions = visitors.map((visitor, index) =>
      conversionRow({
        acuity_appointment_id: `apt-${index}`,
        event_id: `conversion-${index}`,
        visitor_id: visitor.visitor_id,
      }),
    );
    const sessions = visitors.map((visitor) =>
      sessionRow({
        last_seen_at: visitor.last_seen_at,
        session_id: `session-${visitor.visitor_id}`,
        visitor_id: visitor.visitor_id,
      }),
    );

    const data = await fetchCustomerJourneyLedgerData(
      {
        endDate: "2026-05-19",
        startDate: "2026-05-19",
      },
      mockCustomerJourneyClient(
        {
          appointment_events: appointments,
          website_conversions: conversions,
          website_events: [],
          website_sessions: sessions,
          website_visitors: visitors,
        },
        {
          onInFilter: (table, values) => inFilters.push({ table, values }),
        },
      ),
    );

    assert.equal(data.rows.length, 240);
    assert.equal(inFilters.filter((filter) => filter.table === "website_visitors").length, 3);
    assert.equal(inFilters.filter((filter) => filter.table === "website_sessions").length, 3);
    // 6 from acuity-id + visitor-id event fetches; +1 from the funnel-active
    // visitor-id seed query (.in("event_name", BOOKING_FORM_EVENT_NAMES)).
    // That .in() uses a fixed-size string list, not a batched ID list, so it
    // doesn't risk unbounded URL length.
    assert.equal(inFilters.filter((filter) => filter.table === "website_events").length, 7);
    // Conversions are now fetched via a single window query (no .in() batching),
    // so only the per-visitor-id fan-out fetch produces .in() filters here.
    assert.equal(inFilters.filter((filter) => filter.table === "website_conversions").length, 3);
    assert.ok(inFilters.every((filter) => filter.values.length <= 100));
  });

  it("uses the conversion session before a later visitor session for paid touch context", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          conversion_touch: null,
          last_paid_touch: null,
          properties: null,
          raw_json: null,
          session_id: "booking-session",
          source_type: null,
        }),
      ],
      sessions: [
        sessionRow({
          last_paid_touch: {
            source: "shopify_browser",
            sourceType: "paid_meta",
            utm: {
              campaignId: "booking-campaign",
              source: "facebook",
            },
          },
          last_seen_at: "2026-05-19T18:20:00.000Z",
          session_id: "booking-session",
        }),
        sessionRow({
          last_paid_touch: {
            source: "shopify_browser",
            sourceType: "paid_meta",
            utm: {
              campaignId: "post-booking-campaign",
              source: "instagram",
            },
          },
          last_seen_at: "2026-05-20T18:00:00.000Z",
          session_id: "post-booking-session",
        }),
      ],
      visitors: [visitorRow({ last_paid_touch: null })],
    });

    assert.equal(rows[0].sessionId, "booking-session");
    assert.equal(rows[0].campaignId, "booking-campaign");
    assert.equal(rows[0].lastPaidSource, "facebook");
    assert.equal(rows[0].hasPaidTouch, true);
  });

  it("does not treat device-only event rows as paid touch candidates", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          conversion_touch: null,
          last_paid_touch: null,
          properties: null,
          raw_json: null,
          source_type: null,
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-device-only",
          fbc: null,
          fbp: null,
          fbclid: null,
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
          properties: null,
          raw_json: null,
          referrer: null,
          source: null,
          source_type: null,
          utm_ad: null,
          utm_ad_id: null,
          utm_adset: null,
          utm_adset_id: null,
          utm_campaign: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_creative: null,
          utm_id: null,
          utm_medium: null,
          utm_placement: null,
          utm_source: null,
          utm_term: null,
        }),
      ],
      sessions: [],
      visitors: [
        visitorRow({
          fbc: null,
          fbp: null,
          last_paid_touch: null,
        }),
      ],
    });

    assert.equal(rows[0].hasPaidTouch, false);
    assert.equal(rows[0].lastPaidSource, null);
  });

  it("summarizes journey rows without counting null CAPI statuses", () => {
    const data = buildAttributionLedgerData({
      conversions: [
        conversionRow({
          meta_capi_status: "sent",
          visitor_id: "visitor-1",
        }),
        conversionRow({
          event_id: "conversion-2",
          meta_capi_status: null,
          properties: null,
          raw_json: null,
          source_type: null,
          visitor_id: "visitor-2",
        }),
      ],
      events: [],
      range: { days: 7, end: "2026-05-21", start: "2026-05-15" },
      sessions: [],
      visitors: [
        visitorRow({ visitor_id: "visitor-1" }),
        visitorRow({ last_paid_touch: null, visitor_id: "visitor-2" }),
        visitorRow({
          customer_email: null,
          customer_name: null,
          last_paid_touch: null,
          last_seen_at: "2026-05-19T19:00:00.000Z",
          visitor_id: "visitor-3",
        }),
      ],
    });

    // v3 Phase 2: rows.length is 3 (was 2). visitor-3 has no conversion
    // and no appointment, so it now produces a visitor-only row alongside
    // the two conversion-anchored rows.
    assert.equal(data.rows.length, 3);
    assert.equal(data.summary.visitorsShown, 3);
    assert.equal(data.summary.visitorsWithConversions, 2);
    assert.equal(data.summary.visitorsWithPaidTouch, 1);
    assert.deepEqual(data.summary.capiStatuses, [{ count: 1, status: "sent" }]);
  });

  it("counts visitors shown from visitor rows, not booking-only rows", () => {
    const data = buildAttributionLedgerData({
      conversions: [
        conversionRow({
          event_id: "conversion-visitor",
          visitor_id: "visitor-1",
        }),
        conversionRow({
          event_id: "conversion-without-visitor",
          visitor_id: null,
        }),
        conversionRow({
          event_id: "conversion-orphaned-visitor",
          visitor_id: "visitor-orphan",
        }),
      ],
      events: [],
      range: { days: 7, end: "2026-05-21", start: "2026-05-15" },
      sessions: [],
      visitors: [visitorRow({ visitor_id: "visitor-1" })],
    });

    assert.equal(data.rows.length, 3);
    assert.equal(data.summary.visitorsShown, 1);
    assert.equal(data.summary.visitorsWithConversions, 3);
  });

  it("normalizes shared ledger date ranges from days or explicit dates", () => {
    assert.deepEqual(
      normalizeCustomerJourneyLedgerDateRange({
        days: 7,
        endDate: "2026-05-21",
      }),
      { days: 7, end: "2026-05-21", start: "2026-05-15" },
    );

    assert.deepEqual(
      normalizeCustomerJourneyLedgerDateRange({
        endDate: "2026-05-21",
        startDate: "2026-05-01",
      }),
      { days: 21, end: "2026-05-21", start: "2026-05-01" },
    );
  });

  it("resolves paid ad IDs from fallback touch JSON", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          last_paid_touch: {
            source: "shopify_browser",
            sourceType: "paid_meta",
            utm: {
              adId: "238-ad",
              adsetId: "238-adset",
              campaignId: "238-campaign",
              placement: "instagram_stories",
              source: "facebook",
            },
          },
        }),
      ],
      sessions: [],
      visitors: [visitorRow({ last_paid_touch: null })],
    });

    assert.equal(rows[0].lastPaidSource, "facebook");
    assert.equal(rows[0].campaignId, "238-campaign");
    assert.equal(rows[0].adsetId, "238-adset");
    assert.equal(rows[0].adId, "238-ad");
    assert.equal(rows[0].placement, "instagram_stories");
    assert.equal(rows[0].hasPaidTouch, true);
  });

  it("credits richer conversion ad context over later Instagram link-in-bio touch", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          acuity_appointment_id: "1708622080",
          last_paid_touch: {
            capturedAt: "2026-05-20T23:49:18.756Z",
            eventName: "Schedule",
            source: "booking_api",
            sourceType: "paid_meta",
            utm: {
              adId: "120244031602180650",
              adsetId: "120242517363420650",
              campaignId: "120234691669940650",
              medium: "paid_social",
              placement: "Instagram_Stories",
              source: "ig",
            },
          },
          occurred_at: "2026-05-20T23:49:18.756Z",
        }),
      ],
      sessions: [],
      visitors: [
        visitorRow({
          last_paid_touch: {
            capturedAt: "2026-05-20T23:49:27.795Z",
            eventName: "Engaged60Seconds",
            source: "shopify_browser",
            sourceType: "paid_meta",
            utm: {
              content: "link_in_bio",
              fbclid: "link-in-bio-click",
              medium: "social",
              source: "ig",
            },
          },
        }),
      ],
    });

    assert.equal(rows[0].campaignId, "120234691669940650");
    assert.equal(rows[0].adsetId, "120242517363420650");
    assert.equal(rows[0].adId, "120244031602180650");
    assert.equal(rows[0].placement, "Instagram_Stories");
    assert.equal(rows[0].lastPaidSource, "ig");
  });

  it("resolves paid ad IDs from nested conversion attribution JSON", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          acuity_appointment_id: "1708622080",
          last_paid_touch: linkInBioTouch("2026-05-20T23:49:18.756Z"),
          occurred_at: "2026-05-20T23:49:18.756Z",
          properties: {
            attribution: {
              capturedAt: "2026-05-20T22:59:07.892Z",
              fbc: "fb.1.1779317947891.original-click",
              fbp: "fb.1.1779317947891.123",
              utm: {
                adId: "120244031602180650",
                adsetId: "120242517363420650",
                campaignId: "120234691669940650",
                content: "DM_IG_HeyBeyArea",
                medium: "paid_social",
                placement: "Instagram_Stories",
                source: "ig",
              },
            },
          },
        }),
      ],
      sessions: [],
      visitors: [
        visitorRow({
          last_paid_touch: linkInBioTouch("2026-05-20T23:49:27.795Z"),
        }),
      ],
    });

    assert.equal(rows[0].campaignId, "120234691669940650");
    assert.equal(rows[0].adsetId, "120242517363420650");
    assert.equal(rows[0].adId, "120244031602180650");
    assert.equal(rows[0].placement, "Instagram_Stories");
  });

  it("resolves paid ad IDs from event raw attribution JSON", () => {
    const rows = buildAttributionLedgerRows({
      conversions: [
        conversionRow({
          acuity_appointment_id: "1708622080",
          last_paid_touch: linkInBioTouch("2026-05-20T23:49:18.756Z"),
          occurred_at: "2026-05-20T23:49:18.756Z",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-paid",
          occurred_at: "2026-05-20T23:48:27.772Z",
          raw_json: {
            attribution: {
              capturedAt: "2026-05-20T22:59:07.892Z",
              utm: {
                adId: "120244031602180650",
                adsetId: "120242517363420650",
                campaignId: "120234691669940650",
                medium: "paid_social",
                placement: "Instagram_Stories",
                source: "ig",
              },
            },
          },
        }),
      ],
      sessions: [],
      visitors: [
        visitorRow({
          last_paid_touch: linkInBioTouch("2026-05-20T23:49:27.795Z"),
        }),
      ],
    });

    assert.equal(rows[0].campaignId, "120234691669940650");
    assert.equal(rows[0].adsetId, "120242517363420650");
    assert.equal(rows[0].adId, "120244031602180650");
    assert.equal(rows[0].placement, "Instagram_Stories");
  });
});

describe("attribution ledger detail data", () => {
  it("builds booking-only detail when no visitor or session was captured", () => {
    const detail = buildAttributionLedgerConversionOnlyDetailData({
      conversion: conversionRow({
        acuity_appointment_id: "1709178617",
        appointment_type: "In-Person Custom Design Consultation",
        customer_name: "Racelle Hong",
        event_id: "acuity-1709178617",
        occurred_at: "2026-05-21T22:03:33.000Z",
        source_type: "direct",
        visitor_id: null,
      }),
    });

    assert.equal(detail.visitorId, null);
    assert.equal(detail.acuityAppointmentId, "1709178617");
    assert.equal(detail.booking?.eventId, "acuity-1709178617");
    assert.equal(detail.confidence.level, "conversion_only");
    assert.match(detail.summary || "", /no browser visitor\/session ID/i);
    assert.deepEqual(
      detail.timeline.map((event) => event.label),
      ["Acuity booking created"],
    );
  });

  it("falls back to booking-only detail when a conversion points at a missing visitor", async () => {
    const detail = await fetchCustomerJourneyLedgerDetail(
      {
        acuityAppointmentId: "apt-X",
        visitorId: "visitor-orphan",
      },
      mockCustomerJourneyClient({
        website_conversions: [
          conversionRow({
            acuity_appointment_id: "apt-X",
            event_id: "acuity-apt-X",
            occurred_at: "2026-05-21T19:00:00.000Z",
            source_type: "direct",
            visitor_id: "visitor-orphan",
          }),
        ],
        website_events: [],
        website_sessions: [],
        website_visitors: [],
      }),
    );

    assert.ok(detail);
    assert.equal(detail.acuityAppointmentId, "apt-X");
    assert.equal(detail.visitorId, "visitor-orphan");
    assert.equal(detail.confidence.level, "conversion_only");
    assert.deepEqual(
      detail.timeline.map((event) => event.label),
      ["Acuity booking created"],
    );
  });

  it("looks up full visitor detail by Acuity appointment ID", async () => {
    const detail = await fetchCustomerJourneyLedgerDetail(
      { acuityAppointmentId: "apt-full" },
      mockCustomerJourneyClient({
        appointment_events: [
          appointmentRow({ external_booking_id: "apt-full", visit_date_time: "2026-05-21T19:00:00.000Z" }),
        ],
        website_conversions: [
          conversionRow({
            acuity_appointment_id: "apt-full",
            event_id: "acuity-apt-full",
            occurred_at: "2026-05-21T18:00:00.000Z",
            session_id: "session-full",
            visitor_id: "visitor-1",
          }),
        ],
        website_events: [
          eventRow({
            acuity_appointment_id: "apt-full",
            event_id: "acuity-apt-full",
            event_name: "Schedule",
            event_type: "conversion",
            occurred_at: "2026-05-21T18:00:00.000Z",
            session_id: "session-full",
            visitor_id: "visitor-1",
          }),
        ],
        website_sessions: [sessionRow({ session_id: "session-full", visitor_id: "visitor-1" })],
        website_visitors: [visitorRow({ visitor_id: "visitor-1" })],
      }),
    );

    assert.ok(detail);
    assert.equal(detail.visitorId, "visitor-1");
    assert.equal(detail.acuityAppointmentId, "apt-full");
    assert.equal(detail.appointmentVisitDateTime, "2026-05-21T19:00:00.000Z");
    assert.equal(detail.confidence.level, "browser_session");
  });

  it("looks up conversion-only detail by Acuity appointment ID", async () => {
    const detail = await fetchCustomerJourneyLedgerDetail(
      { acuityAppointmentId: "apt-conversion-only" },
      mockCustomerJourneyClient({
        appointment_events: [
          appointmentRow({ external_booking_id: "apt-conversion-only", visit_date_time: "2026-05-21T19:00:00.000Z" }),
        ],
        website_conversions: [
          conversionRow({
            acuity_appointment_id: "apt-conversion-only",
            event_id: "acuity-apt-conversion-only",
            visitor_id: null,
          }),
        ],
        website_events: [],
        website_sessions: [],
        website_visitors: [],
      }),
    );

    assert.ok(detail);
    assert.equal(detail.confidence.level, "conversion_only");
    assert.equal(detail.appointmentVisitDateTime, "2026-05-21T19:00:00.000Z");
    assert.equal(detail.booking?.eventId, "acuity-apt-conversion-only");
  });

  it("looks up event-only detail by Acuity appointment ID", async () => {
    const detail = await fetchCustomerJourneyLedgerDetail(
      { acuityAppointmentId: "apt-event-only" },
      mockCustomerJourneyClient({
        appointment_events: [
          appointmentRow({ external_booking_id: "apt-event-only", visit_date_time: "2026-05-21T19:00:00.000Z" }),
        ],
        website_conversions: [],
        website_events: [
          eventRow({
            acuity_appointment_id: "apt-event-only",
            event_id: "acuity-apt-event-only",
            event_name: "Schedule",
            event_type: "conversion",
            visitor_id: null,
          }),
        ],
        website_sessions: [],
        website_visitors: [],
      }),
    );

    assert.ok(detail);
    assert.equal(detail.confidence.level, "appointment_only");
    assert.equal(detail.booking?.eventId, "acuity-apt-event-only");
    assert.equal(detail.appointmentVisitDateTime, "2026-05-21T19:00:00.000Z");
  });

  it("looks up appointment-only detail by Acuity appointment ID", async () => {
    const detail = await fetchCustomerJourneyLedgerDetail(
      { acuityAppointmentId: "apt-appointment-only" },
      mockCustomerJourneyClient({
        appointment_events: [
          appointmentRow({ external_booking_id: "apt-appointment-only", visit_date_time: "2026-05-21T19:00:00.000Z" }),
        ],
        website_conversions: [],
        website_events: [],
        website_sessions: [],
        website_visitors: [],
      }),
    );

    assert.ok(detail);
    assert.equal(detail.confidence.level, "appointment_only");
    assert.equal(detail.acuityAppointmentId, "apt-appointment-only");
    assert.equal(detail.booking?.eventId, null);
    assert.equal(detail.appointmentVisitDateTime, "2026-05-21T19:00:00.000Z");
  });

  it("builds a sanitized booking timeline with credited and return touches", () => {
    const detail = buildAttributionLedgerDetailData({
      acuityAppointmentId: "1708622080",
      conversions: [
        conversionRow({
          acuity_appointment_id: "1708622080",
          event_id: "acuity-1708622080",
          last_paid_touch: linkInBioTouch("2026-05-20T23:49:18.756Z"),
          meta_capi_status: "sent",
          meta_capi_test_mode: false,
          meta_event_id: "acuity-1708622080",
          occurred_at: "2026-05-20T23:49:18.756Z",
          received_at: "2026-05-20T23:49:18.907Z",
          session_id: "session-1",
          properties: {
            attribution: {
              capturedAt: "2026-05-20T22:59:07.892Z",
              landingPageUrl:
                "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&fbclid=original-click",
              referrer: "https://www.instagram.com/",
              utm: {
                adId: "120244031602180650",
                adsetId: "120242517363420650",
                campaignId: "120234691669940650",
                content: "DM_IG_HeyBeyArea",
                fbclid: "original-click",
                medium: "paid_social",
                placement: "Instagram_Stories",
                source: "ig",
              },
            },
          },
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-original-ad",
          event_name: "PageView",
          fbclid: "original-click",
          occurred_at: "2026-05-20T22:59:08.000Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=paid_social&utm_campaign_id=120234691669940650&utm_adset_id=120242517363420650&utm_ad_id=120244031602180650&utm_content=DM_IG_HeyBeyArea&fbclid=original-click",
          referrer: "https://www.instagram.com/",
          source_type: "paid_meta",
          utm_ad_id: "120244031602180650",
          utm_adset_id: "120242517363420650",
          utm_campaign_id: "120234691669940650",
          utm_content: "DM_IG_HeyBeyArea",
          utm_medium: "paid_social",
          utm_source: "ig",
        }),
        eventRow({
          event_id: "hp_evt-page",
          event_name: "PageView",
          occurred_at: "2026-05-20T23:48:27.772Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=link-in-bio-click",
          referrer: "https://l.instagram.com/",
        }),
        eventRow({
          event_id: "hp_evt-submit",
          event_name: "BookingSubmitAttempt",
          event_type: "booking",
          occurred_at: "2026-05-20T23:49:17.152Z",
        }),
        eventRow({
          event_id: "hp_evt-submit-error",
          event_name: "BookingSubmitError",
          event_type: "booking",
          occurred_at: "2026-05-20T23:49:17.500Z",
          properties: { message: "Invalid appointment request." },
        }),
        eventRow({
          event_id: "acuity-1708622080",
          event_name: "Schedule",
          event_type: "conversion",
          occurred_at: "2026-05-20T23:49:18.756Z",
        }),
        eventRow({
          event_id: "hp_evt-after-booking",
          event_name: "PageView",
          fbclid: "after-booking-click",
          occurred_at: "2026-05-20T23:50:19.000Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment/confirmed?utm_source=ig&utm_medium=social&utm_content=post_booking&fbclid=after-booking-click",
          utm_content: "post_booking",
        }),
      ],
      sessions: [sessionRow({ session_id: "session-1" })],
      visitor: visitorRow({
        visitor_id: "hp_vid-cf42ea5f-f15d-4649-add8-b06d66d70351",
      }),
    });

    assert.equal(detail.visitorId, "hp_vid-cf42ea5f-f15d-4649-add8-b06d66d70351");
    assert.equal(detail.acuityAppointmentId, "1708622080");
    assert.equal(detail.creditedTouch?.campaignId, "120234691669940650");
    assert.equal(detail.creditedTouch?.adsetId, "120242517363420650");
    assert.equal(detail.creditedTouch?.adId, "120244031602180650");
    assert.equal(detail.creditedTouch?.fbclidPresent, true);
    assert.equal(detail.creditedTouch?.pageUrl?.includes("original-click"), false);
    assert.equal(detail.returnTouch?.content, "link_in_bio");
    assert.equal(detail.returnTouch?.medium, "social");
    assert.equal(detail.returnTouch?.pageUrl?.includes("link-in-bio-click"), false);
    assert.equal(detail.timeline.some((event) => event.eventId === "hp_evt-after-booking"), false);
    assert.equal(detail.capi.status, "sent");
    assert.equal(detail.capi.testMode, false);
    assert.equal(detail.confidence.level, "browser_session");
    assert.match(detail.confidence.explanation, /browser-level attribution/);
    assert.match(detail.summary || "", /Paid attribution captured/);
    assert.match(detail.summary || "", /Booking session started from Instagram profile link/);
    assert.deepEqual(
      detail.timeline.map((event) => event.label),
      [
        "Paid ad attribution captured",
        "Meta ad landing page viewed",
        "Instagram profile link landing viewed",
        "Booking submitted",
        "Booking submit failed — Invalid appointment request.",
        "Acuity booking created",
        "Meta CAPI sent",
      ],
    );
  });

  it("uses original paid attribution time instead of booking-time paid echo", () => {
    const detail = buildAttributionLedgerDetailData({
      acuityAppointmentId: "1709637713",
      conversions: [
        conversionRow({
          acuity_appointment_id: "1709637713",
          event_id: "acuity-1709637713",
          conversion_touch: richPaidTouch("2026-05-22T18:04:05.382Z"),
          last_paid_touch: richPaidTouch("2026-05-22T18:04:05.382Z"),
          occurred_at: "2026-05-22T18:04:05.382Z",
          session_id: "session-1",
          properties: {
            attribution: {
              capturedAt: "2026-05-22T17:45:49.970Z",
              fbc: "fb.1.1779471949970.original-click",
              fbp: "fb.1.1779471949970.123",
              landingPageUrl:
                "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=paid_social&utm_campaign_id=120234691669940650&utm_adset_id=120242517363420650&utm_ad_id=120244031602180650&utm_content=DM_IG_HeyBeyArea&fbclid=original-click",
              referrer: "https://www.instagram.com/",
              utm: {
                adId: "120244031602180650",
                adsetId: "120242517363420650",
                campaignId: "120234691669940650",
                content: "DM_IG_HeyBeyArea",
                fbclid: "original-click",
                medium: "paid_social",
                placement: "Instagram_Stories",
                source: "ig",
              },
            },
          },
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-return-page",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:01:43.988Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=paid_social&utm_campaign_id=120234691669940650&utm_adset_id=120242517363420650&utm_ad_id=120244031602180650&utm_content=DM_IG_HeyBeyArea&fbclid=return-click",
          source_type: "paid_meta",
          utm_ad_id: "120244031602180650",
          utm_adset_id: "120242517363420650",
          utm_campaign_id: "120234691669940650",
          utm_content: "DM_IG_HeyBeyArea",
          utm_medium: "paid_social",
          utm_source: "ig",
        }),
        eventRow({
          event_id: "acuity-1709637713",
          event_name: "Schedule",
          event_type: "conversion",
          occurred_at: "2026-05-22T18:04:05.382Z",
        }),
      ],
      sessions: [sessionRow({ session_id: "session-1" })],
      visitor: visitorRow({
        last_paid_touch: richPaidTouch("2026-05-22T18:04:05.911Z"),
      }),
    });

    assert.equal(detail.creditedTouch?.capturedAt, "2026-05-22T17:45:49.970Z");
    assert.equal(detail.creditedTouch?.content, "DM_IG_HeyBeyArea");
    assert.match(detail.summary || "", /Paid attribution captured 18m before booking/);
    assert.doesNotMatch(detail.summary || "", /0s before booking/);
    assert.match(detail.summary || "", /Booking session started from Meta ad DM_IG_HeyBeyArea/);
    assert.match(detail.summary || "", /booked 2m later/);
  });

  it("uses the only pre-booking page view as the booking session source", () => {
    const detail = buildAttributionLedgerDetailData({
      conversions: [
        conversionRow({
          event_id: "acuity-single-page",
          occurred_at: "2026-05-20T18:30:00.000Z",
          session_id: "session-1",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-only-page",
          event_name: "PageView",
          fbc: null,
          fbp: null,
          fbclid: null,
          occurred_at: "2026-05-20T18:29:00.000Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=social&utm_content=only_visit&fbclid=single-click",
          source_type: "referral",
          utm_content: "only_visit",
        }),
      ],
      sessions: [sessionRow({ session_id: "session-1" })],
      visitor: visitorRow(),
    });

    assert.equal(detail.returnTouch?.content, "only_visit");
    assert.equal(
      detail.timeline.find((event) => event.eventId === "hp_evt-only-page")?.label,
      "Instagram profile link landing viewed",
    );
  });

  it("does not label inherited paid attribution as a fresh Meta ad landing", () => {
    const detail = buildAttributionLedgerDetailData({
      acuityAppointmentId: "fbc-only-return",
      conversions: [
        conversionRow({
          acuity_appointment_id: "fbc-only-return",
          event_id: "acuity-fbc-only-return",
          occurred_at: "2026-05-20T18:30:00.000Z",
          session_id: "session-1",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-fbc-only-return",
          event_name: "PageView",
          fbc: "fb.1.1779200000000.original-click",
          fbclid: null,
          occurred_at: "2026-05-20T18:29:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
          referrer: null,
          source_type: "paid_meta",
          utm_ad_id: "inherited-ad",
          utm_content: "inherited-profile",
          utm_medium: "paid_social",
          utm_source: "ig",
        }),
      ],
      sessions: [sessionRow({ session_id: "session-1" })],
      visitor: visitorRow(),
    });

    assert.equal(
      detail.timeline.find((event) => event.eventId === "hp_evt-fbc-only-return")?.label,
      "Booking page viewed",
    );
    assert.match(detail.summary || "", /Booking session started from booking page/);
    assert.doesNotMatch(detail.summary || "", /Booking session started from Meta ad/);
  });

  it("labels fbclid-only Meta-origin page views without implying a paid ad", () => {
    const detail = buildAttributionLedgerDetailData({
      conversions: [
        conversionRow({
          event_id: "acuity-fbclid-only",
          occurred_at: "2026-05-22T19:00:00.000Z",
          session_id: "session-booking",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-facebook-fbclid",
          event_name: "PageView",
          fbclid: "weak-facebook-click",
          occurred_at: "2026-05-21T17:00:00.000Z",
          page_url: "https://www.hungphatusa.com/products/oval-ring?fbclid=weak-facebook-click",
          referrer: "https://l.facebook.com/",
          session_id: "session-prior-facebook",
          source_type: "paid_meta",
          utm_ad_id: null,
          utm_adset_id: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
        eventRow({
          event_id: "hp_evt-instagram-fbclid",
          event_name: "PageView",
          fbclid: "weak-instagram-click",
          occurred_at: "2026-05-22T18:58:00.000Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=weak-instagram-click",
          referrer: "https://l.instagram.com/",
          session_id: "session-booking",
          source_type: "paid_meta",
          utm_ad_id: null,
          utm_adset_id: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
        eventRow({
          event_id: "hp_evt-generic-fbclid",
          event_name: "PageView",
          fbclid: "weak-meta-click",
          occurred_at: "2026-05-22T18:59:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=weak-meta-click",
          referrer: null,
          session_id: "session-booking",
          source_type: "paid_meta",
          utm_ad_id: null,
          utm_adset_id: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
      ],
      sessions: [sessionRow({ session_id: "session-booking" })],
      visitor: visitorRow(),
    });

    assert.deepEqual(
      detail.timeline
        .filter((event) => event.eventId?.startsWith("hp_evt-"))
        .map((event) => [event.eventId, event.label]),
      [
        ["hp_evt-facebook-fbclid", "Page viewed from Facebook"],
        ["hp_evt-instagram-fbclid", "Page viewed from Instagram"],
        ["hp_evt-generic-fbclid", "Page viewed from Facebook or Instagram"],
      ],
    );
    assert.match(detail.summary || "", /Booking session started from Facebook or Instagram page view/);
    assert.doesNotMatch(detail.summary || "", /Booking session started from Meta ad/);
  });

  it("filters noisy same-session events from the curated timeline", () => {
    const detail = buildAttributionLedgerDetailData({
      conversions: [
        conversionRow({
          event_id: "acuity-noise-filter",
          last_paid_touch: richPaidTouch("2026-05-22T17:00:00.000Z"),
          meta_capi_status: "sent",
          meta_event_id: "meta-noise-filter",
          occurred_at: "2026-05-22T19:00:00.000Z",
          received_at: "2026-05-22T19:00:01.000Z",
          session_id: "session-booking",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-noise-paid-source",
          event_name: "PageView",
          occurred_at: "2026-05-22T17:05:00.000Z",
          page_url:
            "https://www.hungphatusa.com/products/oval-ring?utm_source=fb&utm_medium=paid_social&utm_ad_id=ad-one&utm_adset_id=adset-one&utm_campaign_id=campaign-one&fbclid=paid-click",
          referrer: "https://l.facebook.com/",
          session_id: "session-prior-paid",
          source_type: "paid_meta",
          utm_ad_id: "ad-one",
          utm_adset_id: "adset-one",
          utm_campaign_id: "campaign-one",
          utm_medium: "paid_social",
          utm_source: "fb",
        }),
        eventRow({
          event_id: "hp_evt-noise-organic-source",
          event_name: "PageView",
          occurred_at: "2026-05-22T17:10:00.000Z",
          page_url:
            "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=organic-click",
          referrer: "https://l.instagram.com/",
          session_id: "session-prior-organic",
          source_type: "referral",
        }),
        eventRow({
          event_id: "hp_evt-noise-fbclid-source",
          event_name: "PageView",
          fbclid: "weak-facebook-click",
          occurred_at: "2026-05-22T17:15:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=weak-facebook-click",
          referrer: "https://l.facebook.com/",
          session_id: "session-prior-fbclid",
          source_type: "paid_meta",
          utm_ad_id: null,
          utm_adset_id: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
        eventRow({
          event_id: "hp_evt-scroll",
          event_name: "ScrollDepth",
          event_type: "engagement",
          occurred_at: "2026-05-22T18:51:00.000Z",
          session_id: "session-booking",
        }),
        eventRow({
          event_id: "hp_evt-engaged",
          event_name: "Engaged60Seconds",
          event_type: "engagement",
          occurred_at: "2026-05-22T18:52:00.000Z",
          session_id: "session-booking",
        }),
        eventRow({
          event_id: "hp_evt-search",
          event_name: "Search",
          event_type: "search",
          occurred_at: "2026-05-22T18:53:00.000Z",
          session_id: "session-booking",
        }),
        eventRow({
          event_id: "hp_evt-click",
          event_name: "ProductTileClick",
          event_type: "click",
          occurred_at: "2026-05-22T18:54:00.000Z",
          session_id: "session-booking",
        }),
        eventRow({
          event_id: "hp_evt-custom",
          event_name: "CustomSurveyEvent",
          event_type: "custom",
          occurred_at: "2026-05-22T18:54:30.000Z",
          session_id: "session-booking",
        }),
        eventRow({
          event_id: "hp_evt-booking-page-useful",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:55:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
          referrer: null,
          session_id: "session-booking",
          source_type: "direct",
          utm_ad_id: null,
          utm_adset_id: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
        eventRow({
          event_id: "hp_evt-visit-selected-useful",
          event_name: "BookingVisitSelected",
          event_type: "booking",
          occurred_at: "2026-05-22T18:56:00.000Z",
          session_id: "session-booking",
        }),
        eventRow({
          event_id: "acuity-noise-filter",
          event_name: "Schedule",
          event_type: "conversion",
          occurred_at: "2026-05-22T19:00:00.000Z",
          session_id: "session-booking",
        }),
      ],
      sessions: [sessionRow({ session_id: "session-booking" })],
      visitor: visitorRow(),
    });

    const noisyEventIds = new Set([
      "hp_evt-scroll",
      "hp_evt-engaged",
      "hp_evt-search",
      "hp_evt-click",
      "hp_evt-custom",
    ]);
    assert.equal(detail.timeline.some((event) => noisyEventIds.has(event.eventId || "")), false);
    assert.deepEqual(
      detail.timeline.map((event) => [event.eventId, event.label]),
      [
        [null, "Paid ad attribution captured"],
        ["hp_evt-noise-paid-source", "Meta ad landing page viewed"],
        ["hp_evt-noise-organic-source", "Instagram profile link landing viewed"],
        ["hp_evt-noise-fbclid-source", "Page viewed from Facebook"],
        ["hp_evt-booking-page-useful", "Booking page viewed"],
        ["hp_evt-visit-selected-useful", "Appointment type selected"],
        ["acuity-noise-filter", "Acuity booking created"],
        ["meta-noise-filter", "Meta CAPI sent"],
      ],
    );
  });

  it("labels every fresh paid Meta landing in the curated timeline", () => {
    const detail = buildAttributionLedgerDetailData({
      conversions: [
        conversionRow({
          event_id: "acuity-multi-ad",
          occurred_at: "2026-05-22T19:00:00.000Z",
          session_id: "session-booking",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-ad-one",
          event_name: "PageView",
          occurred_at: "2026-05-21T17:00:00.000Z",
          page_url:
            "https://www.hungphatusa.com/products/oval-ring?utm_source=fb&utm_medium=paid_social&utm_ad_id=ad-one&utm_adset_id=adset-one&utm_campaign_id=campaign-one&fbclid=click-one",
          referrer: "https://l.facebook.com/",
          session_id: "session-ad-one",
          source_type: "paid_meta",
          utm_ad_id: "ad-one",
          utm_adset_id: "adset-one",
          utm_campaign_id: "campaign-one",
          utm_medium: "paid_social",
          utm_source: "fb",
        }),
        eventRow({
          event_id: "hp_evt-ad-two",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:30:00.000Z",
          page_url:
            "https://www.hungphatusa.com/pages/custom-jewelry-design?utm_source=ig&utm_medium=paid_social&utm_ad_id=ad-two&utm_adset_id=adset-two&utm_campaign_id=campaign-two&fbclid=click-two",
          referrer: "https://l.instagram.com/",
          session_id: "session-ad-two",
          source_type: "paid_meta",
          utm_ad_id: "ad-two",
          utm_adset_id: "adset-two",
          utm_campaign_id: "campaign-two",
          utm_medium: "paid_social",
          utm_source: "ig",
        }),
        eventRow({
          event_id: "hp_evt-booking-page",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:58:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
          referrer: null,
          session_id: "session-booking",
          source_type: "direct",
          utm_ad_id: null,
          utm_adset_id: null,
          utm_campaign_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
      ],
      sessions: [sessionRow({ session_id: "session-booking" })],
      visitor: visitorRow(),
    });

    assert.deepEqual(
      detail.timeline
        .filter((event) => event.eventId?.startsWith("hp_evt-"))
        .map((event) => [event.eventId, event.label, event.adId]),
      [
        ["hp_evt-ad-one", "Meta ad landing page viewed", "ad-one"],
        ["hp_evt-ad-two", "Meta ad landing page viewed", "ad-two"],
        ["hp_evt-booking-page", "Booking page viewed", null],
      ],
    );
  });

  it("labels useful non-ad page views by page type", () => {
    const detail = buildAttributionLedgerDetailData({
      conversions: [
        conversionRow({
          event_id: "acuity-page-types",
          occurred_at: "2026-05-22T19:00:00.000Z",
          session_id: "session-1",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-product",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:10:00.000Z",
          page_url: "https://www.hungphatusa.com/products/oval-ring",
          referrer: null,
          source_type: "direct",
          utm_ad_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
        eventRow({
          event_id: "hp_evt-custom",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:20:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/custom-jewelry-design",
          referrer: null,
          source_type: "direct",
          utm_ad_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
        eventRow({
          event_id: "hp_evt-booking",
          event_name: "PageView",
          occurred_at: "2026-05-22T18:30:00.000Z",
          page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
          referrer: null,
          source_type: "direct",
          utm_ad_id: null,
          utm_content: null,
          utm_medium: null,
          utm_source: null,
        }),
      ],
      sessions: [sessionRow({ session_id: "session-1" })],
      visitor: visitorRow(),
    });

    assert.deepEqual(
      detail.timeline
        .filter((event) => event.eventId?.startsWith("hp_evt-"))
        .map((event) => [event.eventId, event.label]),
      [
        ["hp_evt-product", "Product page viewed"],
        ["hp_evt-custom", "Custom jewelry page viewed"],
        ["hp_evt-booking", "Booking page viewed"],
      ],
    );
  });

  it("fills missing ad IDs from the touch page URL", () => {
    const pageUrl =
      "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=fb&utm_medium=paid_social&utm_campaign=CBI_Evergreen_Schedueled_Test_BookAppointment_Prospecting_US_2025+%28AI%29&utm_campaign_id=120234691669940650&utm_adset=%28Acuity%29+Testing+%7C+Broad+%7C+New+Creatives+%7C+Apr+17&utm_adset_id=120242517363420650&utm_content=DM+%7C+Testing+%7C+Creative+%23+9+%7C+Apr+30&utm_ad_id=120243240059500650&utm_placement=Facebook_Desktop_Feed&fbclid=paid-click";
    const detail = buildAttributionLedgerDetailData({
      acuityAppointmentId: "1708409464",
      conversions: [
        conversionRow({
          acuity_appointment_id: "1708409464",
          event_id: "acuity-1708409464",
          last_paid_touch: {
            capturedAt: "2026-05-20T18:20:46.546Z",
            fbc: "fb.1.1778893223711.paid-click",
            fbp: "fb.1.1769114051828.browser",
            pageUrl,
            source: "shopify_browser",
            sourceType: "paid_meta",
            utm: {
              campaign: "CBI_Evergreen_Schedueled_Test_BookAppointment_Prospecting_US_2025 (AI)",
              content: "DM | Testing | Creative # 9 | Apr 30",
              medium: "paid_social",
              source: "fb",
            },
          },
          occurred_at: "2026-05-20T18:20:47.762Z",
          session_id: "session-1",
        }),
      ],
      events: [
        eventRow({
          event_id: "hp_evt-return-page",
          event_name: "PageView",
          fbclid: null,
          occurred_at: "2026-05-20T18:19:04.000Z",
          page_url: pageUrl,
          referrer: "https://l.facebook.com/",
          source_type: "paid_meta",
          utm_campaign: "CBI_Evergreen_Schedueled_Test_BookAppointment_Prospecting_US_2025 (AI)",
          utm_content: "DM | Testing | Creative # 9 | Apr 30",
          utm_medium: "paid_social",
          utm_source: "fb",
        }),
      ],
      sessions: [sessionRow({ session_id: "session-1" })],
      visitor: visitorRow(),
    });

    assert.equal(detail.creditedTouch?.campaignId, "120234691669940650");
    assert.equal(detail.creditedTouch?.adsetId, "120242517363420650");
    assert.equal(detail.creditedTouch?.adId, "120243240059500650");
    assert.equal(detail.returnTouch?.campaignId, "120234691669940650");
    assert.equal(detail.returnTouch?.adsetId, "120242517363420650");
    assert.equal(detail.returnTouch?.adId, "120243240059500650");
    assert.equal(detail.returnTouch?.placement, "Facebook_Desktop_Feed");
    assert.equal(detail.returnTouch?.fbclidPresent, true);
  });
});

function linkInBioTouch(capturedAt: string) {
  return {
    capturedAt,
    eventName: "PageView",
    source: "shopify_browser",
    sourceType: "paid_meta",
    utm: {
      content: "link_in_bio",
      fbclid: "link-in-bio-click",
      medium: "social",
      source: "ig",
    },
  };
}

function richPaidTouch(capturedAt: string) {
  return {
    capturedAt,
    eventName: "Schedule",
    source: "booking_api",
    sourceType: "paid_meta",
    utm: {
      adId: "120244031602180650",
      adsetId: "120242517363420650",
      campaignId: "120234691669940650",
      content: "DM_IG_HeyBeyArea",
      fbclid: "original-click",
      medium: "paid_social",
      placement: "Instagram_Stories",
      source: "ig",
    },
  };
}

function mockCustomerJourneyClient(input: {
  appointment_events?: object[];
  website_conversions?: AttributionLedgerConversionRow[];
  website_events?: AttributionLedgerEventRow[];
  website_sessions?: AttributionLedgerSessionRow[];
  website_visitors?: AttributionLedgerVisitorRow[];
}, options?: {
  onInFilter?: (table: string, values: unknown[]) => void;
}): CustomerJourneyLedgerClient {
  return {
    from(table: keyof typeof input) {
      return {
        select() {
          return mockLedgerSelectChain(input[table] || [], {
            onInFilter: (values) => options?.onInFilter?.(String(table), values),
          });
        },
      };
    },
  } as unknown as CustomerJourneyLedgerClient;
}

function mockLedgerSelectChain(sourceRows: object[], options?: {
  onInFilter?: (values: unknown[]) => void;
}) {
  type MockLedgerResult = { data: Array<Record<string, unknown>>; error: Error | null };

  let rows = sourceRows.map((row) => row as Record<string, unknown>);
  const chain = {
    eq(column: string, value: unknown) {
      rows = rows.filter((row) => row[column] === value);
      return chain;
    },
    gte(column: string, value: unknown) {
      rows = rows.filter((row) => String(row[column] ?? "") >= String(value ?? ""));
      return chain;
    },
    ilike(column: string, pattern: string) {
      const re = new RegExp(
        "^" +
          pattern
            .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
            .replace(/%/g, ".*") +
          "$",
        "i",
      );
      rows = rows.filter((row) => re.test(String(row[column] ?? "")));
      return chain;
    },
    in(column: string, values: unknown[]) {
      options?.onInFilter?.(values);
      rows = rows.filter((row) => values.includes(row[column]));
      return chain;
    },
    limit(count: number) {
      rows = rows.slice(0, count);
      return chain;
    },
    lte(column: string, value: unknown) {
      rows = rows.filter((row) => String(row[column] ?? "") <= String(value ?? ""));
      return chain;
    },
    order(column: string, options: { ascending: boolean }) {
      rows = [...rows].sort((left, right) => {
        const result = String(left[column] ?? "").localeCompare(String(right[column] ?? ""));
        return options.ascending ? result : -result;
      });
      return chain;
    },
    then<TResult1 = MockLedgerResult, TResult2 = never>(
      onfulfilled?: ((value: MockLedgerResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
    },
  };

  return chain;
}

function appointmentRow(overrides: Record<string, unknown> = {}) {
  return {
    appt_id: "acuity:1708622080",
    booked_at: "2026-05-18T10:00:00.000Z",
    booking_source: "acuity",
    brand: "hpusa",
    created_at: "2026-05-18T10:00:00.000Z",
    external_booking_id: "1708622080",
    id: "appointment-event-1",
    raw_payload: {},
    source: "Acuity",
    status: "active",
    visit_date_time: "2026-05-19T21:00:00.000Z",
    visit_type: "General Meeting",
    ...overrides,
  };
}

function visitorRow(
  overrides: Partial<AttributionLedgerVisitorRow> = {},
): AttributionLedgerVisitorRow {
  return {
    browser_name: "Mobile Safari",
    conversion_event_id: null,
    customer_email: "visitor@example.com",
    customer_name: "Visitor Customer",
    customer_phone: "555-0100",
    device_category: "mobile",
    fbc: "fb.1.1.click",
    fbp: "fb.1.1.browser",
    first_page_url: "https://www.hungphatusa.com/",
    first_seen_at: "2026-05-19T17:00:00.000Z",
    first_touch: null,
    geo_city: "San Jose",
    geo_country: "US",
    geo_region: "CA",
    geo_timezone: "America/Los_Angeles",
    last_page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
    last_paid_touch: {
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        adId: "visitor-ad",
        adsetId: "visitor-adset",
        campaignId: "visitor-campaign",
        placement: "facebook_feed",
        source: "facebook",
      },
    },
    last_seen_at: "2026-05-19T20:00:00.000Z",
    last_touch: null,
    os_name: "iOS",
    user_agent: "Mozilla/5.0",
    visitor_id: "visitor-1",
    ...overrides,
  };
}

function sessionRow(
  overrides: Partial<AttributionLedgerSessionRow> = {},
): AttributionLedgerSessionRow {
  return {
    browser_name: "Chrome",
    conversion_event_id: null,
    customer_email: null,
    customer_name: null,
    customer_phone: null,
    device_category: "desktop",
    fbc: null,
    fbp: null,
    first_page_url: "https://www.hungphatusa.com/",
    geo_city: "San Jose",
    geo_country: "US",
    geo_region: "CA",
    geo_timezone: "America/Los_Angeles",
    last_page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
    last_paid_touch: null,
    last_seen_at: "2026-05-19T18:00:00.000Z",
    os_name: "macOS",
    session_id: "session-1",
    user_agent: "Mozilla/5.0",
    visitor_id: "visitor-1",
    ...overrides,
  };
}

function conversionRow(
  overrides: Partial<AttributionLedgerConversionRow> = {},
): AttributionLedgerConversionRow {
  return {
    acuity_appointment_id: null,
    appointment_type: null,
    brand: null,
    browser_name: "Mobile Safari",
    conversion_touch: null,
    customer_email: null,
    customer_name: null,
    customer_phone: null,
    device_category: "mobile",
    event_id: "conversion-1",
    fbc: null,
    fbp: null,
    first_touch: null,
    geo_city: "San Jose",
    geo_country: "US",
    geo_region: "CA",
    geo_timezone: "America/Los_Angeles",
    last_paid_touch: null,
    last_touch: null,
    meta_capi_status: null,
    meta_capi_test_mode: null,
    meta_event_id: null,
    occurred_at: "2026-05-19T18:30:00.000Z",
    os_name: "iOS",
    page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
    properties: {},
    raw_json: {},
    received_at: "2026-05-19T18:30:01.000Z",
    referrer: "https://l.instagram.com/",
    session_id: null,
    source_type: "paid_meta",
    user_agent: "Mozilla/5.0",
    visitor_id: "visitor-1",
    ...overrides,
  };
}

function eventRow(overrides: Partial<AttributionLedgerEventRow> = {}): AttributionLedgerEventRow {
  return {
    acuity_appointment_id: null,
    appointment_type: null,
    brand: null,
    browser_name: "Mobile Safari",
    customer_email: null,
    customer_name: null,
    customer_phone: null,
    device_category: "mobile",
    event_id: "hp_evt-1",
    event_name: "PageView",
    event_type: "page",
    fbc: "fb.1.1.click",
    fbp: "fb.1.1.browser",
    fbclid: "link-in-bio-click",
    geo_city: "San Jose",
    geo_country: "US",
    geo_region: "CA",
    geo_timezone: "America/Los_Angeles",
    occurred_at: "2026-05-20T23:48:27.772Z",
    os_name: "iOS",
    page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
    properties: {},
    raw_json: {},
    referrer: "https://l.instagram.com/",
    session_id: "session-1",
    source: "shopify_browser",
    source_type: "paid_meta",
    utm_ad: null,
    utm_ad_id: null,
    utm_adset: null,
    utm_adset_id: null,
    utm_campaign: null,
    utm_campaign_id: null,
    utm_content: "link_in_bio",
    utm_creative: null,
    utm_id: null,
    utm_medium: "social",
    utm_placement: null,
    utm_source: "ig",
    utm_term: null,
    visitor_id: "visitor-1",
    ...overrides,
  };
}
