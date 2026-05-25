---
id: AIW-004
title: Output selector and Answer + visuals mode
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Replace the legacy Ask/Build choice with a single output-mode selector and make Answer + visuals the default. Generate a text answer plus useful visual cards for metric cards, flat tables, bar charts, and line charts.

## Acceptance criteria

- [ ] The analysis surface shows a segmented selector with Answer only, Answer + visuals, and Full dashboard, defaulting to Answer + visuals.
- [ ] Each selector option has hover help explaining its output in concrete terms.
- [ ] Submitting in Answer + visuals mode creates one analysis run containing answer text, source notes, and visual cards.
- [ ] Metric cards, flat tables, bar charts, and line charts render from structured visual objects, not markdown prose.
- [ ] Tests cover selector behavior, tooltip copy, default mode, visual object rendering, loading, empty, and error states.

## Blocked by

- AIW-003

