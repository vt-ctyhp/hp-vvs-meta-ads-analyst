alter table public.customers
  add column is_test boolean not null default false,
  add column test_marked_reason text,
  add column test_marked_by uuid references public.users(id) on delete set null,
  add column test_marked_at timestamptz,
  add constraint customers_test_marker_reason_check
    check (is_test = false or nullif(btrim(test_marked_reason), '') is not null),
  add constraint customers_test_marker_at_check
    check (is_test = false or test_marked_at is not null);
create index idx_customers_is_test on public.customers(is_test)
  where is_test = true;
create table public.customer_purge_runs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  customer_code text not null,
  customer_name text,
  root_ids uuid[] not null default '{}',
  root_appt_ids text[] not null default '{}',
  actor_user_id uuid,
  reason text not null,
  options jsonb not null default '{}'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  storage_manifest jsonb not null default '[]'::jsonb,
  storage_delete_failures jsonb not null default '[]'::jsonb,
  status text not null,
  error text,
  requested_at timestamptz not null default now(),
  db_purged_at timestamptz,
  storage_deleted_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  constraint customer_purge_runs_reason_check
    check (nullif(btrim(reason), '') is not null),
  constraint customer_purge_runs_status_check
    check (status in ('db_purged', 'completed', 'partial_success', 'storage_failed'))
);
create index idx_customer_purge_runs_customer on public.customer_purge_runs(customer_id);
create index idx_customer_purge_runs_status on public.customer_purge_runs(status);
create index idx_customer_purge_runs_requested on public.customer_purge_runs(requested_at desc);
create trigger trg_bump_customer_purge_runs
  before update on public.customer_purge_runs
  for each row execute function public.bump_updated_at_and_version();
alter table public.customer_purge_runs enable row level security;
create policy customer_purge_runs_select_admin on public.customer_purge_runs
  for select to authenticated
  using (public.current_user_has_role('admin'));
create policy customer_purge_runs_insert_admin on public.customer_purge_runs
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy customer_purge_runs_update_admin on public.customer_purge_runs
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create or replace function public.prevent_update_delete()
returns trigger
language plpgsql
as $$
begin
  if current_setting('app.customer_purge', true) = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;

    return new;
  end if;

  raise exception 'append-only table %.% cannot be updated or deleted', tg_table_schema, tg_table_name;
