-- Phase 11 follow-up: grant Ads Analyst module roles read/write access
-- to website_visitors and website_conversions.
--
-- These tables landed in main via the attribution-ledger work
-- (commit 7dd4293). The Phase 2 boundary migration only knew about
-- website_events + website_sessions and so never granted the new tables
-- to ads_analyst_{web,worker,ingest}. Production worked because it still
-- uses SUPABASE_SERVICE_ROLE_KEY (which bypasses RLS); staging
-- (limited-access mode) hit "RLS denied → empty result → page render
-- crash" the moment we merged main and tried to load /attribution-ledger.
--
-- Behavior:
--   - ads_analyst_web: full CRUD (the attribution-ledger page reads;
--     the resolve route updates).
--   - ads_analyst_worker: select + insert + update (sync paths).
--   - ads_analyst_ingest: select + insert + update (the website events
--     ingestion endpoint touches these tables on conversion).
--
-- RLS policies use `using (true)` because website_visitors and
-- website_conversions do not (yet) carry the Phase 3 `environment` column.
-- A follow-up Phase 5+ migration can add environment-scoped policies
-- once those tables get the column. Today staging and production share
-- these rows; this is documented as a known gap.

-- 1. Table privileges.
grant select on table
  public.website_visitors,
  public.website_conversions
to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

grant insert, update on table
  public.website_visitors,
  public.website_conversions
to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

grant delete on table
  public.website_visitors,
  public.website_conversions
to ads_analyst_web;

-- 2. RLS policies. Each is created only if missing so the migration is
--    safe to re-apply.
do $$
declare
  t text;
begin
  foreach t in array array[
    'website_visitors',
    'website_conversions'
  ]
  loop
    -- Read access for web + worker.
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_select'
    ) then
      execute format(
        'create policy ads_analyst_select on public.%I for select to ads_analyst_web, ads_analyst_worker using (true)',
        t
      );
    end if;

    -- Write access for web (the resolve route + UI-triggered backfill).
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_web_insert'
    ) then
      execute format(
        'create policy ads_analyst_web_insert on public.%I for insert to ads_analyst_web with check (true)',
        t
      );
    end if;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_web_update'
    ) then
      execute format(
        'create policy ads_analyst_web_update on public.%I for update to ads_analyst_web using (true) with check (true)',
        t
      );
    end if;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_web_delete'
    ) then
      execute format(
        'create policy ads_analyst_web_delete on public.%I for delete to ads_analyst_web using (true)',
        t
      );
    end if;

    -- Write access for worker (sync paths).
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_worker_insert'
    ) then
      execute format(
        'create policy ads_analyst_worker_insert on public.%I for insert to ads_analyst_worker with check (true)',
        t
      );
    end if;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_worker_update'
    ) then
      execute format(
        'create policy ads_analyst_worker_update on public.%I for update to ads_analyst_worker using (true) with check (true)',
        t
      );
    end if;

    -- Read + write for ingest (the events route touches these on conversion).
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_ingest_select'
    ) then
      execute format(
        'create policy ads_analyst_ingest_select on public.%I for select to ads_analyst_ingest using (true)',
        t
      );
    end if;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_ingest_insert'
    ) then
      execute format(
        'create policy ads_analyst_ingest_insert on public.%I for insert to ads_analyst_ingest with check (true)',
        t
      );
    end if;
    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_ingest_update'
    ) then
      execute format(
        'create policy ads_analyst_ingest_update on public.%I for update to ads_analyst_ingest using (true) with check (true)',
        t
      );
    end if;
  end loop;
end$$;
