# Visitor-only stage-key correctness — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore stage-key correctness for visitor-only ledger rows on `/convert` so funnel-step filter chips (booking_page_view, booking_form_started, etc.) correctly include browse-but-no-book visitors — without giving up Phase 2.5 Fix A's perf win.

**Architecture:** Add one narrow `website_events` helper (`fetchBookingStageEventsForVisitors`) that pulls just the booking-funnel events for unanchored window visitors via two simple `Promise.all` queries. Merge the sparse events into the existing `events` array passed to `buildCustomerJourneyLedgerData`. No changes to row-building logic; `stageKeysForVisitorOnly` already reads from the events list.

**Tech Stack:** TypeScript (Next.js 16 server module), Supabase JS client, `node --test --experimental-strip-types` test runner.

**Companion documents:**
- Spec: [../specs/2026-05-24-visitor-only-stage-keys-design.md](../specs/2026-05-24-visitor-only-stage-keys-design.md)
- Codex review that surfaced the bug: this branch's Codex adversarial review output (finding #3, medium)

**Hard rules:**
1. No commits without explicit user approval (per project AGENTS.md). Each commit step ends with "ask user."
2. Changes confined to `src/lib/customer-journey-ledger.ts`, `tests/customer-journey-ledger-visitor-first.test.ts`, and (4-line addition only) `tests/attribution-ledger.test.ts` (mock chain `ilike` method).
3. NO changes to `buildCustomerJourneyLedgerRows`, `stageKeysForVisitorOnly`, the /convert page, or any API route.
4. NO schema changes, NO new dependencies.
5. TDD: failing test before implementation, every time.

---

## File Structure

**Files this plan will modify:**
- `src/lib/customer-journey-ledger.ts` — add `fetchBookingStageEventsForVisitors` helper + two call sites
- `tests/customer-journey-ledger-visitor-first.test.ts` — add 5 new tests
- `tests/attribution-ledger.test.ts` — add `ilike` method to `mockLedgerSelectChain` (4 lines)

**Files this plan will NOT modify:** anything in `src/app/`, `src/components/`, `src/lib/website-analytics.ts`, `src/lib/analytics.ts`, migrations, other tests.

---

## Task 0: Verify prerequisites

**Why:** Spec calls out two pre-implementation gates. Confirm both before writing code so the plan's assumptions hold.

**Files:** None modified. Read-only inspection + one temp script (deleted at end).

- [ ] **Step 1: Confirm the mock has no `.or()` method**

Already inspected during spec-writing; just re-confirm:

```bash
grep -nE "    or\b|^\s+or\(" tests/attribution-ledger.test.ts | head -5
```
Expected output: NO lines (the mock has no `or` method).

If you see an `or(` line, the spec's "two-query" decision needs reconsidering — STOP and re-decide before proceeding.

- [ ] **Step 2: Confirm the mock will need an `ilike` method**

```bash
grep -nE "ilike|like\(" tests/attribution-ledger.test.ts | head -5
```
Expected: NO matches. We'll add `ilike` to the mock in Task 4.

- [ ] **Step 3: Quick timing probe against production DB (sanity check, not a benchmark)**

