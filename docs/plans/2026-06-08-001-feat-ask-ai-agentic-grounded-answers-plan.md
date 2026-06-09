---
date: 2026-06-08
id: 2026-06-08-001
type: feat
status: draft
owner: viv
slug: ask-ai-agentic-grounded-answers
---

# Ask AI: Agentic, Grounded Answers (stop forcing questions into a fixed schema)

## Summary

Today the Ask AI Workbench uses the model only to pick from a small fixed menu (a metric, a grouping, a chart type) and then writes the answer from string templates. Any question that is not a "metric by dimension" breakdown gets mangled (e.g. "are the US/VN Product ads still active?" came back as "0 campaign count… 0 above average of 0" with a zero bar chart).

This plan replaces the menu-and-template core with an **agent that reads the question, looks up the real data it needs through read-only query tools, then writes the answer and chooses which visuals (charts, tables, or none) best fit**. The model gets flexibility for any question with no per-question-type code; trust is preserved because **every number in the answer comes from a query result, never from the model's memory.** Visual selection is AI-driven for **all output modes, including the full dashboard**, replacing the canned/templated visual sets.

## Problem Frame

Current flow ([analysis-workbench-pipeline.ts](../../src/lib/analysis-workbench-pipeline.ts), [analysis-workbench-intent-planner.ts](../../src/lib/analysis-workbench-intent-planner.ts)):

1. AI intent planner maps the prompt onto a **fixed catalog** ([analysis-workbench-semantic-catalog.ts](../../src/lib/analysis-workbench-semantic-catalog.ts)): metric(s) + dimension + filters + chart type. That catalog is the model's entire vocabulary.
2. Deterministic engine computes numbers from one source, the `aggregate_meta_daily_insights` RPC (a daily **performance** table).
3. The findings prose is a **template** ([analysis-workbench-pipeline.ts:903, :923](../../src/lib/analysis-workbench-pipeline.ts)).

So the model *plans a query* but does not *answer the question*, and the only shape it can produce is "metric by dimension + chart." Status/roster/yes-no/free-form questions have no path and get forced into a count breakdown over a performance table. The design did this on purpose, to guarantee the model never invents a number. We keep that guarantee while removing the rigidity.

## Goals

- Any reasonable question gets a sensible answer with **no per-question-type code**.
- Numbers in the answer are **always traceable to a query result** (no fabrication).
- **The AI picks the visuals for every mode**: it chooses the right charts/tables (or none) from the data it pulled, for Answer only, Answer + visuals, *and* full dashboard. No more canned/templated visual sets.
- The model decides the answer's shape: prose only, prose + the visuals it chose, or a short list/roster.
- Keep the existing UI contract so the distilled answer view ([analysis-workbench-client.tsx](../../src/components/analysis-workbench-client.tsx)) renders unchanged (the hero shows the top visual; the rest fall into the Details grid).
- Ship behind a flag with the current deterministic pipeline as fallback.
- **Hard cost ceiling: $0.05 per answer.**

## Non-Goals / Scope Boundaries

- **Read-only.** No `ads_management`, no edits (matches PRODUCT.md).
- Not removing the deterministic pipeline yet; it stays as the fallback when AI/key is unavailable and as the A/B control.
- Provider stays OpenAI via `getOpenAIAnalysisModel` (no provider migration here).
- Modes are kept as a **breadth hint** (how much to show), not separate code paths; the AI fills each intelligently. "Full dashboard" is now AI-composed, not a separate templated builder.

## Key Technical Decision: constrained query tools, not free-form SQL

The model gets the **real data schema** plus a few **read-only, guarded query tools**, and calls them as needed (function/tool calling). This is general over the whole data model (not a hand-picked catalog) but safe (no arbitrary SQL on prod).

Tools (all read-only via `createAdsAnalystClient("web")`, with row + time-range caps):

1. **`query_performance`** — generalized wrapper over the existing `aggregate_meta_daily_insights` RPC: any metrics, dimensions, filters, date range, sort, limit. Handles spend/impressions/messages/CTR/etc. over time and by group/creative.
2. **`query_entities`** — read-only select over `meta_campaigns` / `meta_ad_sets` / `meta_ads` / `meta_creatives`: current state fields (effective/delivery status, name, budget, thumbnail), filter by brand / campaign group / name / status. This is the table the "is it on or off?" question actually needs. Reuses the same joins as [analysis-workbench-runs.ts `loadAnalysisWorkbenchEntityDisplays`](../../src/lib/analysis-workbench-runs.ts).
3. **Schema is given in the system prompt** (table + field list, allowed values like `delivery_status ∈ {live, paused}`), so the model knows what exists without guessing.

The model loops: read question → call tool(s) → inspect rows → maybe query again → produce a structured result.

Alternative considered: text-to-SQL on a read-only DB role. More powerful, but bigger safety/perf surface (query cost, injection, RLS). Deferred; the two tools above cover the known question space and keep guards simple. (Open question below.)

## Output Contract (keeps the UI unchanged)

The agent returns a structured object the pipeline maps onto the existing `AnalysisWorkbenchRun`:

