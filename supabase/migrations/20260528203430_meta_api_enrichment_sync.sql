-- Migration: meta_api_enrichment_sync
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Meta enrichment sync storage. Additive only: current dashboards continue to
-- read public.meta_daily_insights and aggregate_meta_daily_insights unchanged.

alter table public.meta_campaigns
  add column if not exists daily_budget numeric,
  add column if not exists lifetime_budget numeric,
  add column if not exists budget_remaining numeric,
  add column if not exists bid_strategy text,
  add column if not exists pacing_type jsonb not null default '[]'::jsonb,
  add column if not exists budget_rebalance_flag boolean;

alter table public.meta_ad_sets
  add column if not exists budget_remaining numeric,
  add column if not exists learning_stage_info jsonb not null default '{}'::jsonb,
  add column if not exists attribution_spec jsonb not null default '[]'::jsonb,
  add column if not exists promoted_object jsonb not null default '{}'::jsonb,
  add column if not exists destination_type text,
  add column if not exists targeting_optimization_types jsonb not null default '[]'::jsonb,
  add column if not exists is_dynamic_creative boolean,
  add column if not exists is_budget_schedule_enabled boolean;

alter table public.meta_ads
  add column if not exists tracking_specs jsonb not null default '[]'::jsonb,
  add column if not exists tracking_and_conversion_with_defaults jsonb not null default '{}'::jsonb,
  add column if not exists preview_shareable_link text,
  add column if not exists ad_active_time text,
  add column if not exists configured_status text;

alter table public.meta_creatives
  add column if not exists url_tags text,
  add column if not exists call_to_action jsonb not null default '{}'::jsonb,
  add column if not exists instagram_permalink_url text,
  add column if not exists effective_instagram_media_id text,
  add column if not exists degrees_of_freedom_spec jsonb not null default '{}'::jsonb;

alter table public.meta_ads_backfill_jobs
  add column if not exists sort_direction text not null default 'desc'
    check (sort_direction in ('asc', 'desc'));

alter table public.meta_ads_backfill_chunks
  add column if not exists enrichment_rows integer not null default 0,
  add column if not exists metrics jsonb not null default '{}'::jsonb;

create table if not exists public.meta_daily_insight_enrichments (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  brand_id uuid references public.brands(id) on delete set null,
  account_id uuid references public.meta_ad_accounts(id) on delete set null,
  campaign_ref_id uuid references public.meta_campaigns(id) on delete set null,
  ad_set_ref_id uuid references public.meta_ad_sets(id) on delete set null,
  ad_ref_id uuid references public.meta_ads(id) on delete set null,
  creative_ref_id uuid references public.meta_creatives(id) on delete set null,
  meta_account_id text not null,
  campaign_id text,
  ad_set_id text,
  ad_id text not null,
  creative_id text,
  date_start date not null,
  date_stop date not null,
  account_currency text,
  attribution_setting text,
  cost_per_result jsonb not null default '[]'::jsonb,
  result_rate jsonb not null default '[]'::jsonb,
  outbound_clicks jsonb not null default '[]'::jsonb,
  unique_outbound_clicks jsonb not null default '[]'::jsonb,
  cost_per_outbound_click jsonb not null default '[]'::jsonb,
  website_ctr jsonb not null default '[]'::jsonb,
  landing_page_view_per_link_click numeric,
  landing_page_view_actions_per_link_click numeric,
  inline_post_engagement numeric,
  instagram_profile_visits numeric,
  social_spend numeric,
  cost_per_inline_link_click numeric,
  cost_per_inline_post_engagement numeric,
  meta_conversions jsonb not null default '[]'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, meta_account_id, ad_id, date_start)
);

create table if not exists public.meta_ad_labels (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  meta_account_id text not null,
  meta_id text not null,
  name text,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, meta_account_id, meta_id)
);

create table if not exists public.meta_ad_pixels (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  meta_account_id text not null,
  meta_id text not null,
  name text,
  last_fired_time timestamptz,
  is_unavailable boolean,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, meta_account_id, meta_id)
);

