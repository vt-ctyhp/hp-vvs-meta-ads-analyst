do $$
declare
  t text;
begin
  foreach t in array array[
    'users',
    'user_roles',
    'root_appointments',
    'appointment_events',
    'customer_info',
    'client_status',
    'client_status_history',
    'order_3d',
    'order_3d_revisions',
    'diamond_viewing',
    'stones',
    'stones_sync',
    'wax_requests',
    'tasks',
    'task_log',
    'appointment_artifacts',
    'roster_schedule',
    'schedule_changes',
    'appointment_notices',
    'broadcasts',
    'broadcast_targets',
    'broadcast_reads',
    'documents',
    'doc_number_sequences',
    'payment_ledger',
    'quotations',
    'storage_assets',
    'design_assets',
    'design_decks',
    'design_deck_slides',
    'design_deck_versions',
    'config',
    'ops_log',
    'intake_queue',
    'templates',
    'data_cleanup_cases',
    'task_gen_queue'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;
create policy users_select_self_or_admin on public.users
  for select to authenticated
  using (
    id = public.current_app_user_id()
    or public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
  );
create policy users_insert_admin on public.users
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy users_update_admin on public.users
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy users_delete_admin on public.users
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy user_roles_select_self_or_admin on public.user_roles
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
  );
create policy user_roles_insert_admin on public.user_roles
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy user_roles_update_admin on public.user_roles
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy user_roles_delete_admin on public.user_roles
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy root_appointments_select_visible on public.root_appointments
  for select to authenticated
  using (public.can_read_root(id));
create policy root_appointments_insert_admin on public.root_appointments
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy root_appointments_update_visible_owner on public.root_appointments
  for update to authenticated
  using (public.can_write_root(id))
  with check (public.can_write_root(id));
create policy root_appointments_delete_admin on public.root_appointments
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy appointment_events_select_visible_root on public.appointment_events
  for select to authenticated
  using (public.can_read_root(root_id));
create policy appointment_events_insert_admin on public.appointment_events
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy appointment_events_update_visible_owner on public.appointment_events
  for update to authenticated
  using (public.can_write_root(root_id))
  with check (public.can_write_root(root_id));
create policy appointment_events_delete_admin on public.appointment_events
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy customer_info_select_visible_root on public.customer_info
  for select to authenticated
  using (public.can_read_root(root_id));
create policy customer_info_insert_admin on public.customer_info
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy customer_info_update_assigned_or_admin on public.customer_info
  for update to authenticated
  using (
    public.current_user_has_role('admin')
    or client_advisor_id = public.current_app_user_id()
    or joc_id = public.current_app_user_id()
  )
  with check (
    public.current_user_has_role('admin')
    or client_advisor_id = public.current_app_user_id()
    or joc_id = public.current_app_user_id()
  );
create policy customer_info_delete_admin on public.customer_info
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy client_status_select_visible_root on public.client_status
  for select to authenticated
  using (public.can_read_root(root_id));
create policy client_status_insert_visible_owner on public.client_status
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy client_status_update_visible_owner on public.client_status
  for update to authenticated
  using (public.can_write_root(root_id))
  with check (public.can_write_root(root_id));
create policy client_status_delete_admin on public.client_status
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy client_status_history_select_visible_root on public.client_status_history
  for select to authenticated
  using (public.can_read_root(root_id));
create policy client_status_history_insert_visible_owner on public.client_status_history
  for insert to authenticated
  with check (
    public.can_write_root(root_id)
    and changed_by = public.current_app_user_id()
  );
create policy order_3d_select_visible_root on public.order_3d
  for select to authenticated
  using (public.can_read_root(root_id));
create policy order_3d_insert_visible_owner on public.order_3d
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy order_3d_update_visible_owner on public.order_3d
  for update to authenticated
  using (public.can_write_root(root_id))
  with check (public.can_write_root(root_id));
create policy order_3d_delete_admin on public.order_3d
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy order_3d_revisions_select_visible_root on public.order_3d_revisions
  for select to authenticated
  using (public.can_read_root(root_id));
create policy order_3d_revisions_insert_visible_owner on public.order_3d_revisions
  for insert to authenticated
  with check (
    public.can_write_root(root_id)
    and created_by = public.current_app_user_id()
  );
create policy diamond_viewing_select_visible_root on public.diamond_viewing
  for select to authenticated
  using (public.can_read_root(root_id));
create policy diamond_viewing_insert_visible_owner on public.diamond_viewing
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy diamond_viewing_update_visible_owner on public.diamond_viewing
  for update to authenticated
  using (public.can_write_root(root_id))
  with check (public.can_write_root(root_id));
