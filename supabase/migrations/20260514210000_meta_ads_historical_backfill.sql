create table if not exists public.meta_ads_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'pending'
    check (status in ('pending', 'running', 'paused', 'success', 'partial', 'failed', 'canceled')),
  requested_start date not null,
  requested_end date not null,
  chunk_grain text not null default 'monthly' check (chunk_grain = 'monthly'),
  accounts jsonb not null default '[]'::jsonb,
  total_chunks integer not null default 0,
  completed_chunks integer not null default 0,
  failed_chunks integer not null default 0,
  running_chunks integer not null default 0,
  metrics jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_ads_backfill_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.meta_ads_backfill_jobs(id) on delete cascade,
  meta_account_id text not null,
  brand_code text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'success', 'failed', 'canceled')),
  attempts integer not null default 0,
  insight_rows integer not null default 0,
  error text,
  locked_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, meta_account_id, start_date, end_date)
);

create index if not exists meta_ads_backfill_jobs_status_created_idx
  on public.meta_ads_backfill_jobs(status, created_at desc);

create index if not exists meta_ads_backfill_chunks_status_date_idx
  on public.meta_ads_backfill_chunks(status, start_date, created_at);

create index if not exists meta_ads_backfill_chunks_job_status_idx
  on public.meta_ads_backfill_chunks(job_id, status);

drop trigger if exists meta_ads_backfill_jobs_set_updated_at on public.meta_ads_backfill_jobs;
create trigger meta_ads_backfill_jobs_set_updated_at before update on public.meta_ads_backfill_jobs
for each row execute function public.set_updated_at();

drop trigger if exists meta_ads_backfill_chunks_set_updated_at on public.meta_ads_backfill_chunks;
create trigger meta_ads_backfill_chunks_set_updated_at before update on public.meta_ads_backfill_chunks
for each row execute function public.set_updated_at();

alter table public.meta_ads_backfill_jobs enable row level security;
alter table public.meta_ads_backfill_chunks enable row level security;

create or replace function public.claim_meta_ads_backfill_chunks(p_limit integer default 1)
returns setof public.meta_ads_backfill_chunks
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with next_chunks as (
    select c.id
    from public.meta_ads_backfill_chunks c
    join public.meta_ads_backfill_jobs j on j.id = c.job_id
    where c.status = 'queued'
      and j.status in ('pending', 'running')
    order by c.start_date asc, c.created_at asc
    limit greatest(coalesce(p_limit, 1), 1)
    for update skip locked
  ),
  claimed as (
    update public.meta_ads_backfill_chunks c
    set status = 'running',
        attempts = c.attempts + 1,
        locked_at = now(),
        error = null
    where c.id in (select id from next_chunks)
    returning c.*
  )
  select * from claimed;

  update public.meta_ads_backfill_jobs j
  set status = 'running',
      started_at = coalesce(j.started_at, now()),
      completed_at = null
  where exists (
    select 1
    from public.meta_ads_backfill_chunks c
    where c.job_id = j.id
      and c.status = 'running'
      and c.locked_at >= now() - interval '5 minutes'
  );
end;
$$;

create or replace function public.meta_ads_history_coverage(
  p_start date default '2007-01-01',
  p_end date default current_date
)
returns table (
  meta_account_id text,
  account_name text,
  month text,
  insight_rows bigint,
  first_date date,
  last_date date
)
language sql
stable
set search_path = public
as $$
  with months as (
    select generate_series(
      date_trunc('month', coalesce(p_start, '2007-01-01'::date))::date,
      date_trunc('month', coalesce(p_end, current_date))::date,
      interval '1 month'
    )::date as month_start
  ),
  accounts as (
    select meta_account_id, name
    from public.meta_ad_accounts
  ),
  monthly as (
    select
      meta_account_id,
      date_trunc('month', date_start)::date as month_start,
      count(*) as insight_rows,
      min(date_start) as first_date,
      max(date_start) as last_date
    from public.meta_daily_insights
    where date_start >= coalesce(p_start, '2007-01-01'::date)
      and date_start <= coalesce(p_end, current_date)
    group by meta_account_id, date_trunc('month', date_start)::date
  )
  select
    a.meta_account_id,
    a.name as account_name,
    to_char(m.month_start, 'YYYY-MM') as month,
    coalesce(monthly.insight_rows, 0)::bigint as insight_rows,
    monthly.first_date,
    monthly.last_date
  from accounts a
  cross join months m
  left join monthly
    on monthly.meta_account_id = a.meta_account_id
   and monthly.month_start = m.month_start
  order by a.meta_account_id, m.month_start;
