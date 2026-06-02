-- Migration: meta_webhook_event_log
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Append-only audit log of every Meta webhook delivery we receive. Meta only
-- delivers click-to-Messenger ad attribution (the `referral` object) once, on the
-- realtime webhook -- it is NOT re-fetchable via the Graph Conversations API. When
-- a delivery is missed or fails, we currently have no record of what Meta sent, so
-- we cannot tell "Meta never sent it" from "we dropped it". This table captures the
-- raw payload at the edge so missed/failed attributions are auditable and replayable.

create table if not exists public.meta_webhook_events (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  received_at timestamptz not null default now(),
  object text,
  signature_valid boolean not null default false,
  entry_count integer not null default 0,
  referral_count integer not null default 0,
  message_count integer,
  comment_count integer,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  created_at timestamptz not null default now()
);

-- Recent-first scans (most queries look at the latest deliveries).
create index if not exists meta_webhook_events_received_at_idx
  on public.meta_webhook_events (received_at desc);

-- Fast lookup of deliveries that carried ad attribution.
create index if not exists meta_webhook_events_referral_idx
  on public.meta_webhook_events (received_at desc)
  where referral_count > 0;

alter table public.meta_webhook_events enable row level security;

-- Ingest writes; web/worker/ingest may read for audits and a future admin view.
-- Service role bypasses RLS; these grants cover the scoped ads_analyst_* roles.
grant select on table public.meta_webhook_events
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;
grant insert on table public.meta_webhook_events
  to ads_analyst_worker, ads_analyst_ingest;

create policy ads_analyst_select on public.meta_webhook_events
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_ingest_insert on public.meta_webhook_events
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));

create policy ads_analyst_worker_insert on public.meta_webhook_events
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));

