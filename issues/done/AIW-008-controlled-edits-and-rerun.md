---
id: AIW-008
title: Controlled edits and rerun
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Add safe, governed dashboard editing and rerun controls. Users can adjust date ranges, filters, metrics, sort/limit, compatible chart types, titles, and insight visibility without opening arbitrary SQL, formulas, or a full BI builder.

## Acceptance criteria

- [ ] A user can rerun an existing analysis run against the latest synced data while preserving run lineage.
- [ ] A user can safely edit date range, filters, metrics, sort, limit, object titles, and compatible chart types.
- [ ] A user can pin or hide insights in a dashboard packet.
- [ ] Invalid edits are blocked by the same semantic catalog and validator used during generation.
- [ ] Tests cover valid edits, invalid edits, rerun lineage, source-note updates, and no unsupported custom SQL/formula paths.

## Blocked by

- AIW-007

