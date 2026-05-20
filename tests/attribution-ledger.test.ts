import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildAttributionLedgerRows,
  type AttributionLedgerConversionRow,
  type AttributionLedgerSessionRow,
  type AttributionLedgerVisitorRow,
} from "../src/lib/attribution-ledger.ts";

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
});

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
    meta_event_id: null,
    occurred_at: "2026-05-19T18:30:00.000Z",
    os_name: "iOS",
    session_id: null,
    source_type: "paid_meta",
    user_agent: "Mozilla/5.0",
    visitor_id: "visitor-1",
    ...overrides,
  };
}
