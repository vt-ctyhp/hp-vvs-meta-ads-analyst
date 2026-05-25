-- Meta inbox internal notes and optional manager coaching comments.
-- Notes are operational-only; they are never sent to customers.

create table if not exists public.meta_inbox_notes (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  note_type text not null default 'internal_note' check (note_type in (
    'internal_note',
    'manager_coaching'
  )),
  body text not null check (length(btrim(body)) > 0),
  created_by uuid not null,
  mention_user_ids uuid[] not null default '{}'::uuid[],
  metadata jsonb not null default '{}'::jsonb,
  deleted_by uuid,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_inbox_notes_conversation_idx
  on public.meta_inbox_notes (environment, conversation_id, created_at desc)
  where deleted_at is null;

create index if not exists meta_inbox_notes_actor_idx
  on public.meta_inbox_notes (environment, created_by, created_at desc)
  where deleted_at is null;

create index if not exists meta_inbox_notes_mentions_idx
  on public.meta_inbox_notes using gin (mention_user_ids)
  where deleted_at is null;

drop trigger if exists meta_inbox_notes_set_updated_at
  on public.meta_inbox_notes;
create trigger meta_inbox_notes_set_updated_at
  before update on public.meta_inbox_notes
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_notes enable row level security;

grant select, insert, update on table public.meta_inbox_notes
  to ads_analyst_web;

drop policy if exists ads_analyst_web_select on public.meta_inbox_notes;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_notes;
drop policy if exists ads_analyst_web_update on public.meta_inbox_notes;

create policy ads_analyst_web_select on public.meta_inbox_notes
  for select to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_notes
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_notes
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_notes is
  'Inbox-owned internal notes and manager coaching comments. Never customer-visible.';
comment on column public.meta_inbox_notes.mention_user_ids is
  'Optional central app user IDs mentioned in note text; notification fanout can be added later.';

-- Contract marker for tests and reviewers: note creates write
-- meta_inbox_conversation_events rows where event_type = 'note_added'.
