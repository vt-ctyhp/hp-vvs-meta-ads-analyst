# Visitor-only stage-key correctness — design

**Date:** 2026-05-24
**Owner:** Bug fix for the Codex adversarial review finding #3 against the v3 Phase 2.5 work on `claude/focused-brahmagupta-caa1af`.
**Scope:** `src/lib/customer-journey-ledger.ts` only. Customer-ledger backend change. No UI changes. No schema changes.

## Summary

Phase 2.5 Fix A (commit `427977d`) skipped fetching sessions/events/conversions for unanchored window visitors as a perf optimization. As a side effect, `stageKeysForVisitorOnly` can no longer detect booking-funnel stages (`booking_page_view`, `booking_form_started`, `visit_selected`, `date_selected`, `time_selected`) for those rows, because its input `events` array is always empty. Visitor-only ledger rows therefore receive `stageKeys = ["visitor_only"]` (plus `"paid_meta_visit"` if `visitor.last_paid_touch` is set) and are filtered OUT by /convert's funnel-step chips — defeating the purpose of Phase 2, which surfaced those visitors specifically.

This spec adds a single narrow `website_events` projection for unanchored visitors, just wide enough to compute the booking-stage keys. The full Phase 2.5 fan-out skip stays in place — we never re-fetch the sessions, conversions, or full event history that the optimization avoided.

## Confirmed background

- User uses the funnel-step filter chips on /convert (confirmed during brainstorming).
- The original Phase 2.5 perf win (~2-3s of /convert warm-load time) is non-negotiable; reverting it (Option B) was considered and rejected.
- A denormalized stage-flag column on `website_visitors` (Option C) is out of scope for this fix.

## Resolved decisions

1. **Approach: Option A** — thin booking-event projection. One new helper, one new call site.
2. **Env scope: explicit.** New helper calls `.eq("environment", websiteAttributionEnvironment())` so it doesn't contribute to the documented `website_events` env-scope leak. This is a tighter scope than necessary at fix time (`website_visitors` and `website_conversions` are still un-scoped per spike Track 4c), but matches the existing pattern for `website_events` reads in `fetchWebsiteFunnelData` (`src/lib/website-analytics.ts:955`).
3. **Sparse rows are safe to mix.** Validated in design review: `eventAttributionTouches`, `geoFromRecords`, `events.find(e => e.session_id)`, and `events.find(e => e.page_url)` all gracefully handle null fields. Sparse rows from this new fetch are merged into the existing `events` array passed to `buildCustomerJourneyLedgerData` with no shape-incompatibility.
4. **No claims that aren't measured.** The implementation plan must include EXPLAIN ANALYZE of the new query AND verification that the test mock pattern-matches `.or()` filters. Both are prerequisite gates, not afterthoughts.

## Architecture

All changes live in `src/lib/customer-journey-ledger.ts`. No changes to:
- `buildCustomerJourneyLedgerRows` — already iterates `eventsByVisitor` correctly; just give it a complete event list
- `stageKeysForVisitorOnly` — already reads `event_name` + `page_url` correctly; just give it events
- The page (`src/app/(workspace)/convert/page.tsx`) — no API change
- Tests for anchored/conversion-keyed paths — they don't touch this code path

### New helper: `fetchBookingStageEventsForVisitors`

Signature:
```ts
async function fetchBookingStageEventsForVisitors(
  client: CustomerJourneyLedgerClient,
  visitorIds: string[],
): Promise<CustomerJourneyLedgerEventRow[]>
```

Behavior:
- Batches `visitorIds` by `VISITOR_ID_QUERY_BATCH_SIZE` (existing constant = 100)
- Per batch, issues **two parallel queries** (avoids PostgREST `.or()` — see "Implementation choice" below):

  Query A — booking-form funnel events:
  ```ts
  client
    .from("website_events")
    .select("visitor_id,session_id,event_name,page_url,occurred_at")
    .eq("environment", websiteAttributionEnvironment())
    .in("visitor_id", batch)
    .in("event_name", [
      "BookingFormStarted",
      "BookingContactStarted",
      "BookingVisitSelected",
      "BookingDateSelected",
      "BookingTimeSelected",
      "BookingIdentityCaptured",
    ])
    .limit(MAX_RELATED_ROWS)
  ```

  Query B — booking-page PageViews:
  ```ts
  client
    .from("website_events")
    .select("visitor_id,session_id,event_name,page_url,occurred_at")
    .eq("environment", websiteAttributionEnvironment())
    .in("visitor_id", batch)
    .eq("event_name", "PageView")
    .ilike("page_url", "%/book-an-appointment%")
    .limit(MAX_RELATED_ROWS)
  ```

