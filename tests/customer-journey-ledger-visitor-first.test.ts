// Phase 2 — /convert loader inversion verification.
//
// The pre-Phase-2 loader was appointment-keyed: visitors who browsed the
// site but never booked were structurally unreachable. The spike's Track 4a
// found that 584 total visitors / 112 active in last 30d produced only ~2
// surface rows in the UI; the other rows were visitor-less appointment
// shells displayed as em-dashes.
//
// This test asserts:
//   1. The ledger surfaces a meaningful number of in-window visitors
//      (not just visitors discovered via appointments).
//   2. Every row has at least one identifier — no empty/orphan rows.
//
// Requires SUPABASE env vars at test time; skips otherwise so local dev
// without secrets does not break CI.

import test from "node:test";
import assert from "node:assert/strict";
import { fetchCustomerJourneyLedgerData } from "../src/lib/customer-journey-ledger.ts";
import { createAdsAnalystClient } from "../src/lib/ads-analyst-db.ts";
import { websiteAttributionEnvironment } from "../src/lib/website-analytics.ts";

const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL)
  && (Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) || Boolean(process.env.SUPABASE_ADS_ANALYST_WEB_KEY));

test(
  "ledger surfaces visitors active in window who didn't book",
  { skip: !hasEnv && "SUPABASE env not set" },
  async () => {
    // Pass explicit client to bypass the unstable_cache wrapper, which only
    // works inside a Next.js request context.
    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-23", endDate: "2026-05-22" },
      createAdsAnalystClient("web") as any,
    );
    // Per spike Track 4a sanity scan: 112 active visitors in last 30d.
    // Floor at 50 leaves headroom for natural data drift while still
    // detecting the visitor-less appointment-only regression.
    assert.ok(
      data.rows.length >= 50,
      `expected >=50 ledger rows for last-30d window, got ${data.rows.length}. Visitors-without-bookings should be present.`,
    );
  },
);

test(
  "every ledger row has at least one identifier (no orphan em-dash rows)",
  { skip: !hasEnv && "SUPABASE env not set" },
  async () => {
    // Pass explicit client to bypass the unstable_cache wrapper, which only
    // works inside a Next.js request context.
    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-23", endDate: "2026-05-22" },
      createAdsAnalystClient("web") as any,
    );
    const orphanRows = data.rows.filter((r) =>
      !r.visitorId && !r.acuityAppointmentId && !r.conversionEventId
    );
    assert.equal(
      orphanRows.length,
      0,
      `${orphanRows.length} of ${data.rows.length} rows have neither visitorId nor acuityAppointmentId nor conversionEventId`,
    );
  },
);

test(
  "summary.visitorsShown reflects visitors actually surfaced as rows",
  { skip: !hasEnv && "SUPABASE env not set" },
  async () => {
    // Pass explicit client to bypass the unstable_cache wrapper, which only
    // works inside a Next.js request context.
    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-23", endDate: "2026-05-22" },
      createAdsAnalystClient("web") as any,
    );
    // visitorsShown should at minimum cover every row that has a visitorId
    const rowsWithVisitor = data.rows.filter((r) => r.visitorId).length;
    assert.ok(
      data.summary.visitorsShown >= rowsWithVisitor,
      `summary.visitorsShown (${data.summary.visitorsShown}) < rows with visitorId (${rowsWithVisitor})`,
    );
  },
);

// Helper: build a visitor row with safe defaults for the new tests.
function makeVisitor(overrides: Record<string, unknown> = {}) {
  return {
    visitor_id: "v-default",
    first_seen_at: "2026-05-20T00:00:00.000Z",
    last_seen_at: "2026-05-20T12:00:00.000Z",
    first_page_url: null,
    last_page_url: null,
    first_touch: null,
    last_touch: null,
    last_paid_touch: null,
    fbp: null,
    fbc: null,
    user_agent: null,
    device_category: null,
    browser_name: null,
    os_name: null,
    geo_country: null,
    geo_region: null,
    geo_city: null,
    geo_timezone: null,
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    conversion_event_id: null,
    ...overrides,
  };
}

