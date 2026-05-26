---
id: AIW-007
title: Full dashboard packet and promote from answer
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Add Full dashboard mode and promotion from an answer run into a durable dashboard packet. A packet should combine the direct answer, evidence table, useful visuals, winners/losers/anomalies, next actions, assumptions, caveats, and source notes.

## Acceptance criteria

- [ ] Submitting in Full dashboard mode creates a durable run with a dashboard packet rather than only answer cards.
- [ ] An Answer + visuals run can be promoted into a full dashboard without starting over.
- [ ] Dashboard packets include direct answer, primary evidence table, visual objects, insight summary, next actions, assumptions, caveats, and source notes.
- [ ] Reopening a run restores the same saved dashboard packet from persisted snapshot data.
- [ ] Tests cover full-dashboard creation, promotion from answer, saved/reopen behavior, and dashboard packet completeness.

## Blocked by

- AIW-004
- AIW-005
- AIW-006

