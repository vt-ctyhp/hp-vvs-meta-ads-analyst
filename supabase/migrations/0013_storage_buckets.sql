insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('design-renders', 'design-renders', false),
  ('artifacts', 'artifacts', false),
  ('imports', 'imports', false)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public;
