---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: diagnosis fact packs for Ask AI

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Add diagnosis support for questions like "why did performance drop?", "what changed?", and "why did HP improve?". Diagnosis should compute current-vs-baseline deltas, top positive and negative movers, concentrated drivers, co-moving metrics, and caveats. The answer should describe likely drivers as signals or hypotheses, never proven causes.

## Acceptance criteria

- [ ] "Why did performance drop?" compares the current period to a relevant baseline and identifies the largest negative driver by governed entity grain.
- [ ] "What changed this week?" computes movement against the previous comparable period.
- [ ] The default performance bundle includes primary KPI, spend, and an efficiency metric where applicable.
- [ ] Diagnosis answers use "likely driver", "signal", or equivalent non-causal language.
- [ ] Answers include source notes, assumptions, baseline period, row counts, and caveats.
- [ ] Numeric grounding blocks uncited numbers in diagnosis prose.
- [ ] Tests cover drop, improvement, no-change, empty-row, and mixed-primary-KPI caveat cases.

## Blocked by

- Issue 39 - hybrid governed intent planner for Ask AI.
- Issue 41 - explicit comparison scopes for Ask AI.
