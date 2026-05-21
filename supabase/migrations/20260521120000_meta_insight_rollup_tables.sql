-- Precompute Meta insight dimensions and derived action metrics once at sync
-- time instead of re-joining catalog tables and parsing actions JSON on every
-- dashboard/ad-hoc aggregate query.

create table if not exists public.meta_daily_insight_rollups (
  id uuid primary key default gen_random_uuid(),
  insight_id uuid not null references public.meta_daily_insights(id) on delete cascade,
  environment text not null default 'production' check (environment in ('production', 'staging')),
  brand_id uuid references public.brands(id) on delete set null,
  meta_account_id text not null,
  date_start date not null,
  date_stop date not null,
  week_start date not null,
  month_start date not null,
  quarter_start date not null,
  date_key text not null,
  week_key text not null,
  month_key text not null,
  quarter_key text not null,
  brand text not null default 'Unassigned',
  campaign_umbrella text not null default 'Needs review',
  campaign_umbrella_raw text,
  campaign_filter_text text not null default '',
  campaign text not null default 'Unknown campaign',
  campaign_id text not null default 'unknown',
  ad_set_filter_text text not null default '',
  ad_set text not null default 'Unknown ad set',
  ad_set_id text not null default 'unknown',
  ad_filter_text text not null default '',
  ad text not null default 'Unknown ad',
  ad_id text not null default 'unknown',
  creative_filter_text text not null default '',
  search_filter_text text not null default '',
  creative text not null default 'Unknown creative',
  creative_id text not null default 'unknown',
  daily_budget numeric not null default 0,
  days_in_month numeric not null default 0,
  monthly_budget numeric not null default 0,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  leads bigint not null default 0,
  bookings bigint not null default 0,
  conversions bigint not null default 0,
  website_bookings numeric not null default 0,
  messaging_contacts numeric not null default 0,
  new_messaging_contacts numeric not null default 0,
  primary_results numeric not null default 0,
  secondary_results numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (insight_id)
);

comment on table public.meta_daily_insight_rollups is
  'One precomputed fact row per meta_daily_insights row. Dashboard aggregate RPCs read this table instead of repeatedly parsing actions JSON.';

create index if not exists meta_daily_insight_rollups_environment_date_idx
  on public.meta_daily_insight_rollups(environment, date_start desc);
create index if not exists meta_daily_insight_rollups_account_date_idx
  on public.meta_daily_insight_rollups(environment, meta_account_id, date_start desc);
create index if not exists meta_daily_insight_rollups_brand_date_idx
  on public.meta_daily_insight_rollups(environment, brand, date_start desc);
create index if not exists meta_daily_insight_rollups_umbrella_date_idx
  on public.meta_daily_insight_rollups(environment, campaign_umbrella, date_start desc);
create index if not exists meta_daily_insight_rollups_campaign_date_idx
  on public.meta_daily_insight_rollups(environment, campaign_id, date_start desc);
create index if not exists meta_daily_insight_rollups_ad_set_date_idx
  on public.meta_daily_insight_rollups(environment, ad_set_id, date_start desc);
create index if not exists meta_daily_insight_rollups_ad_date_idx
  on public.meta_daily_insight_rollups(environment, ad_id, date_start desc);
create index if not exists meta_daily_insight_rollups_creative_date_idx
  on public.meta_daily_insight_rollups(environment, creative_id, date_start desc);

drop trigger if exists meta_daily_insight_rollups_set_updated_at on public.meta_daily_insight_rollups;
create trigger meta_daily_insight_rollups_set_updated_at
before update on public.meta_daily_insight_rollups
for each row execute function public.set_updated_at();

alter table public.meta_daily_insight_rollups enable row level security;

drop policy if exists ads_analyst_select on public.meta_daily_insight_rollups;
create policy ads_analyst_select
  on public.meta_daily_insight_rollups
  for select
  to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_insert on public.meta_daily_insight_rollups;
