-- Phase 2 data-boundary foundation for the Ads Analyst module.
--
-- This migration is schema/permission-only. It does not insert, update, delete,
-- backfill, or otherwise mutate application data.

create schema if not exists analytics;
create schema if not exists audit;

comment on schema analytics is
  'Read/write boundary for Ads Analyst analytics interfaces. Sales-owned data is exposed only through narrow derived views.';
comment on schema audit is
  'Audit objects for Ads Analyst module activity and data-boundary events.';

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'ads_analyst_web') then
    create role ads_analyst_web nologin noinherit nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'ads_analyst_worker') then
    create role ads_analyst_worker nologin noinherit nobypassrls;
  end if;

  if not exists (select 1 from pg_roles where rolname = 'ads_analyst_ingest') then
    create role ads_analyst_ingest nologin noinherit nobypassrls;
  end if;
end $$;

grant ads_analyst_web to authenticator;
grant ads_analyst_worker to authenticator;
grant ads_analyst_ingest to authenticator;

comment on role ads_analyst_web is
  'Ads Analyst web runtime role. No Sales/ERP Core table writes.';
comment on role ads_analyst_worker is
  'Ads Analyst controlled worker role for gated sync, backfill, and reconciliation jobs. No Sales/ERP Core table writes.';
comment on role ads_analyst_ingest is
  'Ads Analyst ingestion role for website/social event writes. No Sales/ERP Core table writes.';

revoke all on schema analytics from public;
revoke all on schema audit from public;
grant usage on schema analytics to ads_analyst_web, ads_analyst_worker;
grant usage on schema audit to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

-- Custom roles use explicit grants. Do not let PUBLIC function defaults become
-- an accidental RPC surface for module credentials.
revoke execute on all functions in schema public from public;
alter default privileges in schema public revoke execute on functions from public;

-- Preserve the existing Supabase/Auth runtime surface for current application
-- roles while preventing custom module roles from inheriting PUBLIC function
-- execution implicitly.
grant execute on all functions in schema public to authenticated, service_role;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on all functions in schema public
  from ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

-- The analyst roles may use the public schema only for explicitly granted
-- analyst-owned tables. Sales/ERP Core tables below are explicitly denied.
grant usage on schema public
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;
revoke create on schema public
  from ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

do $$
declare
  t text;
begin
  foreach t in array array[
    'appointment_artifacts',
    'appointment_events',
    'appointment_notice_reads',
    'appointment_notices',
    'appointment_read_model_import_staging',
    'broadcast_reads',
    'broadcast_targets',
    'broadcasts',
    'client_status',
    'client_status_history',
    'config',
    'customer_info',
    'customer_purge_runs',
    'customer_read_model_import_staging',
    'customer_read_model_owner_aliases',
    'customers',
    'data_cleanup_cases',
    'design_assets',
    'design_deck_slides',
    'design_deck_versions',
    'design_decks',
    'diamond_proposal_drafts',
    'diamond_quote_prep',
    'diamond_read_model_import_staging',
    'diamond_viewing',
    'diamond_viewing_requirement_events',
    'doc_number_sequences',
    'documents',
    'human_id_sequences',
    'intake_queue',
    'order_3d',
    'order_3d_revisions',
    'payment_ledger',
    'payment_read_model_import_staging',
    'post_consult_task_drafts',
    'post_consult_task_files',
    'quotations',
    'recording_analysis_groups',
    'recording_sessions',
    'root_appointments',
    'roster_schedule',
    'schedule_changes',
    'stones',
    'stones_sync',
    'storage_assets',
    'task_collaborators',
    'task_gen_queue',
    'task_log',
    'tasks',
    'templates',
    'user_roles',
    'users',
    'wax_requests'
  ]
  loop
    execute format(
      'revoke all privileges on table public.%I from ads_analyst_web, ads_analyst_worker, ads_analyst_ingest',
      t
    );
  end loop;
end $$;

-- Analyst read surfaces.
grant select on table
  public.brands,
  public.meta_ad_accounts,
  public.meta_campaigns,
  public.meta_ad_sets,
  public.meta_ads,
  public.meta_creatives,
  public.meta_daily_insights,
  public.ai_reports,
  public.ai_chat_sessions,
  public.ai_chat_messages,
  public.ai_analysis_dashboards,
  public.ai_analysis_runs,
  public.sync_runs,
  public.campaign_umbrella_overrides,
  public.meta_ads_backfill_jobs,
  public.meta_ads_backfill_chunks,
  public.meta_social_pages,
  public.meta_social_threads,
  public.meta_social_messages,
  public.meta_social_comments,
  public.meta_social_sync_runs,
  public.website_sessions,
  public.website_events,
  public.brand_voice_guidelines,
  public.reply_playbook_entries,
  public.social_thread_summaries,
  public.ai_reply_suggestions
to ads_analyst_web, ads_analyst_worker;

-- Human-created analyst state. Bulk sync/backfill writes stay on the worker role.
grant insert, update, delete on table
  public.ai_reports,
  public.ai_chat_sessions,
  public.ai_chat_messages,
  public.ai_analysis_dashboards,
  public.ai_analysis_runs,
  public.campaign_umbrella_overrides,
  public.brand_voice_guidelines,
  public.reply_playbook_entries,
  public.social_thread_summaries,
  public.ai_reply_suggestions
