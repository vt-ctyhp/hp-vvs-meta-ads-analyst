create table public.config (
  section text not null,
  key text not null,
  value jsonb not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id),
  primary key (section, key)
);
create table public.ops_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  user_id uuid references public.users(id),
  category text not null,
  action text not null,
  target_root_id uuid references public.root_appointments(id),
  target_task_id uuid references public.tasks(id),
  target_document_id uuid references public.documents(id),
  result text not null,
  duration_ms integer,
  payload jsonb,
  error text
);
create index idx_ops_log_occurred on public.ops_log(occurred_at desc);
create index idx_ops_log_category on public.ops_log(category, occurred_at desc);
create index idx_ops_log_root on public.ops_log(target_root_id);
create table public.intake_queue (
  id uuid primary key default gen_random_uuid(),
  intake_id text not null unique,
  payload jsonb not null,
  status text not null default 'pending',
  error text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create index idx_intake_queue_status on public.intake_queue(status, created_at);
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  body text not null,
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id)
);
create table public.data_cleanup_cases (
  id uuid primary key default gen_random_uuid(),
  case_id text not null unique,
  root_id uuid not null references public.root_appointments(id) on delete restrict,
  status text not null,
  proposal jsonb,
  proposed_by uuid references public.users(id),
  proposed_at timestamptz,
  return_reason text,
  approved_by uuid references public.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
