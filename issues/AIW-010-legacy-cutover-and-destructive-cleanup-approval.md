---
id: AIW-010
title: Legacy cutover and destructive cleanup approval
type: HITL
status: hitl-required
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Perform the human-approved cutover from the legacy Ask/Build analysis system to the new workbench. This includes deleting old saved dashboards and old Ask AI analysis chat/history only after explicit approval for the destructive migration.

## Acceptance criteria

- [ ] A reviewer has approved the destructive migration plan before any shared or production database cleanup runs.
- [ ] The legacy Ask/Build user path is removed or fully replaced by the new workbench route.
- [ ] Old saved dashboards are deleted according to the approved cleanup plan.
- [ ] Only legacy Ask AI analysis chat/history is deleted; unrelated app chat or messaging data is preserved.
- [ ] Cutover verification confirms the new workbench works and legacy low-trust dashboards no longer appear.

## Blocked by

- AIW-008
- AIW-009

