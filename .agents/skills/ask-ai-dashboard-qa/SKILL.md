---
name: ask-ai-dashboard-qa
description: Create and run comprehensive persona-based QA tests for this project's Ask AI dashboard generation feature. Use when testing or improving `/api/analysis`, `/analysis`, the Optimize AI panel Build Analysis flow, generated dashboard specs, tables, charts, saved dashboard edits, dashboard usefulness, senior-ads-analyst-quality insight, or failures where Ask AI dashboards are vague, unhelpful, missing required widgets, wrong for analyst/manager/sales/marketing requests, or not robust across edge cases.
---

# Ask AI Dashboard QA

## Goal

Stress-test Ask AI dashboard generation until it behaves like a senior ads analyst: precise request interpretation, useful segmentation, right table/chart outputs, source transparency, clear insight, and actionable next steps.

Passing bar: score `90+`, zero critical failures, and all required widgets/tables/charts present.

## Resources

- Read `references/rubric.md` before scoring quality or deciding whether a generated dashboard passes.
- Read `references/workflow.md` before running API/browser QA loops or writing fixes.
- Use `assets/persona-request-suite.json` as the injected baseline suite for analyst, manager, sales lead, and marketing requests.

## Core Workflow

1. Run local app if doing live API or browser checks:

```bash
npm run dev
```

2. Generate or select test requests:

```bash
node .agents/skills/ask-ai-dashboard-qa/scripts/create-request-suite.mjs \
  --suite .agents/skills/ask-ai-dashboard-qa/assets/persona-request-suite.json \
  --out .codex/ask-ai-dashboard-qa/request-suite.json
```

3. Run API suite against `/api/analysis`:

```bash
node .agents/skills/ask-ai-dashboard-qa/scripts/run-dashboard-qa-suite.mjs \
  --base-url http://localhost:3000 \
  --suite .codex/ask-ai-dashboard-qa/request-suite.json \
  --out .codex/ask-ai-dashboard-qa/latest \
  --login-local-test \
  --repeat 1
```

For local auth, set `LOCAL_TEST_AUTH_ENABLED=true` in the app environment. The runner uses the app's default local test credentials unless `LOCAL_TEST_AUTH_EMAIL` / `LOCAL_TEST_AUTH_PASSWORD` are set.

4. Score an existing response or rerun scoring:

```bash
node .agents/skills/ask-ai-dashboard-qa/scripts/score-dashboard-result.mjs \
  --suite .codex/ask-ai-dashboard-qa/request-suite.json \
  --results .codex/ask-ai-dashboard-qa/latest/results.json \
  --out .codex/ask-ai-dashboard-qa/latest
```

5. Optional LLM judge pass:

```bash
OPENAI_API_KEY=... OPENAI_QA_JUDGE_MODEL=... \
node .agents/skills/ask-ai-dashboard-qa/scripts/score-dashboard-result.mjs \
  --suite .codex/ask-ai-dashboard-qa/request-suite.json \
  --results .codex/ask-ai-dashboard-qa/latest/results.json \
  --out .codex/ask-ai-dashboard-qa/latest \
  --llm-judge
```

The LLM judge must never replace deterministic checks. It only adds senior-analyst usefulness feedback.

6. Use Browser for UI proof after API passes:
   - Open `/analysis` and `/analyst?tab=ai` or the Optimize AI panel route affected by the change.
   - Submit failing prompts from the suite.
   - Capture screenshots showing prompt, dashboard answer, table, chart, warnings/source transparency, and saved/edit behavior.
   - Confirm rendered tables/charts match API result shape.

7. Fix earliest wrong layer:
   - Prompt/spec planning in `src/lib/ad-hoc-analytics.ts`
   - API route/runtime context in `src/app/api/analysis/route.ts`
   - UI rendering in `src/components/analysis-client.tsx` or `src/components/v2/optimize/ai-panel.tsx`
   - Tests in `tests/ad-hoc-analytics.test.ts` or `tests/optimize-ai-panel.test.ts`

8. Rerun until all pass:
   - `score >= 90`
   - `criticalFailures.length === 0`
   - all required widgets present
   - browser screenshots show useful table/chart output

## Standard Verification

Run script self-tests after editing this skill:

```bash
node .agents/skills/ask-ai-dashboard-qa/scripts/create-request-suite.mjs --self-test
node .agents/skills/ask-ai-dashboard-qa/scripts/score-dashboard-result.mjs --self-test
node .agents/skills/ask-ai-dashboard-qa/scripts/run-dashboard-qa-suite.mjs --self-test
```

Run app tests after changing dashboard generation code:

```bash
node --test --experimental-strip-types tests/ad-hoc-analytics.test.ts tests/optimize-ai-panel.test.ts tests/analysis-route.test.ts
```

## Output Contract

Every QA run should leave:

- `qa-report.md`: suite summary, failing cases, scores, senior-analyst gaps, and next fixes.
- `scores.csv`: per-test scores and pass/fail.
- `failures.json`: machine-readable critical/noncritical failures.
- `results.json`: raw API results by prompt/repeat.
- Browser screenshots for UI failures or final proof.