create policy ads_analyst_worker_insert
  on public.meta_daily_insight_rollups
  for insert
  to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_update on public.meta_daily_insight_rollups;
create policy ads_analyst_worker_update
  on public.meta_daily_insight_rollups
  for update
  to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_delete on public.meta_daily_insight_rollups;
create policy ads_analyst_worker_delete
  on public.meta_daily_insight_rollups
  for delete
  to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));

grant select on table public.meta_daily_insight_rollups
  to ads_analyst_web, ads_analyst_worker;
grant insert, update, delete on table public.meta_daily_insight_rollups
  to ads_analyst_worker;

create or replace function public.refresh_meta_daily_insight_rollups(
  p_start date default null,
  p_end date default null,
  p_meta_account_id text default null,
  p_environment text default null
)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_environment text := case
    when p_environment in ('production', 'staging') then p_environment
    else analytics.current_ads_analyst_environment()
  end;
  v_inserted integer := 0;
begin
  if p_start is not null and p_end is not null and p_start > p_end then
    return 0;
  end if;

  delete from public.meta_daily_insight_rollups r
  where r.environment = v_environment
    and (p_start is null or r.date_start >= p_start)
    and (p_end is null or r.date_start <= p_end)
    and (p_meta_account_id is null or r.meta_account_id = p_meta_account_id);

  -- Keep refreshes idempotent when cron and sync jobs overlap on the same insight rows.
  insert into public.meta_daily_insight_rollups (
    insight_id,
    environment,
    brand_id,
    meta_account_id,
    date_start,
    date_stop,
    week_start,
    month_start,
    quarter_start,
    date_key,
    week_key,
    month_key,
    quarter_key,
    brand,
    campaign_umbrella,
    campaign_umbrella_raw,
    campaign_filter_text,
    campaign,
    campaign_id,
    ad_set_filter_text,
    ad_set,
    ad_set_id,
    ad_filter_text,
    ad,
    ad_id,
    creative_filter_text,
    search_filter_text,
    creative,
    creative_id,
    daily_budget,
    days_in_month,
    monthly_budget,
    spend,
    impressions,
    reach,
    clicks,
    leads,
    bookings,
    conversions,
    website_bookings,
    messaging_contacts,
    new_messaging_contacts,
    primary_results,
    secondary_results
  )
  select
    i.id,
    i.environment,
    i.brand_id,
    i.meta_account_id,
    i.date_start,
    i.date_stop,
    (i.date_start - (((extract(dow from i.date_start)::integer + 6) % 7))::integer)::date as week_start,
    date_trunc('month', i.date_start)::date as month_start,
    date_trunc('quarter', i.date_start)::date as quarter_start,
    i.date_start::text as date_key,
    (i.date_start - (((extract(dow from i.date_start)::integer + 6) % 7))::integer)::text as week_key,
    to_char(date_trunc('month', i.date_start), 'YYYY-MM') as month_key,
    to_char(date_trunc('quarter', i.date_start), 'YYYY-"Q"Q') as quarter_key,
    coalesce(b.code, 'Unassigned') as brand,
    coalesce(i.campaign_umbrella, 'Needs review') as campaign_umbrella,
    i.campaign_umbrella as campaign_umbrella_raw,
    concat_ws(' ', i.campaign_name, i.campaign_id) as campaign_filter_text,
    coalesce(i.campaign_name, i.campaign_id, 'Unknown campaign') as campaign,
    coalesce(i.campaign_id, i.campaign_name, 'unknown') as campaign_id,
    concat_ws(' ', i.ad_set_name, i.ad_set_id) as ad_set_filter_text,
    coalesce(i.ad_set_name, i.ad_set_id, 'Unknown ad set') as ad_set,
    coalesce(i.ad_set_id, i.ad_set_name, 'unknown') as ad_set_id,
    concat_ws(' ', i.ad_name, i.ad_id) as ad_filter_text,
    coalesce(i.ad_name, i.ad_id, 'Unknown ad') as ad,
    coalesce(i.ad_id, i.ad_name, 'unknown') as ad_id,
    coalesce(i.creative_id, '') as creative_filter_text,
    concat_ws(
      ' ',
      coalesce(b.code, 'Unassigned'),
      i.campaign_umbrella,
      i.campaign_name,
      i.ad_set_name,
      i.ad_name,
      i.creative_id
    ) as search_filter_text,
    coalesce(i.creative_id, 'Unknown creative') as creative,
    coalesce(i.creative_id, 'unknown') as creative_id,
    coalesce(s.daily_budget, 0) as daily_budget,
    extract(day from (date_trunc('month', i.date_start)::date + interval '1 month - 1 day'))::numeric as days_in_month,
    (
      coalesce(s.daily_budget, 0)
      * extract(day from (date_trunc('month', i.date_start)::date + interval '1 month - 1 day'))::numeric
    ) as monthly_budget,
    coalesce(i.spend, 0) as spend,
    coalesce(i.impressions, 0)::bigint as impressions,
    coalesce(i.reach, 0)::bigint as reach,
    coalesce(i.clicks, 0)::bigint as clicks,
    coalesce(i.leads, 0)::bigint as leads,
    coalesce(i.bookings, 0)::bigint as bookings,
    coalesce(i.conversions, 0)::bigint as conversions,
    coalesce((
      select sum((a ->> 'value')::numeric)
      from jsonb_array_elements(i.actions) a
      where a ->> 'action_type' in ('offsite_conversion.fb_pixel_custom')
    ), 0) as website_bookings,
    coalesce((
      select sum((a ->> 'value')::numeric)
      from jsonb_array_elements(i.actions) a
      where a ->> 'action_type' in ('onsite_conversion.total_messaging_connection')
    ), 0) as messaging_contacts,
    coalesce((
      select sum((a ->> 'value')::numeric)
      from jsonb_array_elements(i.actions) a
      where a ->> 'action_type' in ('onsite_conversion.messaging_first_reply')
    ), 0) as new_messaging_contacts,
    case
      when coalesce(i.campaign_umbrella, 'Needs review') = 'Book Appts US'
      then coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('offsite_conversion.fb_pixel_custom')
      ), 0)
      else coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('onsite_conversion.total_messaging_connection')
      ), 0)
    end as primary_results,
    case
      when coalesce(i.campaign_umbrella, 'Needs review') in ('Facebook US Product', 'Facebook VN Product')
      then coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('onsite_conversion.messaging_first_reply')
      ), 0)
      else 0
    end as secondary_results
  from public.meta_daily_insights i
  left join public.brands b
    on b.id = i.brand_id
  left join public.meta_ad_sets s
    on s.environment = i.environment
   and s.meta_account_id = i.meta_account_id
   and s.ad_set_id = i.ad_set_id
  where i.environment = v_environment
    and (p_start is null or i.date_start >= p_start)
    and (p_end is null or i.date_start <= p_end)
    and (p_meta_account_id is null or i.meta_account_id = p_meta_account_id)
  on conflict (insight_id) do update set
    environment = excluded.environment,
    brand_id = excluded.brand_id,
    meta_account_id = excluded.meta_account_id,
    date_start = excluded.date_start,
    date_stop = excluded.date_stop,
    week_start = excluded.week_start,
    month_start = excluded.month_start,
    quarter_start = excluded.quarter_start,
    date_key = excluded.date_key,
    week_key = excluded.week_key,
    month_key = excluded.month_key,
    quarter_key = excluded.quarter_key,
    brand = excluded.brand,
    campaign_umbrella = excluded.campaign_umbrella,
    campaign_umbrella_raw = excluded.campaign_umbrella_raw,
    campaign_filter_text = excluded.campaign_filter_text,
    campaign = excluded.campaign,
    campaign_id = excluded.campaign_id,
    ad_set_filter_text = excluded.ad_set_filter_text,
    ad_set = excluded.ad_set,
    ad_set_id = excluded.ad_set_id,
    ad_filter_text = excluded.ad_filter_text,
    ad = excluded.ad,
    ad_id = excluded.ad_id,
    creative_filter_text = excluded.creative_filter_text,
    search_filter_text = excluded.search_filter_text,
    creative = excluded.creative,
    creative_id = excluded.creative_id,
    daily_budget = excluded.daily_budget,
    days_in_month = excluded.days_in_month,
    monthly_budget = excluded.monthly_budget,
    spend = excluded.spend,
    impressions = excluded.impressions,
    reach = excluded.reach,
    clicks = excluded.clicks,
    leads = excluded.leads,
    bookings = excluded.bookings,
    conversions = excluded.conversions,
    website_bookings = excluded.website_bookings,
    messaging_contacts = excluded.messaging_contacts,
    new_messaging_contacts = excluded.new_messaging_contacts,
    primary_results = excluded.primary_results,
    secondary_results = excluded.secondary_results;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

