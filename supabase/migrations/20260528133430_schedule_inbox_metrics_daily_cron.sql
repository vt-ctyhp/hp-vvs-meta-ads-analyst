-- Migration: schedule_inbox_metrics_daily_cron
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- Dispatcher: for each distinct effective timezone, if local time is within
-- the first 30 minutes of the day, roll up the prior local day. Iterating
-- tzs means new timezones (added via preferences) are handled automatically.
create or replace function public.run_inbox_metrics_daily_dispatch()
returns void
language plpgsql
security definer
set search_path = public, analytics, extensions
as $$
declare
  v_env text := analytics.current_ads_analyst_environment();
  v_tz  text;
  v_local_now timestamp;
begin
  for v_tz in
    select distinct timezone
      from public.meta_inbox_user_preferences
     where environment = v_env
    union
    select 'America/Los_Angeles'
  loop
    v_local_now := now() at time zone v_tz;
    if v_local_now::time < time '00:30' then
      perform public.compute_inbox_metrics_daily_for_tz(
        v_tz,
        (v_local_now::date) - 1
      );
    end if;
  end loop;
end;
$$;

grant execute on function public.run_inbox_metrics_daily_dispatch()
  to ads_analyst_worker, ads_analyst_ingest;

-- Schedule every 15 minutes. unschedule first for idempotency on re-run.
select cron.unschedule('inbox-metrics-daily')
 where exists (select 1 from cron.job where jobname = 'inbox-metrics-daily');

select cron.schedule(
  'inbox-metrics-daily',
  '*/15 * * * *',
  $cron$ select public.run_inbox_metrics_daily_dispatch(); $cron$
);

