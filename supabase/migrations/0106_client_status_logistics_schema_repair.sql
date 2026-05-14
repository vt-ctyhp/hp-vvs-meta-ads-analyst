alter table public.client_status
  add column if not exists logistics_status text;
alter table public.customer_read_model_import_staging
  add column if not exists logistics_status text;
alter table public.appointment_read_model_import_staging
  add column if not exists logistics_status text;
notify pgrst, 'reload schema';
