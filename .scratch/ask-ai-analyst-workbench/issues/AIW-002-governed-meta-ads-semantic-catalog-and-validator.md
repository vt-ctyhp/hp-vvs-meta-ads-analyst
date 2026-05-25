---
id: AIW-002
title: Governed Meta Ads semantic catalog and validator
type: AFK
status: ready-for-agent
parent: docs/ask-ai-analyst-workbench-prd.md
source_skill: /Users/viv/.codex/skills/to-issues/SKILL.md
---

## Parent

- `docs/ask-ai-analyst-workbench-prd.md`

## What to build

Add the governed semantic catalog that defines which Meta Ads metrics, dimensions, filters, aliases, date grains, KPI mappings, and visualization combinations the new workbench may use. Add validation that blocks unsupported sources and invalid fields before any answer can be shown.

## Acceptance criteria

- [ ] The semantic catalog exposes approved Meta Ads metrics, dimensions, filters, date grains, aliases, primary KPI rules, unsupported source boundaries, and chart compatibility rules through a testable interface.
- [ ] Primary KPI remains group-specific and labels make the underlying metric explicit, including caveats for blended or proxy metrics.
- [ ] Unsupported CRM, revenue, ROAS, staff, website, and social inbox requests are blocked with useful user-facing reasons rather than answered as fact.
- [ ] Invalid filter values, including hallucinated brand or group names, are rejected or repaired with visible assumptions.
- [ ] Tests cover catalog definitions, KPI mappings, aliases, unsupported boundaries, and critical validator failures.

## Blocked by

- AIW-001