create policy diamond_viewing_delete_admin on public.diamond_viewing
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy stones_select_visible on public.stones
  for select to authenticated
  using (
    public.current_user_has_any_role(array[
      'admin',
      'read_only',
      'diamond_order_admin',
      'diamond_order_assistant'
    ]::public.user_role[])
    or (assigned_root_id is not null and public.can_read_root(assigned_root_id))
  );
create policy stones_insert_permitted on public.stones
  for insert to authenticated
  with check (
    public.current_user_has_any_role(array['admin', 'diamond_order_admin']::public.user_role[])
    or (assigned_root_id is not null and public.can_write_root(assigned_root_id))
  );
create policy stones_update_permitted on public.stones
  for update to authenticated
  using (
    public.current_user_has_any_role(array[
      'admin',
      'diamond_order_admin',
      'diamond_order_assistant'
    ]::public.user_role[])
    or (assigned_root_id is not null and public.can_write_root(assigned_root_id))
  )
  with check (
    public.current_user_has_any_role(array[
      'admin',
      'diamond_order_admin',
      'diamond_order_assistant'
    ]::public.user_role[])
    or (assigned_root_id is not null and public.can_write_root(assigned_root_id))
  );
create policy stones_delete_admin on public.stones
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy stones_sync_select_diamond_roles on public.stones_sync
  for select to authenticated
  using (
    public.current_user_has_any_role(array[
      'admin',
      'read_only',
      'diamond_order_admin',
      'diamond_order_assistant'
    ]::public.user_role[])
  );
create policy stones_sync_insert_admin on public.stones_sync
  for insert to authenticated
  with check (
    public.current_user_has_any_role(array['admin', 'diamond_order_admin']::public.user_role[])
  );
create policy wax_requests_select_visible_root on public.wax_requests
  for select to authenticated
  using (public.can_read_root(root_id));
create policy wax_requests_insert_visible_owner on public.wax_requests
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy wax_requests_update_visible_owner on public.wax_requests
  for update to authenticated
  using (public.can_write_root(root_id))
  with check (public.can_write_root(root_id));
create policy wax_requests_delete_admin on public.wax_requests
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy tasks_select_visible on public.tasks
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or owner_user_id = public.current_app_user_id()
    or (owner_kind = 'role' and public.current_user_has_role(owner_role))
    or (root_id is not null and public.can_read_root(root_id))
  );
create policy tasks_insert_admin on public.tasks
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy tasks_update_owner_or_admin on public.tasks
  for update to authenticated
  using (
    public.current_user_has_role('admin')
    or owner_user_id = public.current_app_user_id()
    or (owner_kind = 'role' and public.current_user_has_role(owner_role))
  )
  with check (
    public.current_user_has_role('admin')
    or owner_user_id = public.current_app_user_id()
    or (owner_kind = 'role' and public.current_user_has_role(owner_role))
  );
create policy tasks_delete_admin on public.tasks
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy task_log_select_visible_task on public.task_log
  for select to authenticated
  using (
    exists (
      select 1
      from public.tasks t
      where t.id = task_log.task_id
    )
  );
create policy task_log_insert_task_actor on public.task_log
  for insert to authenticated
  with check (
    public.current_user_has_role('admin')
    or actor_id = public.current_app_user_id()
  );
create policy appointment_artifacts_select_visible_root on public.appointment_artifacts
  for select to authenticated
  using (public.can_read_root(root_id));
create policy appointment_artifacts_insert_visible_owner on public.appointment_artifacts
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy appointment_artifacts_update_visible_owner on public.appointment_artifacts
  for update to authenticated
  using (public.can_write_root(root_id))
  with check (public.can_write_root(root_id));
create policy appointment_artifacts_delete_admin on public.appointment_artifacts
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy roster_schedule_select_authenticated on public.roster_schedule
  for select to authenticated
  using (true);
create policy roster_schedule_write_admin on public.roster_schedule
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy schedule_changes_select_self_or_admin on public.schedule_changes
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
  );
create policy schedule_changes_write_admin on public.schedule_changes
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy appointment_notices_select_target on public.appointment_notices
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or target_advisor_id = public.current_app_user_id()
    or target_joc_id = public.current_app_user_id()
  );
create policy appointment_notices_insert_admin on public.appointment_notices
  for insert to authenticated
  with check (public.current_user_has_role('admin'));
create policy appointment_notices_update_target on public.appointment_notices
  for update to authenticated
  using (
    public.current_user_has_role('admin')
    or target_advisor_id = public.current_app_user_id()
    or target_joc_id = public.current_app_user_id()
  )
  with check (
    public.current_user_has_role('admin')
    or target_advisor_id = public.current_app_user_id()
    or target_joc_id = public.current_app_user_id()
  );