end;
$$;
create or replace function public.customer_purge_actor_is_admin(p_actor_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_has_role('admin'::public.user_role)
    or (
      auth.role() = 'service_role'
      and p_actor_user_id is not null
      and exists (
        select 1
        from public.users u
        join public.user_roles ur on ur.user_id = u.id
        where u.id = p_actor_user_id
          and u.active = true
          and ur.role = 'admin'::public.user_role
      )
    );
$$;
grant execute on function public.customer_purge_actor_is_admin(uuid) to authenticated, service_role;
create or replace function public.preview_test_customer_purge(
  p_customer_id uuid,
  p_actor_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_customer public.customers%rowtype;
  v_customer_name text;
  v_root_ids uuid[];
  v_appt_ids uuid[];
  v_doc_ids uuid[];
  v_task_ids uuid[];
  v_artifact_ids uuid[];
  v_deck_ids uuid[];
  v_design_asset_ids uuid[];
  v_storage_ref_ids uuid[];
  v_storage_manifest jsonb;
  v_storage_size_bytes bigint;
  v_roots jsonb;
  v_counts jsonb;
  v_financial_documents jsonb;
  v_stones_to_unassign jsonb;
begin
  if not public.customer_purge_actor_is_admin(p_actor_user_id) then
    raise exception 'Only admin users can preview customer purges.' using errcode = '42501';
  end if;

  select *
  into v_customer
  from public.customers
  where id = p_customer_id;

  if not found then
    raise exception 'Customer % could not be found.', p_customer_id using errcode = 'P0002';
  end if;

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_root_ids
  from public.root_appointments
  where customer_id = p_customer_id;

  select coalesce(array_agg(id order by visit_date_time nulls last, id), '{}'::uuid[])
  into v_appt_ids
  from public.appointment_events
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by issued_at desc, id), '{}'::uuid[])
  into v_doc_ids
  from public.documents
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_task_ids
  from public.tasks
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_artifact_ids
  from public.appointment_artifacts
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_deck_ids
  from public.design_decks
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_design_asset_ids
  from public.design_assets
  where root_id = any(v_root_ids);

  select coalesce(array_agg(asset_id), '{}'::uuid[])
  into v_storage_ref_ids
  from (
    select pdf_storage_asset_id as asset_id
    from public.documents
    where id = any(v_doc_ids)
    union
    select storage_asset_id
    from public.appointment_artifacts
    where id = any(v_artifact_ids)
    union
    select transcript_storage_asset_id
    from public.appointment_artifacts
    where id = any(v_artifact_ids)
    union
    select summary_storage_asset_id
    from public.appointment_artifacts
    where id = any(v_artifact_ids)
    union
    select storage_asset_id
    from public.design_assets
    where id = any(v_design_asset_ids)
    union
    select pdf_storage_asset_id
    from public.design_deck_versions
    where deck_id = any(v_deck_ids)
    union
    select pptx_storage_asset_id
    from public.design_deck_versions
    where deck_id = any(v_deck_ids)
  ) refs
  where asset_id is not null;

  select
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', sa.id,
          'bucket', sa.bucket,
          'path', sa.path,
          'purpose', sa.purpose,
          'sizeBytes', sa.size_bytes,
          'mimeType', sa.mime_type,
          'originalFilename', sa.original_filename,
          'canonicalFilename', sa.canonical_filename
        )
        order by sa.bucket, sa.path
      ),
      '[]'::jsonb
    ),
    coalesce(sum(sa.size_bytes), 0)::bigint
  into v_storage_manifest, v_storage_size_bytes
  from public.storage_assets sa
  where sa.root_id = any(v_root_ids)
    or sa.appt_id = any(v_appt_ids)
    or sa.document_id = any(v_doc_ids)
    or sa.artifact_id = any(v_artifact_ids)
    or sa.id = any(v_storage_ref_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', r.id,
        'rootApptId', r.root_appt_id,
        'brand', r.brand,
        'status', r.status,
        'bookingSources', coalesce((
          select jsonb_agg(s.booking_source order by s.booking_source)
          from (
            select distinct ae.booking_source::text as booking_source
            from public.appointment_events ae
            where ae.root_id = r.id
          ) s
        ), '[]'::jsonb)
      )
      order by r.created_at, r.id
    ),
    '[]'::jsonb
  )
  into v_roots
  from public.root_appointments r
  where r.id = any(v_root_ids);

  select ci.customer_name
  into v_customer_name
  from public.customer_info ci
  where ci.root_id = any(v_root_ids)
  order by ci.created_at, ci.id
  limit 1;

  v_counts := jsonb_build_object(
    'customers', 1,
    'root_appointments', coalesce(array_length(v_root_ids, 1), 0),
    'appointment_events', coalesce(array_length(v_appt_ids, 1), 0),
    'customer_info', (select count(*) from public.customer_info where root_id = any(v_root_ids)),
    'client_status', (select count(*) from public.client_status where root_id = any(v_root_ids)),
    'client_status_history', (select count(*) from public.client_status_history where root_id = any(v_root_ids)),
    'order_3d', (select count(*) from public.order_3d where root_id = any(v_root_ids)),
    'order_3d_revisions', (select count(*) from public.order_3d_revisions where root_id = any(v_root_ids)),
    'diamond_viewing', (select count(*) from public.diamond_viewing where root_id = any(v_root_ids)),
    'wax_requests', (select count(*) from public.wax_requests where root_id = any(v_root_ids)),
    'tasks', coalesce(array_length(v_task_ids, 1), 0),
    'task_log', (select count(*) from public.task_log where task_id = any(v_task_ids)),
    'task_gen_queue', (select count(*) from public.task_gen_queue where root_id = any(v_root_ids)),
    'appointment_artifacts', coalesce(array_length(v_artifact_ids, 1), 0),
    'appointment_notices', (select count(*) from public.appointment_notices where root_id = any(v_root_ids)),
    'documents', coalesce(array_length(v_doc_ids, 1), 0),
    'payment_ledger', (select count(*) from public.payment_ledger where document_id = any(v_doc_ids)),
    'quotations', (select count(*) from public.quotations where document_id = any(v_doc_ids)),
    'storage_assets', jsonb_array_length(v_storage_manifest),
    'design_assets', coalesce(array_length(v_design_asset_ids, 1), 0),
    'design_decks', coalesce(array_length(v_deck_ids, 1), 0),
    'design_deck_slides', (select count(*) from public.design_deck_slides where deck_id = any(v_deck_ids)),
    'design_deck_versions', (select count(*) from public.design_deck_versions where deck_id = any(v_deck_ids)),
    'diamond_quote_prep', (select count(*) from public.diamond_quote_prep where root_id = any(v_root_ids)),
    'data_cleanup_cases', (select count(*) from public.data_cleanup_cases where root_id = any(v_root_ids)),
    'ops_log', (
      select count(*)
      from public.ops_log
      where target_root_id = any(v_root_ids)
        or target_task_id = any(v_task_ids)
        or target_document_id = any(v_doc_ids)
    ),
    'stones_to_unassign', (select count(*) from public.stones where assigned_root_id = any(v_root_ids))
  );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'documentId', d.document_id,
        'docNumber', d.doc_number,
        'docFamily', d.doc_family,
        'status', d.status,
        'issuedAt', d.issued_at,
        'invoiceTotal', pl.invoice_total,
        'amountReceived', pl.amount_received,
        'balanceDue', pl.balance_due,
        'quotationTotal', q.total
      )
      order by d.issued_at desc, d.id
    ),
    '[]'::jsonb
  )
  into v_financial_documents
  from public.documents d
  left join public.payment_ledger pl on pl.document_id = d.id
  left join public.quotations q on q.document_id = d.id
  where d.id = any(v_doc_ids);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', s.id,
        'certNo', s.cert_no,
        'assignedCustomerName', s.assigned_customer_name,
        'orderStatus', s.order_status,
        'stoneStatus', s.stone_status
      )
      order by s.cert_no
    ),
    '[]'::jsonb
  )
  into v_stones_to_unassign
  from public.stones s
  where s.assigned_root_id = any(v_root_ids);

  return jsonb_build_object(
    'customer', jsonb_build_object(
      'id', v_customer.id,
      'customerCode', v_customer.customer_code,
      'customerName', v_customer_name,
      'isTest', v_customer.is_test,
      'testMarkedReason', v_customer.test_marked_reason,
      'testMarkedAt', v_customer.test_marked_at,
      'testMarkedBy', v_customer.test_marked_by
    ),
    'roots', v_roots,
    'counts', v_counts,
    'financialDocuments', v_financial_documents,
    'storage', jsonb_build_object(
      'fileCount', jsonb_array_length(v_storage_manifest),
      'sizeBytes', v_storage_size_bytes,
      'manifest', v_storage_manifest
    ),
    'stonesToUnassign', v_stones_to_unassign,
    'canExecute', v_customer.is_test
  );
