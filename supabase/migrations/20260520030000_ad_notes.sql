-- ad_notes: free-text annotations operators leave on a specific Meta ad.
--
-- Replaces the locally-saved notes textarea that lived inside the creative
-- analysis drawer. Now persisted server-side, env-scoped, and analyst-owned.
--
-- One row per save; we keep history rather than overwriting so a teammate
-- can see how an ad's read changed over time. The latest note is what the
-- ad profile page surfaces by default.

create table if not exists public.ad_notes (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  meta_account_id text not null,
  ad_id text not null,
  body text not null check (length(trim(body)) > 0),
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now()
);

comment on table public.ad_notes is
  'Operator-authored free-text notes attached to a specific Meta ad. Kept as history; latest row wins for default surfacing.';
comment on column public.ad_notes.meta_account_id is
  'Meta ad account id (string, with or without act_ prefix).';
comment on column public.ad_notes.ad_id is
  'Meta ad id this note attaches to.';

create index if not exists ad_notes_ad_lookup_idx
  on public.ad_notes (environment, meta_account_id, ad_id, created_at desc);

create index if not exists ad_notes_author_idx
  on public.ad_notes (environment, created_by, created_at desc)
  where created_by is not null;

grant select, insert, update, delete on table public.ad_notes to ads_analyst_web;
grant select on table public.ad_notes to ads_analyst_worker;

alter table public.ad_notes enable row level security;

drop policy if exists ads_analyst_select on public.ad_notes;
create policy ads_analyst_select
  on public.ad_notes
  for select
  to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_insert on public.ad_notes;
create policy ads_analyst_web_insert
  on public.ad_notes
  for insert
  to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_update on public.ad_notes;
create policy ads_analyst_web_update
  on public.ad_notes
  for update
  to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_delete on public.ad_notes;
create policy ads_analyst_web_delete
  on public.ad_notes
  for delete
  to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));
