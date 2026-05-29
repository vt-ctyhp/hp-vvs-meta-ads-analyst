-- supabase/migrations/20260528150430_remove_inbox_auto_assign_db_cron.sql
-- Migration: remove the DB pg_cron auto-assign job (seconds=30, Meta-Ads repo)
--
-- Superseded by a Vercel Cron at /api/cron/inbox-auto-assign (*/5), which
-- auto-authenticates with the project CRON_SECRET. The DB job (from
-- 20260528150330) needed app.base_url/app.cron_secret GUCs that can't be set
-- with the available privileges, so it just failed every run. Remove it.

select cron.unschedule('inbox-auto-assign')
 where exists (select 1 from cron.job where jobname = 'inbox-auto-assign');

drop function if exists public.run_inbox_auto_assign_dispatch();
