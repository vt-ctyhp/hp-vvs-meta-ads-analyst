---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: strict calendar date semantics for Ask AI

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Make Ask AI date interpretation predictable for calendar and rolling-period language. The planner and date resolver should distinguish previous complete calendar periods from rolling windows, support exact "since/from" dates, and expose assumptions or clarifications when a date cannot be mapped safely.

## Acceptance criteria

- [ ] "Last month" resolves to the previous complete calendar month.
- [ ] "Past month", "recent month", and "trailing month" resolve to a rolling 30-day window ending at the latest synced Meta Ads date.
- [ ] "April" resolves to the latest complete April in the synced data window, and "April 2026" resolves to 2026-04-01 through 2026-04-30.
- [ ] "Since May 1" resolves to May 1 of the relevant year through the latest synced Meta Ads date.
- [ ] "Q1 2026" resolves to the full first quarter of 2026.
- [ ] Ambiguous calendar phrases produce clarification only when the period cannot be inferred without changing answer meaning.
- [ ] Tests cover calendar months, quarters, rolling windows, since/from dates, month-to-date, week-to-date, and fallback assumptions.

## Blocked by

None - can start immediately, but should align its date-intent shape with issue 39 if both are in flight.
