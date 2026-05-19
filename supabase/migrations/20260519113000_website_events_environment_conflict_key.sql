alter table public.website_events
  add column if not exists environment text not null default 'production';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.website_events'::regclass
      and conname = 'website_events_environment_event_key'
  ) then
    alter table public.website_events
      add constraint website_events_environment_event_key unique (environment, event_id);
  end if;
end $$;