to ads_analyst_web;

-- Controlled worker writes for Meta, website reconciliation, and social sync.
grant insert, update, delete on table
  public.brands,
  public.meta_ad_accounts,
  public.meta_campaigns,
  public.meta_ad_sets,
  public.meta_ads,
  public.meta_creatives,
  public.meta_daily_insights,
  public.sync_runs,
  public.meta_ads_backfill_jobs,
  public.meta_ads_backfill_chunks,
  public.meta_social_pages,
  public.meta_social_threads,
  public.meta_social_messages,
  public.meta_social_comments,
  public.meta_social_sync_runs,
  public.website_sessions,
  public.website_events
to ads_analyst_worker;

-- Public ingestion endpoints can write only event/social ingestion tables.
grant select, insert, update on table
  public.website_sessions,
  public.website_events,
  public.meta_social_pages,
  public.meta_social_threads,
  public.meta_social_messages,
  public.meta_social_comments,
  public.meta_social_sync_runs
to ads_analyst_ingest;

grant execute on function public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
) to ads_analyst_web, ads_analyst_worker;

grant execute on function public.meta_ads_history_coverage(date, date)
  to ads_analyst_web, ads_analyst_worker;
grant execute on function public.claim_meta_ads_backfill_chunks(integer)
  to ads_analyst_worker;

drop view if exists analytics.ads_analyst_identity_profiles_v1;
create view analytics.ads_analyst_identity_profiles_v1
with (security_barrier = true)
as
select
  u.id as app_user_id,
  u.auth_user_id,
  u.email,
  u.full_name,
  u.initials,
  u.active,
  coalesce(
    jsonb_agg(ur.role::text order by ur.role::text) filter (where ur.role is not null),
    '[]'::jsonb
  ) as roles
from public.users u
left join public.user_roles ur on ur.user_id = u.id
group by u.id, u.auth_user_id, u.email, u.full_name, u.initials, u.active;

comment on view analytics.ads_analyst_identity_profiles_v1 is
  'Read-only identity profile interface for Ads Analyst login and access checks. Excludes mutable user management fields and grants no write path.';

revoke all on analytics.ads_analyst_identity_profiles_v1 from public;
grant select on analytics.ads_analyst_identity_profiles_v1 to ads_analyst_web;

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
    'ai_reports',
    'ai_chat_sessions',
    'ai_chat_messages',
    'ai_analysis_dashboards',
    'ai_analysis_runs',
    'sync_runs',
    'campaign_umbrella_overrides',
    'meta_ads_backfill_jobs',
    'meta_ads_backfill_chunks',
    'meta_social_pages',
    'meta_social_threads',
    'meta_social_messages',
    'meta_social_comments',
    'meta_social_sync_runs',
    'website_sessions',
    'website_events',
    'brand_voice_guidelines',
    'reply_playbook_entries',
    'social_thread_summaries',
    'ai_reply_suggestions'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

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

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = 'ads_analyst_worker_delete'
    ) then
      execute format(
        'create policy ads_analyst_worker_delete on public.%I for delete to ads_analyst_worker using (true)',
        t
      );
    end if;
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
end $$;

drop view if exists analytics.sales_appointment_conversions_v1;
create view analytics.sales_appointment_conversions_v1
with (security_barrier = true)
as
select
  ae.id as appointment_event_id,
  ae.appt_id as appointment_record_id,
  ae.booking_source::text as booking_source,
  ae.external_booking_id,
  case
    when ae.booking_source = 'acuity'::public.booking_source
      and nullif(trim(ae.external_booking_id), '') is not null
    then 'acuity-' || trim(ae.external_booking_id)
    else null
  end as conversion_event_id,
  ae.brand::text as brand,
  ae.status as appointment_status,
  ae.source as appointment_source,
  coalesce(nullif(ae.raw_payload #>> '{appointment,type}', ''), ae.visit_type) as appointment_type,
  nullif(ae.raw_payload #>> '{appointment,appointmentTypeID}', '') as appointment_type_id,
  nullif(ae.raw_payload #>> '{appointment,calendarID}', '') as calendar_id,
  nullif(ae.raw_payload #>> '{appointment,timezone}', '') as appointment_timezone,
  ae.duration_minutes,
  ae.visit_date_time,
  ae.booked_at,
  ae.created_at,
  coalesce(ae.created_at, ae.booked_at, ae.visit_date_time) as conversion_occurred_at
from public.appointment_events ae
where ae.booking_source = 'acuity'::public.booking_source
  and nullif(trim(ae.external_booking_id), '') is not null;

comment on view analytics.sales_appointment_conversions_v1 is
  'Derived, read-only Acuity appointment conversion interface for Ads Analyst. Excludes customer PII, notes, payments, documents, tasks, and raw appointment payloads.';

revoke all on analytics.sales_appointment_conversions_v1 from public;
grant select on analytics.sales_appointment_conversions_v1
  to ads_analyst_web, ads_analyst_worker;
