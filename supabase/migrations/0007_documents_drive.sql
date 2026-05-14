create type public.doc_family as enum (
  'deposit_invoice',
  'deposit_receipt',
  'sales_invoice',
  'sales_receipt',
  'quotation'
);
create type public.doc_status as enum (
  'active',
  'voided',
  'superseded',
  'draft'
);
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  document_id text not null unique,
  root_id uuid not null references public.root_appointments(id) on delete restrict,
  appt_id uuid references public.appointment_events(id) on delete set null,
  brand public.brand not null,
  doc_family public.doc_family not null,
  doc_number text not null,
  tax_enabled boolean not null,
  issued_at timestamptz not null default now(),
  issued_by uuid not null references public.users(id),
  pdf_storage_asset_id uuid,
  pdf_storage_bucket text,
  pdf_storage_path text,
  status public.doc_status not null default 'active',
  voided_at timestamptz,
  voided_by uuid references public.users(id),
  void_reason text,
  superseded_by uuid references public.documents(id),
  supersedes uuid references public.documents(id),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (brand, doc_number)
);
create index idx_documents_root on public.documents(root_id);
create index idx_documents_brand_family on public.documents(brand, doc_family);
create index idx_documents_status on public.documents(status);
create index idx_documents_issued on public.documents(issued_at desc);
create table public.doc_number_sequences (
  brand public.brand not null,
  doc_family public.doc_family not null,
  next_value integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key (brand, doc_family)
);
create table public.payment_ledger (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete restrict,
  so text,
  subtotal numeric(12,2) not null,
  referral_discount numeric(12,2) not null default 0,
  tax_rate numeric(5,4) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  invoice_total numeric(12,2) not null,
  amount_received numeric(12,2),
  fees numeric(12,2) not null default 0,
  net_amount numeric(12,2),
  balance_due numeric(12,2),
  method text,
  reference text,
  line_items jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index idx_payment_ledger_document on public.payment_ledger(document_id);
create table public.quotations (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete restrict,
  so text,
  settings_snapshot jsonb not null,
  stones_snapshot jsonb not null,
  subtotal_settings numeric(12,2),
  subtotal_diamonds numeric(12,2),
  total numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1
);
create index idx_quotations_document on public.quotations(document_id);
create type public.storage_asset_purpose as enum (
  'intake_attachment',
  'appointment_recording',
  'diamond_viewing_recording',
  'transcript_text',
  'summary_text',
  'invoice_pdf',
  'receipt_pdf',
  'quotation_pdf',
  'design_render_image',
  'design_deck_pdf',
  'design_deck_pptx',
  'loupe360_upload'
);
create table public.storage_assets (
  id uuid primary key default gen_random_uuid(),
  bucket text not null,
  path text not null,
  purpose public.storage_asset_purpose not null,
  root_id uuid references public.root_appointments(id) on delete set null,
  appt_id uuid references public.appointment_events(id) on delete set null,
  document_id uuid references public.documents(id) on delete set null,
  artifact_id uuid references public.appointment_artifacts(id) on delete set null,
  original_filename text,
  canonical_filename text,
  mime_type text,
  size_bytes bigint,
  checksum_sha256 text,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id),
  unique (bucket, path)
);
create index idx_storage_assets_root on public.storage_assets(root_id);
create index idx_storage_assets_appt on public.storage_assets(appt_id);
create index idx_storage_assets_document on public.storage_assets(document_id);
create index idx_storage_assets_purpose on public.storage_assets(purpose);
alter table public.documents
  add constraint documents_pdf_storage_asset_fkey
  foreign key (pdf_storage_asset_id) references public.storage_assets(id) on delete set null;
alter table public.appointment_artifacts
  add constraint appointment_artifacts_storage_asset_fkey
  foreign key (storage_asset_id) references public.storage_assets(id) on delete set null,
  add constraint appointment_artifacts_transcript_storage_asset_fkey
  foreign key (transcript_storage_asset_id) references public.storage_assets(id) on delete set null,
  add constraint appointment_artifacts_summary_storage_asset_fkey
  foreign key (summary_storage_asset_id) references public.storage_assets(id) on delete set null;
alter table public.stones_sync
  add constraint stones_sync_source_storage_asset_fkey
  foreign key (source_storage_asset_id) references public.storage_assets(id) on delete set null;
create type public.design_deck_status as enum (
  'draft',
  'published',
  'archived'
);
create type public.design_slide_layout as enum (
  'cover',
  'single_image',
  'compare_2up'
);
create table public.design_assets (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  storage_asset_id uuid not null unique references public.storage_assets(id) on delete restrict,
  width_px integer,
  height_px integer,
  aspect_ratio numeric(8,4),
  blur_score numeric(10,4),
  perceptual_hash text,
  duplicate_of uuid references public.design_assets(id),
  quality_flags jsonb not null default '[]'::jsonb,
  suggested_position integer,
  included_by_default boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references public.users(id)
);
create index idx_design_assets_root on public.design_assets(root_id);
create index idx_design_assets_hash on public.design_assets(perceptual_hash);
create table public.design_decks (
  id uuid primary key default gen_random_uuid(),
  root_id uuid not null references public.root_appointments(id) on delete cascade,
  title text not null,
  status public.design_deck_status not null default 'draft',
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1,
  created_by uuid references public.users(id),
  updated_by uuid references public.users(id)
);
create index idx_design_decks_root on public.design_decks(root_id);
create table public.design_deck_slides (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.design_decks(id) on delete cascade,
  position integer not null,
  layout public.design_slide_layout not null,
  primary_design_asset_id uuid references public.design_assets(id) on delete restrict,
  secondary_design_asset_id uuid references public.design_assets(id) on delete restrict,
  caption text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deck_id, position)
);
create table public.design_deck_versions (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.design_decks(id) on delete cascade,
  version_number integer not null,
  slide_snapshot jsonb not null,
  share_token_hash text,
  published_at timestamptz,
  published_by uuid references public.users(id),
  revoked_at timestamptz,
  pdf_storage_asset_id uuid references public.storage_assets(id) on delete set null,
  pptx_storage_asset_id uuid references public.storage_assets(id) on delete set null,
  unique (deck_id, version_number)
);
alter table public.design_decks
  add constraint design_decks_current_version_fkey
  foreign key (current_version_id) references public.design_deck_versions(id);
create or replace function public.next_doc_number(
  p_brand public.brand,
  p_doc_family public.doc_family
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
  v_prefix text;
begin
  update public.doc_number_sequences
    set next_value = next_value + 1,
        updated_at = now()
    where brand = p_brand
      and doc_family = p_doc_family
    returning next_value - 1 into v_next;

  if v_next is null then
    raise exception 'missing doc_number_sequences row for %.%', p_brand, p_doc_family;
  end if;

  v_prefix := upper(p_brand::text) || '-' ||
    case p_doc_family
      when 'deposit_invoice' then 'DI'
      when 'deposit_receipt' then 'DR'
      when 'sales_invoice' then 'SI'
      when 'sales_receipt' then 'SR'
      when 'quotation' then 'QT'
    end;

  return v_prefix || '-' || lpad(v_next::text, 6, '0');
end;
$$;
grant execute on function public.next_doc_number(public.brand, public.doc_family) to authenticated;
