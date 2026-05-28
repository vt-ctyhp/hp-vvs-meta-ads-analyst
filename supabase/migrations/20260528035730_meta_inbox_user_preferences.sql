-- Migration: meta_inbox_user_preferences
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Inbox-owned, singleton per user. user_id = app_user_id (matches
-- meta_inbox_team_members.app_user_id), NOT auth.uid(). sales-standalone-app-v1
-- owns public.users, so we never write there.
create table if not exists public.meta_inbox_user_preferences (
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  user_id     uuid not null,
  timezone    text not null default 'America/Los_Angeles',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (environment, user_id)
);

drop trigger if exists meta_inbox_user_preferences_set_updated_at
  on public.meta_inbox_user_preferences;
create trigger meta_inbox_user_preferences_set_updated_at
  before update on public.meta_inbox_user_preferences
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_user_preferences enable row level security;

grant select, insert, update on table public.meta_inbox_user_preferences
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

-- Primary boundary for v1: scoped module clients + environment match.
drop policy if exists ads_analyst_select on public.meta_inbox_user_preferences;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_user_preferences;
drop policy if exists ads_analyst_web_update on public.meta_inbox_user_preferences;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_user_preferences;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_user_preferences;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_user_preferences;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_user_preferences;

create policy ads_analyst_select on public.meta_inbox_user_preferences
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_insert on public.meta_inbox_user_preferences
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_update on public.meta_inbox_user_preferences
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_insert on public.meta_inbox_user_preferences
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_update on public.meta_inbox_user_preferences
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_insert on public.meta_inbox_user_preferences
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_update on public.meta_inbox_user_preferences
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

-- Defense-in-depth for any future direct authenticated session (spec §9/§15.2).
-- Not load-bearing in v1 because scoped clients have no auth.uid().
drop policy if exists self_or_lead_select on public.meta_inbox_user_preferences;
create policy self_or_lead_select on public.meta_inbox_user_preferences
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or exists (
      select 1
        from public.meta_inbox_team_members lead
        join public.meta_inbox_team_members target on target.team_id = lead.team_id
       where lead.app_user_id = public.current_app_user_id()
         and lead.role = 'lead'
         and target.app_user_id = meta_inbox_user_preferences.user_id
    )
  );
drop policy if exists self_write on public.meta_inbox_user_preferences;
create policy self_write on public.meta_inbox_user_preferences
  for insert to authenticated
  with check (user_id = public.current_app_user_id());
drop policy if exists self_update on public.meta_inbox_user_preferences;
create policy self_update on public.meta_inbox_user_preferences
  for update to authenticated
  using (user_id = public.current_app_user_id())
  with check (user_id = public.current_app_user_id());

comment on table public.meta_inbox_user_preferences is
  'Inbox-owned per-user prefs (timezone). user_id = app_user_id, not auth.uid(). No DELETE in v1.';

