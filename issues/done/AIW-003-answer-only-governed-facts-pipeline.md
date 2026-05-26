---
id: AIW-003
title: Answer-only governed facts pipeline
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Build the first useful analysis path: prompt to governed intent, query plan, deterministic computed facts, validation, and cited text answer. This path powers Answer only mode and establishes the rule that AI narrative may only describe computed fact objects.

## Acceptance criteria

- [ ] A text-only analysis request runs through the same governed planner and query/facts pipeline intended for all output modes.
- [ ] The system computes totals, comparisons, ranks, and source notes in code before narrative is generated.
- [ ] The answer includes concrete cited values, entity names, comparison baselines, assumptions, caveats, and source notes.
- [ ] Narrative generation cannot introduce uncited numeric claims or unsupported fields.
- [ ] Tests cover prompt-to-answer behavior, source notes, unsupported requests, zero-row cases, and numeric-claim grounding.

## Blocked by

- AIW-001
- AIW-002

