-- Meta inbox soft realtime presence for collision prevention.
-- Ephemeral operational state only; no conversation audit event is written.

create table if not exists public.meta_inbox_presence (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  app_user_id uuid not null,
  display_name text,
  activity text not null check (activity in ('viewing', 'typing', 'replying')),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_inbox_presence_user_conversation_idx
  on public.meta_inbox_presence (environment, conversation_id, app_user_id);

create index if not exists meta_inbox_presence_active_conversation_idx
  on public.meta_inbox_presence (environment, conversation_id, expires_at desc);

drop trigger if exists meta_inbox_presence_set_updated_at
  on public.meta_inbox_presence;
create trigger meta_inbox_presence_set_updated_at
  before update on public.meta_inbox_presence
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_presence enable row level security;

grant select, insert, update on table public.meta_inbox_presence
  to ads_analyst_web;

drop policy if exists ads_analyst_web_select on public.meta_inbox_presence;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_presence;
drop policy if exists ads_analyst_web_update on public.meta_inbox_presence;

create policy ads_analyst_web_select on public.meta_inbox_presence
  for select to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_presence
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_presence
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_presence is
  'Ephemeral inbox viewing/typing/replying presence used for advisory collision prevention.';
