create table public.roster_schedule (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  working_days text[] not null default '{}',
  skill_lab_diamond boolean not null default false,
  skill_natural_diamond text not null default 'None',
  skill_general_appointment boolean not null default true,
  default_joc_user_id uuid references public.users(id),
  coverage_partner_user_id uuid references public.users(id),
  coverage_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create type public.schedule_change_type as enum (
  'full_day_off',
  'working',
  'pto',
  'sick',
  'vacation'
);
create table public.schedule_changes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  change_date date not null,
  change_type public.schedule_change_type not null,
  available_from time,
  available_until time,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);
create index idx_schedule_changes_user_date
  on public.schedule_changes(user_id, change_date);
create type public.notice_type as enum (
  'new_booking',
  'rescheduled',
  'canceled',
  'same_day_booking',
  'field_edit'
);
create table public.appointment_notices (
  id uuid primary key default gen_random_uuid(),
  notice_id text not null unique,
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  appt_id uuid references public.appointment_events(id) on delete set null,
  notice_type public.notice_type not null,
  prior_appt_date_time timestamptz,
  new_appt_date_time timestamptz,
  customer_name text not null,
  brand public.brand not null,
  target_advisor_id uuid references public.users(id),
  target_joc_id uuid references public.users(id),
  issued_at timestamptz not null default now(),
  issued_by text not null,
  acknowledged_by_advisor_at timestamptz,
  acknowledged_by_joc_at timestamptz
);
create index idx_notices_advisor on public.appointment_notices(target_advisor_id, issued_at desc)
  where acknowledged_by_advisor_at is null;
create index idx_notices_joc on public.appointment_notices(target_joc_id, issued_at desc)
  where acknowledged_by_joc_at is null;
create type public.broadcast_target_type as enum ('all', 'role', 'person');
create type public.broadcast_priority as enum ('normal', 'urgent');
create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  broadcast_id text not null unique,
  subject text not null,
  body text not null,
  priority public.broadcast_priority not null default 'normal',
  expires_at timestamptz,
  sent_by uuid not null references public.users(id),
  sent_at timestamptz not null default now()
);
create table public.broadcast_targets (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  target_type public.broadcast_target_type not null,
  target_role public.user_role,
  target_user_id uuid references public.users(id),
  check (
    (target_type = 'all' and target_role is null and target_user_id is null) or
    (target_type = 'role' and target_role is not null and target_user_id is null) or
    (target_type = 'person' and target_user_id is not null and target_role is null)
  )
);
create index idx_broadcast_targets_role on public.broadcast_targets(target_role);
create index idx_broadcast_targets_user on public.broadcast_targets(target_user_id);
create table public.broadcast_reads (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);
