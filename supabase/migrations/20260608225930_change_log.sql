-- Migration: change_log
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

create table if not exists public.change_log_entries (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  brand_code text not null check (brand_code in ('HP', 'VVS')),
  meta_account_id text,
  event_date date not null,
  effective_start date,
  effective_end date,
  change_type text not null check (change_type in
    ('budget','status','audience','creative','promotion','price','website','other')),
  title text not null check (length(trim(title)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  before_value text,
  after_value text,
  raw_input text,
  verify_entity text not null default 'none'
    check (verify_entity in ('matched','ambiguous','none')),
  verify_value text not null default 'na'
    check (verify_value in ('confirmed','mismatch','na')),
  status text not null default 'active' check (status in ('active','deleted')),
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_email text
);

create index if not exists change_log_entries_brand_date_idx
  on public.change_log_entries (environment, brand_code, event_date desc);
create index if not exists change_log_entries_type_date_idx
  on public.change_log_entries (environment, change_type, event_date desc);
create index if not exists change_log_entries_active_idx
  on public.change_log_entries (environment, event_date desc) where status = 'active';

create table if not exists public.change_log_entry_entities (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.change_log_entries(id) on delete cascade,
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  entity_kind text not null
    check (entity_kind in ('ad_set','campaign','creative','account','website')),
  entity_meta_id text,
  entity_name text not null,
  match_status text not null default 'unmatched'
    check (match_status in ('matched','ambiguous','unmatched')),
  created_at timestamptz not null default now()
);
create index if not exists change_log_entry_entities_entry_idx
  on public.change_log_entry_entities (entry_id);
create index if not exists change_log_entry_entities_meta_idx
  on public.change_log_entry_entities (environment, entity_meta_id)
  where entity_meta_id is not null;

create table if not exists public.change_log_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.change_log_entries(id) on delete cascade,
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  action text not null check (action in ('create','edit','delete','restore')),
  snapshot jsonb not null,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists change_log_entry_revisions_entry_idx
  on public.change_log_entry_revisions (environment, entry_id, created_at desc);

create table if not exists public.change_log_citations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.change_log_entries(id) on delete cascade,
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  analysis_run_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists change_log_citations_entry_idx
  on public.change_log_citations (environment, entry_id);

create or replace function public.change_log_entries_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create or replace trigger change_log_entries_set_updated_at
  before update on public.change_log_entries
  for each row execute function public.change_log_entries_set_updated_at();

-- Deletes are soft (status = 'deleted'); no hard delete grant is intentional.
grant select on table
  public.change_log_entries, public.change_log_entry_entities,
  public.change_log_entry_revisions, public.change_log_citations
  to ads_analyst_web, ads_analyst_worker;
grant insert, update on table
  public.change_log_entries, public.change_log_entry_entities,
  public.change_log_entry_revisions, public.change_log_citations
  to ads_analyst_web;

alter table public.change_log_entries enable row level security;
alter table public.change_log_entry_entities enable row level security;
alter table public.change_log_entry_revisions enable row level security;
alter table public.change_log_citations enable row level security;

drop policy if exists change_log_entries_select on public.change_log_entries;
create policy change_log_entries_select on public.change_log_entries
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
drop policy if exists change_log_entries_insert on public.change_log_entries;
create policy change_log_entries_insert on public.change_log_entries
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
drop policy if exists change_log_entries_update on public.change_log_entries;
create policy change_log_entries_update on public.change_log_entries
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists change_log_entry_entities_select on public.change_log_entry_entities;
create policy change_log_entry_entities_select on public.change_log_entry_entities
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
drop policy if exists change_log_entry_entities_insert on public.change_log_entry_entities;
create policy change_log_entry_entities_insert on public.change_log_entry_entities
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
drop policy if exists change_log_entry_entities_update on public.change_log_entry_entities;
create policy change_log_entry_entities_update on public.change_log_entry_entities
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists change_log_entry_revisions_select on public.change_log_entry_revisions;
create policy change_log_entry_revisions_select on public.change_log_entry_revisions
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
drop policy if exists change_log_entry_revisions_insert on public.change_log_entry_revisions;
create policy change_log_entry_revisions_insert on public.change_log_entry_revisions
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists change_log_citations_select on public.change_log_citations;
create policy change_log_citations_select on public.change_log_citations
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
drop policy if exists change_log_citations_insert on public.change_log_citations;
create policy change_log_citations_insert on public.change_log_citations
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.change_log_entries is 'Human-authored, AI-readable log of ad-account actions and business context.';
comment on table public.change_log_entry_entities is 'Meta objects (ad sets, campaigns, creatives, accounts, sites) a change-log entry affects.';
comment on table public.change_log_entry_revisions is 'Append-only audit trail of change-log entry create/edit/delete/restore.';
comment on table public.change_log_citations is 'Records when an AI analysis run cited a change-log entry.';
