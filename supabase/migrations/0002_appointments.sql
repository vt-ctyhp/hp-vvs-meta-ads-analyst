create type public.booking_source as enum ('acuity', 'calendly', 'manual', 'test');
create table public.root_appointments (
  id uuid primary key default gen_random_uuid(),
  root_appt_id text not null unique,
  current_appt_id uuid,
  status text not null default 'active',
  brand public.brand not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create table public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appt_id text not null unique,
  root_id uuid not null references public.root_appointments(id) on delete restrict,
  booking_source public.booking_source not null,
  external_booking_id text,
  external_rescheduled_from_id text,
  visit_date_time timestamptz,
  visit_type text,
  duration_minutes integer,
  location text,
  source text,
  brand public.brand not null,
  status text not null default 'active',
  active boolean not null default true,
  rescheduled_from_event_id uuid references public.appointment_events(id),
  rescheduled_to_event_id uuid references public.appointment_events(id),
  booked_at timestamptz,
  canceled_at timestamptz,
  rescheduled_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  outcome text,
  outcome_notes text,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (booking_source, external_booking_id)
);
alter table public.root_appointments
  add constraint root_appointments_current_appt_id_fkey
  foreign key (current_appt_id)
  references public.appointment_events(id)
  on delete set null;
create or replace function public.update_root_current_appt()
returns trigger
language plpgsql
as $$
begin
  if new.active then
    update public.root_appointments
      set current_appt_id = new.id,
          updated_at = now(),
          version = version + 1
    where id = new.root_id;
  end if;
  return new;
end;
$$;
create trigger trg_appt_event_root_pointer
  after insert or update of active on public.appointment_events
  for each row execute function public.update_root_current_appt();
create index idx_appt_events_root on public.appointment_events(root_id);
create index idx_appt_events_visit on public.appointment_events(visit_date_time) where active;
create index idx_appt_events_external on public.appointment_events(booking_source, external_booking_id);
