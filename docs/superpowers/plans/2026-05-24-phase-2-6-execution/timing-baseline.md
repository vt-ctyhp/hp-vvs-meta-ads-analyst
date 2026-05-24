# P2.6 Task 0 — timing baseline

_Measured: 2026-05-23 23:29 (against production DB)_

| Query | Visitor batch size | Time (ms) | Rows returned |
|---|---|---|---|
| A (booking funnel events) | 100 | 241 | 27 |
| B (booking-page PageViews) | 100 | 343 | 58 |

Conclusion: ship. Both queries well under the 1-second per-query budget and the 2-second stop-and-investigate gate. No index review needed before coding.

## End-to-end /convert load timing (post-rebase on main)

_Measured: 2026-05-24, dev server `npm run dev` on port 3000, run from the rebased focused-brahmagupta-caa1af worktree, authenticated browser session, `?days=30` window._

Read from the dev server's request log line `GET /convert?... in <total> (next.js: <X>, application-code: <Y>)`.

| Load | Total | Next.js framework | Application code | Notes |
|---|---|---|---|---|
| Cold | 4.6s | 204ms | 4.4s | First request after dev server start; includes Turbopack compile of `/convert` route + cold `unstable_cache` miss + DB fan-out. |
| Warm 1 (no filter) | 1206ms | 6ms | 1200ms | Same URL ~3s later; `unstable_cache` 30s TTL hit, but RSC re-render still pays dev-mode cost. |
| Warm 2 (filter applied) | 1282ms | 19ms | 1263ms | Stage filter URL `?days=30&stage=booking_page_view` — cache key differs, but visitor data already warm in process. |
| Warm 3 (no filter again) | 1651ms | 11ms | 1640ms | Variance is dev-mode RSC rendering, not loader work. |

This is dev mode, not production. Production warm load (post-a30b457 parallel pagination + the new helper) is expected to stay in the 2–3s range cited in the spec — well within the "+200–500ms" predicted ceiling for `fetchBookingStageEventsForVisitors`.

### Earlier numbers were measured against the wrong worktree

The first version of this doc reported cold TTFB 1192ms / warm TTFB 647ms. Those were captured against `port 3001`, which I later discovered is a dev server for a different worktree (`codex/deep-dashboard-planner`). They are **not** valid measurements of P2.6. The table above replaces them with measurements from a dev server started in the focused-brahmagupta-caa1af worktree on port 3000.

### Browser verification of the actual fix

Initial browser/Playwright verification surfaced a **secondary bug** in the P2.6 helper: `fetchBookingStageEventsForVisitors`'s SELECT projection omitted `event_id`, which `uniqueEvents()` uses as its dedup key. With `event_id` missing on every helper-returned row, the Map collapsed all helper rows into a single entry under `undefined`, so the loader effectively saw one helper-fetched event total across the whole window.

Caught by re-running the loader directly against real data and comparing to a direct query of the same visitor IDs: 211 unanchored visitors had a booking-page PageView in the database, yet only 1 made it into the loader's `stageKeys`. The fix adds `event_id` to the helper's SELECT; a spy-based regression test now asserts every `website_events` SELECT includes `event_id`.

Verified end-to-end via Playwright against the rebased dev server, last-30d window:

| Stage filter | Rows shown in customer ledger |
|---|---|
| (no filter) | 531 |
| `booking_page_view` (Viewed booking page) | 212 |
| `booking_form_started` (Started booking form) | 43 |
| `visit_selected` (Selected visit type) | 43 |
| `date_selected` (Selected date) | 27 |
| `time_selected` (Selected time) | 22 |
| `confirmed_website_bookings` | 32 |

That dropoff (212 → 43 → 27 → 22 → 32) matches the funnel-chart shape, and the unanchored browse-only visitors that the spec called out as the target of Phase 2.6 are now properly surfaced.

Note on remaining "confirmed bookings = 32" with only the basic stage: 31 of those 32 rows have `visitor_id = null` (Acuity webhook produced an appointment row but no `website_conversions` link), so the loader has no events to attach upstream funnel stages. That is a separate pre-existing attribution-gap issue documented in [paid-meta-booking-diagnosis.md](../2026-05-23-phase-2-execution/paid-meta-booking-diagnosis.md) and out of P2.6 scope.

Conclusion: fix works end-to-end. No measurable perf regression.
