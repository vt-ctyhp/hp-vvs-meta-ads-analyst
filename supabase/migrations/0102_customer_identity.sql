create table public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_code text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create table public.human_id_sequences (
  id_kind text not null,
  period text not null,
  next_value integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (id_kind, period),
  constraint human_id_sequences_kind_check
    check (id_kind in ('customer', 'root_appt')),
  constraint human_id_sequences_next_value_check
    check (next_value > 0),
  constraint human_id_sequences_period_check
    check (length(period) > 0)
);
create trigger trg_bump_customers
  before update on public.customers
  for each row execute function public.bump_updated_at_and_version();
create or replace function public.next_customer_code(p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_period text;
begin
  v_period := to_char(coalesce(p_at, now()) at time zone 'America/Los_Angeles', 'YYMM');

  insert into public.human_id_sequences (id_kind, period, next_value)
  values ('customer', v_period, 2)
  on conflict (id_kind, period) do update
    set next_value = public.human_id_sequences.next_value + 1,
        updated_at = now()
  returning next_value - 1 into v_next;

  return 'CUS-' || v_period || '-' || lpad(v_next::text, 3, '0');
end;
$$;
create or replace function public.next_root_appt_id(p_visit_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_period text;
begin
  v_period := to_char(coalesce(p_visit_at, now()) at time zone 'America/Los_Angeles', 'YYYYMMDD');

  insert into public.human_id_sequences (id_kind, period, next_value)
  values ('root_appt', v_period, 2)
  on conflict (id_kind, period) do update
    set next_value = public.human_id_sequences.next_value + 1,
        updated_at = now()
  returning next_value - 1 into v_next;

  return 'AP-' || v_period || '-' || lpad(v_next::text, 3, '0');
end;
$$;
grant execute on function public.next_customer_code(timestamptz) to authenticated;
grant execute on function public.next_root_appt_id(timestamptz) to authenticated;
alter table public.root_appointments
  add column customer_id uuid;
do $$
declare
  r record;
  v_customer_id uuid;
begin
  alter table public.root_appointments disable trigger trg_bump_root_appointments;

  for r in
    select id, created_at, updated_at
    from public.root_appointments
    where customer_id is null
    order by created_at, id
  loop
    insert into public.customers (customer_code, created_at, updated_at)
    values (
      public.next_customer_code(coalesce(r.created_at, now())),
      coalesce(r.created_at, now()),
      coalesce(r.updated_at, r.created_at, now())
    )
    returning id into v_customer_id;

    update public.root_appointments
      set customer_id = v_customer_id
      where id = r.id;
  end loop;

  alter table public.root_appointments enable trigger trg_bump_root_appointments;
end $$;
alter table public.root_appointments
  alter column customer_id set not null,
  add constraint root_appointments_customer_id_fkey
    foreign key (customer_id)
    references public.customers(id)
    on delete restrict;
create index idx_root_appointments_customer
  on public.root_appointments(customer_id);
alter table public.customers enable row level security;
alter table public.human_id_sequences enable row level security;
create policy customers_select_visible_root on public.customers
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or exists (
      select 1
      from public.root_appointments r
      where r.customer_id = customers.id
        and public.can_read_root(r.id)
    )
  );
create policy customers_insert_admin on public.customers
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy customers_update_admin on public.customers
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy customers_delete_admin on public.customers
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy human_id_sequences_select_admin on public.human_id_sequences
  for select to authenticated
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy human_id_sequences_insert_admin on public.human_id_sequences
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy human_id_sequences_update_admin on public.human_id_sequences
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy human_id_sequences_delete_admin on public.human_id_sequences
  for delete to authenticated
  using (public.current_user_has_role('admin'));
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
  v_new_customer_count integer := 0;
  v_root_count integer := 0;
  v_customer_count integer := 0;
  v_status_count integer := 0;
  v_order_count integer := 0;
begin
  drop table if exists pg_temp.crm_import_source;
  drop table if exists pg_temp.crm_import_customers;

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

  create temp table crm_import_customers (
    root_appt_id text primary key,
    customer_id uuid not null
  ) on commit drop;

  insert into pg_temp.crm_import_customers (root_appt_id, customer_id)
  select s.root_appt_id, r.customer_id
  from pg_temp.crm_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id;

  with new_customer_inputs as (
    select
      s.root_appt_id,
      public.next_customer_code(coalesce(s.latest_visit_at, s.source_updated_at, now())) as customer_code,
      coalesce(s.source_updated_at, now()) as created_at
    from pg_temp.crm_import_source s
    where not exists (
      select 1
      from public.root_appointments r
      where r.root_appt_id = s.root_appt_id
    )
  ),
  inserted_customers as (
    insert into public.customers (customer_code, created_at, updated_at)
    select customer_code, created_at, created_at
    from new_customer_inputs
    returning id, customer_code
  )
  insert into pg_temp.crm_import_customers (root_appt_id, customer_id)
  select n.root_appt_id, i.id
  from new_customer_inputs n
  join inserted_customers i on i.customer_code = n.customer_code;

  get diagnostics v_new_customer_count = row_count;

  insert into public.root_appointments (
    customer_id,
    root_appt_id,
    status,
    brand
  )
  select
    c.customer_id,
    s.root_appt_id,
    'active',
    s.brand
  from pg_temp.crm_import_source s
  join pg_temp.crm_import_customers c on c.root_appt_id = s.root_appt_id
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
      ('customers'::text, v_new_customer_count),
      ('root_appointments'::text, v_root_count),
      ('customer_info'::text, v_customer_count),
      ('client_status'::text, v_status_count),
      ('order_3d'::text, v_order_count);
end;
$$;