comment on function public.refresh_meta_daily_insight_rollups(date, date, text, text) is
  'Refreshes precomputed Meta insight rollups for the current Ads Analyst environment, scoped by optional date range and account.';

grant execute on function public.refresh_meta_daily_insight_rollups(date, date, text, text)
  to ads_analyst_worker;

create or replace function public.meta_insight_rollup_health(
  p_start date default null,
  p_end date default null,
  p_environment text default null
)
returns table (
  raw_rows bigint,
  rollup_rows bigint,
  missing_rollups bigint,
  stale_rollups bigint,
  orphan_rollups bigint,
  newest_raw_update timestamptz,
  newest_rollup_update timestamptz,
  oldest_problem_date date,
  repair_meta_account_id text,
  repair_month text,
  ok boolean
)
language sql
stable
set search_path = public
as $$
  with environment_scope as (
    select case
      when p_environment in ('production', 'staging') then p_environment
      else analytics.current_ads_analyst_environment()
    end as environment
  ),
  raw as (
    select
      i.id,
      i.meta_account_id,
      i.date_start,
      greatest(i.updated_at, coalesce(s.updated_at, i.updated_at)) as source_updated_at
    from public.meta_daily_insights i
    cross join environment_scope e
    left join public.meta_ad_sets s
      on s.environment = e.environment
     and s.meta_account_id = i.meta_account_id
     and s.ad_set_id = i.ad_set_id
    where i.environment = e.environment
      and (p_start is null or i.date_start >= p_start)
      and (p_end is null or i.date_start <= p_end)
  ),
  rollups as (
    select
      r.id,
      r.insight_id,
      r.meta_account_id,
      r.date_start,
      r.updated_at
    from public.meta_daily_insight_rollups r
    cross join environment_scope e
    where r.environment = e.environment
      and (p_start is null or r.date_start >= p_start)
      and (p_end is null or r.date_start <= p_end)
  ),
  raw_with_rollups as (
    select
      raw.id,
      raw.meta_account_id,
      raw.date_start,
      raw.source_updated_at,
      rollups.id as rollup_id,
      rollups.updated_at as rollup_updated_at
    from raw
    left join rollups
      on rollups.insight_id = raw.id
  ),
  orphan_rollup_rows as (
    select rollups.*
    from rollups
    left join public.meta_daily_insights i
      on i.id = rollups.insight_id
    where i.id is null
  ),
  problem_rows as (
    select
      date_start,
      meta_account_id
    from raw_with_rollups
    where rollup_id is null
       or source_updated_at > rollup_updated_at
    union all
    select
      date_start,
      meta_account_id
    from orphan_rollup_rows
  ),
  repair_chunk as (
    select
      meta_account_id,
      date_trunc('month', date_start)::date as month_start,
      min(date_start) as oldest_problem_date
    from problem_rows
    where meta_account_id is not null
    group by meta_account_id, date_trunc('month', date_start)::date
    order by min(date_start) asc, meta_account_id asc
    limit 1
  ),
  stats as (
    select
      (select count(*) from raw) as raw_rows,
      (select count(*) from rollups) as rollup_rows,
      (select count(*) from raw_with_rollups where rollup_id is null) as missing_rollups,
      (select count(*) from raw_with_rollups where source_updated_at > rollup_updated_at) as stale_rollups,
      (select count(*) from orphan_rollup_rows) as orphan_rollups,
      (select max(source_updated_at) from raw) as newest_raw_update,
      (select max(updated_at) from rollups) as newest_rollup_update
  )
  select
    stats.raw_rows,
    stats.rollup_rows,
    stats.missing_rollups,
    stats.stale_rollups,
    stats.orphan_rollups,
    stats.newest_raw_update,
    stats.newest_rollup_update,
    repair_chunk.oldest_problem_date,
    repair_chunk.meta_account_id as repair_meta_account_id,
    to_char(repair_chunk.month_start, 'YYYY-MM') as repair_month,
    coalesce(
      stats.raw_rows = stats.rollup_rows
        and stats.missing_rollups = 0
        and stats.stale_rollups = 0
        and stats.orphan_rollups = 0,
      false
    ) as ok
  from stats
  left join repair_chunk on true;
