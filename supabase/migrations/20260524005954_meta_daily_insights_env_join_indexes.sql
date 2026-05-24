-- Indexes for aggregate_meta_daily_insights env-scoped joins
--
-- Background: see docs/superpowers/plans/2026-05-23-phase-1-execution/perf/diagnosis.md
--
-- The RPC defined in 20260522120000_aggregate_meta_insights_environment_scope.sql
-- env-filters meta_daily_insights and LEFT JOINs to brands / meta_campaigns /
-- meta_ad_sets / meta_ads, each filtered by environment + the natural key
-- (brand_id; meta_account_id+campaign_id; meta_account_id+ad_set_id;
-- meta_account_id+ad_id). None of the metadata tables currently has a
-- composite index covering (environment, <join key>), so PG falls back to
-- full hash joins. For full-year scans (~28k outer rows), this is the
-- bottleneck that pushes the RPC over the default statement_timeout.
--
-- Plain CREATE INDEX (not CONCURRENTLY) because Supabase CLI wraps each
-- migration in a transaction. The lock impact is small at current data scale
-- (120k insight rows; metadata tables under 2k rows each) — measured in
-- seconds, not minutes, with negligible concurrent-write contention given
-- the periodic-sync write pattern.

-- meta_daily_insights: composite for the env+date filter on the outer scan.
create index if not exists meta_daily_insights_env_date_idx
  on public.meta_daily_insights (environment, date_start);

-- brands: composite for the env-scoped (environment, id) join used at
-- 20260522120000_aggregate_meta_insights_environment_scope.sql:97-99.
create index if not exists brands_env_id_idx
  on public.brands (environment, id);

-- meta_campaigns: composite for env + (meta_account_id, campaign_id) join
-- used at 20260522120000_aggregate_meta_insights_environment_scope.sql:100-103.
create index if not exists meta_campaigns_env_account_campaign_idx
  on public.meta_campaigns (environment, meta_account_id, campaign_id);

-- meta_ad_sets: composite for env + (meta_account_id, ad_set_id) join
-- used at 20260522120000_aggregate_meta_insights_environment_scope.sql:104-107.
create index if not exists meta_ad_sets_env_account_adset_idx
  on public.meta_ad_sets (environment, meta_account_id, ad_set_id);

-- meta_ads: composite for env + (meta_account_id, ad_id) join
-- used at 20260522120000_aggregate_meta_insights_environment_scope.sql:108-111.
create index if not exists meta_ads_env_account_ad_idx
  on public.meta_ads (environment, meta_account_id, ad_id);
