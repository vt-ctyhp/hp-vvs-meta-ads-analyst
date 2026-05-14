create extension if not exists pgcrypto;
create type public.user_role as enum (
  'admin',
  'client_advisor',
  'joc',
  'diamond_order_admin',
  'diamond_order_assistant',
  'read_only'
);
create type public.brand as enum ('hpusa', 'vvs');
create table public.users (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null unique,
  full_name text not null,
  initials text generated always as (
    upper(substring(coalesce(split_part(full_name, ' ', 1), '') from 1 for 1)) ||
    upper(substring(coalesce(split_part(full_name, ' ', 2), '') from 1 for 1))
  ) stored,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create table public.user_roles (
  user_id uuid not null references public.users(id) on delete cascade,
  role public.user_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.users(id),
  primary key (user_id, role)
);
create or replace function public.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id
  from public.users u
  where u.auth_user_id = auth.uid()
    and u.active = true
  limit 1;
$$;
create or replace function public.current_user_has_role(p_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    coalesce(auth.jwt() -> 'app_metadata' -> 'roles' ? p_role::text, false)
    or exists (
      select 1
      from public.user_roles ur
      join public.users u on u.id = ur.user_id
      where u.auth_user_id = auth.uid()
        and u.active = true
        and ur.role = p_role
    );
$$;
create or replace function public.current_user_has_any_role(p_roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from unnest(p_roles) as r(role)
    where public.current_user_has_role(r.role)
  );
$$;
create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.current_user_has_role('admin'::public.user_role);
$$;
create or replace function public.bump_updated_at_and_version()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  new.version = old.version + 1;
  return new;
end;
$$;
create or replace function public.prevent_update_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception 'append-only table %.% cannot be updated or deleted', tg_table_schema, tg_table_name;
end;
$$;
grant execute on function public.current_app_user_id() to authenticated;
grant execute on function public.current_user_has_role(public.user_role) to authenticated;
grant execute on function public.current_user_has_any_role(public.user_role[]) to authenticated;
grant execute on function public.current_user_is_admin() to authenticated;
