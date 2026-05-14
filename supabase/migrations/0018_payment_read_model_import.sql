create table public.payment_read_model_import_staging (
  payment_id text primary key,
  import_batch_id uuid not null,
  include_in_active_import boolean not null default true,
  source_workbook text not null,
  source_sheet text not null default '_SW_PaymentReadModel',
  source_row_number integer not null,
  source_row_id integer,
  root_appt_id text not null,
  so_number text,
  source_key text,
  brand public.brand not null,
  doc_family public.doc_family not null,
  source_doc_type text,
  source_doc_number text,
  import_doc_number text not null,
  doc_status public.doc_status not null default 'active',
  method text,
  payment_at timestamptz,
  payment_at_ms bigint,
  amount_net numeric(12,2),
  amount_gross numeric(12,2),
  balance_due numeric(12,2),
  order_total numeric(12,2),
  search_text text,
  source_row_json jsonb not null default '{}'::jsonb,
  staged_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_payment_read_model_import_batch
  on public.payment_read_model_import_staging(import_batch_id);
create index idx_payment_read_model_import_root
  on public.payment_read_model_import_staging(root_appt_id);
create index idx_payment_read_model_import_scope
  on public.payment_read_model_import_staging(include_in_active_import, doc_family, doc_status);
create trigger trg_touch_payment_read_model_import_staging
  before update on public.payment_read_model_import_staging
  for each row execute function public.touch_customer_read_model_import_staging();
alter table public.payment_read_model_import_staging enable row level security;
create policy payment_read_model_import_select_admin
  on public.payment_read_model_import_staging
  for select
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy payment_read_model_import_insert_admin
  on public.payment_read_model_import_staging
  for insert
  with check (public.current_user_has_role('admin'));
create policy payment_read_model_import_update_admin
  on public.payment_read_model_import_staging
  for update
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy payment_read_model_import_delete_admin
  on public.payment_read_model_import_staging
  for delete
  using (public.current_user_has_role('admin'));
create or replace function public.preview_payment_read_model_import(
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
    from public.payment_read_model_import_staging s
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
  select 'missing_payment_id'::text, count(*) from eligible where nullif(payment_id, '') is null
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
  select 'missing_amount_gross'::text, count(*) from eligible where amount_gross is null
  union all
  select 'duplicate_import_doc_numbers'::text, count(*)
  from (
    select e.brand, e.import_doc_number
    from eligible e
    group by e.brand, e.import_doc_number
    having count(*) > 1
  ) d
  union all
  select 'existing_documents_to_update'::text, count(*)
  from eligible e
  where exists (
    select 1
    from public.documents d
    where d.document_id = 'PAYMENT-' || e.payment_id
  )
  union all
  select 'new_documents_to_insert'::text, count(*)
  from eligible e
  where not exists (
    select 1
    from public.documents d
    where d.document_id = 'PAYMENT-' || e.payment_id
  )
  union all
  select 'assigned_roots'::text, count(distinct e.root_appt_id)
  from eligible e;
$$;
create or replace function public.apply_payment_read_model_import(
  p_import_batch_id uuid default null,
  p_imported_by uuid default null
)
returns table(target_table text, rows_affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_document_count integer := 0;
  v_ledger_count integer := 0;
  v_imported_by uuid;
begin
  select coalesce(
    p_imported_by,
    (select u.id from public.users u where lower(u.email) = 'vt@ctyhp.us' limit 1),
    (select u.id from public.users u join public.user_roles ur on ur.user_id = u.id where ur.role = 'admin' limit 1),
    (select u.id from public.users u order by u.created_at limit 1)
  )
  into v_imported_by;

  if v_imported_by is null then
    raise exception 'Could not resolve imported_by user for payment import.';
  end if;

  drop table if exists pg_temp.payment_import_source;

  create temp table payment_import_source on commit drop as
    select distinct on (s.payment_id) s.*
    from public.payment_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
      and s.include_in_active_import = true
      and nullif(s.payment_id, '') is not null
      and nullif(s.root_appt_id, '') is not null
      and s.amount_gross is not null
      and exists (
        select 1
        from public.root_appointments r
        where r.root_appt_id = s.root_appt_id
      )
    order by s.payment_id, s.source_row_number;

  insert into public.documents (
    document_id,
    root_id,
    brand,
    doc_family,
    doc_number,
    tax_enabled,
    issued_at,
    issued_by,
    status,
    idempotency_key
  )
  select
    'PAYMENT-' || s.payment_id,
    r.id,
    s.brand,
    s.doc_family,
    s.import_doc_number,
    false,
    coalesce(s.payment_at, s.staged_at),
    v_imported_by,
    s.doc_status,
    'payment-import-' || s.payment_id
  from pg_temp.payment_import_source s
  join public.root_appointments r on r.root_appt_id = s.root_appt_id
  on conflict (document_id) do update
    set root_id = excluded.root_id,
        brand = excluded.brand,
        doc_family = excluded.doc_family,
        doc_number = excluded.doc_number,
        tax_enabled = excluded.tax_enabled,
        issued_at = excluded.issued_at,
        issued_by = excluded.issued_by,
        status = excluded.status,
        idempotency_key = excluded.idempotency_key;

  get diagnostics v_document_count = row_count;

  insert into public.payment_ledger (
    document_id,
    so,
    subtotal,
    referral_discount,
    tax_rate,
    tax_amount,
    invoice_total,
    amount_received,
    fees,
    net_amount,
    balance_due,
    method,
    reference,
    line_items
  )
  select
    d.id,
    nullif(s.so_number, ''),
    coalesce(s.order_total, s.amount_gross + coalesce(s.balance_due, 0), s.amount_gross),
    0,
    0,
    0,
    coalesce(s.order_total, s.amount_gross + coalesce(s.balance_due, 0), s.amount_gross),
    s.amount_gross,
    greatest(coalesce(s.amount_gross, 0) - coalesce(s.amount_net, s.amount_gross, 0), 0),
    coalesce(s.amount_net, s.amount_gross),
    s.balance_due,
    nullif(s.method, ''),
    s.payment_id,
    jsonb_build_array(
      jsonb_build_object(
        'description', 'Imported ' || s.source_doc_type,
        'quantity', 1,
        'unitPrice', coalesce(s.order_total, s.amount_gross + coalesce(s.balance_due, 0), s.amount_gross),
        'sourcePaymentId', s.payment_id,
        'sourceDocNumber', s.source_doc_number,
        'sourceRow', s.source_row_id,
        'sourceRowJson', s.source_row_json
      )
    )
  from pg_temp.payment_import_source s
  join public.documents d on d.document_id = 'PAYMENT-' || s.payment_id
  on conflict (document_id) do update
    set so = excluded.so,
        subtotal = excluded.subtotal,
        referral_discount = excluded.referral_discount,
        tax_rate = excluded.tax_rate,
        tax_amount = excluded.tax_amount,
        invoice_total = excluded.invoice_total,
        amount_received = excluded.amount_received,
        fees = excluded.fees,
        net_amount = excluded.net_amount,
        balance_due = excluded.balance_due,
        method = excluded.method,
        reference = excluded.reference,
        line_items = excluded.line_items;

  get diagnostics v_ledger_count = row_count;

  return query
    values
      ('documents'::text, v_document_count),
      ('payment_ledger'::text, v_ledger_count);
end;
$$;
