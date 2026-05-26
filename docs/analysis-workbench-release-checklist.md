# Analysis Workbench Release Checklist

## Required QA Gate

Run these commands before PR review or cutover:

```bash
npm run qa:analysis-workbench
npm run test
npm run typecheck
```

Passing bar:

- Deterministic QA score is at least 90 for every workbench persona case.
- Critical failures count is 0.
- Required answer, evidence table, chart, and source-note objects are present.
- Numeric claims in the answer map to computed fact citations.

Expected artifacts:

- Passing command output for `npm run qa:analysis-workbench`, `npm run test`, and `npm run typecheck`.
- If the gate fails, the test failure prints a QA report with prompt, mode, missing objects, validation failures, score, and next fix area.
- Browser smoke screenshots may be added under `.codex/ask-ai-dashboard-qa/` when local dev-server permissions allow.