create table if not exists public.meta_custom_conversions (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  meta_account_id text not null,
  meta_id text not null,
  name text,
  custom_event_type text,
  event_source_type text,
  creation_time timestamptz,
  last_fired_time timestamptz,
  is_archived boolean,
  is_unavailable boolean,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, meta_account_id, meta_id)
);

create table if not exists public.meta_insight_breakdown_daily (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  meta_account_id text not null,
  level text not null default 'ad',
  breakdown_set text not null,
  breakdown_key text not null,
  breakdown_values jsonb not null default '{}'::jsonb,
  date_start date not null,
  date_stop date not null,
  campaign_id text,
  ad_set_id text,
  ad_id text,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  inline_link_clicks bigint not null default 0,
  actions jsonb not null default '[]'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, meta_account_id, date_start, level, breakdown_set, breakdown_key)
);

create table if not exists public.meta_insight_breakdown_backfill_chunks (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  meta_account_id text not null,
  brand_code text not null,
  start_date date not null,
  end_date date not null,
  breakdown_set text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failed', 'canceled')),
  attempts integer not null default 0,
  row_count integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  error text,
  locked_at timestamptz,
  retry_after timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (environment, meta_account_id, start_date, end_date, breakdown_set)
);

create index if not exists meta_daily_insight_enrichments_account_date_idx
  on public.meta_daily_insight_enrichments (environment, meta_account_id, date_start desc);
create index if not exists meta_insight_breakdown_daily_account_date_idx
  on public.meta_insight_breakdown_daily (environment, meta_account_id, date_start desc, breakdown_set);
create index if not exists meta_insight_breakdown_chunks_claim_idx
  on public.meta_insight_breakdown_backfill_chunks (environment, status, retry_after, start_date desc, created_at desc);

drop trigger if exists meta_daily_insight_enrichments_set_updated_at on public.meta_daily_insight_enrichments;
create trigger meta_daily_insight_enrichments_set_updated_at before update on public.meta_daily_insight_enrichments
for each row execute function public.set_updated_at();

drop trigger if exists meta_ad_labels_set_updated_at on public.meta_ad_labels;
create trigger meta_ad_labels_set_updated_at before update on public.meta_ad_labels
for each row execute function public.set_updated_at();

drop trigger if exists meta_ad_pixels_set_updated_at on public.meta_ad_pixels;
create trigger meta_ad_pixels_set_updated_at before update on public.meta_ad_pixels
for each row execute function public.set_updated_at();

drop trigger if exists meta_custom_conversions_set_updated_at on public.meta_custom_conversions;
create trigger meta_custom_conversions_set_updated_at before update on public.meta_custom_conversions
for each row execute function public.set_updated_at();

drop trigger if exists meta_insight_breakdown_daily_set_updated_at on public.meta_insight_breakdown_daily;
create trigger meta_insight_breakdown_daily_set_updated_at before update on public.meta_insight_breakdown_daily
for each row execute function public.set_updated_at();

drop trigger if exists meta_insight_breakdown_chunks_set_updated_at on public.meta_insight_breakdown_backfill_chunks;
create trigger meta_insight_breakdown_chunks_set_updated_at before update on public.meta_insight_breakdown_backfill_chunks
for each row execute function public.set_updated_at();

alter table public.meta_daily_insight_enrichments enable row level security;
alter table public.meta_ad_labels enable row level security;
alter table public.meta_ad_pixels enable row level security;
alter table public.meta_custom_conversions enable row level security;
alter table public.meta_insight_breakdown_daily enable row level security;
alter table public.meta_insight_breakdown_backfill_chunks enable row level security;

grant select on table
  public.meta_daily_insight_enrichments,
  public.meta_ad_labels,
  public.meta_ad_pixels,
  public.meta_custom_conversions,
  public.meta_insight_breakdown_daily,
  public.meta_insight_breakdown_backfill_chunks
to ads_analyst_web, ads_analyst_worker;

