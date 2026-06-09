-- Migration: change_log_rpc_revoke_public
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Security fix for 20260609020130_change_log_create_rpc.sql.
--
-- public.create_change_log_entry is SECURITY DEFINER (runs as owner, bypasses RLS)
-- and performs writes. The original migration granted EXECUTE to ads_analyst_web but
-- never revoked Postgres's default PUBLIC EXECUTE, so anon/authenticated (reachable
-- with the client-side publishable key) could call it and inject change-log rows into
-- production. Lock it down to ads_analyst_web only, matching the pattern used by the
-- analytics.* functions in 20260520000100_ads_analyst_environment_scope.sql.
--
-- The application reaches this function via the service-role or ads_analyst_web client,
-- neither of which is affected (service_role and ads_analyst_web keep EXECUTE below),
-- so this is a no-op for legitimate callers.
--
-- Supabase grants EXECUTE on public routines to anon/authenticated EXPLICITLY (not just
-- via PUBLIC), so all three must be revoked by name to actually close the hole.

revoke all on function public.create_change_log_entry(
  text, text, date, date, date, text, text, text, text, text, text, text, text,
  uuid, text, jsonb, uuid, text, jsonb
) from public, anon, authenticated;

grant execute on function public.create_change_log_entry(
  text, text, date, date, date, text, text, text, text, text, text, text, text,
  uuid, text, jsonb, uuid, text, jsonb
) to ads_analyst_web;
