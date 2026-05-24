# P2.6 Task 0 — timing baseline

_Measured: 2026-05-23 23:29_

| Query | Visitor batch size | Time (ms) | Rows returned |
|---|---|---|---|
| A (booking funnel events) | 100 | 241 | 27 |
| B (booking-page PageViews) | 100 | 343 | 58 |

Conclusion: ship. Both queries well under the 1-second per-query budget and the 2-second stop-and-investigate gate. No index review needed before coding.
