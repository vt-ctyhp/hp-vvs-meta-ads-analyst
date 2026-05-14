create or replace function public.can_read_root(p_root_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_has_any_role(array[
      'admin',
      'read_only'
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
create or replace function public.can_write_root(p_root_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_has_role('admin'::public.user_role)
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
create or replace function public.can_read_broadcast(p_broadcast_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_has_any_role(array['admin', 'read_only']::public.user_role[])
    or exists (
      select 1
      from public.broadcast_targets bt
      where bt.broadcast_id = p_broadcast_id
        and (
          bt.target_type = 'all'
          or (bt.target_type = 'person' and bt.target_user_id = public.current_app_user_id())
          or (
            bt.target_type = 'role'
            and public.current_user_has_role(bt.target_role)
          )
        )
    );
$$;
grant execute on function public.can_read_root(uuid) to authenticated;
grant execute on function public.can_write_root(uuid) to authenticated;
grant execute on function public.can_read_broadcast(uuid) to authenticated;
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  claims jsonb;
  roles jsonb;
begin
  select coalesce(jsonb_agg(ur.role::text order by ur.role::text), '[]'::jsonb)
  into roles
  from public.users u
  join public.user_roles ur on ur.user_id = u.id
  where u.auth_user_id = (event ->> 'user_id')::uuid
    and u.active = true;

  claims := coalesce(event -> 'claims', '{}'::jsonb);
  claims := jsonb_set(
    claims,
    '{app_metadata}',
    coalesce(claims -> 'app_metadata', '{}'::jsonb),
    true
  );
  claims := jsonb_set(claims, '{app_metadata,roles}', roles, true);

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
create view public.user_visible_broadcasts as
select distinct b.*, public.current_app_user_id() as viewer_user_id
from public.broadcasts b
join public.broadcast_targets bt on bt.broadcast_id = b.id
where (b.expires_at is null or b.expires_at > now())
  and (
    bt.target_type = 'all'
    or (
      bt.target_type = 'person'
      and bt.target_user_id = public.current_app_user_id()
    )
    or (
      bt.target_type = 'role'
      and public.current_user_has_role(bt.target_role)
    )
  );
create view public.user_inbox_unread_count as
select u.id as user_id,
  coalesce((
    select count(*)
    from public.appointment_notices an
    where (
      an.target_advisor_id = u.id
      and an.acknowledged_by_advisor_at is null
    )
    or (
      an.target_joc_id = u.id
      and an.acknowledged_by_joc_at is null
    )
  ), 0)
  +
  coalesce((
    select count(*)
    from public.user_visible_broadcasts vb
    where vb.viewer_user_id = u.id
      and not exists (
        select 1
        from public.broadcast_reads br
        where br.broadcast_id = vb.id
          and br.user_id = u.id
      )
  ), 0) as unread_count
from public.users u
where u.id = public.current_app_user_id();
