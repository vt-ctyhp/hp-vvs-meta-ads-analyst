---
id: AIW-009
title: No-slop QA release gate
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Turn the Ask AI QA rubric and persona suite into a release gate for the new workbench. The gate should fail builds or PR verification when generated analysis is unsupported, ungrounded, missing required objects, or below the deterministic usefulness score.

## Acceptance criteria

- [ ] The QA suite exercises analyst, manager, marketing, and edge-case prompts against the new analysis workbench API and page.
- [ ] A passing run requires score at least 90, zero critical failures, and required answer/table/chart/source objects present.
- [ ] Numeric-claim checks verify answer numbers map to computed facts.
- [ ] Failures produce a report with prompt, mode, missing objects, validation failures, and next fix area.
- [ ] The release checklist documents the QA command sequence and expected artifacts.

## Blocked by

- AIW-004
- AIW-005
- AIW-007

