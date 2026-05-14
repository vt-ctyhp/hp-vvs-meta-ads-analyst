do $$
declare
  table_name text;
  tables_to_publish text[] := array[
    'broadcast_reads',
    'broadcast_targets',
    'client_status_history',
    'diamond_viewing',
    'root_appointments',
    'task_log'
  ];
begin
  foreach table_name in array tables_to_publish loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    ) then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
end $$;
