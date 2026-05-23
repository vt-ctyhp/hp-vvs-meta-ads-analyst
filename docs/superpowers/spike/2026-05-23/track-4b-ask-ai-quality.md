# Track 4b — Ask AI dashboard quality investigation

_Investigated: 2026-05-23_

## User's complaint
> "The Ask AI dashboard also does not generate useful dashboards, and it's kind of messed up."

## What Ask AI actually does (data flow)

`/analysis` mounts `<OptimizeAiPanel>` (`src/app/(workspace)/analysis/page.tsx:20`). The panel has two distinct entry points feeding the same surface:

1. **"Build Analysis"** (POST `/api/analysis`) calls `createAdHocAnalysis()` in `src/lib/ad-hoc-analytics.ts:642`. Pipeline: (a) preflight fallback spec → (b) `createSpecWithAI(prompt, planModel)` (line 850) — `gpt-5.4` (env `OPENAI_FAST_MODEL`) with a strict JSON-schema `analysisSpecResponseFormat` (line 404) → (c) `validateAnalysisSpec` (regex routing for unsupported sources) → (d) `aggregateSpec()` (line 1065) which fans out **2 + N count-metric × 2** `aggregate_meta_daily_insights` RPC calls in parallel → (e) for deep mode, `generateDeepAnalysis()` (line 1023) calls `gpt-5.5` with the compact rows + totals → (f) `persistAnalysis()` inserts to `ai_analysis_dashboards` + `ai_analysis_runs`.

2. **"Ask"** (POST `/api/chat`) calls `answerExecutiveChat()` in `src/lib/ai.ts:123`. Completely different pipeline: pulls the whole dashboard via `fetchDashboardData()` (a different code path that does NOT use `aggregate_meta_daily_insights` the same way), feeds `compactDashboard()` into chat completion. Router lives in `src/lib/ai-request-router.ts` but the chat route ignores intent — both "build a pivot" and "scale my best ads" go through the same chat function. The router is wired into the spec planner's logging only.

Rendering is split too. Chat answers render through `parseChatContent()` markdown parser in `ai-panel.tsx:861` (added by commit `87119f4`). Dashboard answers render through `AnalysisOutput` in `analysis-client.tsx:592`, with `hideDiagnostics` forced to `true` on `/analysis` (`ai-panel.tsx:744`).

## Existing QA skill findings

`.agents/skills/ask-ai-dashboard-qa/SKILL.md` + `references/rubric.md` already enumerate the failure modes the team knows about. Headline list from `rubric.md:57-65`:
- spec picks spend/CTR when user asked for primary KPI;
- chart shows up but table misses needed breakdown;
- weekly comparison requested → spec only has umbrella dimension;
- generic advice with no cited values;
- unsupported CRM/revenue/ROAS requests return fake/inferred output;
- runtime date range from the panel is ignored;
- follow-up edits drop existing date/filter context.

The QA harness (`scripts/run-dashboard-qa-suite.mjs`) and persona suite (`assets/persona-request-suite.json`) exist but there's no committed `latest/` results directory, and `git log` shows the suite has not been run against current code — failures listed in the rubric are aspirational, not empirically tracked.

## Concrete defects found