- Run both with `Promise.all`, concatenate results, dedupe by `event_id` if present (else by `visitor_id + occurred_at`).
- Returns the merged result rows. Each row is **sparse**: only `visitor_id`, `session_id`, `event_name`, `page_url`, `occurred_at` populated; all other `CustomerJourneyLedgerEventRow` fields stay undefined/null.
- Errors throw, matching `fetchRowsByVisitorIds` and `fetchRowsByAcuityAppointmentIds`.
- When called with an empty `visitorIds` array, returns `[]` without issuing any query.

#### Implementation choice — two queries instead of one `.or()`

Investigated the existing `mockCustomerJourneyClient` in `tests/attribution-ledger.test.ts:1457-1523`. The mock chain implements `eq`, `gte`, `in`, `limit`, `lte`, `order` — **NO `.or()` method**. If the helper used `.or()`, the mock would silently bypass the filter and positive tests would pass by accident (any seeded event would appear in the result regardless of `event_name`). Two `.in`-style queries fit the existing mock unmodified AND give PostgREST simpler plans on the production side. Slight cost: one extra round-trip per batch.

### New call site in `fetchCustomerJourneyLedgerData`

In the branch where appointments exist in window AND a non-empty `anchoredVisitorIdList` triggers the existing fan-out:

```ts
// AFTER: const anchoredVisitorIds = new Set(visitorIdsFromAppointments);
// AFTER: const anchoredVisitorIdList = ...

// NEW:
const unanchoredVisitorIdList = visitors
  .filter((v) => !anchoredVisitorIds.has(v.visitor_id))
  .map((v) => v.visitor_id);

// EXISTING: the early return when !anchoredVisitorIdList.length now needs to ALSO
// fetch booking events for unanchored visitors (since visitor-only rows still
// emit in that branch).
// EXISTING: the Promise.all of sessions/visitorEvents/visitorConversions runs
// for ANCHORED only — unchanged.

// NEW: in parallel with the existing fan-out (when present), or alone:
const unanchoredBookingEvents = await fetchBookingStageEventsForVisitors(
  client,
  unanchoredVisitorIdList,
);

// EXISTING: pass merged events to buildCustomerJourneyLedgerData
return buildCustomerJourneyLedgerData({
  ...,
  events: uniqueEvents([
    ...appointmentEvents,
    ...visitorEvents,
    ...unanchoredBookingEvents,
  ]),
  ...
});
```

The same `unanchoredBookingEvents` fetch is needed in the **other early-return branch** of `fetchCustomerJourneyLedgerData` — the `if (!anchoredVisitorIdList.length)` block — because visitor-only rows are emitted there too.

The branch where no appointments exist at all (`if (!appointmentIds.length)`) already fetches visitor-keyed sessions/events/conversions for the windowVisitors, so it does NOT need the new narrow fetch — the existing fan-out covers it.

### Data flow

```
appointment_events in window
   → appointmentDerivedVisitorIds
   → fetch full anchored fan-out (sessions/events/conversions)  [UNCHANGED — Phase 2.5 Fix A]
   ↓
website_visitors in window
   → split: anchored vs unanchored (by appointmentDerivedVisitorIds membership)
   → for UNANCHORED: fetchBookingStageEventsForVisitors → sparse booking-stage events  [NEW]
   ↓
events = anchored full events ⊎ unanchored sparse booking events
   ↓
buildCustomerJourneyLedgerData → eventsByVisitor
   ↓
visitorOnlyLedgerRow → stageKeysForVisitorOnly → correct booking-stage keys
```

## Components — interface summary

| Unit | Purpose | How callers use it | Depends on |
|---|---|---|---|
| `fetchBookingStageEventsForVisitors(client, visitorIds)` | Pull just enough event data for unanchored visitors to compute booking-funnel stage keys. | Called once per loader invocation with the unanchored visitor IDs (or skipped if list is empty). | `CustomerJourneyLedgerClient`, `VISITOR_ID_QUERY_BATCH_SIZE`, `MAX_RELATED_ROWS`, `websiteAttributionEnvironment()`. |
| `fetchCustomerJourneyLedgerData` (modified) | Existing public loader. | Same signature, same return shape. | Same as today + the new helper. |

