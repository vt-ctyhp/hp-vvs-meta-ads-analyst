---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: governed recommendation fact packs for Ask AI

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Add recommendation support for advisory prompts like "what should I pause?", "what should I scale?", "where is money being wasted?", and "what should I fix first?". Recommendations should be produced from governed heuristics, not free-form model guesses.

## Acceptance criteria

- [ ] "What should I pause this week?" identifies review or pause candidates using high spend plus weak primary KPI or efficiency evidence.
- [ ] "What should I scale?" identifies opportunity candidates using strong primary KPI or efficiency evidence.
- [ ] Fatigue-style prompts use governed proxy signals such as rising frequency, rising CPC/CPL, falling CTR, or falling primary KPI.
- [ ] Recommendation prose remains advisory and never claims to pause, edit, create, duplicate, or mutate Meta campaigns.
- [ ] Every recommendation cites entity name, metric values, date range, and source notes.
- [ ] Unsupported outcome requests such as ROAS or revenue-based scaling are blocked with supported rewrite suggestions.
- [ ] Tests cover scale, pause, waste, fatigue, advisory-language guardrails, and unsupported-outcome guardrails.

## Blocked by

- Issue 39 - hybrid governed intent planner for Ask AI.
- Issue 42 - diagnosis fact packs for Ask AI.