create policy appointment_notices_delete_admin on public.appointment_notices
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy broadcasts_select_visible on public.broadcasts
  for select to authenticated
  using (public.can_read_broadcast(id));
create policy broadcasts_insert_sender_role on public.broadcasts
  for insert to authenticated
  with check (
    sent_by = public.current_app_user_id()
    and public.current_user_has_any_role(array['admin', 'diamond_order_admin']::public.user_role[])
  );
create policy broadcasts_update_sender_or_admin on public.broadcasts
  for update to authenticated
  using (
    public.current_user_has_role('admin')
    or sent_by = public.current_app_user_id()
  )
  with check (
    public.current_user_has_role('admin')
    or sent_by = public.current_app_user_id()
  );
create policy broadcasts_delete_admin on public.broadcasts
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy broadcast_targets_select_visible on public.broadcast_targets
  for select to authenticated
  using (public.can_read_broadcast(public.broadcast_targets.broadcast_id));
create policy broadcast_targets_insert_sender_role on public.broadcast_targets
  for insert to authenticated
  with check (
    public.current_user_has_any_role(array['admin', 'diamond_order_admin']::public.user_role[])
    and exists (
      select 1
      from public.broadcasts b
      where b.id = public.broadcast_targets.broadcast_id
        and (
          b.sent_by = public.current_app_user_id()
          or public.current_user_has_role('admin')
        )
    )
  );
create policy broadcast_targets_update_admin on public.broadcast_targets
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy broadcast_targets_delete_admin on public.broadcast_targets
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy broadcast_reads_select_own on public.broadcast_reads
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
  );
create policy broadcast_reads_insert_own on public.broadcast_reads
  for insert to authenticated
  with check (
    user_id = public.current_app_user_id()
    and public.can_read_broadcast(public.broadcast_reads.broadcast_id)
  );
create policy broadcast_reads_delete_own_or_admin on public.broadcast_reads
  for delete to authenticated
  using (
    user_id = public.current_app_user_id()
    or public.current_user_has_role('admin')
  );
create policy documents_select_visible_root on public.documents
  for select to authenticated
  using (public.can_read_root(root_id));
create policy documents_insert_visible_owner on public.documents
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy documents_update_visible_owner on public.documents
  for update to authenticated
  using (public.current_user_has_role('admin') or public.can_write_root(root_id))
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy documents_delete_admin on public.documents
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy doc_number_sequences_select_admin on public.doc_number_sequences
  for select to authenticated
  using (public.current_user_has_role('admin'));
create policy doc_number_sequences_write_admin on public.doc_number_sequences
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy payment_ledger_select_visible_document on public.payment_ledger
  for select to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = payment_ledger.document_id
        and public.can_read_root(d.root_id)
    )
  );
create policy payment_ledger_insert_visible_document on public.payment_ledger
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = payment_ledger.document_id
        and public.can_write_root(d.root_id)
    )
  );
create policy payment_ledger_update_visible_document on public.payment_ledger
  for update to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = payment_ledger.document_id
        and public.can_write_root(d.root_id)
    )
  )
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = payment_ledger.document_id
        and public.can_write_root(d.root_id)
    )
  );
create policy payment_ledger_delete_admin on public.payment_ledger
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy quotations_select_visible_document on public.quotations
  for select to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = quotations.document_id
        and public.can_read_root(d.root_id)
    )
  );
create policy quotations_insert_visible_document on public.quotations
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = quotations.document_id
        and public.can_write_root(d.root_id)
    )
  );
create policy quotations_update_visible_document on public.quotations
  for update to authenticated
  using (
    exists (
      select 1
      from public.documents d
      where d.id = quotations.document_id
        and public.can_write_root(d.root_id)
    )
  )
  with check (
    exists (
      select 1
      from public.documents d
      where d.id = quotations.document_id
        and public.can_write_root(d.root_id)
    )
  );
create policy quotations_delete_admin on public.quotations
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy storage_assets_select_visible on public.storage_assets
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or (root_id is not null and public.can_read_root(root_id))
    or exists (
      select 1
      from public.documents d
      where d.id = storage_assets.document_id
        and public.can_read_root(d.root_id)
    )
    or exists (
      select 1
      from public.appointment_artifacts aa
      where aa.id = storage_assets.artifact_id
        and public.can_read_root(aa.root_id)
    )
  );
create policy storage_assets_insert_visible on public.storage_assets
  for insert to authenticated
  with check (
    public.current_user_has_role('admin')
    or (root_id is not null and public.can_write_root(root_id))
    or exists (
      select 1
      from public.documents d
      where d.id = storage_assets.document_id
        and public.can_write_root(d.root_id)
    )
    or exists (
      select 1
      from public.appointment_artifacts aa
      where aa.id = storage_assets.artifact_id
        and public.can_write_root(aa.root_id)
    )
  );