function makeAppointment(overrides: Record<string, unknown> = {}) {
  return {
    appt_id: "apt-default",
    booking_source: "acuity",
    external_booking_id: "acuity-id-default",
    visit_date_time: "2026-05-20T18:00:00.000Z",
    visit_type: "General Meeting",
    brand: "hpusa",
    status: "active",
    source: "Acuity",
    booked_at: "2026-05-18T10:00:00.000Z",
    created_at: "2026-05-18T10:00:00.000Z",
    raw_payload: {},
    id: "appt-row-default",
    ...overrides,
  };
}

function makeEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id: `event-${Math.random().toString(36).slice(2)}`,
    session_id: null,
    visitor_id: "v-default",
    environment: websiteAttributionEnvironment(),
    brand: null,
    source: null,
    event_name: "PageView",
    event_type: "page",
    occurred_at: "2026-05-20T10:00:00.000Z",
    page_url: null,
    referrer: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    utm_content: null,
    utm_term: null,
    utm_id: null,
    utm_creative: null,
    utm_ad: null,
    utm_ad_id: null,
    utm_adset: null,
    utm_adset_id: null,
    utm_placement: null,
    fbclid: null,
    fbp: null,
    fbc: null,
    geo_country: null,
    geo_region: null,
    geo_city: null,
    geo_timezone: null,
    device_category: null,
    browser_name: null,
    os_name: null,
    source_type: null,
    acuity_appointment_id: null,
    appointment_type: null,
    customer_name: null,
    customer_email: null,
    customer_phone: null,
    properties: null,
    raw_json: null,
    ...overrides,
  };
}

// Lightweight mock that mirrors mockCustomerJourneyClient from
// tests/attribution-ledger.test.ts. Duplicated rather than imported because
// the source file is a *.test.ts that node:test treats as a peer test file.
// If this duplication grows, factor both into tests/_helpers/.
function makeMockClient(input: {
  appointment_events?: object[];
  website_conversions?: object[];
  website_events?: object[];
  website_sessions?: object[];
  website_visitors?: object[];
}) {
  return {
    from(table: keyof typeof input) {
      return {
        select() {
          let rows = (input[table] || []).map((row) => row as Record<string, unknown>);
          const chain: any = {
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
            then(onfulfilled: any) {
              return Promise.resolve({ data: rows, error: null }).then(onfulfilled);
            },
          };
          return chain;
        },
      };
    },
  };
}

test(
  "visitor-only row gets booking_page_view stage from a PageView on the booking page",
  async () => {
    const apptId = "acuity-xyz-anchored";
    const apptVisitor = makeVisitor({ visitor_id: "v-anchored" });
    const browseOnlyVisitor = makeVisitor({
      visitor_id: "v-browse",
      last_seen_at: "2026-05-20T13:00:00.000Z",
    });
    const appointment = makeAppointment({
      external_booking_id: apptId,
      visit_date_time: "2026-05-20T18:00:00.000Z",
    });
    const browsePageView = makeEvent({
      event_id: "evt-browse-pv",
      visitor_id: "v-browse",
      event_name: "PageView",
      page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
      occurred_at: "2026-05-20T12:30:00.000Z",
    });
    const client = makeMockClient({
      appointment_events: [appointment],
      website_visitors: [apptVisitor, browseOnlyVisitor],
      website_events: [browsePageView],
      website_conversions: [],
      website_sessions: [],
    });

    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-24", endDate: "2026-05-23" },
      client as any,
    );

    const browseRow = data.rows.find((r) => r.visitorId === "v-browse");
    assert.ok(browseRow, "expected a row for the browse-only visitor");
    assert.ok(
      browseRow!.stageKeys.includes("booking_page_view"),
      `expected stageKeys to include "booking_page_view"; got ${JSON.stringify(browseRow!.stageKeys)}`,
    );
  },
);

