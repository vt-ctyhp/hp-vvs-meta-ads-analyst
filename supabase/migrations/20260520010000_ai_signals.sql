-- ai_signals: ranked decision items surfaced by the signal engine.
--
-- The signal engine recomputes this table every 15 minutes from existing
-- analyst primitives (creative score, fatigue detector, funnel analyzers,
-- attribution ledger, sync run state). UI reads the top items per room and
-- offers dismiss + telemetry actions; rows expire on their own or are soft-
-- dismissed by users.
--
-- This migration is additive and analyst-owned. Sales/ERP Core data is not
-- touched.

create table if not exists public.ai_signals (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  signal_type text not null,
  severity text not null check (severity in ('info', 'warn', 'critical')),
  room text not null check (room in ('optimize', 'convert', 'operate')),
  entity_type text not null,
  entity_id text,
  brand text,
  title text not null,
  summary text,
  score smallint not null default 0 check (score between 0 and 100),
  recommendation text,
  payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid,
  acted_at timestamptz,
  acted_by uuid,
  acted_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ai_signals is
  'Ranked decision items surfaced by the signal engine. One row per active signal per environment.';
comment on column public.ai_signals.signal_type is
  'Stable identifier such as scale_candidate, fatigue_kill, funnel_leak, unread_conversation, attribution_gap, capi_failure, sync_stall, backfill_stall, env_drift.';
comment on column public.ai_signals.room is
  'Which 3-room IA destination this signal renders inside: optimize, convert, or operate.';
comment on column public.ai_signals.entity_type is
  'Type of the entity this signal points at: ad, ad_set, campaign, group, creative, funnel_step, conversation, conversion, sync, backfill, env.';
comment on column public.ai_signals.score is
  'Sort key within a severity tier. Higher = more urgent. Bounded 0..100.';
comment on column public.ai_signals.payload is
  'Signal-specific structured data. Schema lives in src/lib/signal-engine.ts.';

-- Top-of-room queue lookup: environment + room + active + severity + score.
create index if not exists ai_signals_room_queue_idx
  on public.ai_signals (environment, room, dismissed_at, severity, score desc, created_at desc);

-- Entity drill lookups: jump from an ad/conversation/etc to its open signals.
create index if not exists ai_signals_entity_idx
  on public.ai_signals (entity_type, entity_id)
  where dismissed_at is null;

-- Expiry sweep.
create index if not exists ai_signals_expiry_idx
  on public.ai_signals (expires_at)
  where dismissed_at is null;

-- Uniqueness: at most one active signal per (env, type, entity) so the engine
-- can upsert idempotently without ballooning the queue.
create unique index if not exists ai_signals_active_uniq_idx
  on public.ai_signals (environment, signal_type, entity_type, coalesce(entity_id, ''))
  where dismissed_at is null;

-- Permissions: web role can read + soft-dismiss + ack; worker role computes
-- and refreshes the queue.
grant select, update on table public.ai_signals to ads_analyst_web;
grant select, insert, update, delete on table public.ai_signals to ads_analyst_worker;

-- Row-level security: env fence + write-source separation.
alter table public.ai_signals enable row level security;

drop policy if exists ads_analyst_select on public.ai_signals;
create policy ads_analyst_select
  on public.ai_signals
  for select
  to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_web_update on public.ai_signals;
create policy ads_analyst_web_update
  on public.ai_signals
  for update
  to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_insert on public.ai_signals;
create policy ads_analyst_worker_insert
  on public.ai_signals
  for insert
  to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_update on public.ai_signals;
create policy ads_analyst_worker_update
  on public.ai_signals
  for update
  to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

drop policy if exists ads_analyst_worker_delete on public.ai_signals;
create policy ads_analyst_worker_delete
  on public.ai_signals
  for delete
  to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));

-- Touch updated_at on row change.
create or replace function public.ai_signals_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists ai_signals_set_updated_at on public.ai_signals;
create trigger ai_signals_set_updated_at
  before update on public.ai_signals
  for each row
  execute function public.ai_signals_set_updated_at();
