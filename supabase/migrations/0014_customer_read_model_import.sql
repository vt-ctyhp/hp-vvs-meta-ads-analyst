create table public.customer_read_model_import_staging (
  root_appt_id text primary key,
  import_batch_id uuid not null,
  include_in_active_import boolean not null default true,
  source_workbook text not null,
  source_sheet text not null default '_SW_CustomerReadModel',
  source_row_number integer not null,
  latest_appt_id text,
  master_row text,
  customer_name text not null,
  email text,
  phone text,
  brand public.brand not null,
  client_advisor text,
  client_advisor_email text,
  joc text,
  joc_email text,
  latest_visit_at timestamptz,
  latest_visit_date date,
  latest_visit_time text,
  latest_visit_type text,
  next_visit text,
  last_visit text,
  appointment_count integer,
  active_appointment_count integer,
  active boolean not null,
  stage_key text,
  stage_label text,
  sales_stage text,
  conversion_status text,
  custom_order_status text,
  in_production_status text,
  center_stone_status text,
  so_number text,
  order_total numeric(12,2),
  paid_to_date numeric(12,2),
  remaining_balance numeric(12,2),
  last_payment_date date,
  quotation_url text,
  client_folder_url text,
  client_status_report_url text,
  tracker_3d_url text,
  deadline_3d date,
  production_deadline date,
  wax_print_status text,
  wax_deadline_admin date,
  dv_stones_summary text,
  next_steps text,
  design_request text,
  budget_range text,
  source text,
  style_notes text,
  source_updated_at timestamptz,
  source_rows_json jsonb,
  search_text text,
  source_row_json jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_customer_read_model_import_batch
  on public.customer_read_model_import_staging(import_batch_id);
create index idx_customer_read_model_import_scope
  on public.customer_read_model_import_staging(include_in_active_import, active, stage_key);
create or replace function public.touch_customer_read_model_import_staging()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create trigger trg_touch_customer_read_model_import_staging
  before update on public.customer_read_model_import_staging
  for each row execute function public.touch_customer_read_model_import_staging();
alter table public.customer_read_model_import_staging enable row level security;
create policy customer_read_model_import_select_admin
  on public.customer_read_model_import_staging
  for select
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy customer_read_model_import_insert_admin
  on public.customer_read_model_import_staging
  for insert
  with check (public.current_user_has_role('admin'));
create policy customer_read_model_import_update_admin
  on public.customer_read_model_import_staging
  for update
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy customer_read_model_import_delete_admin
  on public.customer_read_model_import_staging
  for delete
  using (public.current_user_has_role('admin'));
create or replace function public.preview_customer_read_model_import(
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
    from public.customer_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
  ),
  eligible as (
    select *
    from source_rows s
    where s.include_in_active_import = true
      and s.active = true
      and coalesce(lower(s.stage_key), '') not in ('won', 'lost')
  )
  select 'staged_rows'::text, count(*) from source_rows
  union all
  select 'eligible_rows'::text, count(*) from eligible
  union all
  select 'missing_root_appt_id'::text, count(*) from eligible where nullif(root_appt_id, '') is null
  union all
  select 'missing_customer_name'::text, count(*) from eligible where nullif(customer_name, '') is null
  union all
  select 'new_root_appointments'::text, count(*)
  from eligible e
  where not exists (
    select 1
    from public.root_appointments r
    where r.root_appt_id = e.root_appt_id
  )
  union all
  select 'existing_root_appointments'::text, count(*)
  from eligible e
  where exists (
    select 1
    from public.root_appointments r
    where r.root_appt_id = e.root_appt_id
  )
  union all
  select 'unmapped_client_advisor_emails'::text, count(distinct lower(e.client_advisor_email))
  from eligible e
  where nullif(e.client_advisor_email, '') is not null
    and not exists (
      select 1
      from public.users u
      where lower(u.email) = lower(e.client_advisor_email)
    )
  union all
  select 'unmapped_joc_emails'::text, count(distinct lower(e.joc_email))
  from eligible e
  where nullif(e.joc_email, '') is not null
    and not exists (
      select 1
      from public.users u
      where lower(u.email) = lower(e.joc_email)
    )
  union all
  select 'rows_with_so_number'::text, count(*)
  from eligible e
  where nullif(e.so_number, '') is not null
  union all
  select 'duplicate_so_numbers_in_staging'::text, count(*)
  from (
    select e.brand, e.so_number
    from eligible e
    where nullif(e.so_number, '') is not null
    group by e.brand, e.so_number
    having count(*) > 1
  ) d;
$$;
create or replace function public.apply_customer_read_model_import(
  p_import_batch_id uuid default null,
  p_imported_by uuid default null
)
returns table(target_table text, rows_affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_root_count integer := 0;
  v_customer_count integer := 0;
  v_status_count integer := 0;
  v_order_count integer := 0;
begin
  drop table if exists pg_temp.crm_import_source;

  create temp table crm_import_source on commit drop as
    select distinct on (s.root_appt_id) s.*
    from public.customer_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
      and s.include_in_active_import = true
      and s.active = true
      and coalesce(lower(s.stage_key), '') not in ('won', 'lost')
      and nullif(s.root_appt_id, '') is not null
      and nullif(s.customer_name, '') is not null
    order by s.root_appt_id, s.source_updated_at desc nulls last, s.staged_at desc;

  insert into public.root_appointments (
    root_appt_id,
    status,
    brand
  )
  select
    s.root_appt_id,
    'active',
    s.brand
  from pg_temp.crm_import_source s
  on conflict (root_appt_id) do update
    set status = excluded.status,
        brand = excluded.brand;

  get diagnostics v_root_count = row_count;

  insert into public.customer_info (
    root_id,
    customer_name,
    first_name,
    last_name,
    email,
    phone,
    phone_normalized,
    brand,
    client_advisor_id,
    joc_id,
    budget_range,
    style_notes,
    reference_links,
    marketing_source,
    created_by,
    updated_by
  )
  select
    r.id,
    s.customer_name,
    nullif(split_part(s.customer_name, ' ', 1), ''),
    nullif(regexp_replace(s.customer_name, '^\S+\s*', ''), s.customer_name),
    nullif(s.email, ''),
    nullif(s.phone, ''),
    nullif(regexp_replace(coalesce(s.phone, ''), '\D', '', 'g'), ''),
    s.brand,
    ca.id,
    joc.id,
    nullif(s.budget_range, ''),
    nullif(s.style_notes, ''),
    nullif(
      concat_ws(E'\n',
        case when nullif(s.client_folder_url, '') is null then null else 'Client Folder: ' || s.client_folder_url end,
        case when nullif(s.client_status_report_url, '') is null then null else 'Client Status Report: ' || s.client_status_report_url end,
        case when nullif(s.quotation_url, '') is null then null else 'Quotation: ' || s.quotation_url end,
        case when nullif(s.tracker_3d_url, '') is null then null else '3D Tracker: ' || s.tracker_3d_url end
      ),
      ''
    ),
    nullif(s.source, ''),
    p_imported_by,
    p_imported_by
  from pg_temp.crm_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id
  left join public.users ca on lower(ca.email) = lower(s.client_advisor_email)
  left join public.users joc on lower(joc.email) = lower(s.joc_email)
  on conflict (root_id) do update
    set customer_name = excluded.customer_name,
        first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        phone = excluded.phone,
        phone_normalized = excluded.phone_normalized,
        brand = excluded.brand,
        client_advisor_id = excluded.client_advisor_id,
        joc_id = excluded.joc_id,
        budget_range = excluded.budget_range,
        style_notes = excluded.style_notes,
        reference_links = excluded.reference_links,
        marketing_source = excluded.marketing_source,
        updated_by = excluded.updated_by;

  get diagnostics v_customer_count = row_count;

  insert into public.client_status (
    root_id,
    sales_stage,
    conversion_status,
    custom_order_status,
    in_production_status,
    center_stone_status,
    next_steps,
    deadline_3d,
    production_deadline,
    created_by,
    updated_by
  )
  select
    r.id,
    nullif(s.sales_stage, ''),
    nullif(s.conversion_status, ''),
    nullif(s.custom_order_status, ''),
    nullif(s.in_production_status, ''),
    nullif(s.center_stone_status, ''),
    nullif(s.next_steps, ''),
    s.deadline_3d,
    s.production_deadline,
    p_imported_by,
    p_imported_by
  from pg_temp.crm_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id
  on conflict (root_id) do update
    set sales_stage = excluded.sales_stage,
        conversion_status = excluded.conversion_status,
        custom_order_status = excluded.custom_order_status,
        in_production_status = excluded.in_production_status,
        center_stone_status = excluded.center_stone_status,
        next_steps = excluded.next_steps,
        deadline_3d = excluded.deadline_3d,
        production_deadline = excluded.production_deadline,
        updated_by = excluded.updated_by;

  get diagnostics v_status_count = row_count;

  insert into public.order_3d (
    root_id,
    so_number,
    brand,
    design_request,
    created_by,
    updated_by
  )
  select
    r.id,
    nullif(s.so_number, ''),
    s.brand,
    nullif(s.design_request, ''),
    p_imported_by,
    p_imported_by
  from pg_temp.crm_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id
  where nullif(s.so_number, '') is not null
    or nullif(s.design_request, '') is not null
  on conflict (root_id) do update
    set so_number = excluded.so_number,
        brand = excluded.brand,
        design_request = excluded.design_request,
        updated_by = excluded.updated_by;

  get diagnostics v_order_count = row_count;

  return query
    values
      ('root_appointments'::text, v_root_count),
      ('customer_info'::text, v_customer_count),
      ('client_status'::text, v_status_count),
      ('order_3d'::text, v_order_count);
end;
$$;
