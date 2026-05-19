-- Phase 4 runtime hardening for environment-aware Ads Analyst access.
--
-- This migration is schema/function-only. It does not insert, update, delete,
-- backfill, or otherwise mutate application data.

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
    where c.environment = current_environment
      and j.environment = current_environment
      and c.status = 'queued'
      and j.status in ('pending', 'running')
      and (c.retry_after is null or c.retry_after <= now())
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
    where c.environment = current_environment
      and c.id in (select id from next_chunks)
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
      where c.environment = current_environment
        and c.job_id = j.id
        and c.status = 'running'
        and c.locked_at >= now() - interval '5 minutes'
    );
end;
$$;

comment on function public.claim_meta_ads_backfill_chunks(integer) is
  'Claims only backfill chunks matching the Ads Analyst environment in the caller JWT claim.';

grant execute on function public.claim_meta_ads_backfill_chunks(integer)
  to ads_analyst_worker;

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
  with runtime as (
    select analytics.current_ads_analyst_environment() as environment
  ),
  months as (
    select generate_series(
      date_trunc('month', coalesce(p_start, '2007-01-01'::date))::date,
      date_trunc('month', coalesce(p_end, current_date))::date,
      interval '1 month'
    )::date as month_start
  ),
  accounts as (
    select a.meta_account_id, a.name
    from public.meta_ad_accounts a
    cross join runtime r
    where a.environment = r.environment
  ),
  monthly as (
    select
      i.meta_account_id,
      date_trunc('month', i.date_start)::date as month_start,
      count(*) as insight_rows,
      min(i.date_start) as first_date,
      max(i.date_start) as last_date
    from public.meta_daily_insights i
    cross join runtime r
    where i.environment = r.environment
      and i.date_start >= coalesce(p_start, '2007-01-01'::date)
      and i.date_start <= coalesce(p_end, current_date)
    group by i.meta_account_id, date_trunc('month', i.date_start)::date
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

comment on function public.meta_ads_history_coverage(date, date) is
  'Reports Meta Ads history coverage only for the Ads Analyst environment in the caller JWT claim.';

grant execute on function public.meta_ads_history_coverage(date, date)
  to ads_analyst_web, ads_analyst_worker;
