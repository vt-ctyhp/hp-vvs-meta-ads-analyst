-- Meta inbox public comment action foundation: public/private replies,
-- likes, hides, deletes, moderation reason notes, and audit hooks.

create table if not exists public.meta_inbox_comment_actions (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  conversation_id uuid not null references public.meta_inbox_conversations(id) on delete cascade,
  comment_id text not null,
  action_type text not null check (action_type in (
    'public_reply',
    'private_reply',
    'like',
    'hide',
    'delete'
  )),
  message_text text,
  reason_note text,
  requested_by uuid,
  requested_at timestamptz,
  status text not null default 'approved' check (status in (
    'approved',
    'queued',
    'sending',
    'succeeded',
    'failed_retryable',
    'failed_terminal',
    'canceled'
  )),
  meta_action_id text,
  meta_response jsonb not null default '{}'::jsonb,
  meta_error_message text,
  meta_error_code integer,
  meta_error_subcode integer,
  meta_trace_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_retry_at timestamptz,
  last_attempted_at timestamptz,
  completed_at timestamptz,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    action_type not in ('public_reply', 'private_reply')
    or (message_text is not null and length(btrim(message_text)) > 0)
  ),
  check (
    action_type not in ('hide', 'delete')
    or (reason_note is not null and length(btrim(reason_note)) > 0)
  )
);

create unique index if not exists meta_inbox_comment_actions_idempotency_idx
  on public.meta_inbox_comment_actions (
    environment,
    conversation_id,
    action_type,
    idempotency_key
  );

create index if not exists meta_inbox_comment_actions_conversation_idx
  on public.meta_inbox_comment_actions (environment, conversation_id, created_at desc);

create index if not exists meta_inbox_comment_actions_comment_idx
  on public.meta_inbox_comment_actions (environment, comment_id, created_at desc);

create index if not exists meta_inbox_comment_actions_failed_retry_idx
  on public.meta_inbox_comment_actions (
    environment,
    status,
    next_retry_at,
    created_at desc
  )
  where status in ('failed_retryable', 'failed_terminal');

create index if not exists meta_inbox_comment_actions_delivery_queue_idx
  on public.meta_inbox_comment_actions (environment, status, created_at)
  where status = 'queued';

drop trigger if exists meta_inbox_comment_actions_set_updated_at
  on public.meta_inbox_comment_actions;
create trigger meta_inbox_comment_actions_set_updated_at
  before update on public.meta_inbox_comment_actions
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_comment_actions enable row level security;

grant select, insert, update on table public.meta_inbox_comment_actions
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

drop policy if exists ads_analyst_select on public.meta_inbox_comment_actions;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_comment_actions;
drop policy if exists ads_analyst_web_update on public.meta_inbox_comment_actions;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_comment_actions;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_comment_actions;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_comment_actions;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_comment_actions;

create policy ads_analyst_select on public.meta_inbox_comment_actions
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_insert on public.meta_inbox_comment_actions
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_web_update on public.meta_inbox_comment_actions
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_insert on public.meta_inbox_comment_actions
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_update on public.meta_inbox_comment_actions
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_insert on public.meta_inbox_comment_actions
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_update on public.meta_inbox_comment_actions
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_comment_actions is
  'Inbox-owned public comment action ledger for replies, private replies, likes, hides, deletes, Meta errors, and manager audit reporting.';
comment on column public.meta_inbox_comment_actions.reason_note is
  'Required reason note for moderation-sensitive hide/delete actions.';
comment on column public.meta_inbox_comment_actions.idempotency_key is
  'Duplicate-action protection key unique per conversation/action/environment.';

-- Contract marker for tests and reviewers: comment actions write
-- meta_inbox_conversation_events rows where event_type = 'comment_action'.