Create `scripts/spike-p26-timing.ts` (temporary — deleted in step 5):
```typescript
// TEMP — Phase 2.6 perf sanity check. Delete after Task 0.
// Run: node --experimental-strip-types --env-file=.env.local scripts/spike-p26-timing.ts
import { createServiceClient } from "../src/lib/supabase.ts";

const s = createServiceClient();
const START = "2026-04-24T00:00:00.000Z";
const END = "2026-05-24T23:59:59.999Z";

// Pull window visitor IDs the same way the loader will
const { data: visitors } = await s
  .from("website_visitors")
  .select("visitor_id")
  .gte("last_seen_at", START).lte("last_seen_at", END)
  .order("last_seen_at", { ascending: false })
  .limit(500);
const ids = (visitors ?? []).map((v: any) => v.visitor_id);
console.log("visitor_ids in window:", ids.length);

// Time Query A — booking-form events
const t1 = performance.now();
const { data: a, error: ea } = await s
  .from("website_events")
  .select("visitor_id,session_id,event_name,page_url,occurred_at")
  .eq("environment", "production")
  .in("visitor_id", ids.slice(0, 100))
  .in("event_name", ["BookingFormStarted","BookingContactStarted","BookingVisitSelected","BookingDateSelected","BookingTimeSelected","BookingIdentityCaptured"])
  .limit(2500);
console.log(`Query A (booking funnel events, 100 visitors): ${Math.round(performance.now() - t1)}ms, ${a?.length ?? "ERR"} rows`, ea?.message ?? "");

// Time Query B — booking-page PageViews
const t2 = performance.now();
const { data: b, error: eb } = await s
  .from("website_events")
  .select("visitor_id,session_id,event_name,page_url,occurred_at")
  .eq("environment", "production")
  .in("visitor_id", ids.slice(0, 100))
  .eq("event_name", "PageView")
  .ilike("page_url", "%/book-an-appointment%")
  .limit(2500);
console.log(`Query B (booking-page PageViews, 100 visitors): ${Math.round(performance.now() - t2)}ms, ${b?.length ?? "ERR"} rows`, eb?.message ?? "");
```

Run:
```bash
node --experimental-strip-types --env-file=.env.local scripts/spike-p26-timing.ts
```

Expected: each query returns in well under 1 second for 100 visitors. If either exceeds 2 seconds, the implementation needs an index review BEFORE coding — STOP and report.

- [ ] **Step 4: Record findings**

Create `docs/superpowers/plans/2026-05-24-phase-2-6-execution/timing-baseline.md`:
```markdown
# P2.6 Task 0 — timing baseline

_Measured: <YYYY-MM-DD HH:MM>_

| Query | Visitor batch size | Time (ms) | Rows returned |
|---|---|---|---|
| A (booking funnel events) | 100 | <ms> | <n> |
| B (booking-page PageViews) | 100 | <ms> | <n> |

Conclusion: <ship/redesign>
```

- [ ] **Step 5: Delete temp script**

```bash
rm scripts/spike-p26-timing.ts
git status --short scripts/   # should show no new files
```

- [ ] **Step 6: Commit (with user approval)**

```bash
git add docs/superpowers/plans/2026-05-24-phase-2-6-execution/timing-baseline.md
```
Ask user: "Task 0 prereqs verified. Mock will need `ilike` (small change in Task 4). Query timing within budget. OK to commit the baseline doc?"
If approved:
```bash
git commit -m "docs(p2.6): timing baseline for visitor-only stage-key fix"
```

---

## Task 1: Write the failing test (TDD red)

**Why:** Establish the failing behavior first. Without this, "the implementation works" can't be falsified.

**Files:**
- Modify: `tests/customer-journey-ledger-visitor-first.test.ts`

- [ ] **Step 1: Read the existing test file's structure to match its import style**

```bash
head -25 tests/customer-journey-ledger-visitor-first.test.ts
```
Note: it imports from `../src/lib/customer-journey-ledger.ts` and uses a real `createAdsAnalystClient` for integration. We'll use `mockCustomerJourneyClient` for the new tests (extracted from `tests/attribution-ledger.test.ts`).

- [ ] **Step 2: Append the failing positive test**

Append to `tests/customer-journey-ledger-visitor-first.test.ts` (the file already imports `fetchCustomerJourneyLedgerData` at the top — no new imports needed):

```typescript
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
```

- [ ] **Step 3: Run the test to verify it FAILS**

```bash
set -a && source .env.local && set +a && npm test -- --test-name-pattern="visitor-only row gets booking_page_view" 2>&1 | tail -25
```
Expected: FAIL with `expected stageKeys to include "booking_page_view"; got ["visitor_only"]` (or similar).

If it passes, something is wrong — STOP. Either Phase 2.5 Fix A wasn't applied OR the fix is already in place. Investigate before proceeding.

- [ ] **Step 4: Commit the failing test (with user approval)**

Ask user: "Failing test added and confirmed RED. OK to commit?"
If approved:
```bash
git add tests/customer-journey-ledger-visitor-first.test.ts
git commit -m "test(ledger): add failing visitor-only stage-key test"
```

---

## Task 2: Implement `fetchBookingStageEventsForVisitors` helper

**Why:** The pure helper, without any call-site wiring. Easier to reason about in isolation.

