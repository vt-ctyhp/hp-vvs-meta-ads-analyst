-- Meta inbox attachment foundation: normalized inbound/outbound metadata
-- for message history display and approved send-attempt attachment IDs.

create table if not exists public.meta_inbox_attachments (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid references public.meta_inbox_conversations(id) on delete cascade,
  message_id uuid references public.meta_social_messages(id) on delete set null,
  send_attempt_id uuid references public.meta_inbox_send_attempts(id) on delete set null,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound', 'draft')),
  platform text not null check (platform in ('facebook', 'instagram')),
  attachment_type text not null check (attachment_type in (
    'image',
    'video',
    'audio',
    'file',
    'sticker',
    'product',
    'share',
    'unknown'
  )),
  meta_attachment_id text,
  name text,
  mime_type text,
  media_url text,
  preview_url text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  is_sendable boolean not null default false,
  send_capability jsonb not null default '{}'::jsonb,
  raw_json jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists meta_inbox_attachments_conversation_idx
  on public.meta_inbox_attachments (environment, conversation_id, created_at desc);

create index if not exists meta_inbox_attachments_message_idx
  on public.meta_inbox_attachments (environment, message_id);

create index if not exists meta_inbox_attachments_send_attempt_idx
  on public.meta_inbox_attachments (environment, send_attempt_id);

create index if not exists meta_inbox_attachments_type_idx
  on public.meta_inbox_attachments (environment, platform, attachment_type, is_sendable);

drop trigger if exists meta_inbox_attachments_set_updated_at
  on public.meta_inbox_attachments;
create trigger meta_inbox_attachments_set_updated_at
  before update on public.meta_inbox_attachments
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_attachments enable row level security;

grant select, insert, update, delete on table public.meta_inbox_attachments
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

drop policy if exists ads_analyst_select on public.meta_inbox_attachments;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_attachments;
drop policy if exists ads_analyst_web_update on public.meta_inbox_attachments;
drop policy if exists ads_analyst_web_delete on public.meta_inbox_attachments;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_attachments;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_attachments;
drop policy if exists ads_analyst_worker_delete on public.meta_inbox_attachments;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_attachments;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_attachments;
drop policy if exists ads_analyst_ingest_delete on public.meta_inbox_attachments;

create policy ads_analyst_select on public.meta_inbox_attachments
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_attachments
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_attachments
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_delete on public.meta_inbox_attachments
  for delete to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_insert on public.meta_inbox_attachments
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_update on public.meta_inbox_attachments
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_delete on public.meta_inbox_attachments
  for delete to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_insert on public.meta_inbox_attachments
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_update on public.meta_inbox_attachments
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_delete on public.meta_inbox_attachments
  for delete to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_attachments is
  'Normalized Meta inbox attachment metadata for inbound display and outbound approved send attempts.';
comment on column public.meta_inbox_attachments.is_sendable is
  'Whether this attachment currently passed the platform/account capability gate for outbound send.';
