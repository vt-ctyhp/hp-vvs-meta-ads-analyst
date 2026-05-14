create table public.diamond_viewing (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null unique references public.root_appointments(id) on delete restrict,
  summary text,
  stone_type text,
  shape text,
  carat_min numeric(6,3),
  carat_max numeric(6,3),
  color_min text,
  color_max text,
  clarity_min text,
  clarity_max text,
  ratio_preference text,
  budget_note text,
  primary_decision_factor text,
  variety_focus text[],
  notes text,
  workflow_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create type public.stone_order_status as enum (
  'proposing',
  'on_the_way',
  'delivered',
  'not_approved',
  'returned',
  'sold'
);
create type public.stone_status as enum (
  'in_stock',
  'out',
  'returned',
  'sold',
  'on_hold'
);
create table public.stones (
  id uuid primary key default gen_random_uuid(),
  cert_no text not null unique,
  vendor text,
  lab text,
  stone_type text,
  shape text,
  carat numeric(6,3),
  color text,
  clarity text,
  cut text,
  polish text,
  symmetry text,
  fluor_intensity text,
  fluor_color text,
  measurements text,
  ratio numeric(6,3),
  cost_per_carat numeric(12,2),
  total_cost numeric(12,2),
  customer_price_per_carat numeric(12,2),
  customer_total_price numeric(12,2),
  order_status public.stone_order_status,
  stone_status public.stone_status,
  decision text,
  hold boolean not null default false,
  ordered_by uuid references public.users(id),
  purchased_ordered_date date,
  memo_invoice_date date,
  return_due_date date,
  return_notes text,
  tracking_eta date,
  tracking_status text,
  carrier text,
  tracking_number text,
  tracking_url text,
  tracking_notes text,
  last_tracking_check_at timestamptz,
  assigned_root_id uuid references public.root_appointments(id) on delete set null,
  assigned_customer_name text,
  assigned_advisor_id uuid references public.users(id),
  assigned_joc_id uuid references public.users(id),
  assigned_at timestamptz,
  assigned_by uuid references public.users(id),
  joc_handoff_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create index idx_stones_cert on public.stones(cert_no);
create index idx_stones_assigned_root on public.stones(assigned_root_id);
create index idx_stones_order_status on public.stones(order_status);
create index idx_stones_stone_status on public.stones(stone_status);
create index idx_stones_return_due on public.stones(return_due_date)
  where order_status = 'delivered';
create table public.stones_sync (
  id uuid primary key default gen_random_uuid(),
  sync_id text not null unique,
  source_storage_asset_id uuid,
  source_filename text,
  applied_at timestamptz not null default now(),
  applied_by uuid not null references public.users(id),
  source_rows integer not null,
  matched integer not null,
  updated integer not null,
  appended integer not null,
  skipped integer not null,
  conflicts integer not null,
  notes text,
  detail jsonb
);
create table public.wax_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  root_id uuid not null references public.root_appointments(id) on delete restrict,
  so_mo text,
  needed_by_rep date,
  priority text not null,
  notes text,
  status text not null,
  admin_deadline date,
  est_print_date date,
  completed_date date,
  status_notes text,
  request_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create index idx_wax_requests_root on public.wax_requests(root_id);
create index idx_wax_requests_status on public.wax_requests(status);