create policy storage_assets_update_visible on public.storage_assets
  for update to authenticated
  using (
    public.current_user_has_role('admin')
    or (root_id is not null and public.can_write_root(root_id))
    or exists (
      select 1
      from public.documents d
      where d.id = storage_assets.document_id
        and public.can_write_root(d.root_id)
    )
    or exists (
      select 1
      from public.appointment_artifacts aa
      where aa.id = storage_assets.artifact_id
        and public.can_write_root(aa.root_id)
    )
  )
  with check (
    public.current_user_has_role('admin')
    or (root_id is not null and public.can_write_root(root_id))
    or exists (
      select 1
      from public.documents d
      where d.id = storage_assets.document_id
        and public.can_write_root(d.root_id)
    )
    or exists (
      select 1
      from public.appointment_artifacts aa
      where aa.id = storage_assets.artifact_id
        and public.can_write_root(aa.root_id)
    )
  );
create policy storage_assets_delete_admin on public.storage_assets
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy design_assets_select_visible_root on public.design_assets
  for select to authenticated
  using (public.can_read_root(root_id));
create policy design_assets_insert_visible_root on public.design_assets
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy design_assets_update_visible_root on public.design_assets
  for update to authenticated
  using (public.current_user_has_role('admin') or public.can_write_root(root_id))
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy design_assets_delete_admin on public.design_assets
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy design_decks_select_visible_root on public.design_decks
  for select to authenticated
  using (public.can_read_root(root_id));
create policy design_decks_insert_visible_root on public.design_decks
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy design_decks_update_visible_root on public.design_decks
  for update to authenticated
  using (public.current_user_has_role('admin') or public.can_write_root(root_id))
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy design_decks_delete_admin on public.design_decks
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy design_deck_slides_select_visible_deck on public.design_deck_slides
  for select to authenticated
  using (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_slides.deck_id
        and public.can_read_root(dd.root_id)
    )
  );
create policy design_deck_slides_insert_visible_deck on public.design_deck_slides
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_slides.deck_id
        and (public.current_user_has_role('admin') or public.can_write_root(dd.root_id))
    )
  );
create policy design_deck_slides_update_visible_deck on public.design_deck_slides
  for update to authenticated
  using (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_slides.deck_id
        and (public.current_user_has_role('admin') or public.can_write_root(dd.root_id))
    )
  )
  with check (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_slides.deck_id
        and (public.current_user_has_role('admin') or public.can_write_root(dd.root_id))
    )
  );
create policy design_deck_slides_delete_admin on public.design_deck_slides
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy design_deck_versions_select_visible_deck on public.design_deck_versions
  for select to authenticated
  using (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_versions.deck_id
        and public.can_read_root(dd.root_id)
    )
  );
create policy design_deck_versions_insert_visible_deck on public.design_deck_versions
  for insert to authenticated
  with check (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_versions.deck_id
        and (public.current_user_has_role('admin') or public.can_write_root(dd.root_id))
    )
  );
create policy design_deck_versions_update_visible_deck on public.design_deck_versions
  for update to authenticated
  using (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_versions.deck_id
        and (public.current_user_has_role('admin') or public.can_write_root(dd.root_id))
    )
  )
  with check (
    exists (
      select 1
      from public.design_decks dd
      where dd.id = design_deck_versions.deck_id
        and (public.current_user_has_role('admin') or public.can_write_root(dd.root_id))
    )
  );
create policy design_deck_versions_delete_admin on public.design_deck_versions
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy config_select_authenticated on public.config
  for select to authenticated
  using (true);
create policy config_write_admin on public.config
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy ops_log_select_admin on public.ops_log
  for select to authenticated
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy ops_log_insert_authenticated on public.ops_log
  for insert to authenticated
  with check (auth.role() = 'authenticated');
create policy intake_queue_admin on public.intake_queue
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy templates_select_authenticated on public.templates
  for select to authenticated
  using (true);
create policy templates_write_admin on public.templates
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy data_cleanup_cases_select_visible_root on public.data_cleanup_cases
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or public.can_read_root(root_id)
  );
create policy data_cleanup_cases_insert_visible_owner on public.data_cleanup_cases
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy data_cleanup_cases_update_visible_owner on public.data_cleanup_cases
  for update to authenticated
  using (public.current_user_has_role('admin') or public.can_write_root(root_id))
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy data_cleanup_cases_delete_admin on public.data_cleanup_cases
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy task_gen_queue_admin on public.task_gen_queue
  for all to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
