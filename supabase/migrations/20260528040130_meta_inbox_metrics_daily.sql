-- Migration: meta_inbox_metrics_daily
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Materialized per-user daily rollup. Written by cron/backfill (worker/ingest),
-- read by web. date + timezone are snapshotted in the user's tz at rollup time.
create table if not exists public.meta_inbox_metrics_daily (
  id                     uuid primary key default gen_random_uuid(),
  environment            text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  user_id                uuid not null,
  date                   date not null,
  timezone               text not null,
  avg_response_seconds   integer,
  on_time_replies        integer not null default 0,
  total_replies          integer not null default 0,
  team_claims            integer not null default 0,
  breached_at_eod        integer not null default 0,
  computed_at            timestamptz not null default now()
);

create unique index if not exists meta_inbox_metrics_daily_user_date_idx
  on public.meta_inbox_metrics_daily (environment, user_id, date);
create index if not exists meta_inbox_metrics_daily_date_idx
  on public.meta_inbox_metrics_daily (environment, date desc);

alter table public.meta_inbox_metrics_daily enable row level security;

-- web: read-only. worker/ingest: read + write (cron + backfill).
grant select on table public.meta_inbox_metrics_daily
  to ads_analyst_web;
grant select, insert, update on table public.meta_inbox_metrics_daily
  to ads_analyst_worker, ads_analyst_ingest;

drop policy if exists ads_analyst_select on public.meta_inbox_metrics_daily;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_metrics_daily;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_metrics_daily;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_metrics_daily;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_metrics_daily;

create policy ads_analyst_select on public.meta_inbox_metrics_daily
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_insert on public.meta_inbox_metrics_daily
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_update on public.meta_inbox_metrics_daily
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_insert on public.meta_inbox_metrics_daily
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_update on public.meta_inbox_metrics_daily
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

-- Defense-in-depth (spec §9): authenticated owner-or-any-lead SELECT.
drop policy if exists self_or_lead_select on public.meta_inbox_metrics_daily;
create policy self_or_lead_select on public.meta_inbox_metrics_daily
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or exists (
      select 1 from public.meta_inbox_team_members
       where app_user_id = public.current_app_user_id() and role = 'lead'
    )
  );

comment on table public.meta_inbox_metrics_daily is
  'Per-user daily metrics rollup (yesterday + 7d/30d periods). Written by cron/backfill, read by web. No DELETE in v1.';