end;
$$;
grant execute on function public.preview_test_customer_purge(uuid, uuid) to authenticated, service_role;
create or replace function public.execute_test_customer_purge(
  p_customer_id uuid,
  p_actor_user_id uuid,
  p_reason text,
  p_delete_storage_objects boolean default false,
  p_confirmation text default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, auth
as $$
declare
  v_customer public.customers%rowtype;
  v_preview jsonb;
  v_customer_name text;
  v_root_ids uuid[];
  v_root_appt_ids text[];
  v_appt_ids uuid[];
  v_doc_ids uuid[];
  v_task_ids uuid[];
  v_artifact_ids uuid[];
  v_deck_ids uuid[];
  v_design_asset_ids uuid[];
  v_storage_manifest jsonb;
  v_storage_ids uuid[];
  v_run_id uuid;
  v_status text;
begin
  if not public.customer_purge_actor_is_admin(p_actor_user_id) then
    raise exception 'Only admin users can execute customer purges.' using errcode = '42501';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'A purge reason is required.' using errcode = '22023';
  end if;

  select *
  into v_customer
  from public.customers
  where id = p_customer_id
  for update;

  if not found then
    raise exception 'Customer % could not be found.', p_customer_id using errcode = 'P0002';
  end if;

  if v_customer.is_test is not true then
    raise exception 'Customer % is not marked as test data.', v_customer.customer_code using errcode = '42501';
  end if;

  if p_confirmation is distinct from ('DELETE ' || v_customer.customer_code) then
    raise exception 'Confirmation must exactly match DELETE %.', v_customer.customer_code using errcode = '22023';
  end if;

  v_preview := public.preview_test_customer_purge(p_customer_id, p_actor_user_id);
  v_customer_name := v_preview #>> '{customer,customerName}';
  v_storage_manifest := coalesce(v_preview #> '{storage,manifest}', '[]'::jsonb);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[]),
         coalesce(array_agg(root_appt_id order by created_at, id), '{}'::text[])
  into v_root_ids, v_root_appt_ids
  from public.root_appointments
  where customer_id = p_customer_id;

  select coalesce(array_agg(id order by visit_date_time nulls last, id), '{}'::uuid[])
  into v_appt_ids
  from public.appointment_events
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by issued_at desc, id), '{}'::uuid[])
  into v_doc_ids
  from public.documents
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_task_ids
  from public.tasks
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_artifact_ids
  from public.appointment_artifacts
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_deck_ids
  from public.design_decks
  where root_id = any(v_root_ids);

  select coalesce(array_agg(id order by created_at, id), '{}'::uuid[])
  into v_design_asset_ids
  from public.design_assets
  where root_id = any(v_root_ids);

  select coalesce(array_agg((asset ->> 'id')::uuid), '{}'::uuid[])
  into v_storage_ids
  from jsonb_array_elements(v_storage_manifest) asset
  where asset ? 'id';

  v_status := case when p_delete_storage_objects then 'db_purged' else 'completed' end;

  insert into public.customer_purge_runs (
    actor_user_id,
    completed_at,
    customer_code,
    customer_id,
    customer_name,
    db_purged_at,
    options,
    preview,
    reason,
    root_appt_ids,
    root_ids,
    status,
    storage_manifest
  )
  values (
    p_actor_user_id,
    case when p_delete_storage_objects then null else now() end,
    v_customer.customer_code,
    v_customer.id,
    v_customer_name,
    now(),
    jsonb_build_object('deleteStorageObjects', p_delete_storage_objects),
    v_preview,
    btrim(p_reason),
    v_root_appt_ids,
    v_root_ids,
    v_status,
    v_storage_manifest
  )
  returning id into v_run_id;

  perform set_config('app.customer_purge', 'on', true);

  update public.stones
  set assigned_root_id = null,
      assigned_customer_name = null,
      assigned_advisor_id = null,
      assigned_joc_id = null,
      assigned_at = null,
      assigned_by = null,
      joc_handoff_at = null,
      updated_at = now()
  where assigned_root_id = any(v_root_ids);

  update public.root_appointments
  set current_appt_id = null
  where id = any(v_root_ids);

  update public.documents
  set pdf_storage_asset_id = null
  where id = any(v_doc_ids);

  update public.appointment_artifacts
  set storage_asset_id = null,
      transcript_storage_asset_id = null,
      summary_storage_asset_id = null
  where id = any(v_artifact_ids);

  update public.design_decks
  set current_version_id = null
  where id = any(v_deck_ids);

  update public.design_deck_versions
  set pdf_storage_asset_id = null,
      pptx_storage_asset_id = null
  where deck_id = any(v_deck_ids);

  update public.stones_sync
  set source_storage_asset_id = null
  where source_storage_asset_id = any(v_storage_ids);

  delete from public.ops_log
  where target_root_id = any(v_root_ids)
    or target_task_id = any(v_task_ids)
    or target_document_id = any(v_doc_ids);

  delete from public.task_log
  where task_id = any(v_task_ids);

  delete from public.client_status_history
  where root_id = any(v_root_ids);

  delete from public.order_3d_revisions
  where root_id = any(v_root_ids);

  delete from public.design_deck_slides
  where deck_id = any(v_deck_ids);

  delete from public.design_deck_versions
  where deck_id = any(v_deck_ids);

  delete from public.design_decks
  where id = any(v_deck_ids);

  delete from public.design_assets
  where id = any(v_design_asset_ids);

  delete from public.payment_ledger
  where document_id = any(v_doc_ids);

  delete from public.quotations
  where document_id = any(v_doc_ids);

  delete from public.documents
  where id = any(v_doc_ids);

  delete from public.storage_assets
  where id = any(v_storage_ids);

  delete from public.appointment_artifacts
  where id = any(v_artifact_ids);

  delete from public.appointment_notices
  where root_id = any(v_root_ids);

  delete from public.data_cleanup_cases
  where root_id = any(v_root_ids);

  delete from public.diamond_quote_prep
  where root_id = any(v_root_ids);

  delete from public.wax_requests
  where root_id = any(v_root_ids);

  delete from public.diamond_viewing
  where root_id = any(v_root_ids);

  delete from public.order_3d
  where root_id = any(v_root_ids);

  delete from public.client_status
  where root_id = any(v_root_ids);

  delete from public.customer_info
  where root_id = any(v_root_ids);

  delete from public.tasks
  where id = any(v_task_ids);

  delete from public.appointment_events
  where id = any(v_appt_ids);

  delete from public.task_gen_queue
  where root_id = any(v_root_ids);

  delete from public.root_appointments
  where id = any(v_root_ids);

  delete from public.customers
  where id = p_customer_id;

  return jsonb_build_object(
    'purgeRunId', v_run_id,
    'customerId', p_customer_id,
    'customerCode', v_customer.customer_code,
    'status', v_status,
    'deleteStorageObjects', p_delete_storage_objects,
    'storageManifest', v_storage_manifest,
    'preview', v_preview
  );
end;
$$;
grant execute on function public.execute_test_customer_purge(uuid, uuid, text, boolean, text) to authenticated, service_role;
