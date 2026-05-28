-- Migration: enable_pg_cron
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- pg_cron (default_version 1.6.4, available on this project) drives the
-- daily metrics rollup. Scheduling itself lives in Task 25's migration.
create extension if not exists pg_cron with schema extensions;

