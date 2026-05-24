-- Spike query log — 2026-05-23
-- Every SELECT run against production Supabase during the spike is appended here.
-- Format per query:
--   -- [YYYY-MM-DD HH:MM] [track] [purpose]
--   SELECT ...;
-- NO writes, schema changes, or DDL. If you find yourself wanting to write, stop.

-- [2026-05-23 16:08] [track-0] connectivity probe (service role, 3 baseline tables)
-- Result: brands=3, meta_daily_insights=120962, meta_campaigns=238
SELECT count(*) FROM brands;
SELECT count(*) FROM meta_daily_insights;
SELECT count(*) FROM meta_campaigns;

-- [2026-05-23 16:30] [track-1] /analyst internal-consistency reconciliation runs
-- All run via .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs
-- Compares sum(meta_daily_insights) raw rows vs aggregate_meta_daily_insights RPC output
-- Outputs in docs/superpowers/spike/2026-05-23/reconcile/run-*/
--   run-brand              | 2026-04-23..2026-05-22 | --dimensions brand              | PASS
--   run-total              | 2026-04-23..2026-05-22 | (default dims)                  | PASS
--   run-campaign_umbrella  | 2026-04-23..2026-05-22 | --dimensions campaign_umbrella  | PASS
--   run-campaign           | 2026-04-23..2026-05-22 | --dimensions campaign           | PASS
--   run-ad_set             | 2026-04-23..2026-05-22 | --dimensions ad_set             | PASS
--   run-ad                 | 2026-04-23..2026-05-22 | --dimensions ad                 | PASS
--   run-creative           | 2026-04-23..2026-05-22 | --dimensions creative           | PASS
--   run-2025-by-month      | 2025-01-01..2025-12-31 | --dimensions month              | FAIL (176 mismatches)
--   run-2026q1-campaign    | 2026-01-01..2026-03-31 | --dimensions campaign           | FAIL (178 mismatches)
--   run-2024-umbrella      | 2024-01-01..2024-12-31 | --dimensions campaign_umbrella  | FAIL (75 mismatches)
-- Equivalent SQL shape (representative; actual RPC has env-scope predicates on joins):
--   SELECT date_trunc('month', date_start), sum(spend), sum(impressions), ...
--     FROM meta_daily_insights
--    WHERE date_start BETWEEN $start AND $end AND environment = 'production';
-- vs RPC:
--   SELECT * FROM aggregate_meta_daily_insights($start, $end, '{month}', '{}', null, null, 10000);

-- [2026-05-23 17:00] [track-1.4-lite] website/convert table sanity scan
-- Window: 2026-04-23 to 2026-05-22
SELECT count(*) FROM website_events;                                                        -- 8490
SELECT count(*) FROM website_sessions;                                                      -- 676
SELECT count(*) FROM website_visitors;                                                      -- 584
SELECT count(*) FROM website_conversions;                                                   -- 12 total / 11 in window
SELECT count(*) FROM appointment_events;                                                    -- 522 total / 102 in window
SELECT count(*) FROM website_events WHERE visitor_id IS NULL;                               -- 65 (0.77%)
SELECT count(*) FROM website_conversions WHERE visitor_id IS NULL;                          -- 6 (50% of total)
SELECT count(*) FROM appointment_events WHERE visit_date_time IS NULL;                      -- 29 (5.6%)
-- Boundary view access via service role: ERROR (empty message). May indicate RLS-locked view
-- or schema misconfig; the loader at website-analytics.ts:1448-1470 queries this view.
SELECT count(*) FROM analytics.sales_appointment_conversions_v1;                            -- ERROR

-- [2026-05-23 17:25] [track-2] aggregate_meta_daily_insights RPC timing (warm 2nd run)
-- Last 7d total                          → 177ms / 1 row
-- Last 30d total                         → 417ms / 1 row
-- Last 30d by campaign                   → 910ms / 9 rows
-- Last 30d by ad                         → 405ms / 92 rows
-- Last 90d by campaign                   → 1014ms / 16 rows
-- Full year 2025 by month                → 10585ms / STATEMENT TIMEOUT
-- Full year 2025 by campaign             → 8459ms  / STATEMENT TIMEOUT
-- All-time (2024-2026) by year           → 10239ms / STATEMENT TIMEOUT
-- Representative call:
SELECT * FROM aggregate_meta_daily_insights(
  '2025-01-01'::date, '2025-12-31'::date,
  '{month}'::text[], '[]'::jsonb, 'spend', 'desc', 10000
);

