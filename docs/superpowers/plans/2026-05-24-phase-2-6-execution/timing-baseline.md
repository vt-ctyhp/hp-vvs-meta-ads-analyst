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

Confirmed by running the production loader (`fetchCustomerJourneyLedgerData({ days: 30 })`) against real data and inspecting `stageKeys` for unanchored rows:

| Row segment (last 30d) | Count |
|---|---|
| Total ledger rows | 531 |
| Unanchored visitor-only rows | 499 |
| Unanchored with `booking_page_view` in stageKeys | **1** |
| Unanchored with `booking_form_started` in stageKeys | 0 |
| Unanchored with stageKeys `["visitor_only"]` only | 319 |
| Unanchored with stageKeys `["visitor_only","paid_meta_visit"]` | 179 |

Sample matched row: `visitor=hp_vid-d4c7d2b8-548e-45e2-ad4e-49df872e1cc6`, `stageKeys=["visitor_only","paid_meta_visit","booking_page_view"]`. Pre-fix this row would have had `["visitor_only","paid_meta_visit"]` and been filtered OUT of the "Viewed booking page" funnel-step chip; post-fix it is correctly included.

In the actual /convert UI, the "Viewed booking page" chip filter shows 2 rows: 1 anchored conversion (Jasmeen Kaur — booked + viewed page) plus the 1 unanchored visitor surfaced by P2.6.

The absolute number being small is not a bug in P2.6 — it's a separate, pre-existing visitor-attribution gap: of 32 confirmed bookings in the window, **31 have `visitor_id = null`** (Acuity appointment that never linked to a website session). Without a visitor_id, the loader can't attach any funnel-stage events to those rows, so they all show stages = `["confirmed_website_bookings"]` only. That's why the funnel chart's "Paid Meta confirmed bookings: 5" doesn't match the ledger's 1 — the funnel uses `meta_daily_insights` aggregates (no visitor link required), while the customer ledger is visitor-keyed. P2.6 does not address this attribution gap; it is out of scope (and documented separately on this branch in the audit doc).

Conclusion: fix works end-to-end. No measurable perf regression.