**Files:**
- Modify: `src/lib/customer-journey-ledger.ts` — add helper near the existing `fetchRowsByVisitorIds` helper (around line 644)

- [ ] **Step 1: Add the import for `websiteAttributionEnvironment`**

At the top of `src/lib/customer-journey-ledger.ts`, find this section:
```typescript
import { selectOriginalPaidTouch } from "./attribution-touch-selection.ts";
import { createAdsAnalystClient } from "./ads-analyst-db.ts";
```

Change to:
```typescript
import { selectOriginalPaidTouch } from "./attribution-touch-selection.ts";
import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { websiteAttributionEnvironment } from "./website-analytics.ts";
```

Verify the function is exported in `website-analytics.ts`:
```bash
grep -nE "^export.*websiteAttributionEnvironment|^function websiteAttributionEnvironment" src/lib/website-analytics.ts
```
Expected: shows `function websiteAttributionEnvironment` at ~line 1873 but NOT `export`. If not exported, add `export` to the function declaration:

```bash
# Open src/lib/website-analytics.ts, find the function (around line 1873), and
# change `function websiteAttributionEnvironment()` to `export function
# websiteAttributionEnvironment()`. Confirm with:
grep -n "export function websiteAttributionEnvironment" src/lib/website-analytics.ts
```

- [ ] **Step 2: Add the constants near other booking-event constants**

In `src/lib/customer-journey-ledger.ts`, find `isBookingFormStartedLedgerEvent` (around line 1597) to confirm the event-name list. Add the constant near the top of the file, right after the existing constants block (around line 14, after `INVALID_APPOINTMENT_STATUSES`):

```typescript
// Phase 2.6 (visitor-only stage-key fix): event names that drive
// stageKeysForVisitorOnly when no full event history is fetched for
// unanchored visitors. Keep in sync with isBookingFormStartedLedgerEvent.
const BOOKING_FORM_EVENT_NAMES = [
  "BookingFormStarted",
  "BookingContactStarted",
  "BookingVisitSelected",
  "BookingDateSelected",
  "BookingTimeSelected",
  "BookingIdentityCaptured",
] as const;

