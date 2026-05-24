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
