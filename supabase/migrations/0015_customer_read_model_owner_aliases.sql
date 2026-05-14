create table public.customer_read_model_owner_aliases (
  alias text not null,
  owner_role public.user_role not null,
  email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  primary key (alias, owner_role)
);
create trigger trg_bump_customer_read_model_owner_aliases
  before update on public.customer_read_model_owner_aliases
  for each row execute function public.bump_updated_at_and_version();
insert into public.customer_read_model_owner_aliases (alias, owner_role, email)
values
  ('Val', 'client_advisor', 'val@ctyhp.com'),
  ('An Vo', 'client_advisor', 'hoaan@ctyhp.com'),
  ('An Vo (HA)', 'client_advisor', 'hoaan@ctyhp.com'),
  ('Hoa An', 'client_advisor', 'hoaan@ctyhp.com'),
  ('Lyn', 'client_advisor', 'lyn@ctyhp.com'),
  ('Lyn Ngoc', 'client_advisor', 'lyn@ctyhp.com'),
  ('Wendy', 'client_advisor', 'phungminh@ctyhp.com'),
  ('Wendy (PM)', 'client_advisor', 'phungminh@ctyhp.com'),
  ('Kris', 'client_advisor', 'tuongvan@ctyhp.com'),
  ('Kris (TV)', 'client_advisor', 'tuongvan@ctyhp.com'),
  ('Paul', 'joc', 'os003@ctyhp.com'),
  ('Mark', 'joc', 'oc002@ctyhp.com'),
  ('Maria', 'joc', 'maria@ctyhp.com')
on conflict (alias, owner_role) do update
  set email = excluded.email;
alter table public.customer_read_model_owner_aliases enable row level security;
create policy customer_read_model_owner_aliases_select_admin
  on public.customer_read_model_owner_aliases
  for select
  using (public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[]));
create policy customer_read_model_owner_aliases_insert_admin
  on public.customer_read_model_owner_aliases
  for insert
  with check (public.current_user_has_role('admin'));
create policy customer_read_model_owner_aliases_update_admin
  on public.customer_read_model_owner_aliases
  for update
  using (public.current_user_has_role('admin'))
  with check (public.current_user_has_role('admin'));
create policy customer_read_model_owner_aliases_delete_admin
  on public.customer_read_model_owner_aliases
  for delete
  using (public.current_user_has_role('admin'));
create or replace function public.resolve_customer_read_model_owner(
  p_owner_names text,
  p_owner_email text,
  p_owner_role public.user_role
)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  with email_match as (
    select u.id
    from public.users u
    where nullif(p_owner_email, '') is not null
      and lower(u.email) = lower(p_owner_email)
    limit 1
  ),
  name_tokens as (
    select trim(token.alias) as alias, token.ordinality
    from regexp_split_to_table(coalesce(p_owner_names, ''), ',') with ordinality as token(alias, ordinality)
    where nullif(trim(token.alias), '') is not null
  ),
  alias_match as (
    select u.id
    from name_tokens n
    join public.customer_read_model_owner_aliases a
      on lower(a.alias) = lower(n.alias)
      and a.owner_role = p_owner_role
    join public.users u
      on lower(u.email) = lower(a.email)
    order by n.ordinality
    limit 1
  )
  select coalesce(
    (select id from email_match),
    (select id from alias_match)
  );
$$;
create or replace function public.preview_customer_read_model_owner_mapping(
  p_import_batch_id uuid default null
)
returns table(check_name text, issue_count bigint)
language sql
stable
security definer
set search_path = public
as $$
  with eligible as (
    select *
    from public.customer_read_model_import_staging s
    where (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
      and s.include_in_active_import = true
      and s.active = true
      and coalesce(lower(s.stage_key), '') not in ('won', 'lost')
  )
  select 'rows_with_client_advisor_source'::text, count(*)
  from eligible e
  where nullif(e.client_advisor_email, '') is not null
    or nullif(e.client_advisor, '') is not null
  union all
  select 'rows_without_client_advisor_mapping'::text, count(*)
  from eligible e
  where (nullif(e.client_advisor_email, '') is not null or nullif(e.client_advisor, '') is not null)
    and public.resolve_customer_read_model_owner(e.client_advisor, e.client_advisor_email, 'client_advisor') is null
  union all
  select 'rows_with_joc_source'::text, count(*)
  from eligible e
  where nullif(e.joc_email, '') is not null
    or nullif(e.joc, '') is not null
  union all
  select 'rows_without_joc_mapping'::text, count(*)
  from eligible e
  where (nullif(e.joc_email, '') is not null or nullif(e.joc, '') is not null)
    and public.resolve_customer_read_model_owner(e.joc, e.joc_email, 'joc') is null;
$$;
create or replace function public.repair_customer_read_model_owner_assignments(
  p_import_batch_id uuid default null
)
returns table(target_table text, rows_affected integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_customer_count integer := 0;
begin
  update public.customer_info ci
  set client_advisor_id = public.resolve_customer_read_model_owner(
        s.client_advisor,
        s.client_advisor_email,
        'client_advisor'
      ),
      joc_id = public.resolve_customer_read_model_owner(
        s.joc,
        s.joc_email,
        'joc'
      )
  from public.root_appointments r
  join public.customer_read_model_import_staging s
    on s.root_appt_id = r.root_appt_id
  where ci.root_id = r.id
    and (p_import_batch_id is null or s.import_batch_id = p_import_batch_id)
    and s.include_in_active_import = true
    and s.active = true
    and coalesce(lower(s.stage_key), '') not in ('won', 'lost')
    and (
      ci.client_advisor_id is distinct from public.resolve_customer_read_model_owner(
        s.client_advisor,
        s.client_advisor_email,
        'client_advisor'
      )
      or ci.joc_id is distinct from public.resolve_customer_read_model_owner(
        s.joc,
        s.joc_email,
        'joc'
      )
    );

  get diagnostics v_customer_count = row_count;

  return query values ('customer_info'::text, v_customer_count);
end;
$$;
