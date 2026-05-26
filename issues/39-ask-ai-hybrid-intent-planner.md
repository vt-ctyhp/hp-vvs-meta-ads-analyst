---
labels:
  - ready-for-agent
mode: AFK
status: open
---

# feat: hybrid governed intent planner for Ask AI

## Parent

Parent PRD: `docs/ask-ai-natural-language-robustness-prd.md`

## What to build

Add a governed natural-language intent planner for Ask AI. A production prompt should produce strict structured intent JSON with a `questionType`, governed metrics, dimensions, filters, date intent, sort, limit, visual intent, assumptions, and clarification needs. The deterministic planner remains available as fallback when model planning is unavailable or invalid.

The first supported `questionType` values are `leaderboard`, `trend`, `comparison`, `diagnosis`, and `recommendation`. The planner must not produce SQL, raw data access, or unsupported fields. Existing semantic validation remains the authority before any aggregate query runs.

## Acceptance criteria

- [ ] A prompt such as "Which campaigns are wasting money?" resolves to a governed intent with a recommendation or diagnosis question type, not a generic spend leaderboard.
- [ ] A prompt such as "Show bookings by day for book appointment ads this week" resolves to governed metrics, dimensions, filters, date range, and trend intent.
- [ ] Malformed or unavailable model output falls back to deterministic planning without failing safe prompts.
- [ ] Invalid metrics, dimensions, filters, and unsupported sources are blocked by semantic validation before aggregate queries run.
- [ ] Planner output is persisted or exposed in the run result enough for QA replay.
- [ ] Focused planner tests cover all five question types plus fallback behavior.

## Blocked by

None - can start immediately.
