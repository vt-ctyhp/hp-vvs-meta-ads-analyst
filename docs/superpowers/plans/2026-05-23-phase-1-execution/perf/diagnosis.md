# Phase 1 perf diagnosis

_Measured: 2026-05-23 22:30 PDT_

## Baseline timings (warm second-run, service role)

| Query | Time | Note |
|---|---|---|
| RPC full-year 2025 by month | 8283ms (TIMEOUT) | Fails — exceeds default statement_timeout |
| RPC last 270d by month | 2304ms | 10 result rows |
| RPC last 180d by month | 2243ms | 7 result rows |
| RPC last 90d by month | 2056ms | 4 result rows |
| RAW count for full-year prod | 2098ms | head:true count over 28891 rows |
| RAW paginated pull, full-year prod (date_start, spend, impressions only) | 6806ms | Just iterating; no aggregation |

## What this tells us

- **RPC scales linearly with input rows** (2.0s @ 90d → 2.3s @ 270d). The cliff at 365d is the default ~8s `statement_timeout` boundary, not a sudden plan regression.
- **Even a bare COUNT(*) over the same env-filtered table takes 2s.** That's the floor — env-filtering + range scan on 120k-row table.
- **Year-full raw paginated pull is 6.8s** for just date_start + spend + impressions. Three columns, no joins, no actions. So a full-year scan is inherently slow.

## Likely bottlenecks (ranked)

1. **Action JSONB processing in the RPC.** Each insight row has up to 7 `coalesce(...)` chains, each with 5-7 subqueries against `jsonb_array_elements(actions)` — roughly **40 subquery evaluations per insight row**, ~1.15M evaluations for a year. This is almost certainly the dominant cost.
2. **Scan + env filter on meta_daily_insights.** 2s floor. Helped by an `(environment, date_start)` composite if env was selective (it's not — 99.96% prod).
3. **The 4 LEFT JOINs to env-scoped metadata.** Currently no composite indexes on metadata tables. Even though the metadata tables are small (119-1000 rows each), the per-row hash probe over 28k insights adds up.

## What indexes can plausibly buy

- Adding `(environment, meta_account_id, campaign_id)` on `meta_campaigns` etc. lets PG use nested-loop JOIN instead of full hash join. For 28k outer rows × small inner tables, this is usually faster.
- Adding `(environment, date_start)` on `meta_daily_insights` is unlikely to help much (env is not selective for prod-default queries).

**Expected improvement from indexes alone: 20-40%** — enough to get full-year under the 8s timeout, but not enough to make it snappy. A follow-up RPC refactor (single-pass action processing) is needed for true speed.

## Recommended phase scope

This phase (P1 of v3-scope plan):
- Add metadata-table composite indexes
- Add `(environment, date_start)` on meta_daily_insights (cheap and might help marginally)
- Re-time after; if full-year still times out, file a follow-up issue for the RPC action-processing refactor.

## What we did NOT measure (and why)

- **EXPLAIN ANALYZE** — requires SQL Editor access; the timing-based approach is sufficient to decide whether to ship indexes. If indexes don't help, we'll need EXPLAIN for the follow-up RPC work.
- **Per-table index hit rates** — would require `pg_stat_user_indexes`; skipping for the same reason.
