---
name: meta-ads-data-accuracy
description: Thoroughly test and fix data accuracy for the Meta Ads AI surfaces in this project. Use when auditing or changing the dashboard, Optimize/Analyst UI numbers, AI chat or ad-hoc analysis text, generated reports, CSV/exported outputs, Supabase aggregation RPCs, date/filter handling, campaign/ad-set/ad/creative hierarchy rollups, attribution-window claims, currency/percent formatting, or any bug where Meta Ads AI may present inaccurate spend, impressions, clicks, CTR, CPC, CPM, conversions, ROAS, or narrative claims.
---

# Meta Ads Data Accuracy

## Core Rule

Treat Supabase as source of truth. Verify every number shown by the UI, AI text, and exports against Supabase reads using the same date range, filters, environment, hierarchy level, and metric formulas.

Known prior failure: `aggregate_meta_daily_insights` overmultiplied rows when environment-scoped joins were missing. Always test raw `meta_daily_insights` totals against RPC output before trusting dashboard, AI, or export results.

## Reference Files

- Read `references/accuracy-contract.md` before auditing metric formulas, date semantics, filters, hierarchy, attribution windows, or ROAS claims.
- Read `references/test-playbook.md` before adding tests, running browser checks, comparing reports/exports, or writing an audit report.

## Fast Audit Workflow

1. Identify surface: dashboard UI, AI chat/ad-hoc analysis text, generated report, or export.
2. Capture exact inputs: URL, route, prompt, date range, timezone assumption, brand/group/status/search filters, hierarchy level, environment, and attribution-window wording.
3. Run static RPC guard:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs
```

4. Run live Supabase reconciliation when env vars are available:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs \
  --start 2026-05-01 \
  --end 2026-05-07 \
  --dimensions campaign_umbrella,campaign \
  --filter campaign_umbrella:equals="Cash for Gold US" \
  --out .codex/meta-ads-accuracy/latest
```

Required env: `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. Optional env: `ADS_ANALYST_ENVIRONMENT` defaults to `production`.

5. Run the live end-to-end truth test for Analyst, Optimize, AI, report, or export changes:

```bash
set -a
source .env.local
set +a
node --test --experimental-strip-types tests/meta-ads-e2e-truth.test.ts
```

This test uses the latest synced production window by default. It proves raw `meta_daily_insights` totals match `aggregate_meta_daily_insights`, verifies a real campaign-umbrella filter, and checks campaign -> ad-set -> creative rollups for the same date/filter scope. It skips when live Supabase env vars are unavailable.

6. Run targeted app tests for changed code:

```bash
node --test --experimental-strip-types tests/meta-insight-aggregates.test.ts tests/meta-ads-e2e-truth.test.ts tests/analysis-route.test.ts tests/period-pivot-data.test.ts tests/optimize-ai-panel.test.ts
```

7. For UI changes, start the app and use Browser to inspect the affected screen. Capture screenshot(s), visible numbers, and any API payload that feeds the surface.
8. For AI chat, ad-hoc analysis, reports, or exports, save the output text/JSON/CSV and scan numeric claims:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/scan-ai-numeric-claims.mjs \
  --input .codex/meta-ads-accuracy/latest/ai-output.txt \
  --facts .codex/meta-ads-accuracy/latest/raw-summary.json \
  --out .codex/meta-ads-accuracy/latest
```

9. Fix mismatches at the earliest wrong layer: SQL/RPC, data mapper, API route, AI prompt/context, formatter, export serializer, or UI rendering.
10. Add or update automated tests that would have failed before the fix.
11. Return an audit report with failing test list, fixes made, tests run, screenshots captured, and reconciliation CSV path.

## What To Check

- Totals: spend, impressions, reach, clicks, conversions, website bookings, messaging contacts, primary KPI, secondary KPI, and source row count.
- Rates: CTR = clicks / impressions * 100, CPM = spend / impressions * 1000, CPC = spend / clicks, CPL = spend / leads, frequency = impressions / reach.
- ROAS: verify only if a real revenue source and attribution contract are present. If revenue is not wired for the surface, AI/export text must say ROAS is unavailable instead of inventing it.
- Dates: inclusive `date_start >= start` and `date_start <= end`; preserve California calendar-date semantics used by sync/backfill.
- Filters: brand, campaign umbrella/group, delivery status, search, campaign, ad set, ad, creative.
- Hierarchy: campaign totals must equal child ad-set totals; ad-set totals must equal child ad/creative totals for the same filters and date range.
- Data-flow scope: the page header, API query, table rows, charts, lazy child rows, and AI context must all use the same date range, filters, environment, hierarchy level, and status default. Do not mix "last 7 days" totals with "current week" tables unless the UI says those are different scopes.
- AI claims: every numeric claim needs backing rows in the table/totals provided to the model. Flag claims that use stale dates, different filters, unsupported metrics, or ambiguous attribution wording.
- Exports/reports: values must match UI/API source data, not a separately recomputed or differently filtered dataset.

## Useful Scripts

- `scripts/reconcile-meta-ads-data.mjs`: live Supabase raw-table vs RPC reconciliation. Writes `audit-report.md`, `reconciliation.csv`, `failures.json`, `raw-summary.json`, and `rpc-rows.json`.
- `scripts/scan-ai-numeric-claims.mjs`: scans AI/report/export text or JSON for numeric claims and compares recognized metric claims to a fact file.
- `scripts/assert-rpc-sql-guards.mjs`: static regression guard for the environment-scoped RPC join predicates and action-alias coalesce behavior that prevent overmultiplication.

Run script self-tests after editing scripts:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs --self-test
node .agents/skills/meta-ads-data-accuracy/scripts/scan-ai-numeric-claims.mjs --self-test
node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs --self-test
```
