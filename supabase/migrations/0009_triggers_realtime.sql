do $$
declare
  t record;
begin
  for t in
    select table_schema, table_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name = 'version'
      and table_name in (
        select table_name
        from information_schema.columns
        where table_schema = 'public'
          and column_name = 'updated_at'
      )
  loop
    execute format('drop trigger if exists trg_bump_%I on %I.%I', t.table_name, t.table_schema, t.table_name);
    execute format(
      'create trigger trg_bump_%I before update on %I.%I for each row execute function public.bump_updated_at_and_version()',
      t.table_name,
      t.table_schema,
      t.table_name
    );
  end loop;
end $$;
create trigger trg_append_only_client_status_history
  before update or delete on public.client_status_history
  for each row execute function public.prevent_update_delete();
create trigger trg_append_only_order_3d_revisions
  before update or delete on public.order_3d_revisions
  for each row execute function public.prevent_update_delete();
create trigger trg_append_only_task_log
  before update or delete on public.task_log
  for each row execute function public.prevent_update_delete();
create trigger trg_append_only_stones_sync
  before update or delete on public.stones_sync
  for each row execute function public.prevent_update_delete();
create trigger trg_append_only_ops_log
  before update or delete on public.ops_log
  for each row execute function public.prevent_update_delete();
create or replace function public.enqueue_task_gen()
returns trigger
language plpgsql
as $$
declare
  r_id uuid;
begin
  if tg_table_name = 'stones' then
    if tg_op = 'DELETE' then
      r_id := old.assigned_root_id;
    elsif tg_op = 'UPDATE' then
      r_id := coalesce(new.assigned_root_id, old.assigned_root_id);
    else
      r_id := new.assigned_root_id;
    end if;
  elsif tg_op = 'DELETE' then
    r_id := old.root_id;
  else
    r_id := new.root_id;
  end if;

  if r_id is not null then
    insert into public.task_gen_queue (root_id, enqueued_at)
    values (r_id, now())
    on conflict (root_id) do update set enqueued_at = excluded.enqueued_at;
  end if;

  return null;
end;
$$;
create trigger trg_enqueue_task_gen_appt_events
  after insert or update or delete on public.appointment_events
  for each row execute function public.enqueue_task_gen();
create trigger trg_enqueue_task_gen_client_status
  after insert or update or delete on public.client_status
  for each row execute function public.enqueue_task_gen();
create trigger trg_enqueue_task_gen_order_3d
  after insert or update or delete on public.order_3d
  for each row execute function public.enqueue_task_gen();
create trigger trg_enqueue_task_gen_wax_requests
  after insert or update or delete on public.wax_requests
  for each row execute function public.enqueue_task_gen();
create trigger trg_enqueue_task_gen_stones
  after insert or update of assigned_root_id, order_status, stone_status, return_due_date, tracking_eta
  on public.stones
  for each row
  execute function public.enqueue_task_gen();
create trigger trg_enqueue_task_gen_artifacts
  after insert or update or delete on public.appointment_artifacts
  for each row execute function public.enqueue_task_gen();
alter publication supabase_realtime add table public.tasks;
alter publication supabase_realtime add table public.appointment_notices;
alter publication supabase_realtime add table public.broadcasts;
alter publication supabase_realtime add table public.client_status;
alter publication supabase_realtime add table public.order_3d;
alter publication supabase_realtime add table public.order_3d_revisions;
alter publication supabase_realtime add table public.wax_requests;
alter publication supabase_realtime add table public.stones;
alter publication supabase_realtime add table public.customer_info;
alter publication supabase_realtime add table public.appointment_events;
alter publication supabase_realtime add table public.appointment_artifacts;
alter publication supabase_realtime add table public.storage_assets;
alter publication supabase_realtime add table public.documents;
alter publication supabase_realtime add table public.payment_ledger;
alter publication supabase_realtime add table public.quotations;
alter publication supabase_realtime add table public.design_assets;
alter publication supabase_realtime add table public.design_decks;
alter publication supabase_realtime add table public.design_deck_slides;
alter publication supabase_realtime add table public.design_deck_versions;