grant insert, update, delete on table
  public.meta_daily_insight_enrichments,
  public.meta_ad_labels,
  public.meta_ad_pixels,
  public.meta_custom_conversions,
  public.meta_insight_breakdown_daily,
  public.meta_insight_breakdown_backfill_chunks
to ads_analyst_worker;

do $$
declare
  t text;
begin
  foreach t in array array[
    'meta_daily_insight_enrichments',
    'meta_ad_labels',
    'meta_ad_pixels',
    'meta_custom_conversions',
    'meta_insight_breakdown_daily',
    'meta_insight_breakdown_backfill_chunks'
  ]
  loop
    execute format('drop policy if exists ads_analyst_select on public.%I', t);
    execute format(
      'create policy ads_analyst_select on public.%I for select to ads_analyst_web, ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment))',
      t
    );

    execute format('drop policy if exists ads_analyst_worker_insert on public.%I', t);
    execute format('drop policy if exists ads_analyst_worker_update on public.%I', t);
    execute format('drop policy if exists ads_analyst_worker_delete on public.%I', t);

    execute format(
      'create policy ads_analyst_worker_insert on public.%I for insert to ads_analyst_worker with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_worker_update on public.%I for update to ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_worker_delete on public.%I for delete to ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment))',
      t
    );
  end loop;
end $$;

create or replace function public.claim_meta_ads_backfill_chunks(p_limit integer default 1)
returns setof public.meta_ads_backfill_chunks
language plpgsql
security definer
set search_path = public
as $$
declare
  current_environment text := analytics.current_ads_analyst_environment();
begin
  return query
  with next_chunks as (
    select c.id
    from public.meta_ads_backfill_chunks c
    join public.meta_ads_backfill_jobs j on j.id = c.job_id
    where c.status = 'queued'
      and c.environment = current_environment
      and j.environment = current_environment
      and (c.retry_after is null or c.retry_after <= now())
      and j.status in ('pending', 'running')
    order by
      case when j.sort_direction = 'asc' then c.start_date end asc,
      case when j.sort_direction = 'desc' then c.start_date end desc,
      c.created_at asc
    limit greatest(coalesce(p_limit, 1), 1)
    for update skip locked
  ),
  claimed as (
    update public.meta_ads_backfill_chunks c
    set status = 'running',
        attempts = c.attempts + 1,
        locked_at = now(),
        retry_after = null,
        error = null
    where c.id in (select id from next_chunks)
    returning c.*
  )
  select * from claimed;

  update public.meta_ads_backfill_jobs j
  set status = 'running',
      started_at = coalesce(j.started_at, now()),
      completed_at = null
  where j.environment = current_environment
    and exists (
      select 1
      from public.meta_ads_backfill_chunks c
      where c.job_id = j.id
        and c.environment = current_environment
        and c.status = 'running'
        and c.locked_at >= now() - interval '5 minutes'
    );
end;
$$;

create or replace function public.claim_meta_insight_breakdown_backfill_chunks(p_limit integer default 1)
returns setof public.meta_insight_breakdown_backfill_chunks
language plpgsql
security definer
set search_path = public
as $$
declare
  current_environment text := analytics.current_ads_analyst_environment();
begin
  return query
  with next_chunks as (
    select c.id
    from public.meta_insight_breakdown_backfill_chunks c
    where c.status = 'queued'
      and c.environment = current_environment
      and (c.retry_after is null or c.retry_after <= now())
    order by c.start_date desc, c.created_at asc
    limit greatest(coalesce(p_limit, 1), 1)
    for update skip locked
  ),
  claimed as (
    update public.meta_insight_breakdown_backfill_chunks c
    set status = 'running',
        attempts = c.attempts + 1,
        locked_at = now(),
        retry_after = null,
        error = null
    where c.id in (select id from next_chunks)
    returning c.*
  )
  select * from claimed;
end;
$$;

grant execute on function public.claim_meta_ads_backfill_chunks(integer)
  to ads_analyst_worker;
grant execute on function public.claim_meta_insight_breakdown_backfill_chunks(integer)
  to ads_analyst_worker;
