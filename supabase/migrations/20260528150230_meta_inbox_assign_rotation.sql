-- supabase/migrations/20260528150230_meta_inbox_assign_rotation.sql
-- Migration: meta_inbox_assign_rotation
--
-- Shared Supabase ledger file. seconds=30 (Meta-Ads repo).
--
-- Strict round-robin pointer per category. last_assigned_user_id is an
-- app_user_id (nullable when the rotation is fresh). System-only table: written
-- by the auto-assign worker, never by a human session.
create table if not exists public.meta_inbox_assign_rotation (
  environment           text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  queue_category_key    text not null,
  last_assigned_user_id uuid,
  updated_at            timestamptz not null default now(),
  primary key (environment, queue_category_key)
);

drop trigger if exists meta_inbox_assign_rotation_set_updated_at
  on public.meta_inbox_assign_rotation;
create trigger meta_inbox_assign_rotation_set_updated_at
  before update on public.meta_inbox_assign_rotation
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_assign_rotation enable row level security;

grant select, insert, update on table public.meta_inbox_assign_rotation
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

drop policy if exists ads_analyst_select on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_web_update on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_assign_rotation;

create policy ads_analyst_select on public.meta_inbox_assign_rotation
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_insert on public.meta_inbox_assign_rotation
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_update on public.meta_inbox_assign_rotation
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_insert on public.meta_inbox_assign_rotation
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_update on public.meta_inbox_assign_rotation
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_insert on public.meta_inbox_assign_rotation
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_update on public.meta_inbox_assign_rotation
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_assign_rotation is
  'Strict round-robin pointer per queue category. last_assigned_user_id = app_user_id. System-only writes.';