1. **Runtime context silently clobbers explicit dates.** `src/lib/ad-hoc-analytics.ts:1010-1014` — when `runtimeContext.dateRange.days` is non-zero (it's always 30 by default from `resolveAnalysisRouteDateRange` in `analysis-route.ts:15`), `applyRuntimeContext` overwrites the spec's `dateRange` with `{ days: 30 }`, erasing the planner's explicit `start: "2026-01-01"`. Persisted evidence: `ai_analysis_runs` row `d7f4ed61` ran the prompt "Vietnam ads Month by month since the beginning of this year" but `source_transparency.timeRange` is `{start: 2026-04-24, end: 2026-05-23, days: 30}`, not Jan–May. The saved spec has `dateRange: {start:"2026-01-01", preset:"custom"}` but the actual query was the last 30 days. **Severity: critical (rubric "runtime date range is ignored" — actually inverted).**

2. **Dashboard answer rendered as raw text.** `src/components/analysis-client.tsx:621` dumps `result.answer` (markdown from `gpt-5.5` with `##` headings, `-` bullets, pipe tables) into a single `<p>`. Commit `87119f4` added markdown parsing for chat in `ai-panel.tsx:861-953` but never wired it into `AnalysisOutput`. Persisted runs show deep answers up to 4,335 output tokens (run `56d77b81`) — that's an entire executive memo collapsed into one paragraph. **Severity: high (rubric "no concrete numbers visible" — they exist, just unreadable).**

3. **Diagnostics force-hidden on `/analysis`.** `ai-panel.tsx:744` passes `hideDiagnostics` to `AnalysisOutput`, suppressing `MetaStrip` and `AnalystDebugPanel` (`analysis-client.tsx:628-633`). Users can't see resolved date range, latest synced date, repaired-spec flag, source row count, or `assumptions` array. When defect #1 silently changes the date window, there is no visual indicator. **Severity: high.**

4. **Persisted run preview is empty.** `persistAnalysis()` at `ad-hoc-analytics.ts:2256-2260` writes only `{title, rowCount, widgets:[type]}` to `ai_analysis_runs.result_preview`. Confirmed via DB query: all 8 sampled rows have `validationStatus: undefined, answer: undefined, warnings: undefined, totals: []`. The `ai_analysis_runs` table is effectively useless for QA replay — you cannot reconstruct what the user saw without re-running the LLM. **Severity: medium (blocks the QA skill's `--repeat` reproducibility goal).**

5. **Brand glossary doesn't know Vietnam.** Persisted dashboard `554f2305` saved `filters: [{field:"brand", value:"Vietnam", operator:"equals"}]` for "Vietnam ads" prompt — but `meta_ad_accounts` brand codes are `HP`/`VVS`. `recordCounts: {matched_insights: 0}`. There is no brand alias table; `CAMPAIGN_GLOSSARY` (line 285) only covers umbrellas (Cash for Gold, Book Appts). LLM hallucinated a brand value that doesn't exist in the data, no validation caught it, and the user got an empty dashboard with no error. **Severity: high.**

6. **Inherits broken `aggregate_meta_daily_insights` RPC for historical windows.** All dashboards call the same RPC documented as broken in `docs/superpowers/spike/2026-05-23/track-1-rotten-rpcs.md:9-22` (429 mismatches across 3 historical windows) and timing out for year-long windows (`track-2-perf-audit.md:14-19`, 10s timeout for 2025-by-month). Recent dashboard `b4c95f73` ("Monthly spend… since January 1") executed across 142 days = within the timeout zone but in the discrepancy zone. Numbers shown to the user are silently wrong. **Severity: critical (compounds with defect #3 — no warning surfaced).**

7. **Chat surface duplicates dashboard surface with a different backend.** `/api/chat` (`src/lib/ai.ts:123`) and `/api/analysis` (`src/lib/ad-hoc-analytics.ts:642`) both answer free-form Meta-ads questions but use different data fetchers, different model defaults, different prompts, different rendering paths, and persist to different tables (`ai_chat_messages` vs `ai_analysis_runs`). `classifyCopilotRequest` in `ai-request-router.ts:15` exists to disambiguate intent but is only used cosmetically — it's returned in `ChatResult.modelUsed.routing` but never branches the work. A "build me a pivot" prompt sent to the chat surface returns prose; the same prompt to Build Analysis returns a dashboard. **Severity: medium (UX inconsistency, doubled maintenance surface).**

8. **Plan model drift between env and persistence.** `.env.local` sets `OPENAI_FAST_MODEL=gpt-5.4`, but recent persisted dashboards `725d8c6c` and `554f2305` ran on `model_plan: gpt-5.4-nano`. Either env was different at run time or there's an unaccounted override. **Severity: low (cost/quality drift, surface only).**

9. **Fast mode answer is mechanical filler.** `buildDeterministicAnswer()` (`ad-hoc-analytics.ts:2303`) is the fast-mode fallback: produces "Total spend was $X. Highest spend row: ...". No insight, no comparison, no recommendation — but the UI labels it the same as a deep answer. The rubric's "senior usefulness (20)" dimension scores zero on every fast-mode dashboard by design. **Severity: medium.**

10. **Pivot-table dimension count silently changes the LLM spec.** `normalizeSpec` (line 1313) re-derives dimensions when `tableLayout.type === "metric_rows_pivot"`, adding row+column dimensions even if the LLM had only one. This means a saved spec re-loaded later can have *different* dimensions than what was generated, without `repairedSpec` always flagging it (see persisted dashboard `b4e65942` — saved `dimensions: ["week","campaign_umbrella"]` which is the rewritten version, not the LLM's output). **Severity: low (subtle but breaks "exact reproducibility").**

## Sample of actually-persisted dashboards

DB query: `SELECT id,title,prompt,mode,spec,model_plan,model_analysis FROM ai_analysis_dashboards ORDER BY updated_at DESC LIMIT 10;`

| id | prompt | symptom |
|---|---|---|
| `554f2305` | "Vietnam ads Month by month since the beginning of this year" | spec has `filters:[brand=Vietnam]` — zero matches in data; run executed on last 30 days, not Jan→May. **Two defects (#1, #5) compounded into an empty dashboard.** |
| `725d8c6c` | "month-by-month performance and ad spend for Facebook VN product campaigns" | spec dropped `dateRange` entirely (`{}`), used `campaign_umbrella contains "VN Product"` (partial match works), but `model_plan: gpt-5.4-nano` (defect #8) returned 30-day window for a "monthly" prompt. |
| `b4c95f73` | "Since January 1, 2026, show month-by-month pacing…" | 142-day window queried correctly. Falls in **broken RPC zone** (track-1 finding). Numbers shown to user almost certainly silently wrong. No warning surfaced (defect #3 hides debug panel). |
| `b4e65942` | "pivot table … umbrella rows × week columns … spend" | Spec looks correct, but `metrics:["spend","primary_results"]` was injected by `normalizeSpec` even though prompt only asked for spend — fast-mode deterministic answer reports "Total spend" and ignores `primary_results` (rubric "spec picks more than asked"). |

`ai_analysis_runs.result_preview` for all 8 sampled rows: `{title, widgets:["table","line"], rowCount: N}`. No answer, no warnings, no validation status preserved.

## Diagnosis

The user's "messed up and not useful" is the additive sum of **all five layers being independently broken**:

- **(a) Data layer** is wrong for historical windows (Track 1 finding inherited verbatim) and slow/timeout-prone for year-long windows.
- **(b) Spec planner** hallucinates filter values not in the data dictionary (Vietnam brand) and silently has its date range overridden by URL defaults after the fact.
- **(c) Router** is decorative — same prompt routes to two different backends with different rendering.
- **(d) Rendering layer** is the most obvious-to-users defect: deep-mode markdown is dumped raw into one `<p>`, fast-mode answer is mechanical, and the diagnostic panel that would flag every other problem is force-hidden on `/analysis`.
- **(e) Persistence** drops the answer/warnings/totals so post-hoc QA is impossible.

The QA skill (`62ee65d`) exists but evidence-of-use is missing — the failure list in `references/rubric.md` reads like the team's pre-emptive hypothesis, not a measured regression suite. None of the recent firefighting commits (`87119f4`, `3724f11`, `c2719a2`, `d65a959`) added integration coverage that would have caught defects #1, #2, #3, or #5 on the user's actual `/analysis` route.

## Fix shape

In ascending order of effort:

1. **Defects #1, #3, #4** are 10-line surgical fixes: make `applyRuntimeContext` skip `days` when spec has an explicit `start`; remove the forced `hideDiagnostics` on `/analysis`; expand `result_preview` to include `answer`, `warnings`, `totals`, `validationStatus`.
2. **Defect #2**: lift `parseChatContent` out of `ai-panel.tsx` into a shared util, render `result.answer` with it in `AnalysisOutput` (1-day refactor + tests).
3. **Defect #5**: add a brand-alias map next to `CAMPAIGN_GLOSSARY` and validate `brand` filter values against `meta_ad_accounts.brand_code`. Reject (clarify) instead of querying with bogus values.
4. **Defect #7**: kill `/api/chat` or make it strictly a thin wrapper that routes by `classifyCopilotRequest`. Today it's parallel scaffolding.
5. **Defect #6 (the big one)**: depends on the RPC fix from Track 1. Until that lands, surface a banner on every dashboard whose `range.days > 60` ("historical accuracy unverified — see ops").
6. **Defect #9**: have fast-mode call a cheaper LLM (gpt-4.1-mini) for the narrative summary, instead of the deterministic template. Cost is bounded and the rubric's "senior usefulness" jumps from 0 to ~10.

## How this affects the rebuild decision

This pushes toward **C-scope with one targeted addition**, not B. The five layers are independently broken but every one is locally fixable — none requires a structural rewrite of how `/analysis` exists. The biggest leverage point is shared with the central reliability fix (RPC repair) plus a UI/persistence pass that's <1 week of focused work. The one B-shaped argument is defect #7 (chat vs build duplication) — if the team also wants a unified copilot surface, that's a 2–4 week refactor that could be folded into C. Recommendation: roll the surgical fixes into the existing C plan, defer the chat/build unification to a follow-up.