test(
  "every website_events fetch projects event_id (regression: uniqueEvents dedupes by event_id; missing it collapses helper rows to one Map entry, surfaced via bug where 211 unanchored visitors with booking PageViews showed as only 1)",
  async () => {
    const appointment = makeAppointment({ external_booking_id: "anchor-dedup" });
    const apptVisitor = makeVisitor({ visitor_id: "v-anchor-dedup" });
    const browse = makeVisitor({ visitor_id: "v-browse-x" });
    const pv = makeEvent({
      visitor_id: "v-browse-x",
      event_name: "PageView",
      page_url: "https://www.hungphatusa.com/pages/book-an-appointment",
      occurred_at: "2026-05-20T12:30:00.000Z",
    });

    // Wrap makeMockClient and capture every column list passed to .select()
    // on website_events. Each query must include event_id; otherwise the
    // returned rows collide in uniqueEvents (Map keyed by event_id).
    const selectColsOnWebsiteEvents: string[] = [];
    const inner = makeMockClient({
      appointment_events: [appointment],
      website_visitors: [apptVisitor, browse],
      website_events: [pv],
      website_conversions: [],
      website_sessions: [],
    });
    const spyClient = {
      from(table: string) {
        const innerFrom = inner.from(table as any);
        if (table !== "website_events") return innerFrom;
        return {
          select(cols: string) {
            selectColsOnWebsiteEvents.push(cols);
            return innerFrom.select();
          },
        };
      },
    };

    await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-24", endDate: "2026-05-23" },
      spyClient as any,
    );

    assert.ok(
      selectColsOnWebsiteEvents.length > 0,
      "expected at least one website_events SELECT",
    );
    for (const cols of selectColsOnWebsiteEvents) {
      const colSet = new Set(cols.split(",").map((c) => c.trim()));
      assert.ok(
        colSet.has("event_id"),
        `website_events SELECT must include event_id (uniqueEvents dedupes by it); got: ${cols}`,
      );
    }
  },
);

test(
  "visitor-only row gets booking_form_started stage from a BookingFormStarted event",
  async () => {
    const appointment = makeAppointment({ external_booking_id: "anchor" });
    const apptVisitor = makeVisitor({ visitor_id: "v-anchor" });
    const browseVisitor = makeVisitor({ visitor_id: "v-form", last_seen_at: "2026-05-20T13:00:00.000Z" });
    const formEvent = makeEvent({
      event_id: "evt-form",
      visitor_id: "v-form",
      event_name: "BookingFormStarted",
      occurred_at: "2026-05-20T12:50:00.000Z",
    });
    const client = makeMockClient({
      appointment_events: [appointment],
      website_visitors: [apptVisitor, browseVisitor],
      website_events: [formEvent],
      website_conversions: [],
      website_sessions: [],
    });

    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-24", endDate: "2026-05-23" },
      client as any,
    );

    const row = data.rows.find((r) => r.visitorId === "v-form");
    assert.ok(row, "expected a row for the form-started visitor");
    assert.ok(
      row!.stageKeys.includes("booking_form_started"),
      `expected stageKeys to include "booking_form_started"; got ${JSON.stringify(row!.stageKeys)}`,
    );
  },
);

test(
  "visitor-only row with no booking events has only the baseline stageKey",
  async () => {
    const appointment = makeAppointment({ external_booking_id: "anchor2" });
    const apptVisitor = makeVisitor({ visitor_id: "v-anchor2" });
    const browseVisitor = makeVisitor({
      visitor_id: "v-empty",
      last_seen_at: "2026-05-20T14:00:00.000Z",
    });
    // Non-booking event that should be ignored by the narrow fetch
    const noiseEvent = makeEvent({
      event_id: "evt-noise",
      visitor_id: "v-empty",
      event_name: "PageView",
      page_url: "https://www.hungphatusa.com/collections/all", // NOT booking
    });
    const client = makeMockClient({
      appointment_events: [appointment],
      website_visitors: [apptVisitor, browseVisitor],
      website_events: [noiseEvent],
      website_conversions: [],
      website_sessions: [],
    });

    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-24", endDate: "2026-05-23" },
      client as any,
    );

    const row = data.rows.find((r) => r.visitorId === "v-empty");
    assert.ok(row, "expected a row for the noise-only visitor");
    assert.deepEqual(
      row!.stageKeys,
      ["visitor_only"],
      `expected only ["visitor_only"]; got ${JSON.stringify(row!.stageKeys)}`,
    );
  },
);

