create table if not exists public.meta_social_pages (
  id uuid primary key default gen_random_uuid(),
  page_id text not null unique,
  name text,
  ig_user_id text,
  ig_username text,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meta_social_threads (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram')),
  thread_id text not null,
  page_id text,
  ig_user_id text,
  thread_type text not null default 'message',
  participant_id text,
  participant_name text,
  snippet text,
  message_count integer not null default 0,
  unread_count integer not null default 0,
  last_message_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, thread_id)
);

create table if not exists public.meta_social_messages (
  id uuid primary key default gen_random_uuid(),
  thread_ref_id uuid references public.meta_social_threads(id) on delete cascade,
  platform text not null check (platform in ('facebook', 'instagram')),
  thread_id text not null,
  message_id text not null,
  direction text not null default 'unknown' check (direction in ('inbound', 'outbound', 'unknown')),
  sender_id text,
  sender_name text,
  recipient_id text,
  recipient_name text,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  sent_at timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (platform, message_id)
);

create table if not exists public.meta_social_comments (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('facebook', 'instagram')),
  comment_id text not null,
  parent_comment_id text,
  page_id text,
  ig_user_id text,
  content_id text,
  content_permalink text,
  author_id text,
  author_name text,
  body text,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  hidden boolean,
  created_time timestamptz,
  raw_json jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (platform, comment_id)
);

create table if not exists public.meta_social_sync_runs (
  id uuid primary key default gen_random_uuid(),
  trigger text not null,
  status text not null default 'running' check (status in ('running', 'success', 'failed', 'partial')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  page_ids jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists meta_social_threads_last_message_idx on public.meta_social_threads(last_message_at desc nulls last);
create index if not exists meta_social_threads_platform_idx on public.meta_social_threads(platform);
create index if not exists meta_social_messages_thread_idx on public.meta_social_messages(platform, thread_id, sent_at desc nulls last);
create index if not exists meta_social_comments_created_idx on public.meta_social_comments(created_time desc nulls last);
create index if not exists meta_social_comments_content_idx on public.meta_social_comments(platform, content_id);
create index if not exists meta_social_sync_runs_started_idx on public.meta_social_sync_runs(started_at desc);

drop trigger if exists meta_social_pages_set_updated_at on public.meta_social_pages;
create trigger meta_social_pages_set_updated_at before update on public.meta_social_pages
for each row execute function public.set_updated_at();

drop trigger if exists meta_social_threads_set_updated_at on public.meta_social_threads;
create trigger meta_social_threads_set_updated_at before update on public.meta_social_threads
for each row execute function public.set_updated_at();

drop trigger if exists meta_social_comments_set_updated_at on public.meta_social_comments;
create trigger meta_social_comments_set_updated_at before update on public.meta_social_comments
for each row execute function public.set_updated_at();

alter table public.meta_social_pages enable row level security;
alter table public.meta_social_threads enable row level security;
alter table public.meta_social_messages enable row level security;
alter table public.meta_social_comments enable row level security;
alter table public.meta_social_sync_runs enable row level security;
