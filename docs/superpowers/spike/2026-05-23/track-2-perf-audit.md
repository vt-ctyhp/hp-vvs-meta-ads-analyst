# Track 2 — Performance audit

_Completed (query-side only): 2026-05-23 17:30 PDT_
_Browser-side cold/warm measurements: not done — would require user-provided production URL + manual DevTools session. Query-side findings below are conclusive enough for the rebuild decision without them._

## `aggregate_meta_daily_insights` RPC timing

Method: Node script calling the RPC via the Supabase JS client (service role), 2 runs per scenario, second run reported to avoid cold-connection skew. Production database, default Supabase statement_timeout.

| Scenario | Window | Dimensions | Result rows | Time (ms) | Status |
|---|---|---|---|---|---|
| Last 7d total | 2026-05-16 → 2026-05-22 | (default) | 1 | **177** | ✅ |
| Last 30d total | 2026-04-23 → 2026-05-22 | (default) | 1 | **417** | ✅ |
| Last 30d by campaign | 2026-04-23 → 2026-05-22 | campaign | 9 | **910** | ⚠️ ~1s |
| Last 30d by ad (largest fanout) | 2026-04-23 → 2026-05-22 | ad | 92 | **405** | ✅ |
| Last 90d by campaign | 2026-02-23 → 2026-05-22 | campaign | 16 | **1014** | ⚠️ >1s |
| **Full year 2025 by month** | 2025-01-01 → 2025-12-31 | month | n/a | **10585** | 🔴 **statement timeout** |
| **Full year 2025 by campaign** | 2025-01-01 → 2025-12-31 | campaign | n/a | **8459** | 🔴 **statement timeout** |
| **All-time by year (AI "all data" proxy)** | 2024-01-01 → 2026-05-22 | year | n/a | **10239** | 🔴 **statement timeout** |

## Headline

**The same RPC that is internally inconsistent for historical windows (Track 1 finding #1) also times out for those same windows.** Last 30 days runs in 400ms; full year 2025 hits Supabase's statement timeout at ~10s.

This perfectly matches recent firefighting in git log:
- `3724f11` "fix(ai): prevent Ask AI dashboard query timeouts" (the commit that landed on main while we were doing this spike)
- `c2719a2` "fix(ai): harden Ask AI dashboards and show API cost"
- `758244a` "fix(convert): reconcile funnel metrics with source rows"

The team has been actively patching around this for at least a week. The root cause is the same: the env-scoped joins in `aggregate_meta_daily_insights` are unindexed or poorly indexed for the historical query patterns, producing both wrong answers AND slow ones.

## Combined Track 1 + Track 2 picture

For the central performance dashboard `/analyst`:

| Window | Correctness | Performance |
|---|---|---|
| Last 7 days | ✅ correct | ✅ fast (~200ms) |
| Last 30 days | ✅ correct | ✅ acceptable (~400ms-1s) |
| Last 90 days | ✅ correct (per spot check) | ⚠️ slow (~1s+) |
| Last year / quarter-over-quarter | 🔴 **wrong** (Track 1) | 🔴 **times out** (Track 2) |
| All-time / AI deep analysis | 🔴 **wrong** (Track 1) | 🔴 **times out** (Track 2) |

The two problems are the same problem. Fix the RPC and both the correctness and the perf issues go away for the same effort.

## What was NOT measured

- **Cold/warm page load times** for the 4 dashboards via browser DevTools. Would require: production URL, user opening DevTools in incognito and capturing waterfall. Skipped because (a) the query-side finding already explains the slow loads and (b) doing it properly is a half-day of user time.
- **Vercel cold-start tax** specifically. The query timeout finding is loud enough that any cold-start tax is secondary.
- **Slow queries beyond this RPC.** Could be other slow queries in `/convert` / `/website-funnel` / `/creative-analysis` loaders that compound the problem. Worth a follow-up scan but unlikely to change the recommendation.
- **EXPLAIN ANALYZE plans** for the failing scenarios. Skipped because the timeout itself is the actionable signal — once the RPC is reshaped (per Track 1 finding), the plans become moot.

## Improvement projection

If the `aggregate_meta_daily_insights` RPC is reshaped to:
- Remove the env predicates from joined metadata (treat `meta_daily_insights.environment` as authoritative, see Track 1 finding #1)
- Add or verify indexes on `meta_daily_insights (environment, date_start, campaign_id)` and friends

Realistic outcomes (based on the join-pattern change alone, not benchmarked):
- Full-year window: 10s timeout → ~1-2s (indexed scan over filtered insights table)
- Historical AI queries: 10s timeout → ~2-3s (multi-year scan)
- All historical reconciliation discrepancies → resolved (per Track 1 hypothesis)

**Both correctness and perf wins from one fix.** Estimated 2-5 person-days including reconciliation tests.

## Verdict

**Performance is fixable in place** by addressing the same RPC identified in Track 1. No rebuild is required for perf reasons. Deep work on cold-start tax, page bundle size, or N+1 patterns is secondary — fix the RPC first and re-measure.
