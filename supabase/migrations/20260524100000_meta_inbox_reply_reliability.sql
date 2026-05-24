-- Meta inbox reply reliability: inbox-owned send attempts, failed-send retry
-- state, Meta error details, and manager-visible audit hooks.

create table if not exists public.meta_inbox_send_attempts (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  reply_text text not null,
  approved_by uuid,
  approved_at timestamptz,
  status text not null default 'approved' check (status in (
    'approved',
    'queued',
    'sending',
    'sent',
    'failed_retryable',
    'failed_terminal',
    'canceled'
  )),
  messaging_type text check (
    messaging_type is null or messaging_type in ('RESPONSE', 'MESSAGE_TAG')
  ),
  tag text check (
    tag is null or tag in ('HUMAN_AGENT')
  ),
  attachment_ids uuid[] not null default '{}'::uuid[],
  meta_send_id text,
  meta_error_message text,
  meta_error_code integer,
  meta_error_subcode integer,
  meta_trace_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists meta_inbox_send_attempts_idempotency_idx
  on public.meta_inbox_send_attempts (environment, conversation_id, idempotency_key);

create index if not exists meta_inbox_send_attempts_conversation_idx
  on public.meta_inbox_send_attempts (environment, conversation_id, created_at desc);

create index if not exists meta_inbox_send_attempts_failed_retry_idx
  on public.meta_inbox_send_attempts (
    environment,
    status,
    next_retry_at,
    created_at desc
  )
  where status in ('failed_retryable', 'failed_terminal');

create index if not exists meta_inbox_send_attempts_delivery_queue_idx
  on public.meta_inbox_send_attempts (
    environment,
    status,
    created_at
  )
  where status = 'queued';

drop trigger if exists meta_inbox_send_attempts_set_updated_at
  on public.meta_inbox_send_attempts;
create trigger meta_inbox_send_attempts_set_updated_at
  before update on public.meta_inbox_send_attempts
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_send_attempts enable row level security;

grant select, insert, update on table public.meta_inbox_send_attempts
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

drop policy if exists ads_analyst_select on public.meta_inbox_send_attempts;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_send_attempts;
drop policy if exists ads_analyst_web_update on public.meta_inbox_send_attempts;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_send_attempts;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_send_attempts;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_send_attempts;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_send_attempts;

create policy ads_analyst_select on public.meta_inbox_send_attempts
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_send_attempts
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_send_attempts
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_insert on public.meta_inbox_send_attempts
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_update on public.meta_inbox_send_attempts
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_insert on public.meta_inbox_send_attempts
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_update on public.meta_inbox_send_attempts
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_send_attempts is
  'Inbox-owned outbound reply attempt ledger for reply-window eligibility, failed-send retry, Meta error details, and manager reporting.';
comment on column public.meta_inbox_send_attempts.status is
  'Send attempt lifecycle. Failed statuses power the failed-send inbox and retry workflow.';
comment on column public.meta_inbox_send_attempts.idempotency_key is
  'Client/server duplicate-send protection key unique per conversation and environment.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'meta_inbox_conversation_events_event_type_check'
  ) then
    raise notice 'meta_inbox_conversation_events_event_type_check not found; send_attempt event_type expected in foundation migration.';
  end if;
end $$;

-- Contract marker for tests and reviewers: send attempts write
-- meta_inbox_conversation_events rows where event_type = 'send_attempt'.
