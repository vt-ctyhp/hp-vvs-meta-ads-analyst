-- Migration: prune_meta_webhook_events_cron
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- The meta_webhook_events audit log is append-only and grows with every Meta
-- delivery. Keep a rolling 90-day window: enough to debug a missed attribution
-- weeks after the fact, bounded so the table stays small. Retention is applied
-- across all environments (it is an operational log, not analyst data).

create or replace function public.prune_meta_webhook_events()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_deleted integer;
begin
  delete from public.meta_webhook_events
   where received_at < now() - interval '90 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.prune_meta_webhook_events()
  to ads_analyst_worker, ads_analyst_ingest;

-- Daily at 03:40 UTC (quiet window). unschedule first for idempotency on re-run.
select cron.unschedule('prune-meta-webhook-events')
 where exists (select 1 from cron.job where jobname = 'prune-meta-webhook-events');

select cron.schedule(
  'prune-meta-webhook-events',
  '40 3 * * *',
  $cron$ select public.prune_meta_webhook_events(); $cron$
);

