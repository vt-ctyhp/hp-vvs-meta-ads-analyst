---
id: AIW-005
title: Pivot table and scatter visual support
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Extend the visual object model and renderer to support pivot tables and scatter charts. Add compatibility handling so the system repairs obvious chart requests and blocks impossible ones with suggested fixes.

## Acceptance criteria

- [ ] The visual planner can choose and render pivot tables for row-by-column analyst comparisons.
- [ ] The visual planner can choose and render scatter charts when two numeric measures and a valid row grain/entity exist.
- [ ] Incompatible pivot or scatter requests are auto-repaired when obvious and otherwise blocked with a suggested valid request.
- [ ] Pivot and scatter outputs include source notes and assumptions consistent with other visual cards.
- [ ] Tests cover pivot layout, scatter requirements, compatible chart swaps, repair cases, and blocked invalid chart requests.

## Blocked by

- AIW-004

