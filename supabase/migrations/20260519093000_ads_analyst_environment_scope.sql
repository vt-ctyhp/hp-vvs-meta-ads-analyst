-- Phase 3 environment fence for the Ads Analyst module.
--
-- This migration is schema/permission-only. It does not insert, update, delete,
-- backfill, or otherwise mutate application data.
--
-- This intentionally does not replace legacy natural-key unique constraints.
-- With limited module JWTs, a staging upsert that collides with an existing
-- production row is denied by RLS instead of overwriting production. A later
-- phase must update application write payloads and onConflict keys before
-- replacing unique constraints with environment-scoped keys.

create schema if not exists analytics;

create or replace function analytics.current_ads_analyst_environment()
returns text
language sql
stable
set search_path = ''
as $$
  with runtime_claims as (
    select
      nullif(current_setting('request.jwt.claim.ads_analyst_environment', true), '') as direct_ads_environment,
      nullif(current_setting('request.jwt.claim.app_environment', true), '') as direct_app_environment,
      nullif(current_setting('request.jwt.claims', true), '')::jsonb as claims
  ),
  selected_environment as (
    select coalesce(
      direct_ads_environment,
      direct_app_environment,
      claims ->> 'ads_analyst_environment',
      claims ->> 'app_environment',
      'production'
    ) as environment
    from runtime_claims
  )
  select case
    when environment in ('production', 'staging') then environment
    else 'production'
  end
  from selected_environment;
$$;

comment on function analytics.current_ads_analyst_environment() is
  'Returns the Ads Analyst runtime environment from JWT claims, defaulting to production.';

create or replace function analytics.ads_analyst_environment_matches(row_environment text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select row_environment = analytics.current_ads_analyst_environment();
$$;

comment on function analytics.ads_analyst_environment_matches(text) is
  'RLS helper that keeps Ads Analyst module roles inside their own environment rows.';

revoke all on function analytics.current_ads_analyst_environment() from public;
revoke all on function analytics.ads_analyst_environment_matches(text) from public;

grant execute on function analytics.current_ads_analyst_environment()
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;
grant execute on function analytics.ads_analyst_environment_matches(text)
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_analysis_dashboards',
    'ai_analysis_runs',
    'ai_chat_messages',
    'ai_chat_sessions',
    'ai_reply_suggestions',
    'ai_reports',
    'brand_voice_guidelines',
    'brands',
    'campaign_umbrella_overrides',
    'meta_ad_accounts',
    'meta_ad_sets',
    'meta_ads',
    'meta_ads_backfill_chunks',
    'meta_ads_backfill_jobs',
    'meta_campaigns',
    'meta_creatives',
    'meta_daily_insights',
    'meta_social_comments',
    'meta_social_messages',
    'meta_social_pages',
    'meta_social_sync_runs',
    'meta_social_threads',
    'reply_playbook_entries',
    'social_thread_summaries',
    'sync_runs',
    'website_events',
    'website_sessions'
  ]
  loop
    execute format(
      'alter table public.%I add column if not exists environment text not null default %L',
      t,
      'production'
    );

    if not exists (
      select 1
      from pg_constraint c
      join pg_class r on r.oid = c.conrelid
      join pg_namespace n on n.oid = r.relnamespace
      where n.nspname = 'public'
        and r.relname = t
        and c.conname = 'ads_analyst_environment_check'
    ) then
      execute format(
        'alter table public.%I add constraint ads_analyst_environment_check check (environment in (%L, %L)) not valid',
        t,
        'production',
        'staging'
      );
    end if;

    execute format(
      'comment on column public.%I.environment is %L',
      t,
      'Ads Analyst environment label. Production rows are the shared ERP-connected baseline; staging rows are isolated test state.'
    );

    execute format(
      'create index if not exists %I on public.%I (environment)',
      left(t || '_ads_analyst_environment_idx', 63),
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_analysis_dashboards',
    'ai_analysis_runs',
    'ai_chat_messages',
    'ai_chat_sessions',
    'ai_reply_suggestions',
    'ai_reports',
    'brand_voice_guidelines',
    'brands',
    'campaign_umbrella_overrides',
    'meta_ad_accounts',
    'meta_ad_sets',
    'meta_ads',
    'meta_ads_backfill_chunks',
    'meta_ads_backfill_jobs',
    'meta_campaigns',
    'meta_creatives',
    'meta_daily_insights',
    'meta_social_comments',
    'meta_social_messages',
    'meta_social_pages',
    'meta_social_sync_runs',
    'meta_social_threads',
    'reply_playbook_entries',
    'social_thread_summaries',
    'sync_runs',
    'website_events',
    'website_sessions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists ads_analyst_select on public.%I', t);
    execute format(
      'create policy ads_analyst_select on public.%I for select to ads_analyst_web, ads_analyst_worker using (analytics.ads_analyst_environment_matches(environment))',
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'ai_reports',
    'ai_chat_sessions',
    'ai_chat_messages',
    'ai_analysis_dashboards',
    'ai_analysis_runs',
    'campaign_umbrella_overrides',
    'brand_voice_guidelines',
    'reply_playbook_entries',
    'social_thread_summaries',
    'ai_reply_suggestions'
  ]
  loop
    execute format('drop policy if exists ads_analyst_web_insert on public.%I', t);
    execute format('drop policy if exists ads_analyst_web_update on public.%I', t);
    execute format('drop policy if exists ads_analyst_web_delete on public.%I', t);

    execute format(
      'create policy ads_analyst_web_insert on public.%I for insert to ads_analyst_web with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_web_update on public.%I for update to ads_analyst_web using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_web_delete on public.%I for delete to ads_analyst_web using (analytics.ads_analyst_environment_matches(environment))',
      t
    );
  end loop;
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'brands',
    'meta_ad_accounts',
    'meta_campaigns',
    'meta_ad_sets',
    'meta_ads',
    'meta_creatives',
    'meta_daily_insights',
    'sync_runs',
    'meta_ads_backfill_jobs',
    'meta_ads_backfill_chunks',
    'meta_social_pages',
    'meta_social_threads',
    'meta_social_messages',
    'meta_social_comments',
    'meta_social_sync_runs',
    'website_sessions',
    'website_events'
  ]
  loop
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

do $$
declare
  t text;
begin
  foreach t in array array[
    'website_sessions',
    'website_events',
    'meta_social_pages',
    'meta_social_threads',
    'meta_social_messages',
    'meta_social_comments',
    'meta_social_sync_runs'
  ]
  loop
    execute format('drop policy if exists ads_analyst_ingest_select on public.%I', t);
    execute format('drop policy if exists ads_analyst_ingest_insert on public.%I', t);
    execute format('drop policy if exists ads_analyst_ingest_update on public.%I', t);

    execute format(
      'create policy ads_analyst_ingest_select on public.%I for select to ads_analyst_ingest using (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_ingest_insert on public.%I for insert to ads_analyst_ingest with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
    execute format(
      'create policy ads_analyst_ingest_update on public.%I for update to ads_analyst_ingest using (analytics.ads_analyst_environment_matches(environment)) with check (analytics.ads_analyst_environment_matches(environment))',
      t
    );
  end loop;
end $$;
