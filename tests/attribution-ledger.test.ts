import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAttributionLedgerData,
  buildAttributionLedgerDetailData,
  buildAttributionLedgerRows,
  type AttributionLedgerConversionRow,
  type AttributionLedgerEventRow,
  type AttributionLedgerSessionRow,
  type AttributionLedgerVisitorRow,
} from "../src/lib/attribution-ledger.ts";
import { normalizeCustomerJourneyLedgerDateRange } from "../src/lib/customer-journey-ledger.ts";

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

  it("keeps visitors without conversions and uses session context", () => {
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

    assert.equal(rows.length, 1);
    assert.equal(rows[0].visitorId, "visitor-1");
    assert.equal(rows[0].sessionId, "session-latest");
    assert.equal(rows[0].customerName, "Session Customer");
    assert.equal(rows[0].customerEmail, "session@example.com");
    assert.equal(rows[0].customerPhone, "555-0199");
    assert.equal(rows[0].firstPage, "https://www.hungphatusa.com/pages/book-an-appointment");
    assert.equal(rows[0].hasConversion, false);
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
      conversions: [],
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

    assert.equal(data.rows.length, 3);
    assert.equal(data.summary.visitorsShown, 3);
    assert.equal(data.summary.visitorsWithConversions, 2);
    assert.equal(data.summary.visitorsWithPaidTouch, 1);
    assert.deepEqual(data.summary.capiStatuses, [{ count: 1, status: "sent" }]);
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
    assert.match(detail.summary || "", /returned from link_in_bio/);
    assert.deepEqual(
      detail.timeline.map((event) => event.label),
      [
        "Paid ad attribution captured",
        "Page viewed",
        "Meta ad landing page viewed",
        "Booking submitted",
        "Acuity booking created",
        "Meta CAPI sent",
      ],
    );
  });

  it("uses the only pre-booking page view as the return touch", () => {
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
    assert.equal(detail.timeline.find((event) => event.eventId === "hp_evt-only-page")?.label, "Meta/social landing page viewed");
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
    browser_name: "Mobile Safari",
    device_category: "mobile",
    event_id: "hp_evt-1",
    event_name: "PageView",
    event_type: "page",
    fbc: "fb.1.1.click",
    fbp: "fb.1.1.browser",
    fbclid: "link-in-bio-click",
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
