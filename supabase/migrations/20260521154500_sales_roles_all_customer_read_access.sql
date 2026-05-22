create or replace function public.can_read_root(p_root_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_has_any_role(array[
      'admin',
      'read_only',
      'client_advisor',
      'joc'
    ]::public.user_role[])
    or exists (
      select 1
      from public.customer_info ci
      where ci.root_id = p_root_id
        and (
          ci.client_advisor_id = public.current_app_user_id()
          or ci.joc_id = public.current_app_user_id()
        )
    );
$$;

grant execute on function public.can_read_root(uuid) to authenticated;

drop policy if exists users_select_self_or_admin on public.users;
drop policy if exists users_select_self_admin_or_sales_roster on public.users;
create policy users_select_self_admin_or_sales_roster on public.users
  for select to authenticated
  using (
    id = public.current_app_user_id()
    or public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or (
      active = true
      and public.current_user_has_any_role(array['client_advisor', 'joc']::public.user_role[])
    )
  );

drop policy if exists user_roles_select_self_or_admin on public.user_roles;
drop policy if exists user_roles_select_self_admin_or_sales_roster on public.user_roles;
create policy user_roles_select_self_admin_or_sales_roster on public.user_roles
  for select to authenticated
  using (
    user_id = public.current_app_user_id()
    or public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or (
      public.current_user_has_any_role(array['client_advisor', 'joc']::public.user_role[])
      and exists (
        select 1
        from public.users u
        where u.id = user_roles.user_id
          and u.active = true
      )
    )
  );
