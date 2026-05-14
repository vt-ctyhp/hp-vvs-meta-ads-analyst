create type public.task_status as enum (
  'pending',
  'snoozed',
  'completed',
  'blocked',
  'canceled'
);
create type public.task_owner_kind as enum ('user', 'role');
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  task_id text not null unique,
  task_type text not null,
  lifecycle_stage text,
  task_title text,
  instructions text,
  root_id uuid references public.root_appointments(id) on delete cascade,
  appt_id uuid references public.appointment_events(id) on delete set null,
  owner_kind public.task_owner_kind not null,
  owner_user_id uuid references public.users(id),
  owner_role public.user_role,
  status public.task_status not null default 'pending',
  due_at timestamptz,
  snooze_until date,
  snooze_reason text,
  blocked_reason text,
  intended_owner_id uuid references public.users(id),
  coverage_reason text,
  completed_at timestamptz,
  completed_by uuid references public.users(id),
  completion_payload jsonb,
  primary_action text,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  check (
    (owner_kind = 'user' and owner_user_id is not null and owner_role is null) or
    (owner_kind = 'role' and owner_role is not null and owner_user_id is null)
  )
);
alter table public.client_status_history
  add constraint client_status_history_task_id_fkey
  foreign key (task_id)
  references public.tasks(id)
  on delete set null;
create index idx_tasks_owner_user on public.tasks(owner_user_id)
  where status in ('pending', 'snoozed');
create index idx_tasks_owner_role on public.tasks(owner_role)
  where status in ('pending', 'snoozed');
create index idx_tasks_root on public.tasks(root_id);
create index idx_tasks_type on public.tasks(task_type);
create index idx_tasks_status on public.tasks(status);
create index idx_tasks_due on public.tasks(due_at) where status = 'pending';
create table public.task_log (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null,
  actor_id uuid references public.users(id),
  payload jsonb,
  occurred_at timestamptz not null default now()
);
create index idx_task_log_task on public.task_log(task_id, occurred_at desc);
create type public.artifact_type as enum (
  'appointment_recording',
  'diamond_viewing_recording',
  'client_advisor_recap',
  'transcript',
  'summary'
);
create type public.artifact_workflow_stage as enum (
  'uploaded',
  'transcription_queued',
  'transcribing',
  'transcript_ready',
  'summary_queued',
  'summary_ready',
  'approved',
  'handed_off',
  'error'
);
create table public.appointment_artifacts (
  id uuid primary key default gen_random_uuid(),
  artifact_id text not null unique,
  appt_id uuid not null references public.appointment_events(id) on delete cascade,
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  artifact_type public.artifact_type not null,
  workflow_stage public.artifact_workflow_stage not null default 'uploaded',
  storage_asset_id uuid,
  original_filename text,
  canonical_filename text,
  mime_type text,
  file_size_bytes bigint,
  assemblyai_transcript_id text,
  transcript_text text,
  transcript_storage_asset_id uuid,
  summary_json jsonb,
  summary_storage_asset_id uuid,
  sales_brief text,
  client_follow_up_draft text,
  review_flags jsonb,
  approved_at timestamptz,
  approved_by uuid references public.users(id),
  joc_handoff_at timestamptz,
  joc_handoff_by uuid references public.users(id),
  attempts integer not null default 0,
  last_error text,
  last_attempt_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index idx_artifacts_appt on public.appointment_artifacts(appt_id);
create index idx_artifacts_root on public.appointment_artifacts(root_id);
create index idx_artifacts_stage on public.appointment_artifacts(workflow_stage);
create table public.task_gen_queue (
  root_id uuid primary key references public.root_appointments(id) on delete cascade,
  enqueued_at timestamptz not null default now()
);
