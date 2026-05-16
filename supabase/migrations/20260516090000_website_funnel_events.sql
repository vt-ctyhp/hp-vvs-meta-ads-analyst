create table if not exists public.website_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text not null unique,
  visitor_id text,
  brand text not null default 'HP',
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  first_page_url text,
  last_page_url text,
  first_referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbp text,
  fbc text,
  user_agent text,
  ip_hash text,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.website_events (
  id uuid primary key default gen_random_uuid(),
  event_id text not null unique,
  session_id text,
  visitor_id text,
  brand text not null default 'HP',
  source text not null,
  event_name text not null,
  event_type text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  page_url text,
  page_path text,
  page_title text,
  page_group text,
  referrer text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  utm_term text,
  fbp text,
  fbc text,
  user_agent text,
  ip_hash text,
  meta_event_name text,
  meta_event_id text,
  acuity_appointment_id text,
  appointment_type text,
  properties jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists website_events_occurred_at_idx
  on public.website_events(occurred_at desc);

create index if not exists website_events_event_name_idx
  on public.website_events(event_name);

create index if not exists website_events_page_group_idx
  on public.website_events(page_group);

create index if not exists website_events_session_idx
  on public.website_events(session_id, occurred_at desc);

create index if not exists website_events_meta_event_idx
  on public.website_events(meta_event_name, meta_event_id);

create index if not exists website_sessions_last_seen_idx
  on public.website_sessions(last_seen_at desc);

drop trigger if exists website_sessions_set_updated_at on public.website_sessions;
create trigger website_sessions_set_updated_at before update on public.website_sessions
for each row execute function public.set_updated_at();

drop trigger if exists website_events_set_updated_at on public.website_events;
create trigger website_events_set_updated_at before update on public.website_events
for each row execute function public.set_updated_at();

alter table public.website_sessions enable row level security;
alter table public.website_events enable row level security;