$$;

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
  with filtered as (
    select
      i.*,
      coalesce(b.code, 'Unassigned') as brand_code,
      case when 'date' = any(p_dimensions) then i.date_start::text end as date_dim,
      case
        when 'week' = any(p_dimensions)
        then (i.date_start - (((extract(dow from i.date_start)::integer + 6) % 7))::integer)::text
      end as week_dim,
      case when 'month' = any(p_dimensions) then to_char(date_trunc('month', i.date_start), 'YYYY-MM') end as month_dim,
      case when 'brand' = any(p_dimensions) then coalesce(b.code, 'Unassigned') end as brand_dim,
      case when 'campaign_umbrella' = any(p_dimensions) then coalesce(i.campaign_umbrella, 'Needs review') end as umbrella_dim,
      case when 'campaign' = any(p_dimensions) then coalesce(i.campaign_id, i.campaign_name, 'unknown') end as campaign_key,
      case when 'campaign' = any(p_dimensions) then coalesce(i.campaign_name, i.campaign_id, 'Unknown campaign') end as campaign_display,
      case when 'ad_set' = any(p_dimensions) then coalesce(i.ad_set_id, i.ad_set_name, 'unknown') end as ad_set_key,
      case when 'ad_set' = any(p_dimensions) then coalesce(i.ad_set_name, i.ad_set_id, 'Unknown ad set') end as ad_set_display,
      case when 'ad' = any(p_dimensions) then coalesce(i.ad_id, i.ad_name, 'unknown') end as ad_key,
      case when 'ad' = any(p_dimensions) then coalesce(i.ad_name, i.ad_id, 'Unknown ad') end as ad_display,
      case when 'creative' = any(p_dimensions) then coalesce(i.creative_id, 'unknown') end as creative_key,
      case when 'creative' = any(p_dimensions) then coalesce(i.creative_id, 'Unknown creative') end as creative_display,
      date_trunc('month', i.date_start)::date as month_start,
      coalesce(s.daily_budget, 0) as daily_budget,
      extract(day from (date_trunc('month', i.date_start)::date + interval '1 month - 1 day'))::numeric as days_in_month,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('offsite_conversion.fb_pixel_custom')
      ), 0) as website_bookings_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('onsite_conversion.total_messaging_connection')
      ), 0) as messaging_contacts_raw,
      coalesce((
        select sum((a ->> 'value')::numeric)
        from jsonb_array_elements(i.actions) a
        where a ->> 'action_type' in ('onsite_conversion.messaging_first_reply')
      ), 0) as new_messaging_contacts_raw
    from public.meta_daily_insights i
    left join public.brands b on b.id = i.brand_id
    left join public.meta_ad_sets s
      on s.meta_account_id = i.meta_account_id
     and s.ad_set_id = i.ad_set_id
    where i.date_start >= p_start
      and i.date_start <= p_end
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(p_filters, '[]'::jsonb)) f
        where coalesce(f ->> 'value', '') <> ''
          and not (
            case coalesce(f ->> 'operator', 'contains')
              when 'equals' then
                lower(
                  case coalesce(f ->> 'field', 'search')
                    when 'brand' then coalesce(b.code, 'Unassigned')
                    when 'campaign_umbrella' then coalesce(i.campaign_umbrella, '')
                    when 'campaign' then concat_ws(' ', i.campaign_name, i.campaign_id)
                    when 'ad_set' then concat_ws(' ', i.ad_set_name, i.ad_set_id)
                    when 'ad' then concat_ws(' ', i.ad_name, i.ad_id)
                    when 'creative' then coalesce(i.creative_id, '')
                    else concat_ws(' ', coalesce(b.code, 'Unassigned'), i.campaign_umbrella, i.campaign_name, i.ad_set_name, i.ad_name, i.creative_id)
                  end
                ) = lower(coalesce(f ->> 'value', ''))
              else
                position(
                  lower(coalesce(f ->> 'value', '')) in lower(
                    case coalesce(f ->> 'field', 'search')
                      when 'brand' then coalesce(b.code, 'Unassigned')
                      when 'campaign_umbrella' then coalesce(i.campaign_umbrella, '')
                      when 'campaign' then concat_ws(' ', i.campaign_name, i.campaign_id)
                      when 'ad_set' then concat_ws(' ', i.ad_set_name, i.ad_set_id)
                      when 'ad' then concat_ws(' ', i.ad_name, i.ad_id)
                      when 'creative' then coalesce(i.creative_id, '')
                      else concat_ws(' ', coalesce(b.code, 'Unassigned'), i.campaign_umbrella, i.campaign_name, i.ad_set_name, i.ad_name, i.creative_id)
                    end
                  )
                ) > 0
            end
          )
      )
  ),
  ranked as (
    select
      filtered.*,
      row_number() over (
        partition by
          date_dim,
          week_dim,
          month_dim,
          brand_dim,
          umbrella_dim,
          campaign_key,
          ad_set_key,
          ad_key,
          creative_key,
          meta_account_id,
          ad_set_id,
          month_start
        order by date_start asc
      ) as budget_rank
    from filtered
  ),
  grouped as (
    select
      date_dim,
      week_dim,
      month_dim,
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
      round(sum(case when budget_rank = 1 and daily_budget > 0 then daily_budget * days_in_month else 0 end), 2) as monthly_budget,
      sum(impressions)::bigint as impressions,
      sum(reach)::bigint as reach,
      sum(clicks)::bigint as clicks,
      sum(leads)::bigint as leads,
      sum(bookings)::bigint as bookings,
      sum(conversions)::bigint as conversions,
      round(sum(website_bookings_raw), 2) as website_bookings,
      round(sum(messaging_contacts_raw), 2) as messaging_contacts,
      round(sum(new_messaging_contacts_raw), 2) as new_messaging_contacts,
      round(sum(
        case
          when coalesce(campaign_umbrella, 'Needs review') = 'Book Appts US'
          then website_bookings_raw
          else messaging_contacts_raw
        end
      ), 2) as primary_results,
      round(sum(
        case
          when coalesce(campaign_umbrella, 'Needs review') in ('Facebook US Product', 'Facebook VN Product')
          then new_messaging_contacts_raw
          else 0
        end
      ), 2) as secondary_results,
      count(*)::bigint as source_rows
    from ranked
    group by
      date_dim,
      week_dim,
      month_dim,
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
    campaign_umbrella asc nulls last,
    campaign asc nulls last
  limit least(greatest(coalesce(p_limit, 100), 1), 10000);
$$;
