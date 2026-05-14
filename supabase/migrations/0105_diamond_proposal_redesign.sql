create table public.diamond_proposal_drafts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null unique references public.tasks(id) on delete cascade,
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  current_step integer not null default 1 check (current_step between 1 and 3),
  target_count integer not null default 3 check (target_count > 0),
  requirements jsonb not null default '{}'::jsonb,
  selected_inventory_stones jsonb not null default '[]'::jsonb,
  manual_stones jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create index idx_diamond_proposal_drafts_root
  on public.diamond_proposal_drafts(root_id);
create table public.diamond_viewing_requirement_events (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete set null,
  source text not null check (source in ('booking', 'proposal_draft', 'proposal_submit', 'manual')),
  requirements_snapshot jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now(),
  captured_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index idx_diamond_viewing_requirement_events_root
  on public.diamond_viewing_requirement_events(root_id, captured_at desc);
create trigger trg_bump_diamond_proposal_drafts
  before update on public.diamond_proposal_drafts
  for each row execute function public.bump_updated_at_and_version();
create trigger trg_enqueue_task_gen_diamond_proposal_drafts
  after insert or update or delete on public.diamond_proposal_drafts
  for each row execute function public.enqueue_task_gen();
alter table public.diamond_proposal_drafts enable row level security;
alter table public.diamond_viewing_requirement_events enable row level security;
create policy diamond_proposal_drafts_select_visible_root on public.diamond_proposal_drafts
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or public.can_read_root(root_id)
  );
create policy diamond_proposal_drafts_insert_visible_owner on public.diamond_proposal_drafts
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy diamond_proposal_drafts_update_visible_owner on public.diamond_proposal_drafts
  for update to authenticated
  using (public.current_user_has_role('admin') or public.can_write_root(root_id))
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy diamond_proposal_drafts_delete_admin on public.diamond_proposal_drafts
  for delete to authenticated
  using (public.current_user_has_role('admin'));
create policy diamond_viewing_requirement_events_select_visible_root on public.diamond_viewing_requirement_events
  for select to authenticated
  using (
    public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or public.can_read_root(root_id)
  );
create policy diamond_viewing_requirement_events_insert_visible_owner on public.diamond_viewing_requirement_events
  for insert to authenticated
  with check (public.current_user_has_role('admin') or public.can_write_root(root_id));
create policy diamond_viewing_requirement_events_update_admin on public.diamond_viewing_requirement_events
  for update to authenticated
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy diamond_viewing_requirement_events_delete_admin on public.diamond_viewing_requirement_events
  for delete to authenticated
  using (public.current_user_has_role('admin'));
alter publication supabase_realtime add table public.diamond_proposal_drafts;
alter publication supabase_realtime add table public.diamond_viewing_requirement_events;
