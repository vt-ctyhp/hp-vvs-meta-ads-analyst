---
id: AIW-011
title: Post-MVP export pack
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Add export support after the MVP dashboard packet is stable: management-ready PDF report export, per-table CSV export, and per-chart PNG export.

## Acceptance criteria

- [ ] A full dashboard packet can export a management-ready PDF containing answer, visuals, source notes, assumptions, and caveats.
- [ ] Each table object can export CSV using the currently displayed data and column labels.
- [ ] Each chart object can export PNG with readable labels and without UI chrome.
- [ ] Exports preserve source notes and run identity so shared artifacts can be traced back to the analysis run.
- [ ] Tests or verified browser checks cover PDF, CSV, and PNG export paths.

## Blocked by

- AIW-007

