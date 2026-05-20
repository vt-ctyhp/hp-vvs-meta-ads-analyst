-- Conversation state columns for the new inbox workflow.
--
-- Adds snooze, assignment, and read-receipt columns to social threads and
-- comments so sales/marketing can triage conversations. All columns are
-- nullable and analyst-owned. No effect on existing inbox sync logic.
--
-- Permission to mutate these columns is gated by the new
-- `manage_inbox_state` application permission (see src/lib/access-control.ts).

alter table public.meta_social_threads
  add column if not exists snoozed_until timestamptz,
  add column if not exists snoozed_reason text,
  add column if not exists assigned_to uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid;

alter table public.meta_social_comments
  add column if not exists snoozed_until timestamptz,
  add column if not exists snoozed_reason text,
  add column if not exists assigned_to uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_by uuid,
  add column if not exists read_at timestamptz,
  add column if not exists read_by uuid;

comment on column public.meta_social_threads.snoozed_until is
  'Until when this conversation is hidden from the active queue. Null = not snoozed.';
comment on column public.meta_social_threads.assigned_to is
  'App user id from analytics.ads_analyst_identity_profiles_v1 assigned to follow up.';
comment on column public.meta_social_threads.read_at is
  'Timestamp the conversation was last marked read by a teammate.';

-- Queue ordering: active conversations (not snoozed) sorted by most recent.
create index if not exists meta_social_threads_active_queue_idx
  on public.meta_social_threads (environment, snoozed_until, read_at, last_message_at desc nulls last);

create index if not exists meta_social_threads_assigned_idx
  on public.meta_social_threads (environment, assigned_to, last_message_at desc nulls last)
  where assigned_to is not null;

create index if not exists meta_social_comments_active_queue_idx
  on public.meta_social_comments (environment, snoozed_until, read_at, created_time desc nulls last);

create index if not exists meta_social_comments_assigned_idx
  on public.meta_social_comments (environment, assigned_to, created_time desc nulls last)
  where assigned_to is not null;

-- Web role can update these state columns; worker continues to upsert the rest
-- via existing sync paths. Grants are already wide for these tables in earlier
-- phases, but make sure update is explicitly allowed for web.
grant update (snoozed_until, snoozed_reason, assigned_to, assigned_at, assigned_by, read_at, read_by)
  on public.meta_social_threads to ads_analyst_web;
grant update (snoozed_until, snoozed_reason, assigned_to, assigned_at, assigned_by, read_at, read_by)
  on public.meta_social_comments to ads_analyst_web;

-- Web write policy: allow updates to the state columns within the caller env.
-- Existing select policy from Phase 3 already covers reads.
drop policy if exists ads_analyst_web_state_update on public.meta_social_threads;
create policy ads_analyst_web_state_update
  on public.meta_social_threads
  for update
  to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_state_update on public.meta_social_comments;
create policy ads_analyst_web_state_update
  on public.meta_social_comments
  for update
  to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