- `answer.summary` — model-written prose, composed only from returned rows.
- `visualCards` — **0..N cards the AI chose**, each built from the **rows the model queried** (not free text). The AI decides type (bar / line / pivot / table / metric / scatter) and whether a visual helps at all. The distilled UI shows the first as the hero and the rest in the Details grid (already supported). Breadth follows the mode: Answer only → usually none, Answer + visuals → the key one or two, Full dashboard → the fuller set the AI judges useful.
- `dashboardPacket` — when mode is full dashboard, the AI-selected visuals/tables plus any insight groupings (e.g. winners/losers/next actions) are composed **from queried rows**, replacing the templated packet builder. Same contract the UI already renders.
- `sourceNotes` — the queries that ran + row counts + key returned values. Doubles as the audit/grounding trail and as citations.
- `facts` / `validation` — retained for grounding metadata and the grounding check below.

### Modes become a breadth hint, not a code path
There is one agent. The output mode is passed in as guidance for *how much* to show, and the AI fills it: Answer only (prose, rarely a visual), Answer + visuals (answer + the few visuals that matter), Full dashboard (answer + the broader set of charts/tables/insights it judges useful). No separate templated dashboard path.

## Grounding & Safety (how numbers stay honest)

1. **Numbers originate from tool results.** The prose is generated in the same step that has the returned rows in context; the model is instructed to use only those values.
2. **Validation pass:** extract numeric tokens / named entities from `answer.summary` and confirm each appears in the returned query results. If a number can't be traced, downgrade to a safe message rather than ship a possibly-fabricated figure.
3. **Empty/unknown path:** if tools return nothing, the answer says so plainly ("No live US Product campaigns found in the last 30 days") instead of inventing a breakdown of zeros.
4. **Caps:** hard cost ceiling of **$0.05 per answer** (tracked via `openai-cost`; stop the loop and answer with what's gathered when approaching it), plus ~5–6 tool calls max, max rows, bounded date range, and a ~20–30s timeout.

## Phases / Implementation Units

### Phase 1 — Read-only query tools
- Unit 1: `query_performance` wrapper over `aggregate_meta_daily_insights` (params validated, capped).
- Unit 2: `query_entities` over the four entity tables with status/name/budget/thumbnail and brand/group/status filters.
- Unit 3: Schema description (tables, fields, allowed values) as a shared constant for the system prompt.

### Phase 2 — Agent loop
- Unit 4: System prompt (role, schema, tools, grounding rules, visual-selection guidance + the mode breadth hint).
- Unit 5: Tool-calling loop with step/cost caps ($0.05); returns the structured output contract.
- Unit 6: Map structured output → `AnalysisWorkbenchRun` (answer, the AI-chosen visuals built from rows, source notes). One mapper for all modes.
- Unit 6b: Full-dashboard composition — the same agent emits the broader visual/table/insight set from queried rows into `dashboardPacket`, retiring the templated packet builder for the agent path.

### Phase 3 — Grounding & guardrails
- Unit 7: Numbers-traceable validator + empty/unknown handling + safe downgrade.

### Phase 4 — Evaluation (replaces the "no-slop" template gate)
- Unit 8: Rework [analysis-workbench-qa-gate.ts](../../src/lib/analysis-workbench-qa-gate.ts) from "did it print the expected template/sections" to "are the numbers real (present in tool results), did it answer the question, no fabricated entities, and is the chosen visual appropriate (or correctly omitted)." Keep a persona/question eval set, add the status question that failed, a few free-form ones, and a full-dashboard case (assert the AI picked a sensible visual mix, not a canned set).

### Phase 5 — Rollout
- Unit 9: Flag (e.g. `ANALYSIS_WORKBENCH_AGENT`) selecting agent vs current pipeline; deterministic pipeline remains the fallback when the flag is off or no API key. Wire into [analysis-workbench-runs.ts](../../src/lib/analysis-workbench-runs.ts). A/B on the same prompts before flipping the default.

## Decisions Locked

- **Cost ceiling: $0.05 per answer** (hard cap; stop and answer with what's gathered when approaching it).
- **AI picks the visuals for every mode, including full dashboard.** No templated/canned visual sets; modes are a breadth hint.
- **Query surface (default): the two constrained read-only tools** (`query_performance`, `query_entities`), not free-form SQL. Revisit only if real questions need reach the tools can't cover.
- **Grounding (default): strict** — block/withhold any number that can't be traced to a tool result, rather than ship a possibly-fabricated figure.

## Open Questions

1. Validator strictness on legitimate rounding/derived phrasing (e.g. "about a third") — allow a small tolerance, or require exact traceability? (Tune during Phase 3 with the eval set.)
2. Latency feel at the $0.05 cap (a few tool calls). If answers feel slow, do we show a streaming/partial state? (UI follow-up, not blocking.)

## Verification

- Eval set of real prompts incl. the failing status question, a trend, a creative breakdown, a budget question, a full-dashboard prompt, and 2-3 free-form ones; assert numbers match the DB, nothing is fabricated, each answer stays under $0.05, and the AI's chosen visuals fit the question (and dashboard mode shows a varied data-appropriate mix, not a canned set).
- Manual: run the exact screenshot question and confirm a sensible roster answer (US/VN Product: live vs paused), likely no chart.
- `npm test` + `npm run typecheck`; new grounding eval green; old deterministic path still works with the flag off.

## Risks

- Less deterministic than templates (acceptable for an internal analyst tool; mitigated by the validator + fallback).
- Tool/query cost and latency (mitigated by caps).
- The QA-gate rewrite is the riskiest change; keep the old gate until the new eval is trusted.