const BOOKING_PAGE_URL_PATTERN = "%/book-an-appointment%";
```

- [ ] **Step 3: Add the helper function**

In `src/lib/customer-journey-ledger.ts`, find `fetchRowsByVisitorIds` (around line 644). Add the new helper RIGHT AFTER it:

```typescript
// Phase 2.6: pull only booking-funnel events for the given visitor IDs.
// Used to populate stageKeysForVisitorOnly for unanchored visitors without
// re-paying the full fan-out cost that Phase 2.5 Fix A optimized away.
// Returns SPARSE event rows — only visitor_id, session_id, event_name,
// page_url, occurred_at are populated. Safe to merge into the events array
// passed to buildCustomerJourneyLedgerData because the consumers
// (eventAttributionTouches, geoFromRecords, etc.) gracefully handle null
// fields.
async function fetchBookingStageEventsForVisitors(
  client: CustomerJourneyLedgerClient,
  visitorIds: string[],
): Promise<CustomerJourneyLedgerEventRow[]> {
  if (!visitorIds.length) return [];

  const env = websiteAttributionEnvironment();
  const cols = "visitor_id,session_id,event_name,page_url,occurred_at";
  const rows: CustomerJourneyLedgerEventRow[] = [];

  for (const batch of chunks(visitorIds, VISITOR_ID_QUERY_BATCH_SIZE)) {
    const [funnelResult, pageViewResult] = await Promise.all([
      client
        .from("website_events")
        .select(cols)
        .eq("environment", env)
        .in("visitor_id", batch)
        .in("event_name", [...BOOKING_FORM_EVENT_NAMES])
        .limit(MAX_RELATED_ROWS),
      client
        .from("website_events")
        .select(cols)
        .eq("environment", env)
        .in("visitor_id", batch)
        .eq("event_name", "PageView")
        .ilike("page_url", BOOKING_PAGE_URL_PATTERN)
        .limit(MAX_RELATED_ROWS),
    ]);

    if (funnelResult.error) throw funnelResult.error;
    if (pageViewResult.error) throw pageViewResult.error;

    rows.push(...((funnelResult.data ?? []) as CustomerJourneyLedgerEventRow[]));
    rows.push(...((pageViewResult.data ?? []) as CustomerJourneyLedgerEventRow[]));
  }

  return rows;
}
```

- [ ] **Step 4: Verify the helper compiles**

```bash
npx tsc --noEmit
```
Expected: no new errors related to `fetchBookingStageEventsForVisitors`. If `CustomerJourneyLedgerClient` doesn't type the `ilike` method, that's expected — see Task 3 for the typing fix. Other type errors → STOP and fix.

- [ ] **Step 5: Add `ilike` to the CustomerJourneyLedgerClient type**

Find the `LedgerSelectChain` type in `src/lib/customer-journey-ledger.ts` (around line 340):

```typescript
type LedgerSelectChain<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  eq: (column: string, value: unknown) => LedgerSelectChain<T>;
  gte: (column: string, value: unknown) => LedgerSelectChain<T>;
  in: (column: string, values: unknown[]) => LedgerSelectChain<T>;
  limit: (count: number) => LedgerSelectChain<T>;
  lte: (column: string, value: unknown) => LedgerSelectChain<T>;
  order: (column: string, options: { ascending: boolean }) => LedgerSelectChain<T>;
};
```

Add `ilike`:
```typescript
type LedgerSelectChain<T> = PromiseLike<{ data: T | null; error: Error | null }> & {
  eq: (column: string, value: unknown) => LedgerSelectChain<T>;
  gte: (column: string, value: unknown) => LedgerSelectChain<T>;
  ilike: (column: string, pattern: string) => LedgerSelectChain<T>;
  in: (column: string, values: unknown[]) => LedgerSelectChain<T>;
  limit: (count: number) => LedgerSelectChain<T>;
  lte: (column: string, value: unknown) => LedgerSelectChain<T>;
  order: (column: string, options: { ascending: boolean }) => LedgerSelectChain<T>;
};
```

- [ ] **Step 6: Re-verify compile**

```bash
npx tsc --noEmit
```
Expected: clean. If errors remain, fix before Task 3.

- [ ] **Step 7: Commit (with user approval)**

Ask user: "Helper added with type. OK to commit?"
If approved:
```bash
git add src/lib/customer-journey-ledger.ts src/lib/website-analytics.ts
git commit -m "feat(ledger): add fetchBookingStageEventsForVisitors helper"
```

---

## Task 3: Wire the helper into `fetchCustomerJourneyLedgerData`

**Why:** Helper exists but isn't called yet. Test from Task 1 is still failing.

**Files:**
- Modify: `src/lib/customer-journey-ledger.ts` — two call sites in `fetchCustomerJourneyLedgerData`

- [ ] **Step 1: Identify the call sites**

Open `src/lib/customer-journey-ledger.ts`. The function `fetchCustomerJourneyLedgerData` starts around line 490. Find:

a) The block `if (!anchoredVisitorIdList.length) { return buildCustomerJourneyLedgerData({...}); }` — around line 699
b) The block after `const [sessions, visitorEvents, visitorConversions] = await Promise.all([...]);` that builds the final return — around line 745

Both blocks need to merge unanchored-visitor booking events.

- [ ] **Step 2: Compute `unanchoredVisitorIdList` once, near `anchoredVisitorIdList`**

Find this existing block (around line 694):
```typescript
const anchoredVisitorIds = new Set(visitorIdsFromAppointments);
const anchoredVisitorIdList = visitors
  .filter((v) => anchoredVisitorIds.has(v.visitor_id))
  .map((v) => v.visitor_id);
```

Add right after it:
```typescript
const unanchoredVisitorIdList = visitors
  .filter((v) => !anchoredVisitorIds.has(v.visitor_id))
  .map((v) => v.visitor_id);
