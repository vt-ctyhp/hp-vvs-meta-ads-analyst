import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  appointmentEventToWebsiteConversionInput,
  buildWebsiteLocationBreakdown,
  fetchWebsiteFunnelData,
  isAuthorizedConversionRequest,
  isPaidTouch,
  normalizeBookingAttributionPayload,
  normalizeBookingConversionPayload,
  reconcileAppointmentConversionsToWebsiteEvents,
  selectLastPaidTouch,
  websiteGeoFromRequest,
  type AppointmentEventConversionRow,
  type WebsiteLocationEventInput,
} from "../src/lib/website-analytics.ts";
import {
  selectBestPaidTouch,
  selectOriginalPaidTouch,
} from "../src/lib/attribution-touch-selection.ts";

describe("website analytics appointment reconciliation", () => {
  it("builds a website Schedule conversion from an Acuity appointment event", () => {
    const conversion = appointmentEventToWebsiteConversionInput({
      id: "appointment-event-id",
      appt_id: "acuity:1706526506",
      booking_source: "acuity",
      external_booking_id: "1706526506",
      visit_date_time: "2026-05-17T21:00:00+00:00",
      visit_type: "General Meeting",
      brand: "hpusa",
      status: "active",
      source: "Acuity",
      booked_at: "2026-05-17T00:00:00+00:00",
      created_at: "2026-05-17T15:03:07.027446+00:00",
      raw_payload: {
        appointment: {
          appointmentTypeID: 91808134,
          calendarID: 12345,
          datetime: "2026-05-17T14:00:00-0700",
          datetimeCreated: "2026-05-17T10:03:03-0500",
          duration: 30,
          email: "customer@example.com",
          firstName: "Anthony",
          lastName: "Tran",
          phone: "(408) 555-1212",
          timezone: "America/Los_Angeles",
          type: "General Meeting",
        },
      },
    } satisfies AppointmentEventConversionRow);

    assert.equal(conversion?.eventId, "acuity-1706526506");
    assert.equal(conversion?.eventName, "Schedule");
    assert.equal(conversion?.eventType, "conversion");
    assert.equal(conversion?.occurredAt, "2026-05-17T15:03:03.000Z");
    assert.equal(conversion?.brand, "HP");
    assert.equal(conversion?.pageGroup, "booking");
    assert.equal(conversion?.acuityAppointmentId, "1706526506");
    assert.equal(conversion?.appointmentType, "General Meeting");
    assert.deepEqual(conversion?.customer, {
      email: "customer@example.com",
      firstName: "Anthony",
      lastName: "Tran",
      name: "Anthony Tran",
      phone: "(408) 555-1212",
    });
    assert.deepEqual(conversion?.properties, {
      appointmentEventId: "appointment-event-id",
      appointmentRecordId: "acuity:1706526506",
      appointmentSource: "Acuity",
      appointmentStatus: "active",
      appointmentTypeID: 91808134,
      calendarID: 12345,
      datetime: "2026-05-17T21:00:00.000Z",
      duration: 30,
      reconciledFromAppointmentEvent: true,
      timezone: "America/Los_Angeles",
    });
  });

  it("ignores non-Acuity appointments", () => {
    const conversion = appointmentEventToWebsiteConversionInput({
      id: "manual-event-id",
      appt_id: "manual:1",
      booking_source: "manual",
      external_booking_id: "1",
      visit_date_time: null,
      visit_type: null,
      brand: "hpusa",
      status: "active",
      source: "Manual",
      booked_at: null,
      created_at: "2026-05-17T15:03:07.027446+00:00",
      raw_payload: {},
    });

    assert.equal(conversion, null);
  });

  it("reads Acuity appointments for the funnel without running reconciliation", async () => {
    const selectedTables: string[] = [];
    const client = {
      from(table: string) {
        selectedTables.push(table);
        if (
          table === "appointment_events" ||
          table === "website_events" ||
          table === "website_conversions" ||
          table === "meta_daily_insights"
        ) {
          return {
            select() {
              return resolvedSelect([]);
            },
          };
        }
        throw new Error(`Unexpected table read: ${table}`);
      },
    };

    const data = await fetchWebsiteFunnelData(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: client as never },
    );

    assert.deepEqual(selectedTables, [
      "website_events",
      "appointment_events",
      "meta_daily_insights",
    ]);
    assert.equal(data.sourceTransparency.recordCounts.website_events, 0);
    assert.equal(data.sourceTransparency.recordCounts.website_conversions, 0);
    assert.equal(data.sourceTransparency.recordCounts.meta_daily_insights, 0);
    assert.equal(data.sourceTransparency.recordCounts.appointment_events, 0);
  });

  it("paginates website funnel reads before calculating totals", async () => {
    const events = [
      ...Array.from({ length: 1001 }, (_, index) =>
        websiteEvent({
          event_id: `page-view-${index}`,
          event_name: "PageView",
          event_type: "page",
          occurred_at: `2026-05-01T00:${String(index % 60).padStart(2, "0")}:00.000Z`,
          page_group: "booking",
          session_id: `session-${index}`,
        }),
      ),
      websiteEvent({
        event_id: "schedule-meta-event",
        event_name: "BookingComplete",
        meta_event_name: "Schedule",
        event_type: "conversion",
        occurred_at: "2026-05-01T02:00:00.000Z",
        page_group: "booking",
        properties: { trackingCompleteness: { complete: true } },
        session_id: "schedule-session",
        source_type: "paid_meta",
      }),
    ];
    const metaRows = Array.from({ length: 1001 }, (_, index) => ({
      actions: [],
      bookings: 1,
      conversions: 0,
      date_start: "2026-05-01",
      id: `meta-${index}`,
    }));
    const conversions = [
      {
        acuity_appointment_id: "apt-1",
        event_id: "conversion-1",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        occurred_at: "2026-05-01T03:00:00.000Z",
        source_type: "paid_meta",
      },
      {
        acuity_appointment_id: "apt-2",
        event_id: "conversion-2",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        occurred_at: "2026-05-01T04:00:00.000Z",
        source_type: "direct",
      },
    ];
    const appointments = [
      appointmentEvent({
        external_booking_id: "apt-1",
        visit_date_time: "2026-05-01T13:00:00.000Z",
      }),
      appointmentEvent({
        external_booking_id: "apt-2",
        visit_date_time: "2026-05-01T14:00:00.000Z",
      }),
    ];
    const rangeCalls: Record<string, Array<[number, number]>> = {
      appointment_events: [],
      meta_daily_insights: [],
      website_conversions: [],
      website_events: [],
    };
    const eqCalls: Record<string, Array<[string, unknown]>> = {
      appointment_events: [],
      meta_daily_insights: [],
      website_conversions: [],
      website_events: [],
    };
    const selectedColumns: Record<string, string[]> = {};
    const client = {
      from(table: "appointment_events" | "website_events" | "website_conversions" | "meta_daily_insights") {
        return {
          select(columns: string) {
            selectedColumns[table] ||= [];
            selectedColumns[table].push(columns);
            return resolvedSelect(
              table === "website_events"
                ? events
                : table === "website_conversions"
                  ? conversions
                  : table === "appointment_events"
                    ? appointments
                    : metaRows,
              rangeCalls[table],
              eqCalls[table],
            );
          },
        };
      },
    };

    const data = await fetchWebsiteFunnelData(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: client as never },
    );

    assert.deepEqual(rangeCalls.website_events, [
      [0, 999],
      [1000, 1999],
    ]);
    assert.deepEqual(rangeCalls.meta_daily_insights, [
      [0, 999],
      [1000, 1999],
    ]);
    assert.deepEqual(rangeCalls.appointment_events, []);
    assert.deepEqual(eqCalls.website_events, [
      ["environment", "production"],
      ["environment", "production"],
    ]);
    assert.deepEqual(eqCalls.website_conversions, []);
    assert.deepEqual(eqCalls.meta_daily_insights, [
      ["environment", "production"],
      ["environment", "production"],
    ]);
    assert.match(selectedColumns.website_events[0], /meta_event_name/);
    assert.equal(data.sourceTransparency.recordCounts.website_events, 1002);
    assert.equal(data.sourceTransparency.recordCounts.website_conversions, 2);
    assert.equal(data.sourceTransparency.recordCounts.appointment_events, 2);
    assert.equal(data.sourceTransparency.recordCounts.meta_daily_insights, 1001);
    assert.equal(data.overview.sessions, 1002);
    assert.equal(data.overview.pageViews, 1001);
    assert.equal(data.overview.schedules, 1);
    assert.equal(data.overview.websiteScheduleConversions, 2);
    assert.equal(data.overview.paidMetaScheduleConversions, 1);
    assert.equal(data.overview.completeTrackingConversions, 1);
    assert.equal(data.overview.metaAttributedBookings, 1001);
    assert.equal(data.overview.discrepancy, -999);
    assert.equal(data.funnel.at(-1)?.count, 1);
    assert.equal(data.trend[0]?.pageViews, 1001);
    assert.equal(data.trend[0]?.schedules, 1);
    assert.equal(data.trend[0]?.websiteScheduleConversions, 2);
    assert.equal(data.trend[0]?.paidMetaScheduleConversions, 1);
    assert.equal(data.trend[0]?.metaAttributedBookings, 1001);
  });

  it("counts funnel stages by unique session instead of raw events", async () => {
    const events = [
      websiteEvent({
        event_id: "view-1",
        event_name: "PageView",
        page_group: "booking",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "view-2",
        event_name: "PageView",
        page_group: "booking",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "view-3",
        event_name: "PageView",
        page_group: "booking",
        session_id: "session-b",
      }),
      websiteEvent({
        event_id: "visit-1",
        event_name: "BookingVisitSelected",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "visit-2",
        event_name: "BookingVisitSelected",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "date-1",
        event_name: "BookingDateSelected",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "date-2",
        event_name: "BookingDateSelected",
        session_id: "session-b",
      }),
      websiteEvent({
        event_id: "time-1",
        event_name: "BookingTimeSelected",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "time-2",
        event_name: "BookingTimeSelected",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "contact-1",
        event_name: "BookingContactStarted",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "submit-1",
        event_name: "BookingSubmitAttempt",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "schedule-1",
        event_name: "BookingComplete",
        meta_event_name: "Schedule",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "schedule-2",
        event_name: "BookingComplete",
        meta_event_name: "Schedule",
        session_id: "session-a",
      }),
      websiteEvent({
        event_id: "schedule-3",
        event_name: "Schedule",
        session_id: "session-b",
      }),
    ];
    const conversions = [
      {
        acuity_appointment_id: "apt-1",
        event_id: "conversion-1",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        occurred_at: "2026-05-01T04:00:00.000Z",
        source_type: "paid_meta",
      },
      {
        acuity_appointment_id: "apt-2",
        event_id: "conversion-2",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        occurred_at: "2026-05-01T05:00:00.000Z",
        source_type: "direct",
      },
    ];
    const appointments = [
      appointmentEvent({
        external_booking_id: "apt-1",
        visit_date_time: "2026-05-01T13:00:00.000Z",
      }),
      appointmentEvent({
        external_booking_id: "apt-2",
        visit_date_time: "2026-05-01T14:00:00.000Z",
      }),
    ];
    const client = {
      from(table: "appointment_events" | "website_events" | "website_conversions" | "meta_daily_insights") {
        return {
          select() {
            return resolvedSelect(
              table === "website_events"
                ? events
                : table === "website_conversions"
                  ? conversions
                  : table === "appointment_events"
                    ? appointments
                    : [],
            );
          },
        };
      },
    };

    const data = await fetchWebsiteFunnelData(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: client as never },
    );

    assert.equal(data.overview.pageViews, 3);
    assert.equal(data.overview.schedules, 3);
    assert.deepEqual(
      Object.fromEntries(data.funnel.map((row) => [row.key, row.count])),
      {
        booking_page_view: 2,
        booking_form_started: 2,
        visit_selected: 1,
        date_selected: 2,
        time_selected: 1,
        confirmed_website_bookings: 2,
        paid_meta_bookings: 1,
      },
    );
  });

  it("counts two Acuity IDs in one browser session as two confirmed appointments", async () => {
    const events = [
      websiteEvent({
        event_id: "schedule-1",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        session_id: "same-session",
      }),
      websiteEvent({
        event_id: "schedule-2",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        session_id: "same-session",
      }),
    ];
    const appointments = [
      appointmentEvent({ external_booking_id: "apt-1", visit_date_time: "2026-05-01T13:00:00.000Z" }),
      appointmentEvent({ external_booking_id: "apt-2", visit_date_time: "2026-05-01T14:00:00.000Z" }),
    ];

    const data = await fetchWebsiteFunnelData(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: funnelClient({ appointments, events }) as never },
    );

    assert.equal(data.overview.schedules, 2);
    assert.equal(data.overview.websiteScheduleConversions, 2);
    assert.equal(data.funnel.find((row) => row.key === "confirmed_website_bookings")?.count, 2);
  });

  it("filters appointment denominator by visit date and valid Acuity status", async () => {
    const appointments = [
      appointmentEvent({ external_booking_id: "active-in-range", status: "active", visit_date_time: "2026-05-01T13:00:00.000Z" }),
      appointmentEvent({ external_booking_id: "outside-range", status: "active", visit_date_time: "2026-04-30T13:00:00.000Z" }),
      appointmentEvent({ external_booking_id: "cancelled", status: "canceled", visit_date_time: "2026-05-01T14:00:00.000Z" }),
      appointmentEvent({ external_booking_id: "old-rescheduled", status: "rescheduled", visit_date_time: "2026-05-01T15:00:00.000Z" }),
      appointmentEvent({ external_booking_id: "new-rescheduled-time", status: "scheduled", visit_date_time: "2026-05-02T15:00:00.000Z" }),
    ];

    const may1 = await fetchWebsiteFunnelData(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: funnelClient({ appointments }) as never },
    );
    const may2 = await fetchWebsiteFunnelData(
      { startDate: "2026-05-02", endDate: "2026-05-02" },
      { client: funnelClient({ appointments }) as never },
    );

    assert.equal(may1.overview.websiteScheduleConversions, 1);
    assert.equal(may1.trend[0]?.websiteScheduleConversions, 1);
    assert.equal(may2.overview.websiteScheduleConversions, 1);
    assert.equal(may2.trend[0]?.websiteScheduleConversions, 1);
  });

  it("joins paid Meta conversion by Acuity ID even when conversion occurred outside the date range", async () => {
    const appointments = [
      appointmentEvent({ external_booking_id: "apt-paid", visit_date_time: "2026-05-01T13:00:00.000Z" }),
    ];
    const conversions = [
      {
        acuity_appointment_id: "apt-paid",
        event_id: "conversion-paid",
        event_name: "Schedule",
        meta_event_name: "Schedule",
        occurred_at: "2026-04-29T20:00:00.000Z",
        source_type: "paid_meta",
      },
    ];

    const data = await fetchWebsiteFunnelData(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: funnelClient({ appointments, conversions }) as never },
    );

    assert.equal(data.overview.websiteScheduleConversions, 1);
    assert.equal(data.overview.paidMetaScheduleConversions, 1);
    assert.equal(data.trend[0]?.paidMetaScheduleConversions, 1);
  });

  it("reconciles missing conversions from existing rich website events without overwriting the event", async () => {
    const appointment = appointmentEvent({
      external_booking_id: "apt-rich",
      id: "appointment-rich",
      visit_date_time: "2026-05-01T13:00:00.000Z",
    });
    const richEvent = websiteEvent({
      acuity_appointment_id: "apt-rich",
      environment: "production",
      event_id: "acuity-apt-rich",
      event_name: "Schedule",
      event_type: "conversion",
      meta_event_name: "Schedule",
      occurred_at: "2026-05-01T12:00:00.000Z",
      properties: { browserTracked: true },
      raw_json: {
        tracking: {
          attribution: {
            capturedAt: "2026-04-30T12:00:00.000Z",
            eventId: "paid-touch",
            eventName: "PageView",
            pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=fb&utm_medium=paid_social&utm_campaign_id=campaign-1",
            source: "shopify_browser",
            sourceType: "paid_meta",
          },
        },
      },
      session_id: "session-rich",
      source: "shopify_browser",
      source_type: "paid_meta",
      visitor_id: "visitor-rich",
    });
    const client = reconciliationClient({
      appointment_events: [appointment],
      website_events: [richEvent],
      website_conversions: [],
      website_sessions: [],
      website_visitors: [],
    });

    const result = await reconcileAppointmentConversionsToWebsiteEvents(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: client as never },
    );

    assert.equal(result.insertedConversions, 1);
    assert.equal(result.skippedExistingConversions, 0);
    assert.equal(client.upserts.filter((row) => row.table === "website_events").length, 0);
    const conversion = client.upserts.find((row) => row.table === "website_conversions")?.row as Record<string, unknown>;
    assert.equal(conversion.session_id, "session-rich");
    assert.equal(conversion.visitor_id, "visitor-rich");
    assert.equal(objectRecord(conversion.properties).browserTracked, true);
    assert.equal(objectRecord(conversion.last_paid_touch).sourceType, "paid_meta");
  });

  it("reconciliation creates both event and conversion when no website event exists", async () => {
    const client = reconciliationClient({
      appointment_events: [
        appointmentEvent({
          external_booking_id: "apt-missing-event",
          id: "appointment-missing-event",
          visit_date_time: "2026-05-01T13:00:00.000Z",
        }),
      ],
      website_events: [],
      website_conversions: [],
      website_sessions: [],
      website_visitors: [],
    });

    const result = await reconcileAppointmentConversionsToWebsiteEvents(
      { startDate: "2026-05-01", endDate: "2026-05-01" },
      { client: client as never },
    );

    assert.equal(result.insertedConversions, 1);
    assert.equal(client.upserts.filter((row) => row.table === "website_events").length, 1);
    assert.equal(client.upserts.filter((row) => row.table === "website_conversions").length, 1);
  });

  it("treats Meta click identifiers and ad IDs as paid touches", () => {
    assert.equal(
      isPaidTouch({
        capturedAt: "2026-05-19T10:00:00.000Z",
        eventId: "evt-1",
        eventName: "PageView",
        pageUrl: "https://www.hungphatusa.com/",
        source: "shopify_browser",
        sourceType: "direct",
        utm: { adId: "2380000000001", campaignId: "2380000000002" },
      }),
      true,
    );

    assert.equal(
      isPaidTouch({
        capturedAt: "2026-05-19T10:00:00.000Z",
        eventId: "evt-2",
        eventName: "PageView",
        pageUrl: "https://www.hungphatusa.com/",
        source: "shopify_browser",
        sourceType: "direct",
      }),
      false,
    );
  });

  it("does not let direct fbc-only returns replace richer paid ad context", () => {
    const originalAdTouch = {
      capturedAt: "2026-05-19T10:00:00.000Z",
      eventId: "evt-paid",
      eventName: "PageView",
      fbc: "fb.1.1779200000000.original-click",
      fbp: "fb.1.1779200000000.123",
      pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=original-click",
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        adId: "2380000000001",
        adsetId: "2380000000002",
        campaignId: "2380000000003",
        fbclid: "original-click",
      },
    };

    const directReturnTouch = {
      capturedAt: "2026-05-20T10:00:00.000Z",
      eventId: "evt-direct-return",
      eventName: "PageView",
      fbc: "fb.1.1779200000000.original-click",
      fbp: "fb.1.1779200000000.123",
      pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment",
      source: "shopify_browser",
      sourceType: "paid_meta",
    };

    assert.equal(selectLastPaidTouch(originalAdTouch, directReturnTouch), originalAdTouch);
  });

  it("does not let Instagram link-in-bio fbclid-only returns replace richer paid ad context", () => {
    const originalAdTouch = {
      capturedAt: "2026-05-20T22:59:07.892Z",
      eventId: "evt-paid",
      eventName: "PageView",
      fbc: "fb.1.1779317947891.original-click",
      fbp: "fb.1.1779317947891.123",
      pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=original-click",
      source: "shopify_browser",
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

    const linkInBioTouch = {
      capturedAt: "2026-05-20T23:48:27.772Z",
      eventId: "evt-link-in-bio",
      eventName: "PageView",
      fbc: "fb.1.1779320908163.link-in-bio-click",
      fbp: "fb.1.1779320908167.123",
      pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=ig&utm_medium=social&utm_content=link_in_bio&fbclid=link-in-bio-click",
      referrer: "https://l.instagram.com/",
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        content: "link_in_bio",
        fbclid: "link-in-bio-click",
        medium: "social",
        source: "ig",
      },
    };

    assert.equal(selectLastPaidTouch(originalAdTouch, linkInBioTouch), originalAdTouch);
  });

  it("uses the newer touch when paid touches have the same richness", () => {
    const olderAdTouch = {
      capturedAt: "2026-05-20T22:00:00.000Z",
      eventId: "evt-paid-old",
      eventName: "PageView",
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        adId: "old-ad",
        adsetId: "old-adset",
        campaignId: "old-campaign",
      },
    };
    const newerAdTouch = {
      capturedAt: "2026-05-20T23:00:00.000Z",
      eventId: "evt-paid-new",
      eventName: "PageView",
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        adId: "new-ad",
        adsetId: "new-adset",
        campaignId: "new-campaign",
      },
    };

    assert.equal(selectLastPaidTouch(olderAdTouch, newerAdTouch), newerAdTouch);
  });

  it("keeps conversion storage pointed at the original paid attribution time", () => {
    const originalAdTouch = {
      capturedAt: "2026-05-22T17:45:49.970Z",
      eventId: "evt-paid",
      eventName: "PageView",
      fbc: "fb.1.1779471949970.original-click",
      fbp: "fb.1.1779471949970.123",
      pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=original-click",
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        adId: "120244031602180650",
        adsetId: "120242517363420650",
        campaignId: "120234691669940650",
        content: "DM_IG_HeyBeyArea",
        fbclid: "original-click",
        medium: "paid_social",
        source: "ig",
      },
    };
    const bookingPaidEcho = {
      ...originalAdTouch,
      capturedAt: "2026-05-22T18:04:05.382Z",
      eventId: "acuity-1709637713",
      eventName: "Schedule",
      source: "booking_api",
    };

    assert.equal(
      selectOriginalPaidTouch([bookingPaidEcho, originalAdTouch], {
        maxCapturedAt: "2026-05-22T18:04:05.382Z",
      }),
      originalAdTouch,
    );

    const fbcOnlyOriginalTouch = {
      ...originalAdTouch,
      utm: undefined,
    };
    assert.equal(
      selectOriginalPaidTouch([bookingPaidEcho, fbcOnlyOriginalTouch], {
        maxCapturedAt: "2026-05-22T18:04:05.382Z",
      }),
      fbcOnlyOriginalTouch,
    );
  });

  it("ignores known paid touches after the booking cutoff", () => {
    const bookingTouch = {
      capturedAt: "2026-05-20T23:49:18.756Z",
      eventId: "acuity-1708622080",
      eventName: "Schedule",
      source: "booking_api",
      sourceType: "paid_meta",
      utm: {
        adId: "booking-ad",
        adsetId: "booking-adset",
        campaignId: "booking-campaign",
      },
    };
    const afterBookingTouch = {
      capturedAt: "2026-05-20T23:49:27.795Z",
      eventId: "evt-after-booking",
      eventName: "Engaged60Seconds",
      source: "shopify_browser",
      sourceType: "paid_meta",
      utm: {
        adId: "after-booking-ad",
        adsetId: "after-booking-adset",
        campaignId: "after-booking-campaign",
      },
    };

    assert.equal(
      selectBestPaidTouch([bookingTouch, afterBookingTouch], {
        maxCapturedAt: "2026-05-20T23:49:18.756Z",
      }),
      bookingTouch,
    );
  });

  it("requires the shared secret for server-side conversion and attribution endpoints", () => {
    const previous = process.env.WEBSITE_EVENT_SHARED_SECRET;
    process.env.WEBSITE_EVENT_SHARED_SECRET = "server-secret";

    assert.equal(isAuthorizedConversionRequest(new Request("https://example.com")), false);
    assert.equal(
      isAuthorizedConversionRequest(
        new Request("https://example.com", {
          headers: { Authorization: "Bearer server-secret" },
        }),
      ),
      true,
    );

    if (previous === undefined) delete process.env.WEBSITE_EVENT_SHARED_SECRET;
    else process.env.WEBSITE_EVENT_SHARED_SECRET = previous;
  });

  it("extracts approximate browser geo from Vercel headers", () => {
    const geo = websiteGeoFromRequest(
      new Request("https://example.com", {
        headers: {
          "x-vercel-ip-city": "San%20Jose",
          "x-vercel-ip-country": "us",
          "x-vercel-ip-country-region": "ca",
          "x-vercel-ip-latitude": "37.3382",
          "x-vercel-ip-longitude": "-121.8863",
          "x-vercel-ip-timezone": "America/Los_Angeles",
        },
      }),
    );

    assert.deepEqual(geo, {
      geo_city: "San Jose",
      geo_country: "US",
      geo_region: "CA",
      geo_timezone: "America/Los_Angeles",
    });
  });

  it("does not use booking API request geo as customer location", () => {
    const geo = websiteGeoFromRequest(
      new Request("https://example.com", {
        headers: {
          "x-vercel-ip-city": "Dallas",
          "x-vercel-ip-country": "US",
          "x-vercel-ip-country-region": "TX",
          "x-vercel-ip-timezone": "America/Chicago",
        },
      }),
      "booking_api",
    );

    assert.deepEqual(geo, {
      geo_city: null,
      geo_country: null,
      geo_region: null,
      geo_timezone: null,
    });
  });

  it("aggregates website sessions and schedules by approximate location", () => {
    const locations = buildWebsiteLocationBreakdown([
      locationEvent({
        event_name: "PageView",
        geo_city: "San Jose",
        geo_country: "US",
        geo_region: "CA",
        session_id: "session-1",
      }),
      locationEvent({
        event_name: "Engaged60Seconds",
        geo_city: "San Jose",
        geo_country: "US",
        geo_region: "CA",
        session_id: "session-1",
      }),
      locationEvent({
        event_name: "Schedule",
        geo_city: "San Jose",
        geo_country: "US",
        geo_region: "CA",
        session_id: "session-1",
      }),
      locationEvent({
        event_name: "PageView",
        geo_city: "Oakland",
        geo_country: "US",
        geo_region: "CA",
        session_id: "session-2",
      }),
      locationEvent({
        event_name: "PageView",
        geo_city: null,
        geo_country: null,
        geo_region: null,
        session_id: "session-3",
      }),
    ]);

    assert.deepEqual(locations, [
      {
        city: "San Jose",
        country: "US",
        region: "CA",
        scheduleRate: 1,
        schedules: 1,
        sessions: 1,
      },
      {
        city: "Oakland",
        country: "US",
        region: "CA",
        scheduleRate: 0,
        schedules: 0,
        sessions: 1,
      },
    ]);
  });

  it("normalizes the live booking API payload into a Schedule conversion with full tracking", () => {
    const conversion = normalizeBookingConversionPayload({
      appointment: {
        id: 1706526506,
        type: "General Meeting",
      },
      datetime: "2026-05-17T14:00:00-0700",
      email: "customer@example.com",
      firstName: "Anthony",
      lastName: "Tran",
      notes: "Party size: Two of us",
      phone: "(408) 555-1212",
      source: {
        pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment",
        userAgent: "Mozilla/5.0",
      },
      tracking: {
        attribution: {
          fbc: "fb.1.1779200000000.original-click",
          fbp: "fb.1.1779200000000.123",
          landingPageUrl:
            "https://www.hungphatusa.com/pages/book-an-appointment?fbclid=original-click",
          referrer: "https://www.instagram.com/",
          utm: {
            adId: "2380000000001",
            adsetId: "2380000000002",
            campaignId: "2380000000003",
            fbclid: "original-click",
            medium: "paid_social",
            source: "facebook",
          },
        },
        eventId: "theme-schedule-event",
        eventSourceUrl: "https://www.hungphatusa.com/pages/book-an-appointment",
        pageGroup: "booking",
        pagePath: "/pages/book-an-appointment",
        sessionId: "hp_sid-session",
        visitorId: "hp_vid-visitor",
      },
    }) as Record<string, unknown>;

    assert.equal(conversion.eventId, "theme-schedule-event");
    assert.equal(conversion.metaEventId, "theme-schedule-event");
    assert.equal(conversion.metaEventName, "Schedule");
    assert.equal(conversion.acuityAppointmentId, "1706526506");
    assert.equal(conversion.appointmentType, "General Meeting");
    const eventSourceUrl = new URL(String(conversion.eventSourceUrl));
    assert.equal(eventSourceUrl.origin + eventSourceUrl.pathname, "https://www.hungphatusa.com/pages/book-an-appointment");
    assert.equal(eventSourceUrl.searchParams.get("utm_ad_id"), "2380000000001");
    assert.equal(eventSourceUrl.searchParams.get("utm_adset_id"), "2380000000002");
    assert.equal(eventSourceUrl.searchParams.get("utm_campaign_id"), "2380000000003");
    assert.equal(eventSourceUrl.searchParams.get("fbclid"), "original-click");
    assert.equal(conversion.fbc, "fb.1.1779200000000.original-click");
    assert.equal(conversion.fbp, "fb.1.1779200000000.123");
    assert.equal(conversion.pageGroup, "booking");
    assert.equal(conversion.pagePath, "/pages/book-an-appointment");
    assert.equal(conversion.sessionId, "hp_sid-session");
    assert.equal(conversion.visitorId, "hp_vid-visitor");
    assert.deepEqual(conversion.customer, {
      email: "customer@example.com",
      firstName: "Anthony",
      lastName: "Tran",
      phone: "(408) 555-1212",
    });
    assert.deepEqual(conversion.utm, {
      adId: "2380000000001",
      adsetId: "2380000000002",
      campaignId: "2380000000003",
      fbclid: "original-click",
      medium: "paid_social",
      source: "facebook",
    });
  });

  it("flattens nested tracking before attribution resolution", () => {
    const attribution = normalizeBookingAttributionPayload({
      source: {
        pageUrl: "https://www.hungphatusa.com/pages/book-an-appointment",
      },
      tracking: {
        eventSourceUrl:
          "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=facebook",
        fbc: "fb.1.1779200000000.original-click",
        fbp: "fb.1.1779200000000.123",
        sessionId: "hp_sid-session",
        utm: {
          campaignId: "2380000000003",
          source: "facebook",
        },
        visitorId: "hp_vid-visitor",
      },
    }) as Record<string, unknown>;

    const eventSourceUrl = new URL(String(attribution.eventSourceUrl));
    assert.equal(eventSourceUrl.origin + eventSourceUrl.pathname, "https://www.hungphatusa.com/pages/book-an-appointment");
    assert.equal(eventSourceUrl.searchParams.get("utm_campaign_id"), "2380000000003");
    assert.equal(eventSourceUrl.searchParams.get("utm_source"), "facebook");
    assert.equal(attribution.fbc, "fb.1.1779200000000.original-click");
    assert.equal(attribution.fbp, "fb.1.1779200000000.123");
    assert.equal(attribution.sessionId, "hp_sid-session");
    assert.deepEqual(attribution.utm, {
      campaignId: "2380000000003",
      source: "facebook",
    });
    assert.equal(attribution.visitorId, "hp_vid-visitor");
  });

  it("fills missing tracking IDs from booking URL query params", () => {
    const pageUrl =
      "https://www.hungphatusa.com/pages/book-an-appointment?utm_source=fb&utm_medium=paid_social&utm_campaign=Campaign+Name&utm_campaign_id=url-campaign&utm_adset_id=url-adset&utm_content=Creative&utm_ad_id=url-ad&utm_placement=Facebook_Feed&fbclid=paid-click";
    const conversion = normalizeBookingConversionPayload({
      appointment: {
        id: 1708409464,
        type: "Virtual Custom Design Consultation",
      },
      email: "customer@example.com",
      firstName: "Adrian",
      lastName: "Test",
      source: { pageUrl },
      tracking: {
        eventSourceUrl: pageUrl,
        sessionId: "hp_sid-session",
        utm: {
          adId: "explicit-ad",
          campaign: "Campaign Name",
          content: "Creative",
          medium: "paid_social",
          source: "fb",
        },
        visitorId: "hp_vid-visitor",
      },
    }) as Record<string, unknown>;

    assert.deepEqual(conversion.utm, {
      adId: "explicit-ad",
      adsetId: "url-adset",
      campaign: "Campaign Name",
      campaignId: "url-campaign",
      content: "Creative",
      fbclid: "paid-click",
      medium: "paid_social",
      placement: "Facebook_Feed",
      source: "fb",
    });

    const eventSourceUrl = new URL(String(conversion.eventSourceUrl));
    assert.equal(eventSourceUrl.searchParams.get("utm_campaign_id"), "url-campaign");
    assert.equal(eventSourceUrl.searchParams.get("utm_adset_id"), "url-adset");
    assert.equal(eventSourceUrl.searchParams.get("utm_ad_id"), "url-ad");
  });

  it("keeps the raw customer-linked event retention window at 24 months", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260519091500_attribution_ledger.sql", import.meta.url),
      "utf8",
    );

    assert.match(migration, /interval '24 months'/);
    assert.match(migration, /anonymize_expired_website_attribution/);
  });

  it("clears stored location during website attribution anonymization", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260522090000_website_geo_location_fields.sql", import.meta.url),
      "utf8",
    );

    assert.match(migration, /interval '24 months'/);
    assert.match(migration, /geo_city = null/);
    assert.match(migration, /geo_timezone = null/);
  });
});

