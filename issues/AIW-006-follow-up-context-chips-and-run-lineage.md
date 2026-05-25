---
id: AIW-006
title: Follow-up context chips and run lineage
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Make follow-up chat context-aware without hiding scope. Follow-up prompts inherit the prior run context, show inherited context chips, allow chips to be removed, and persist run lineage showing what was inherited and what changed.

## Acceptance criteria

- [ ] Follow-up prompts inherit prior date range, filters, entities, metrics, and grouping context by default.
- [ ] Inherited context appears as removable chips before submission.
- [ ] Removing a chip prevents that part of context from being applied to the follow-up run.
- [ ] Each follow-up run persists its parent run, inherited context, changed context, and final resolved context.
- [ ] Tests cover inherited context, chip removal, lineage persistence, and follow-up answers that do not silently drop scope.

## Blocked by

- AIW-003

