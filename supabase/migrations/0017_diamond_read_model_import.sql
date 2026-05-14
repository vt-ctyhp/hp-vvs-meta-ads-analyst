create table public.diamond_read_model_import_staging (
  import_cert_no text primary key,
  import_batch_id uuid not null,
  include_in_active_import boolean not null default true,
  source_workbook text not null,
  source_sheet text not null default '_SW_DiamondReadModel',
  source_row_number integer not null,
  source_row_id integer,
  root_appt_id text not null,
  customer_name text,
  customer_appt_at timestamptz,
  client_advisor text,
  joc text,
  company public.brand not null,
  vendor text,
  stone_type text,
  shape text,
  carat numeric(6,3),
  color text,
  clarity text,
  lab text,
  source_cert_no text,
  measurements text,
  ratio numeric(6,3),
  order_status public.stone_order_status,
  stone_status public.stone_status,
  decision text,
  request_date date,
  requested_by text,
  ordered_by text,
  purchased_ordered_date date,
  memo_invoice_date date,
  return_due_date date,
  tracking_eta date,
  tracking_status text,
  carrier text,
  tracking_number text,
  tracking_url text,
  tracking_notes text,
  loupe360_order_number text,
  invoice_number text,
  loupe360_last_sync_at timestamptz,
  diamond_label text,
  source_spreadsheet_url text,
  source_spreadsheet_name text,
  source_tab text,
  search_text text,
  source_row_json jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_diamond_read_model_import_batch
  on public.diamond_read_model_import_staging(import_batch_id);
create index idx_diamond_read_model_import_root
  on public.diamond_read_model_import_staging(root_appt_id);
create index idx_diamond_read_model_import_scope
  on public.diamond_read_model_import_staging(include_in_active_import, order_status, stone_status);
create trigger trg_touch_diamond_read_model_import_staging
  before update on public.diamond_read_model_import_staging
  for each row execute function public.touch_customer_read_model_import_staging();
alter table public.diamond_read_model_import_staging enable row level security;
create policy diamond_read_model_import_select_admin
  on public.diamond_read_model_import_staging
  for select
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy diamond_read_model_import_insert_admin
  on public.diamond_read_model_import_staging
  for insert
  with check (public.current_user_has_role('admin'));
create policy diamond_read_model_import_update_admin
  on public.diamond_read_model_import_staging
  for update
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy diamond_read_model_import_delete_admin
  on public.diamond_read_model_import_staging
  for delete
  using (public.current_user_has_role('admin'));
create or replace function public.preview_diamond_read_model_import(
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
    from public.diamond_read_model_import_staging s
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
  select 'missing_import_cert_no'::text, count(*) from eligible where nullif(import_cert_no, '') is null
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
  select 'generated_cert_numbers'::text, count(*)
  from eligible e
  where e.import_cert_no <> e.source_cert_no
  union all
  select 'duplicate_source_cert_numbers'::text, count(*)
  from (
    select lower(e.source_cert_no)
    from eligible e
    where nullif(e.source_cert_no, '') is not null
    group by lower(e.source_cert_no)
    having count(*) > 1
  ) d
  union all
  select 'existing_stones_to_update'::text, count(*)
  from eligible e
  where exists (
    select 1
    from public.stones s
    where s.cert_no = e.import_cert_no
  )
  union all
  select 'new_stones_to_insert'::text, count(*)
  from eligible e
  where not exists (
    select 1
    from public.stones s
    where s.cert_no = e.import_cert_no
  )
  union all
  select 'assigned_roots'::text, count(distinct e.root_appt_id)
  from eligible e;
$$;
create or replace function public.apply_diamond_read_model_import(
  p_import_batch_id uuid default null
)
returns table(target_table text, rows_affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stone_count integer := 0;
begin
  drop table if exists pg_temp.diamond_import_source;

  create temp table diamond_import_source on commit drop as
    select distinct on (s.import_cert_no) s.*
    from public.diamond_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
      and s.include_in_active_import = true
      and nullif(s.import_cert_no, '') is not null
      and nullif(s.root_appt_id, '') is not null
      and exists (
        select 1
        from public.root_appointments r
        where r.root_appt_id = s.root_appt_id
      )
    order by s.import_cert_no, s.source_row_number;

  insert into public.stones (
    cert_no,
    vendor,
    lab,
    stone_type,
    shape,
    carat,
    color,
    clarity,
    measurements,
    ratio,
    order_status,
    stone_status,
    decision,
    purchased_ordered_date,
    memo_invoice_date,
    return_due_date,
    tracking_eta,
    tracking_status,
    carrier,
    tracking_number,
    tracking_url,
    tracking_notes,
    assigned_root_id,
    assigned_customer_name,
    assigned_advisor_id,
    assigned_joc_id,
    assigned_at
  )
  select
    s.import_cert_no,
    nullif(s.vendor, ''),
    nullif(s.lab, ''),
    nullif(s.stone_type, ''),
    nullif(s.shape, ''),
    s.carat,
    nullif(s.color, ''),
    nullif(s.clarity, ''),
    nullif(s.measurements, ''),
    s.ratio,
    s.order_status,
    s.stone_status,
    nullif(s.decision, ''),
    s.purchased_ordered_date,
    s.memo_invoice_date,
    s.return_due_date,
    s.tracking_eta,
    nullif(s.tracking_status, ''),
    nullif(s.carrier, ''),
    nullif(s.tracking_number, ''),
    nullif(s.tracking_url, ''),
    nullif(s.tracking_notes, ''),
    r.id,
    coalesce(nullif(s.customer_name, ''), ci.customer_name),
    ci.client_advisor_id,
    ci.joc_id,
    coalesce(s.request_date::timestamptz, s.purchased_ordered_date::timestamptz, s.staged_at)
  from pg_temp.diamond_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id
  left join public.customer_info ci on ci.root_id = r.id
  on conflict (cert_no) do update
    set vendor = excluded.vendor,
        lab = excluded.lab,
        stone_type = excluded.stone_type,
        shape = excluded.shape,
        carat = excluded.carat,
        color = excluded.color,
        clarity = excluded.clarity,
        measurements = excluded.measurements,
        ratio = excluded.ratio,
        order_status = excluded.order_status,
        stone_status = excluded.stone_status,
        decision = excluded.decision,
        purchased_ordered_date = excluded.purchased_ordered_date,
        memo_invoice_date = excluded.memo_invoice_date,
        return_due_date = excluded.return_due_date,
        tracking_eta = excluded.tracking_eta,
        tracking_status = excluded.tracking_status,
        carrier = excluded.carrier,
        tracking_number = excluded.tracking_number,
        tracking_url = excluded.tracking_url,
        tracking_notes = excluded.tracking_notes,
        assigned_root_id = excluded.assigned_root_id,
        assigned_customer_name = excluded.assigned_customer_name,
        assigned_advisor_id = excluded.assigned_advisor_id,
        assigned_joc_id = excluded.assigned_joc_id,
        assigned_at = excluded.assigned_at;

  get diagnostics v_stone_count = row_count;

  return query values ('stones'::text, v_stone_count);
end;
$$;