function resolvedSelect(
  data: unknown[],
  rangeCalls: Array<[number, number]> = [],
  eqCalls: Array<[string, unknown]> = [],
) {
  let selected = data;
  const chain = {
    eq(column: string, value: unknown) {
      eqCalls.push([column, value]);
      return chain;
    },
    gte(column: string, value: unknown) {
      selected = selected.filter((row) => String((row as Record<string, unknown>)[column] ?? "") >= String(value ?? ""));
      return chain;
    },
    lte(column: string, value: unknown) {
      selected = selected.filter((row) => String((row as Record<string, unknown>)[column] ?? "") <= String(value ?? ""));
      return chain;
    },
    in(column: string, values: unknown[]) {
      selected = selected.filter((row) => values.includes((row as Record<string, unknown>)[column]));
      return chain;
    },
    order() {
      return chain;
    },
    limit() {
      return chain;
    },
    range(from: number, to: number) {
      rangeCalls.push([from, to]);
      selected = selected.slice(from, to + 1);
      return chain;
    },
    then(resolve: (value: { data: unknown[]; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve({ data: selected, error: null }).then(resolve, reject);
    },
    maybeSingle() {
      return Promise.resolve({ data: selected[0] || null, error: null });
    },
    single() {
      return Promise.resolve({ data: selected[0], error: null });
    },
  };
  return chain;
}

function appointmentEvent(overrides: Record<string, unknown> = {}) {
  return {
    appt_id: "acuity:apt-1",
    booked_at: "2026-04-30T10:00:00.000Z",
    booking_source: "acuity",
    brand: "hpusa",
    created_at: "2026-04-30T10:00:00.000Z",
    external_booking_id: "apt-1",
    id: "appointment-event-1",
    raw_payload: {},
    source: "Acuity",
    status: "active",
    visit_date_time: "2026-05-01T13:00:00.000Z",
    visit_type: "General Meeting",
    ...overrides,
  };
}

function funnelClient(input: {
  appointments?: unknown[];
  conversions?: unknown[];
  events?: unknown[];
  metaRows?: unknown[];
}) {
  return {
    from(table: "appointment_events" | "website_events" | "website_conversions" | "meta_daily_insights") {
      return {
        select() {
          return resolvedSelect(
            table === "website_events"
              ? input.events || []
              : table === "website_conversions"
                ? input.conversions || []
                : table === "appointment_events"
                  ? input.appointments || []
                  : input.metaRows || [],
          );
        },
      };
    },
  };
}

function reconciliationClient(input: Record<string, unknown[]>) {
  const upserts: Array<{ row: unknown; table: string }> = [];
  const updates: Array<{ patch: unknown; table: string }> = [];
  const client = {
    upserts,
    updates,
    from(table: string) {
      return {
        select() {
          return resolvedSingleSelect(input[table] || []);
        },
        update(patch: unknown) {
          updates.push({ patch, table });
          return {
            eq() {
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
        upsert(row: unknown) {
          upserts.push({ row, table });
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({ data: { id: `${table}-id` }, error: null });
                },
              };
            },
            then(resolve: (value: { data: null; error: null }) => unknown, reject?: (reason: unknown) => unknown) {
              return Promise.resolve({ data: null, error: null }).then(resolve, reject);
            },
          };
        },
      };
    },
  };
  return client;
}

function resolvedSingleSelect(data: unknown[]) {
  return resolvedSelect(data);
}

function websiteEvent(overrides: Record<string, unknown>) {
  return {
    acuity_appointment_id: null,
    customer_email: null,
    customer_name: null,
    customer_phone: null,
    event_id: "event-id",
    event_name: "PageView",
    event_type: "page",
    geo_city: null,
    geo_country: null,
    geo_region: null,
    geo_timezone: null,
    meta_event_id: null,
    meta_event_name: null,
    occurred_at: "2026-05-01T00:00:00.000Z",
    page_group: "other",
    page_path: "/",
    page_title: "Page",
    page_url: "https://www.hungphatusa.com/",
    properties: {},
    session_id: "session-id",
    source: "shopify_browser",
    source_type: "direct",
    utm_ad_id: null,
    utm_adset_id: null,
    utm_campaign_id: null,
    visitor_id: null,
    ...overrides,
  };
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function locationEvent(overrides: Partial<WebsiteLocationEventInput>): WebsiteLocationEventInput {
  return {
    event_name: "PageView",
    geo_city: null,
    geo_country: null,
    geo_region: null,
    meta_event_name: null,
    session_id: "session-1",
    ...overrides,
  };
}
