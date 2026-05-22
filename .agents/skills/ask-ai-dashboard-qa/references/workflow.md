# Ask AI Dashboard QA Workflow

## API Loop

1. Start app with required env:

```bash
LOCAL_TEST_AUTH_ENABLED=true npm run dev
```

2. Run suite:

```bash
node .agents/skills/ask-ai-dashboard-qa/scripts/run-dashboard-qa-suite.mjs \
  --base-url http://localhost:3000 \
  --suite .agents/skills/ask-ai-dashboard-qa/assets/persona-request-suite.json \
  --out .codex/ask-ai-dashboard-qa/latest \
  --login-local-test
```

3. Read `qa-report.md` first, then `failures.json`.
4. Fix the earliest wrong layer.
5. Add or update unit tests for fixed prompt/spec behavior.
6. Rerun the failed test IDs, then the full suite.

Use `--test-id id1 --test-id id2` to narrow iteration and `--repeat 3` to catch nondeterministic dashboard generation.

## Browser Loop

After API passes:

1. Open `/analysis`.
2. Submit one analyst, one manager, one sales lead, and one marketing prompt from the suite.
3. Confirm table columns, rows, charts, warnings, and source transparency match API result.
4. Open Optimize AI panel where relevant and repeat with runtime filters/date range.
5. Screenshot final passing state and any visual failure.

Browser pass criteria:

- Table visible when required.
- Bar/line chart visible when required.
- Metric cards or totals are not empty.
- Unsupported messages are clear and do not show misleading charts.
- Saved dashboard load/edit keeps original context.

## Fix Guidance

Use these local files:

- `src/lib/ad-hoc-analytics.ts`: prompt planning, spec normalization, validation, table/chart data, answer generation.
- `src/app/api/analysis/route.ts`: create/edit/load API behavior and runtime context.
- `src/components/analysis-client.tsx`: standalone AI Analysis page rendering.
- `src/components/v2/optimize/ai-panel.tsx`: Optimize panel Build Analysis flow.
- `tests/ad-hoc-analytics.test.ts`: spec planning and normalization tests.
- `tests/optimize-ai-panel.test.ts`: panel/API integration tests.

Prefer deterministic tests for recurring failures. Add fixture prompts from `assets/persona-request-suite.json` when they expose real gaps.

## Report Format

Final QA report should include:

- Overall pass/fail and score.
- Failed test IDs grouped by persona and request type.
- Critical failures.
- Missing widgets/tables/charts.
- Weak senior-analyst insight notes.
- Files changed.
- Commands run.
- Browser screenshot paths.