```

- [ ] **Step 3: Update the early-return branch**

Find (around line 699):
```typescript
if (!anchoredVisitorIdList.length) {
  return buildCustomerJourneyLedgerData({
    appointments,
    conversions: rangeConversions,
    events: appointmentEvents,
    range,
    sessions: [],
    visitors,
  });
}
```

Change to:
```typescript
if (!anchoredVisitorIdList.length) {
  const unanchoredBookingEvents = await fetchBookingStageEventsForVisitors(
    client,
    unanchoredVisitorIdList,
  );
  return buildCustomerJourneyLedgerData({
    appointments,
    conversions: rangeConversions,
    events: uniqueEvents([...appointmentEvents, ...unanchoredBookingEvents]),
    range,
    sessions: [],
    visitors,
  });
}
```

- [ ] **Step 4: Update the main return**

Find the existing `Promise.all` and final return (around line 715-745):
```typescript
const [sessions, visitorEvents, visitorConversions] = await Promise.all([
  fetchRowsByVisitorIds<CustomerJourneyLedgerSessionRow>(...),
  fetchRowsByVisitorIds<CustomerJourneyLedgerEventRow>(...),
  fetchRowsByVisitorIds<CustomerJourneyLedgerConversionRow>(...),
]);

return buildCustomerJourneyLedgerData({
  appointments,
  conversions: uniqueConversions([
    ...rangeConversions,
    ...visitorConversions,
  ]),
  events: uniqueEvents([
    ...appointmentEvents,
    ...visitorEvents,
  ]),
  range,
  sessions,
  visitors,
});
```

Change to add the booking-events fetch in parallel:
```typescript
const [sessions, visitorEvents, visitorConversions, unanchoredBookingEvents] = await Promise.all([
  fetchRowsByVisitorIds<CustomerJourneyLedgerSessionRow>(...),
  fetchRowsByVisitorIds<CustomerJourneyLedgerEventRow>(...),
  fetchRowsByVisitorIds<CustomerJourneyLedgerConversionRow>(...),
  fetchBookingStageEventsForVisitors(client, unanchoredVisitorIdList),
]);

