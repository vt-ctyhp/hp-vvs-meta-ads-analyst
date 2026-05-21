import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  appointmentEventToWebsiteConversionInput,
  isAuthorizedConversionRequest,
  isPaidTouch,
  normalizeBookingAttributionPayload,
  normalizeBookingConversionPayload,
  selectLastPaidTouch,
  type AppointmentEventConversionRow,
} from "../src/lib/website-analytics.ts";

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

  it("keeps the raw customer-linked event retention window at 24 months", async () => {
    const migration = await readFile(
      new URL("../supabase/migrations/20260519090000_attribution_ledger.sql", import.meta.url),
      "utf8",
    );

    assert.match(migration, /interval '24 months'/);
    assert.match(migration, /anonymize_expired_website_attribution/);
  });
});
