---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: explicit comparison scopes for Ask AI

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Teach Ask AI to represent comparisons as explicit scoped plans instead of flattening them into one query. Entity-vs-entity and period-vs-period prompts should create labeled scopes, execute governed aggregate requests per scope, compute side-by-side facts, and answer with deltas, percent deltas, winners, caveats, and source notes.

## Acceptance criteria

- [ ] "Compare HP vs VVS by CPL" creates two labeled entity scopes and computes side-by-side CPL, spend, and primary KPI facts.
- [ ] "This week vs last week" creates two labeled period scopes and computes deltas and percent deltas.
- [ ] "Cash for Gold vs Book Appointment ads" compares the two campaign groups without treating them as a single impossible exact filter.
- [ ] Source notes show each scope's date range and filters.
- [ ] Answers cite every compared number and label the winner without unsupported claims.
- [ ] Tests cover entity-vs-entity, period-vs-period, multi-group comparisons, empty-scope behavior, and numeric grounding.

## Blocked by

- Issue 39 - hybrid governed intent planner for Ask AI.
- Issue 40 - strict calendar date semantics for Ask AI.
