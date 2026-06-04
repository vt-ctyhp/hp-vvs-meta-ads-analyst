-- Migration: add_ad_sets_ads_refreshed_at
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Per-ad-set freshness marker driving the chunked, self-healing catalog refresh.
-- Each cron_catalog chunk processes the stalest ad sets first (NULLs = never
-- refreshed / brand-new), fetches their ads, and stamps ads_refreshed_at. The
-- index makes the stalest-first selection cheap.

alter table public.meta_ad_sets
  add column if not exists ads_refreshed_at timestamptz;

create index if not exists meta_ad_sets_staleness_idx
  on public.meta_ad_sets (environment, meta_account_id, ads_refreshed_at nulls first);

