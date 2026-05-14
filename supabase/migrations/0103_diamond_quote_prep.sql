create table public.diamond_quote_prep (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  scope_fingerprint text not null,
  line_item_key text not null,
  line_item_type text not null check (line_item_type in ('setting', 'stone')),
  line_item_ref_id uuid,
  line_item_label text not null,
  quoted_price numeric(12,2),
  competitor_entries jsonb not null default '[]'::jsonb,
  raw_median_price numeric(12,2),
  online_retailer_price numeric(12,2),
  savings numeric(12,2),
  notes text,
  prepared_at timestamptz,
  prepared_by uuid references public.users(id) on delete set null,
  line_item_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (root_id, scope_fingerprint, line_item_key)
);
create index idx_diamond_quote_prep_root
  on public.diamond_quote_prep(root_id);
create index idx_diamond_quote_prep_scope
  on public.diamond_quote_prep(root_id, scope_fingerprint);
create trigger trg_bump_diamond_quote_prep
  before update on public.diamond_quote_prep
  for each row execute function public.bump_updated_at_and_version();
create trigger trg_enqueue_task_gen_diamond_quote_prep
  after insert or update or delete on public.diamond_quote_prep
  for each row execute function public.enqueue_task_gen();
alter table public.diamond_quote_prep enable row level security;
create policy diamond_quote_prep_select_visible_root on public.diamond_quote_prep
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or public.can_read_root(root_id)
  );
create policy diamond_quote_prep_insert_visible_owner on public.diamond_quote_prep
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy diamond_quote_prep_update_visible_owner on public.diamond_quote_prep
  for update to authenticated
  using (public.current_user_has_role('admin') or public.can_write_root(root_id))
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy diamond_quote_prep_delete_admin on public.diamond_quote_prep
  for delete to authenticated
  using (public.current_user_has_role('admin'));
drop policy if exists tasks_update_owner_or_admin on public.tasks;
create policy tasks_update_owner_or_admin on public.tasks
  for update to authenticated
  using (
    public.current_user_has_role('admin')
    or owner_user_id = public.current_app_user_id()
    or (owner_kind = 'role' and public.current_user_has_role(owner_role))
    or (task_type = 'PREPARE_DV_QUOTATION' and root_id is not null and public.can_write_root(root_id))
  )
  with check (
    public.current_user_has_role('admin')
    or owner_user_id = public.current_app_user_id()
    or (owner_kind = 'role' and public.current_user_has_role(owner_role))
    or (task_type = 'PREPARE_DV_QUOTATION' and root_id is not null and public.can_write_root(root_id))
  );
alter publication supabase_realtime add table public.diamond_quote_prep;