$$;

comment on function public.meta_insight_rollup_health(date, date, text) is
  'Compares raw Meta daily insight rows and ad-set budget sources with precomputed rollups, then returns the next account-month chunk that should be repaired.';

grant execute on function public.meta_insight_rollup_health(date, date, text)
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

-- One-time backfill for already-stored insights. Runtime refreshes keep this
-- table current after new sync/backfill jobs.
select public.refresh_meta_daily_insight_rollups(null, null, null, 'production');
select public.refresh_meta_daily_insight_rollups(null, null, null, 'staging');

drop function if exists public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
);

create or replace function public.aggregate_meta_daily_insights(
  p_start date,
  p_end date,
  p_dimensions text[] default '{}'::text[],
  p_filters jsonb default '[]'::jsonb,
  p_sort_field text default 'spend',
  p_sort_direction text default 'desc',
  p_limit integer default 100
)
returns table (
  date text,
  week text,
  month text,
  quarter text,
  brand text,
  campaign_umbrella text,
  campaign text,
  campaign_id text,
  ad_set text,
  ad_set_id text,
  ad text,
  ad_id text,
  creative text,
  creative_id text,
  spend numeric,
  monthly_budget numeric,
  impressions bigint,
  reach bigint,
  clicks bigint,
  leads bigint,
  bookings bigint,
  conversions bigint,
  website_bookings numeric,
  messaging_contacts numeric,
  new_messaging_contacts numeric,
  primary_results numeric,
  secondary_results numeric,
  ctr numeric,
  cpm numeric,
  cpc numeric,
  cpl numeric,
  frequency numeric,
  source_rows bigint
)
language sql
stable
set search_path = public
as $$
  with env as (
    select analytics.current_ads_analyst_environment() as environment
  ),
  filtered as (
    select r.*
    from public.meta_daily_insight_rollups r
    cross join env
    where r.environment = env.environment
      and r.date_start >= p_start
      and r.date_start <= p_end
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) f
        where coalesce(f ->> 'value', '') <> ''
          and not (
            case coalesce(f ->> 'operator', 'contains')
              when 'equals' then
                lower(
                  case coalesce(f ->> 'field', 'search')
                    when 'brand' then r.brand
                    when 'campaign_umbrella' then coalesce(r.campaign_umbrella_raw, '')
                    when 'campaign' then r.campaign_filter_text
                    when 'ad_set' then r.ad_set_filter_text
                    when 'ad' then r.ad_filter_text
                    when 'creative' then r.creative_filter_text
                    else r.search_filter_text
                  end
                ) = lower(coalesce(f ->> 'value', ''))
              else
                position(
                  lower(coalesce(f ->> 'value', '')) in lower(
                    case coalesce(f ->> 'field', 'search')
                      when 'brand' then r.brand
                      when 'campaign_umbrella' then coalesce(r.campaign_umbrella_raw, '')
                      when 'campaign' then r.campaign_filter_text
                      when 'ad_set' then r.ad_set_filter_text
                      when 'ad' then r.ad_filter_text
                      when 'creative' then r.creative_filter_text
                      else r.search_filter_text
                    end
                  )
                ) > 0
            end
          )
      )
  ),
  dimensional as (
    select
      case when 'date' = any(coalesce(p_dimensions, '{}'::text[])) then date_key end as date_dim,
      case when 'week' = any(coalesce(p_dimensions, '{}'::text[])) then week_key end as week_dim,
      case when 'month' = any(coalesce(p_dimensions, '{}'::text[])) then month_key end as month_dim,
      case when 'quarter' = any(coalesce(p_dimensions, '{}'::text[])) then quarter_key end as quarter_dim,
      case when 'brand' = any(coalesce(p_dimensions, '{}'::text[])) then brand end as brand_dim,
      case when 'campaign_umbrella' = any(coalesce(p_dimensions, '{}'::text[])) then campaign_umbrella end as umbrella_dim,
      case when 'campaign' = any(coalesce(p_dimensions, '{}'::text[])) then campaign_id end as campaign_key,
      case when 'campaign' = any(coalesce(p_dimensions, '{}'::text[])) then campaign end as campaign_display,
      case when 'ad_set' = any(coalesce(p_dimensions, '{}'::text[])) then ad_set_id end as ad_set_key,
      case when 'ad_set' = any(coalesce(p_dimensions, '{}'::text[])) then ad_set end as ad_set_display,
      case when 'ad' = any(coalesce(p_dimensions, '{}'::text[])) then ad_id end as ad_key,
      case when 'ad' = any(coalesce(p_dimensions, '{}'::text[])) then ad end as ad_display,
      case when 'creative' = any(coalesce(p_dimensions, '{}'::text[])) then creative_id end as creative_key,
      case when 'creative' = any(coalesce(p_dimensions, '{}'::text[])) then creative end as creative_display,
      meta_account_id,
      ad_set_id as budget_ad_set_id,
      month_start,
      date_start,
      monthly_budget,
      spend,
      impressions,
      reach,
      clicks,
      leads,
      bookings,
      conversions,
      website_bookings,
      messaging_contacts,
      new_messaging_contacts,
      primary_results,
      secondary_results
    from filtered
  ),
  ranked as (
    select
      dimensional.*,
      row_number() over (
        partition by
          date_dim,
          week_dim,
          month_dim,
          quarter_dim,
          brand_dim,
          umbrella_dim,
          campaign_key,
          ad_set_key,
          ad_key,
          creative_key,
          meta_account_id,
          budget_ad_set_id,
          month_start
        order by date_start asc
      ) as budget_rank
    from dimensional
  ),
  grouped as (
    select
      date_dim,
      week_dim,
      month_dim,
      quarter_dim,
      brand_dim,
      umbrella_dim,
      campaign_key,
      max(campaign_display) as campaign_display,
      ad_set_key,
      max(ad_set_display) as ad_set_display,
      ad_key,
      max(ad_display) as ad_display,
      creative_key,
      max(creative_display) as creative_display,
      round(sum(spend), 2) as spend,
      round(sum(case when budget_rank = 1 then monthly_budget else 0 end), 2) as monthly_budget,
      sum(impressions)::bigint as impressions,
      sum(reach)::bigint as reach,
      sum(clicks)::bigint as clicks,
      sum(leads)::bigint as leads,
      sum(bookings)::bigint as bookings,
      sum(conversions)::bigint as conversions,
      round(sum(website_bookings), 2) as website_bookings,
      round(sum(messaging_contacts), 2) as messaging_contacts,
      round(sum(new_messaging_contacts), 2) as new_messaging_contacts,
      round(sum(primary_results), 2) as primary_results,
      round(sum(secondary_results), 2) as secondary_results,
      count(*)::bigint as source_rows
    from ranked
    group by
      date_dim,
      week_dim,
      month_dim,
      quarter_dim,
      brand_dim,
      umbrella_dim,
      campaign_key,
      ad_set_key,
      ad_key,
      creative_key
  ),
  shaped as (
    select
      date_dim as date,
      week_dim as week,
      month_dim as month,
      quarter_dim as quarter,
      brand_dim as brand,
      umbrella_dim as campaign_umbrella,
      campaign_display as campaign,
      campaign_key as campaign_id,
      ad_set_display as ad_set,
      ad_set_key as ad_set_id,
      ad_display as ad,
      ad_key as ad_id,
      creative_display as creative,
      creative_key as creative_id,
      spend,
      monthly_budget,
      impressions,
      reach,
      clicks,
      leads,
      bookings,
      conversions,
      website_bookings,
      messaging_contacts,
      new_messaging_contacts,
      primary_results,
      secondary_results,
      round(case when impressions > 0 then (clicks::numeric / impressions::numeric) * 100 else 0 end, 2) as ctr,
      round(case when impressions > 0 then (spend / impressions::numeric) * 1000 else 0 end, 2) as cpm,
      round(case when clicks > 0 then spend / clicks::numeric else 0 end, 2) as cpc,
      round(case when leads > 0 then spend / leads::numeric else null end, 2) as cpl,
      round(case when reach > 0 then impressions::numeric / reach::numeric else 0 end, 2) as frequency,
      source_rows
    from grouped
  )
  select *
  from shaped
  order by
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'date' then date end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'date' then date end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'week' then week end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'week' then week end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'month' then month end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'month' then month end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'quarter' then quarter end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'quarter' then quarter end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'brand' then brand end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'brand' then brand end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'campaign_umbrella' then campaign_umbrella end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'campaign_umbrella' then campaign_umbrella end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'campaign' then campaign end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'campaign' then campaign end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ad_set' then ad_set end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ad_set' then ad_set end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ad' then ad end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ad' then ad end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'creative' then creative end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'creative' then creative end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'spend' then spend end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'spend' then spend end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'monthly_budget' then monthly_budget end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'monthly_budget' then monthly_budget end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'impressions' then impressions end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'impressions' then impressions end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'clicks' then clicks end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'clicks' then clicks end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'leads' then leads end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'leads' then leads end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'bookings' then bookings end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'bookings' then bookings end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'conversions' then conversions end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'conversions' then conversions end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'website_bookings' then website_bookings end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'website_bookings' then website_bookings end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'messaging_contacts' then messaging_contacts end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'messaging_contacts' then messaging_contacts end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'new_messaging_contacts' then new_messaging_contacts end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'new_messaging_contacts' then new_messaging_contacts end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'primary_results' then primary_results end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'primary_results' then primary_results end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'secondary_results' then secondary_results end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'secondary_results' then secondary_results end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'ctr' then ctr end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'ctr' then ctr end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpm' then cpm end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpm' then cpm end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpc' then cpc end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpc' then cpc end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'cpl' then cpl end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'cpl' then cpl end desc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'asc' and p_sort_field = 'frequency' then frequency end asc nulls last,
    case when lower(coalesce(p_sort_direction, 'desc')) = 'desc' and p_sort_field = 'frequency' then frequency end desc nulls last,
    date asc nulls last,
    week asc nulls last,
    month asc nulls last,
    quarter asc nulls last,
    campaign_umbrella asc nulls last,
    campaign asc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 10000);
$$;

grant execute on function public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
) to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;