test(
  "anchored visitor row stage keys are unaffected by the new fetch",
  async () => {
    const apptId = "acuity-anchor3";
    const apptVisitor = makeVisitor({ visitor_id: "v-anchored3" });
    const appointment = makeAppointment({
      external_booking_id: apptId,
      visit_date_time: "2026-05-20T18:00:00.000Z",
    });
    // Conversion that links the appointment to the anchored visitor
    const conversion = {
      event_id: "conv-anchored",
      session_id: null,
      visitor_id: "v-anchored3",
      occurred_at: "2026-05-20T17:00:00.000Z",
      received_at: null,
      source_type: "direct",
      acuity_appointment_id: apptId,
      appointment_type: "General Meeting",
      brand: "hpusa",
      customer_name: null,
      customer_email: null,
      customer_phone: null,
      meta_event_id: null,
      meta_capi_status: "sent",
      meta_capi_test_mode: null,
      fbp: null,
      fbc: null,
      geo_country: null,
      geo_region: null,
      geo_city: null,
      geo_timezone: null,
      user_agent: null,
      device_category: null,
      browser_name: null,
      os_name: null,
      page_url: null,
      referrer: null,
      first_touch: null,
      last_touch: null,
      last_paid_touch: null,
      conversion_touch: null,
      properties: null,
      raw_json: null,
    };
    const client = makeMockClient({
      appointment_events: [appointment],
      website_visitors: [apptVisitor],
      website_events: [],
      website_conversions: [conversion],
      website_sessions: [],
    });

    const data = await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-24", endDate: "2026-05-23" },
      client as any,
    );

    const row = data.rows.find((r) => r.visitorId === "v-anchored3");
    assert.ok(row, "expected a row for the anchored visitor");
    assert.equal(row!.hasConversion, true, "anchored visitor should have hasConversion=true");
    assert.ok(
      row!.stageKeys.includes("confirmed_website_bookings"),
      `anchored row should still include "confirmed_website_bookings"; got ${JSON.stringify(row!.stageKeys)}`,
    );
  },
);

test(
  "no booking-event query is issued when there are no unanchored visitors",
  async () => {
    const apptId = "acuity-anchor4";
    const apptVisitor = makeVisitor({ visitor_id: "v-only-anchored" });
    const appointment = makeAppointment({
      external_booking_id: apptId,
      visit_date_time: "2026-05-20T18:00:00.000Z",
    });
    const conversion = {
      event_id: "conv-only-anchored",
      session_id: null,
      visitor_id: "v-only-anchored",
      occurred_at: "2026-05-20T17:00:00.000Z",
      received_at: null,
      source_type: "direct",
      acuity_appointment_id: apptId,
      appointment_type: "General Meeting",
      brand: "hpusa",
      customer_name: null,
      customer_email: null,
      customer_phone: null,
      meta_event_id: null,
      meta_capi_status: "sent",
      meta_capi_test_mode: null,
      fbp: null,
      fbc: null,
      geo_country: null,
      geo_region: null,
      geo_city: null,
      geo_timezone: null,
      user_agent: null,
      device_category: null,
      browser_name: null,
      os_name: null,
      page_url: null,
      referrer: null,
      first_touch: null,
      last_touch: null,
      last_paid_touch: null,
      conversion_touch: null,
      properties: null,
      raw_json: null,
    };

    // Track every .in() call to website_events with booking-form event names
    const bookingEventQueries: unknown[] = [];
    const wrappedClient = {
      from(table: string) {
        return {
          select(_cols: string) {
            const inner = makeMockClient({
              appointment_events: [appointment],
              website_visitors: [apptVisitor],
              website_events: [],
              website_conversions: [conversion],
              website_sessions: [],
            }).from(table as any).select();
            const proxy: any = new Proxy(inner, {
              get(target, prop) {
                if (prop === "in") {
                  return (column: string, values: unknown[]) => {
                    if (
                      table === "website_events" &&
                      column === "event_name" &&
                      Array.isArray(values) &&
                      (values as string[]).includes("BookingFormStarted")
                    ) {
                      bookingEventQueries.push(values);
                    }
                    return proxy;
                  };
                }
                return (target as any)[prop];
              },
            });
            return proxy;
          },
        };
      },
    };

    await fetchCustomerJourneyLedgerData(
      { startDate: "2026-04-24", endDate: "2026-05-23" },
      wrappedClient as any,
    );

    assert.equal(
      bookingEventQueries.length,
      0,
      "fetchBookingStageEventsForVisitors should NOT have been called when there are no unanchored visitors",
    );
  },
);
