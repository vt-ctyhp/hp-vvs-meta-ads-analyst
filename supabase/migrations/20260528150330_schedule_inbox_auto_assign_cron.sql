-- supabase/migrations/20260528150330_schedule_inbox_auto_assign_cron.sql
-- Migration: schedule_inbox_auto_assign_cron
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Mirrors the dispatch wrapper pattern from schedule_inbox_metrics_daily_cron,
-- but dispatches via net.http_post to the Next.js sweep route instead of calling
-- SQL functions directly. Base URL and cron secret are read from GUCs
-- app.base_url and app.cron_secret (set via Supabase dashboard → Database →
-- Configuration → PostgreSQL parameters).

create or replace function public.run_inbox_auto_assign_dispatch()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_base_url   text := current_setting('app.base_url', true);
  v_cron_secret text := current_setting('app.cron_secret', true);
begin
  perform net.http_post(
    url     := v_base_url || '/api/cron/inbox-auto-assign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_cron_secret
    ),
    body    := '{}'::jsonb
  );
end;
$$;

grant execute on function public.run_inbox_auto_assign_dispatch()
  to ads_analyst_worker, ads_analyst_ingest;

-- Schedule every 5 minutes. Unschedule first for idempotency on re-run.
select cron.unschedule('inbox-auto-assign')
 where exists (select 1 from cron.job where jobname = 'inbox-auto-assign');

select cron.schedule(
  'inbox-auto-assign',
  '*/5 * * * *',
  $cron$ select public.run_inbox_auto_assign_dispatch(); $cron$
);
