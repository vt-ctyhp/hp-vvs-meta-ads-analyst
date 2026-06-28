-- Migration: revoke_client_execute_meta_ads_secdef_rpcs
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

-- SECURITY: lock the client-reachable roles out of these SECURITY DEFINER public RPCs.
--
-- All six functions are SECURITY DEFINER (run as owner `postgres`, bypass RLS) and do
-- privileged backend work: claim/mutate Meta backfill queue state, prune the webhook
-- audit log, anonymize expired website attribution, and compute/dispatch inbox metrics.
-- They are backend-only: the app reaches them via createAdsAnalystClient("worker"|"ingest")
-- (roles ads_analyst_worker / ads_analyst_ingest) or the service-role fallback, plus
-- pg_cron (as postgres). None is ever called from a browser / authenticated session.
--
-- Supabase's default privileges grant EXECUTE on new public routines to anon AND
-- authenticated EXPLICITLY (not only via PUBLIC), so revoking PUBLIC/anon alone does NOT
-- close the hole -- `authenticated` (reachable with the client-side publishable key)
-- keeps EXECUTE and can invoke these definer functions. A prior one-time live revoke
-- already removed PUBLIC + anon on prod but left `authenticated` in place; this migration
-- records that fix in-tree AND finishes it by revoking `authenticated` as well. Same
-- pattern as 20260609040330_change_log_rpc_revoke_public.sql.
--
-- These six functions were applied straight to the live database and are NOT in this
-- repo's migration history, so a plain `revoke ... on function public.<fn>(...)` would
-- error on a clean `supabase db reset` ("function does not exist"). The existence-guarded
-- DO loop below is therefore a NO-OP locally and only acts where the functions exist
-- (prod). Idempotent: REVOKE does not error when a grant is already absent.
--
-- Revoke-only by design: the legitimate grantees (postgres owner, service_role,
-- ads_analyst_worker, ads_analyst_ingest) are left untouched, so no real caller is
-- affected, and nothing is re-granted -- a re-grant would also fail locally where those
-- scoped roles do not exist.

do $$
declare
  r record;
begin
  for r in
    select p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and p.proname in (
        'anonymize_expired_website_attribution',
        'claim_meta_ads_backfill_chunks',
        'claim_meta_insight_breakdown_backfill_chunks',
        'prune_meta_webhook_events',
        'compute_inbox_metrics_daily_for_tz',
        'run_inbox_metrics_daily_dispatch'
      )
  loop
    execute format(
      'revoke execute on function public.%I(%s) from public, anon, authenticated',
      r.proname,
      r.args
    );
  end loop;
end $$;