return buildCustomerJourneyLedgerData({
  appointments,
  conversions: uniqueConversions([
    ...rangeConversions,
    ...visitorConversions,
  ]),
  events: uniqueEvents([
    ...appointmentEvents,
    ...visitorEvents,
    ...unanchoredBookingEvents,
  ]),
  range,
  sessions,
  visitors,
});
```

(The `...fetchRowsByVisitorIds<...>(...)` placeholders are existing code — leave them as-is. Only the array structure and the final `events` spread changes.)

- [ ] **Step 5: Verify the test from Task 1 now PASSES**

```bash
set -a && source .env.local && set +a && npm test -- --test-name-pattern="visitor-only row gets booking_page_view" 2>&1 | tail -15
```
Expected: PASS (TDD green).

If still failing: read the assertion message carefully. Common cause is the helper not being called because `unanchoredVisitorIdList` is empty (verify visitor wasn't accidentally classified as anchored).

- [ ] **Step 6: Run full suite to check for regressions**

```bash
set -a && source .env.local && set +a && npm test 2>&1 | tail -10
```
Expected: 406+ passing (was 405 before; +1 for the new test in Task 1). 0 fails.

If any test from `attribution-ledger.test.ts` newly fails, the mock there doesn't support `ilike` and is being hit by my helper's chain. Move to Task 4 immediately — those tests are using `mockCustomerJourneyClient` which needs `ilike` added.

- [ ] **Step 7: Commit (with user approval)**

Ask user: "Helper wired in, target test passing, full suite N/N pass. OK to commit?"
If approved:
```bash
git add src/lib/customer-journey-ledger.ts
git commit -m "fix(ledger): emit correct stage keys for visitor-only rows"
```

---

## Task 4: Extend the mock + add remaining tests

**Why:** The other `mockCustomerJourneyClient` in `tests/attribution-ledger.test.ts` may fail or silently pass because `ilike` doesn't exist on its chain. Add `ilike` there. Then add 4 more tests to lock in negative + defensive behavior.

**Files:**
- Modify: `tests/attribution-ledger.test.ts` — add 4-line `ilike` method to `mockLedgerSelectChain`
- Modify: `tests/customer-journey-ledger-visitor-first.test.ts` — append 4 more tests

- [ ] **Step 1: Add `ilike` to `mockLedgerSelectChain`**

In `tests/attribution-ledger.test.ts`, find the chain definition (around line 1485). Add `ilike` after `gte`:

```typescript
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
```

Insert it between `gte` and `in` to keep alphabetical order.

- [ ] **Step 2: Run attribution-ledger tests to confirm they still pass**

```bash
set -a && source .env.local && set +a && npm test -- tests/attribution-ledger.test.ts 2>&1 | tail -10
```
Expected: all pass.

- [ ] **Step 3: Append test 2 — BookingFormStarted → booking_form_started stage**

Append to `tests/customer-journey-ledger-visitor-first.test.ts`:

```typescript
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
```

- [ ] **Step 4: Append test 3 — Negative: no booking events → only baseline stage key**

```typescript
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
```

- [ ] **Step 5: Append test 4 — Anchored visitor stage keys unchanged**

```typescript
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
```

- [ ] **Step 6: Append test 5 — Defensive: empty unanchored list → helper not invoked**

```typescript
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
```

- [ ] **Step 7: Run the full new test set**

```bash
set -a && source .env.local && set +a && npm test -- --test-name-pattern="visitor-only|anchored visitor row|no booking-event query" 2>&1 | tail -20
```
Expected: all 4 new tests + the 1 from Task 1 all PASS.

- [ ] **Step 8: Commit (with user approval)**

Ask user: "All 5 new tests pass. OK to commit?"
If approved:
```bash
git add tests/customer-journey-ledger-visitor-first.test.ts tests/attribution-ledger.test.ts
git commit -m "test(ledger): cover visitor-only stage-key correctness + mock ilike"
```

---

## Task 5: Full suite + end-to-end timing + final commit

**Why:** Confirm nothing else regressed and measure /convert end-to-end. Replaces the perf-claim placeholder in the spec with real numbers.

**Files:** None modified. Measurement + docs only.

- [ ] **Step 1: Full test suite**

```bash
set -a && source .env.local && set +a && npm test 2>&1 | tail -10
```
Expected: ALL tests pass (was 405 before this plan; should be 410 after — 4 new in visitor-first test + 1 BookingFormStarted positive).

If a test that was passing before now fails, investigate. The most likely culprit is a test that expected `stageKeys: ["visitor_only"]` for a visitor that now picks up a booking stage. Fix the assertion if the new behavior is correct; otherwise revert the relevant change.

- [ ] **Step 2: Time /convert end-to-end via the dev server**

If the dev server isn't running:
```bash
npm run dev
```

In another terminal, time a fresh /convert load (cookies pre-authenticated via your browser, then hit the URL via curl):

For accurate timing, the simplest path is to load /convert in your already-authenticated Chrome and observe the dev server log line:
```
GET /convert ... in <N>s (next.js: ..., application-code: ...)
```

Record cold and warm load times.

- [ ] **Step 3: Update the timing-baseline doc with end-to-end numbers**

Append to `docs/superpowers/plans/2026-05-24-phase-2-6-execution/timing-baseline.md`:
```markdown
## End-to-end /convert load timing

| State | Time (s) |
|---|---|
| Cold | <s> |
| Warm | <s> |

Compared to pre-P2.6 baseline (warm ~2-3s after Phase 2.5 Fix A landed),
expected delta: +200-500ms warm from the new fetch.
Actual delta: <delta>
```

- [ ] **Step 4: Final commit (with user approval)**

Ask user: "P2.6 complete: 410 tests pass, /convert warm load <Xs>. OK to commit the timing update and consider this feature done?"
If approved:
```bash
git add docs/superpowers/plans/2026-05-24-phase-2-6-execution/timing-baseline.md
git commit -m "docs(p2.6): end-to-end timing after visitor-only stage-key fix"
```

- [ ] **Step 5: Push the branch (with user approval)**

Ask user: "Ready to push the branch?"
If approved:
```bash
git push
```

---

## Hand-off

After this plan ships, the related work remaining on the v3 scope:
- Codex finding #1 (`website_visitors` env leak) — separate spec; requires schema migration
- Codex finding #2 (`website_conversions` env leak) — separate spec; same shape as #1
- Other v3 phases (Ask AI 4 layers, ingestion NULLs, dead code, schema-as-code)

This plan does not change the recommendation in [../spike/2026-05-23/recommendation.md](../spike/2026-05-23/recommendation.md).
