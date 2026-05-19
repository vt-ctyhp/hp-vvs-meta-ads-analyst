alter table public.website_sessions
  add column if not exists environment text not null default 'production';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.website_sessions'::regclass
      and conname = 'website_sessions_environment_session_key'
  ) then
    alter table public.website_sessions
      add constraint website_sessions_environment_session_key unique (environment, session_id);
  end if;
end $$;
