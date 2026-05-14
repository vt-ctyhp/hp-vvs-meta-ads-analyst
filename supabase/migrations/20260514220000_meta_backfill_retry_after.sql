alter table public.meta_ads_backfill_chunks
  add column if not exists retry_after timestamptz;

create index if not exists meta_ads_backfill_chunks_retry_after_idx
  on public.meta_ads_backfill_chunks(status, retry_after, start_date);

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
      and (c.retry_after is null or c.retry_after <= now())
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
  where exists (
    select 1
    from public.meta_ads_backfill_chunks c
    where c.job_id = j.id
      and c.status = 'running'
      and c.locked_at >= now() - interval '5 minutes'
  );
end;
$$;
