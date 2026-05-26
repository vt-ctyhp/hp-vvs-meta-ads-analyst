---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: natural-language Ask AI UI transparency and QA gate

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Expose robust natural-language behavior clearly in the Ask AI UI and release gate. Users should see assumptions, clarification needs, supported rewrite suggestions, comparison scopes, advisory recommendation labels, source notes, and caveats. QA should exercise the new natural-language question types end to end.

## Acceptance criteria

- [ ] Ask AI renders visible assumptions for default date, metric bundle, grouping, and latest synced date.
- [ ] Clarification states explain the ambiguous field and show suggested valid choices.
- [ ] Unsupported-boundary responses show why the request is blocked and provide supported rewrites.
- [ ] Comparison answers show scope labels and source notes for each side.
- [ ] Recommendation answers are visibly advisory and do not look like campaign mutation controls.
- [ ] Saved run previews preserve answer, question type, validation status, warnings, assumptions, source notes, and key facts for QA replay.
- [ ] Persona QA covers leaderboard, trend, comparison, diagnosis, recommendation, unsupported mixed request, and date semantics.
- [ ] Browser or component tests cover assumptions, clarification, unsupported rewrite, source notes, and advisory labels.

## Blocked by

- Issue 39 - hybrid governed intent planner for Ask AI.
- Issue 41 - explicit comparison scopes for Ask AI.
- Issue 42 - diagnosis fact packs for Ask AI.
- Issue 43 - governed recommendation fact packs for Ask AI.
- Issue 44 - safer named-entity filters and unsupported-boundary rewrites.
