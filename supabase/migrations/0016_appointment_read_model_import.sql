create table public.appointment_read_model_import_staging (
  event_appt_id text primary key,
  import_batch_id uuid not null,
  include_in_active_import boolean not null default true,
  source_workbook text not null,
  source_sheet text not null default '_SW_AppointmentReadModel',
  source_row_number integer not null,
  source_row_id integer,
  appt_id text,
  root_appt_id text not null,
  source_uid text,
  customer_name text,
  email text,
  phone text,
  brand public.brand not null,
  booked_at timestamptz,
  canceled_at timestamptz,
  rescheduled_from_uid text,
  rescheduled_to_uid text,
  visit_at timestamptz,
  visit_date date,
  visit_time text,
  visit_type text,
  diamond_type text,
  status text not null,
  active boolean not null default false,
  source_active boolean not null default false,
  client_advisor text,
  client_advisor_email text,
  joc text,
  joc_email text,
  client_folder_url text,
  client_status_report_url text,
  quotation_url text,
  tracker_3d_url text,
  sales_stage text,
  conversion_status text,
  custom_order_status text,
  in_production_status text,
  next_steps text,
  design_request text,
  deadline_3d date,
  production_deadline date,
  wax_print_status text,
  wax_deadline_admin date,
  wax_request_url text,
  center_stone_status text,
  dv_stones_summary text,
  source_row_json jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_appointment_read_model_import_batch
  on public.appointment_read_model_import_staging(import_batch_id);
create index idx_appointment_read_model_import_root
  on public.appointment_read_model_import_staging(root_appt_id);
create index idx_appointment_read_model_import_scope
  on public.appointment_read_model_import_staging(include_in_active_import, active, status);
create trigger trg_touch_appointment_read_model_import_staging
  before update on public.appointment_read_model_import_staging
  for each row execute function public.touch_customer_read_model_import_staging();
alter table public.appointment_read_model_import_staging enable row level security;
create policy appointment_read_model_import_select_admin
  on public.appointment_read_model_import_staging
  for select
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy appointment_read_model_import_insert_admin
  on public.appointment_read_model_import_staging
  for insert
  with check (public.current_user_has_role('admin'));
create policy appointment_read_model_import_update_admin
  on public.appointment_read_model_import_staging
  for update
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy appointment_read_model_import_delete_admin
  on public.appointment_read_model_import_staging
  for delete
  using (public.current_user_has_role('admin'));
create or replace function public.preview_appointment_read_model_import(
  p_import_batch_id uuid default null
)
returns table(check_name text, issue_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with source_rows as (
    select *
    from public.appointment_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
  ),
  eligible as (
    select *
    from source_rows s
    where s.include_in_active_import = true
  )
  select 'staged_rows'::text, count(*) from source_rows
  union all
  select 'eligible_rows'::text, count(*) from eligible
  union all
  select 'missing_event_appt_id'::text, count(*) from eligible where nullif(event_appt_id, '') is null
  union all
  select 'missing_root_appt_id'::text, count(*) from eligible where nullif(root_appt_id, '') is null
  union all
  select 'missing_existing_root_appointments'::text, count(*)
  from eligible e
  where not exists (
    select 1
    from public.root_appointments r
    where r.root_appt_id = e.root_appt_id
  )
  union all
  select 'active_appointment_events'::text, count(*)
  from eligible e
  where e.active = true
  union all
  select 'completed_appointment_events'::text, count(*)
  from eligible e
  where e.status = 'completed'
  union all
  select 'duplicate_source_uids'::text, count(*)
  from (
    select e.source_uid
    from eligible e
    where nullif(e.source_uid, '') is not null
    group by e.source_uid
    having count(*) > 1
  ) d
  union all
  select 'roots_with_multiple_active_events'::text, count(*)
  from (
    select e.root_appt_id
    from eligible e
    where e.active = true
    group by e.root_appt_id
    having count(*) > 1
  ) d;
$$;
create or replace function public.apply_appointment_read_model_import(
  p_import_batch_id uuid default null
)
returns table(target_table text, rows_affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_count integer := 0;
  v_pointer_count integer := 0;
begin
  drop table if exists pg_temp.appt_import_source;

  create temp table appt_import_source on commit drop as
    select distinct on (s.event_appt_id) s.*
    from public.appointment_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
      and s.include_in_active_import = true
      and nullif(s.event_appt_id, '') is not null
      and nullif(s.root_appt_id, '') is not null
      and exists (
        select 1
        from public.root_appointments r
        where r.root_appt_id = s.root_appt_id
      )
    order by s.event_appt_id, s.source_row_number;

  insert into public.appointment_events (
    appt_id,
    root_id,
    booking_source,
    external_booking_id,
    external_rescheduled_from_id,
    visit_date_time,
    visit_type,
    source,
    brand,
    status,
    active,
    booked_at,
    canceled_at,
    rescheduled_at,
    completed_at,
    no_show_at,
    raw_payload
  )
  select
    s.event_appt_id,
    r.id,
    'manual'::public.booking_source,
    s.event_appt_id,
    nullif(s.rescheduled_from_uid, ''),
    s.visit_at,
    nullif(s.visit_type, ''),
    'workbook_import',
    s.brand,
    s.status,
    s.active,
    s.booked_at,
    case when s.status = 'canceled' then coalesce(s.canceled_at, s.visit_at, s.staged_at) else s.canceled_at end,
    case when s.status = 'rescheduled' then coalesce(s.visit_at, s.staged_at) else null end,
    case when s.status = 'completed' then coalesce(s.visit_at, s.staged_at) else null end,
    case when s.status = 'no_show' then coalesce(s.visit_at, s.staged_at) else null end,
    jsonb_build_object(
      'source', 'customer_read_model_workbook',
      'source_appt_id', s.appt_id,
      'source_uid', s.source_uid,
      'source_row_number', s.source_row_number,
      'source_row_id', s.source_row_id,
      'source_active', s.source_active,
      'diamond_type', s.diamond_type,
      'client_advisor', s.client_advisor,
      'client_advisor_email', s.client_advisor_email,
      'joc', s.joc,
      'joc_email', s.joc_email,
      'client_folder_url', s.client_folder_url,
      'client_status_report_url', s.client_status_report_url,
      'quotation_url', s.quotation_url,
      'tracker_3d_url', s.tracker_3d_url,
      'sales_stage', s.sales_stage,
      'conversion_status', s.conversion_status,
      'custom_order_status', s.custom_order_status,
      'in_production_status', s.in_production_status,
      'next_steps', s.next_steps,
      'design_request', s.design_request,
      'deadline_3d', s.deadline_3d,
      'production_deadline', s.production_deadline,
      'wax_print_status', s.wax_print_status,
      'wax_deadline_admin', s.wax_deadline_admin,
      'wax_request_url', s.wax_request_url,
      'center_stone_status', s.center_stone_status,
      'dv_stones_summary', s.dv_stones_summary,
      'source_row_json', s.source_row_json
    )
  from pg_temp.appt_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id
  on conflict (appt_id) do update
    set root_id = excluded.root_id,
        booking_source = excluded.booking_source,
        external_booking_id = excluded.external_booking_id,
        external_rescheduled_from_id = excluded.external_rescheduled_from_id,
        visit_date_time = excluded.visit_date_time,
        visit_type = excluded.visit_type,
        source = excluded.source,
        brand = excluded.brand,
        status = excluded.status,
        active = excluded.active,
        booked_at = excluded.booked_at,
        canceled_at = excluded.canceled_at,
        rescheduled_at = excluded.rescheduled_at,
        completed_at = excluded.completed_at,
        no_show_at = excluded.no_show_at,
        raw_payload = excluded.raw_payload;

  get diagnostics v_event_count = row_count;

  with ranked as (
    select distinct on (ae.root_id)
      ae.root_id,
      ae.id
    from public.appointment_events ae
    join public.root_appointments r on r.id = ae.root_id
    where ae.active = true
      and ae.status not in ('canceled', 'rescheduled', 'no_show', 'completed')
      and exists (
        select 1
        from pg_temp.appt_import_source s
        where s.root_appt_id = r.root_appt_id
      )
    order by ae.root_id, ae.visit_date_time asc nulls last, ae.created_at desc
  )
  update public.root_appointments r
  set current_appt_id = ranked.id
  from ranked
  where r.id = ranked.root_id
    and r.current_appt_id is distinct from ranked.id;

  get diagnostics v_pointer_count = row_count;

  update public.root_appointments r
  set current_appt_id = null
  where exists (
      select 1
      from pg_temp.appt_import_source s
      where s.root_appt_id = r.root_appt_id
    )
    and not exists (
      select 1
      from public.appointment_events ae
      where ae.root_id = r.id
        and ae.active = true
        and ae.status not in ('canceled', 'rescheduled', 'no_show', 'completed')
    );

  return query
    values
      ('appointment_events'::text, v_event_count),
      ('root_appointments_current_appt_id'::text, v_pointer_count);
end;
$$;