No other functions change.

## Error handling

- Fetch failure throws (matches existing pattern; pages catch and render an error UI).
- Empty `unanchoredVisitorIdList` short-circuits — no query issued.
- Malformed `.or()` filter (e.g., PostgREST parser rejects) surfaces as an exception during dev; caught by the test suite before merge.

## Testing

In `tests/customer-journey-ledger-visitor-first.test.ts` (extends the existing file). Each test uses a mock client.

| # | Case | Setup | Assertion |
|---|---|---|---|
| 1 | Positive: PageView on booking page → `booking_page_view` stage | 1 valid Acuity appointment in window + 1 unanchored window visitor with one `PageView` event on `/pages/book-an-appointment` | Visitor-only row's `stageKeys` includes `"booking_page_view"` |
| 2 | Positive: BookingFormStarted → `booking_form_started` stage | 1 valid Acuity appointment + 1 unanchored visitor with a `BookingFormStarted` event | Visitor-only row's `stageKeys` includes `"booking_form_started"` |
| 3 | Negative: no booking events → only baseline keys | 1 valid Acuity appointment + 1 unanchored visitor with no events | Visitor-only row's `stageKeys` is exactly `["visitor_only"]` (or `["visitor_only", "paid_meta_visit"]` if `last_paid_touch` is set) |
| 4 | Anchored visitor unaffected | 1 valid Acuity appointment + 1 anchored visitor with full sessions/events/conversions | Anchored visitor's row still has its full pre-fix stage keys |
| 5 | Empty unanchored list → no query issued | 1 valid Acuity appointment + 1 anchored visitor; window visitors fetch returns ONLY the anchored visitor | The new helper is NOT invoked (verified via mock spy / call counter). |

### Mock prerequisite

**Resolved before plan-writing.** Inspected `mockCustomerJourneyClient` at `tests/attribution-ledger.test.ts:1457-1523`. The mock chain implements `eq`, `gte`, `in`, `limit`, `lte`, `order` but NOT `.or()`. Picked the two-query implementation (above) so the mock works unmodified. The mock DOES need a 7th method, `ilike`, added for Query B — this is a 4-line addition that follows the existing `eq` pattern. The plan includes this as a sub-task before the test cases run.

### Performance prerequisite

Before claiming a perf number for the new fetch, the implementation plan must:
- Run the new query against production data via `EXPLAIN (ANALYZE, BUFFERS)`
- Confirm the query uses `website_events_visitor_idx` (or another existing index) and not a sequential scan
- If a sequential scan results, the design needs a follow-up index migration (NOT in this spec's scope; flag and re-decide)

## Out of scope

- Codex finding #1 (`website_visitors` env leak — schema change required)
- Codex finding #2 (`website_conversions` env leak — schema change required)
- Adding a denormalized stage-flag column on `website_visitors` (Option C)
- Changing the funnel-step filter UX on /convert
- Refactoring the 2,500+ line `customer-journey-ledger.ts` file
- Any change to `buildCustomerJourneyLedgerRows` or `stageKeysForVisitorOnly`

## Risks

1. ~~**`.or()` PostgreSQL plan.** Mixed `IN(...) OR (event_name = 'PageView' AND page_url ILIKE ...)` may not use `website_events_visitor_idx` efficiently.~~ **Resolved before plan-writing** — design now uses two simpler queries with `Promise.all`, each with single-direction predicates that the existing `website_events_visitor_idx` should handle cleanly. Still worth a perf timing check during implementation, but no longer an `.or()`-specific risk.
2. **Mock fidelity.** If tests pass by accident due to mock laxity, the fix appears verified but isn't. Mitigation: verify mock behavior first (above).
3. **Sparse-row edge cases.** New code paths may eventually try to read fields the sparse rows don't have. Mitigation: keep the sparse projection as locally-used as possible; do not export sparse rows beyond the loader. Add a comment at the helper noting the sparse contract.
4. **Env-scope coverage.** Even with `.eq("environment", ...)` on the new fetch, the visitor row itself still leaks (Codex finding #1). This spec does not solve that; it only ensures the new code path does not WORSEN the leak.
