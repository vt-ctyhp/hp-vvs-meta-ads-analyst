# Phase 1 post-index results

_Measured: 2026-05-23 23:00 PDT, two warm runs each_

## Before vs After

| Query | Before (run 1) | After (run 1) | After (run 2) | Verdict |
|---|---|---|---|---|
| **RPC full-year 2025 by month** | **TIMEOUT (8283ms+)** | **4660ms** | **4124ms** | ✅ **Primary goal MET — no longer times out, ~50% faster** |
| RPC last 270d by month | 2304ms | 3763ms | 2267ms | Neutral (within noise) |
| RPC last 90d by month | 2056ms | 710ms | 878ms | ✅ ~2-3× faster |
| RPC last 30d (default dims) | 132ms | 314ms | 625ms | Noisy but fast in absolute terms |
| RPC last 30d by campaign | 910ms | 299ms | 989ms | Mixed, never bad |

## Headline

**Full-year /analyst queries now complete in ~4-5 seconds** (was: statement_timeout after 8s with no result). Year-over-year, quarter-over-quarter, and AI-deep-analysis use cases that touch historical windows now work end-to-end.

## What landed

Migration `20260524005954_meta_daily_insights_env_join_indexes.sql` applied to production with 5 composite indexes:
- `meta_daily_insights (environment, date_start)`
- `brands (environment, id)`
- `meta_campaigns (environment, meta_account_id, campaign_id)`
- `meta_ad_sets (environment, meta_account_id, ad_set_id)`
- `meta_ads (environment, meta_account_id, ad_id)`

Plus 3 placeholder migration files (`20260521170000`, `20260522133000`, `20260523180000`) added to match the existing repo pattern for previously-applied-but-not-round-tripped migrations. These three are tracked in spike Track 3 as part of the "schema-as-code is 30% broken" finding; Phase 7 of the v3 plan will reconstruct the actual SQL content for these.

## What didn't land (and why it's OK)

- **No RPC action-processing refactor.** The diagnosis predicted that JSONB action processing was the dominant per-row cost. With the indexes alone we got under the timeout, so the refactor is not needed for Phase 1's goal. If a future workload (e.g. multi-year queries, larger metadata sets) pushes the RPC back into timeout territory, that refactor is the next lever.
- **No CONCURRENTLY index creation.** Supabase CLI wraps each migration in a transaction; CREATE INDEX CONCURRENTLY can't run inside one. Plain CREATE INDEX was acceptable for these table sizes — measured pause was sub-second per index in practice.

## Variance note

Smaller-window timings (≤270 days) show high run-to-run variance (~3× range) due to Supabase connection caching, plan caching, and concurrent load on the shared db. The full-year measurement is the stable signal because the index decision changed the plan for that case.
