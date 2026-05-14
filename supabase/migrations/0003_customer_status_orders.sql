create table public.customer_info (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null unique references public.root_appointments(id) on delete restrict,
  customer_name text not null,
  first_name text,
  last_name text,
  email text,
  email_lower text generated always as (lower(email)) stored,
  phone text,
  phone_normalized text,
  address text,
  brand public.brand not null,
  client_advisor_id uuid references public.users(id),
  joc_id uuid references public.users(id),
  budget_range text,
  diamond_type text,
  style_notes text,
  reference_links text,
  marketing_source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create index idx_customer_info_email on public.customer_info(email_lower);
create index idx_customer_info_phone on public.customer_info(phone_normalized);
create index idx_customer_info_advisor on public.customer_info(client_advisor_id);
create index idx_customer_info_joc on public.customer_info(joc_id);
create table public.client_status (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null unique references public.root_appointments(id) on delete restrict,
  sales_stage text,
  conversion_status text,
  custom_order_status text,
  in_production_status text,
  center_stone_status text,
  next_steps text,
  order_date date,
  deadline_3d date,
  deadline_3d_move_count integer not null default 0,
  deadline_3d_updated_at timestamptz,
  deadline_3d_updated_by uuid references public.users(id),
  production_deadline date,
  production_deadline_move_count integer not null default 0,
  lost_lead_reason text,
  lost_lead_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create table public.client_status_history (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null references public.root_appointments(id) on delete restrict,
  changed_field text not null,
  previous_value text,
  new_value text,
  reason text,
  source text,
  task_id uuid,
  changed_at timestamptz not null default now(),
  changed_by uuid not null references public.users(id)
);
create index idx_client_status_history_root
  on public.client_status_history(root_id, changed_at desc);
create table public.order_3d (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null unique references public.root_appointments(id) on delete restrict,
  so_number text,
  brand public.brand not null,
  odoo_url text,
  short_tag text,
  design_request text,
  wax_needed text,
  no_3d_reason text,
  so_linked_at timestamptz,
  so_linked_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id),
  unique (brand, so_number)
);
create index idx_order_3d_so on public.order_3d(brand, so_number);
create table public.order_3d_revisions (
  id uuid primary key default gen_random_uuid(),
  revision_id text not null unique,
  root_id uuid not null references public.root_appointments(id) on delete restrict,
  order_3d_id uuid not null references public.order_3d(id) on delete restrict,
  revision_number integer not null,
  action text not null,
  mode text,
  accent_type text,
  ring_style text,
  metal text,
  us_size numeric(4,2),
  band_width_mm numeric(4,2),
  center_type text,
  shape text,
  diamond_dimension text,
  design_notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null references public.users(id),
  unique (order_3d_id, revision_number)
);
create index idx_order_3d_revisions_root
  on public.order_3d_revisions(root_id, revision_number desc);
create index idx_order_3d_revisions_order
  on public.order_3d_revisions(order_3d_id, revision_number desc);
