# Meta Ads Accuracy Test Playbook

## Audit Output Contract

Produce these artifacts when possible:

- `audit-report.md`: plain-language result, scope, blockers, and risk.
- `failures.json`: machine-readable mismatches.
- `reconciliation.csv`: raw Supabase vs RPC rows.
- Screenshots for UI dashboard/report surfaces.
- Test list: commands run, pass/fail, and any skipped checks with reason.

## Static Checks

Run:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs
```

This catches the known overmultiplication class before browser or AI checks.

## Live Reconciliation

Run `reconcile-meta-ads-data.mjs` for the exact range/filter in question. Use multiple dimensions when hierarchy could be wrong:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs \
  --start 2026-05-01 \
  --end 2026-05-07 \
  --dimensions campaign_umbrella,campaign,ad_set \
  --filter brand:equals=HP \
  --filter delivery_status:equals=live \
  --out .codex/meta-ads-accuracy/2026-05-01_2026-05-07
```

If env vars are missing, say live reconciliation was not run and fall back to local tests/static checks.

## Targeted Unit Tests

Use direct `node --test` commands for narrow test sets:

```bash
node --test --experimental-strip-types tests/meta-insight-aggregates.test.ts
node --test --experimental-strip-types tests/analysis-route.test.ts
node --test --experimental-strip-types tests/period-pivot-data.test.ts tests/pivot-by-period.test.ts tests/snapshot-by-entity.test.ts
node --test --experimental-strip-types tests/optimize-ai-panel.test.ts tests/ad-hoc-analytics.test.ts
```

Add tests at the lowest layer that can catch the bug:

- SQL/RPC contract changed: add integration or static SQL guard coverage.
- Mapper/rate formula changed: add unit test with rows that prove totals first, rates second.
- Date/filter changed: add test with explicit `startDate`, `endDate`, `days`, and equivalent filters in different order.
- UI formatter changed: add render/static markup test for money, percent, and zero/null states.
- AI prompt/context changed: add test that source transparency and debug context include range/filter/source function.

## Browser/UI Verification

For dashboard UI:

1. Start dev server with `npm run dev`.
2. Use Browser to open the affected route.
3. Set the same date range and filters used in reconciliation.
4. Capture screenshot and visible metric values.
5. Inspect the API payload feeding the view when possible.
6. Compare visible values to `reconciliation.csv` or `raw-summary.json`.

Check responsive layout only when UI changed. Accuracy audit is blocked if the visible number cannot be mapped to a source key.

## AI Chat And Analysis Text

Save raw response JSON or text, then run:

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/scan-ai-numeric-claims.mjs \
  --input .codex/meta-ads-accuracy/run/ai-output.json \
  --facts .codex/meta-ads-accuracy/run/raw-summary.json \
  --out .codex/meta-ads-accuracy/run
```

Manually review any claim tagged `unknown_metric`, `unsupported_roas`, or `needs_context`. The scanner is a triage aid, not a substitute for reconciliation.

## Reports And Exports

For generated reports:

- Verify report route input body matches audited range/filter.
- Check persisted `ai_reports` content and `sourceTransparency`.
- Scan numeric claims and compare to reconciliation.

For CSV/export files:

- Compare row count, hierarchy keys, and metric columns to reconciliation.
- Ensure exported currency/percent strings parse back to the same numeric values.
- Check hidden-financials or permission modes do not leak spend, CPC, CPM, or cost-per-result.

## Fix Strategy

Fix earliest wrong layer:

1. Supabase SQL/RPC if raw table and RPC disagree.
2. Data access/mapping if RPC and API disagree.
3. API route defaults if range/filter context differs.
4. AI prompt/context if model receives incomplete or ambiguous facts.
5. UI/export formatter if numbers are right but labels, rounding, or display are wrong.

After fixing, rerun the failing script/test first, then the narrow impacted test set.
