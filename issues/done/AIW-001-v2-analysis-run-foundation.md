---
id: AIW-001
title: V2 analysis-run foundation
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Create the first vertical slice of the replacement Ask AI workbench: one prompt submission creates a durable analysis run record, returns a basic run response, and lets the user reopen recent runs from the analysis surface. This slice does not need final planning intelligence or rich visuals yet; it proves the new run model, API path, and UI shell work end to end.

## Acceptance criteria

- [ ] A user can submit a prompt through the new chat-led analysis surface and receive a created analysis run with status, prompt, output mode, and timestamps.
- [ ] The run is persisted with enough structured fields to support later intent, facts, visuals, source notes, validation, and run lineage without changing the core identity model.
- [ ] The page lists recent analysis runs and can reopen a saved run without calling the legacy Ask/Build dashboard path.
- [ ] The legacy Ask and Build buttons are not part of the new foundation path.
- [ ] Tests cover run creation, run listing, run reopen, permission gating, and empty/error states.

## Blocked by

None - can start immediately

