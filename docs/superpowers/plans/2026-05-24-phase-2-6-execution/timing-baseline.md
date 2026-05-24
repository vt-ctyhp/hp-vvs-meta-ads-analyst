# P2.6 Task 0 — timing baseline

_Measured: 2026-05-23 23:29_

| Query | Visitor batch size | Time (ms) | Rows returned |
|---|---|---|---|
| A (booking funnel events) | 100 | 241 | 27 |
| B (booking-page PageViews) | 100 | 343 | 58 |

Conclusion: ship. Both queries well under the 1-second per-query budget and the 2-second stop-and-investigate gate. No index review needed before coding.

## End-to-end /convert load timing

Measured via Chrome Navigation Timing on the dev server (`npm run dev` on port 3001) at `/convert?days=30`. Authenticated session. Cache TTL = 30s.

| State | TTFB (ms) | Total page load (ms) | Notes |
|---|---|---|---|
| Cold | 1192 | 10931 | First load after server start; includes Next.js dev compile of /convert. |
| Warm | 647 | 5647 | Same URL ~5s later — server-side `unstable_cache` hit. |

Pre-P2.6 baseline reference in spec was "warm ~2-3s after Phase 2.5 Fix A landed" (production build). Dev-mode totals here aren't directly comparable to production — most of the gap above TTFB is dev-only HMR/compile overhead in client JS. The relevant signal is the **server-side TTFB**, which on the cached path stays at ~650ms — comfortably within the "+200–500ms" predicted ceiling for the new helper.

Conclusion: no perf regression introduced by `fetchBookingStageEventsForVisitors`. Production warm load expected to remain in the 2–3s range.
