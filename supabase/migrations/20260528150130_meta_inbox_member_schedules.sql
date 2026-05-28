-- supabase/migrations/20260528150130_meta_inbox_member_schedules.sql
-- Migration: meta_inbox_member_schedules
--
-- Shared Supabase ledger file. seconds=30 (Meta-Ads repo) so it cannot collide
-- with sales-standalone-app-v1 (seconds=00).
--
-- Inbox-owned weekly working schedule. app_user_id = meta_inbox_team_members.app_user_id
-- (NOT auth.uid()). Time is NOT stored with a region; it reuses
-- meta_inbox_user_preferences.region. One row per working weekday; a missing
-- weekday row = day off. An overnight shift is end_time <= start_time.
create table if not exists public.meta_inbox_member_schedules (
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  app_user_id uuid not null,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (environment, app_user_id, weekday)
);

drop trigger if exists meta_inbox_member_schedules_set_updated_at
  on public.meta_inbox_member_schedules;
create trigger meta_inbox_member_schedules_set_updated_at
  before update on public.meta_inbox_member_schedules
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_member_schedules enable row level security;

grant select, insert, update, delete on table public.meta_inbox_member_schedules
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

-- Primary boundary for v1: scoped module clients + environment match.
drop policy if exists ads_analyst_select on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_web_update on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_web_delete on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_member_schedules;

create policy ads_analyst_select on public.meta_inbox_member_schedules
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_insert on public.meta_inbox_member_schedules
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_update on public.meta_inbox_member_schedules
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_delete on public.meta_inbox_member_schedules
  for delete to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_insert on public.meta_inbox_member_schedules
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_update on public.meta_inbox_member_schedules
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_insert on public.meta_inbox_member_schedules
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_update on public.meta_inbox_member_schedules
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

-- Defense-in-depth for any future direct authenticated session: a member sees
-- their own rows; a team lead manages their team members' rows. Not load-bearing
-- in v1 because scoped clients have no auth.uid().
drop policy if exists self_or_lead_select on public.meta_inbox_member_schedules;
create policy self_or_lead_select on public.meta_inbox_member_schedules
  for select to authenticated
  using (
    app_user_id = public.current_app_user_id()
    or exists (
      select 1
        from public.meta_inbox_team_members lead
        join public.meta_inbox_team_members target on target.team_id = lead.team_id
       where lead.app_user_id = public.current_app_user_id()
         and lead.role = 'lead'
         and target.app_user_id = meta_inbox_member_schedules.app_user_id
    )
  );

comment on table public.meta_inbox_member_schedules is
  'Inbox-owned weekly working windows. app_user_id = team member id, not auth.uid(). Missing weekday = day off; region reuses meta_inbox_user_preferences.';
