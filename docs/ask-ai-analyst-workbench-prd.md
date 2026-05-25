# Ask AI Analyst Workbench PRD

| Field | Value |
| --- | --- |
| Status | Draft for approval |
| Owner | viv |
| Date | 2026-05-25 |
| Scope | Big-bang rewrite of Ask AI analysis |
| Target route | `/analysis` |
| Release shape | Replace legacy Ask/Build analysis system after MVP passes QA gate |

## Problem Statement

The current Ask AI page is not intuitive and does not produce analysis that a real data analyst would trust or use in a management presentation. The experience splits the user between text answers and dashboard generation, and those two paths do not share one reliable model of data, planning, rendering, or saved history. The result feels like AI slop: generic prose, weak tables, limited chart types, hidden assumptions, and outputs that often miss the actual decision a user needs to make.

The current system also cannot express the analyst workflow the product needs. It only supports a narrow widget set, has limited pivot capability, lacks many standard analyst visualizations, and does not enforce a strong contract that every number and insight must come from governed data. Users need to ask a business question, get a direct text answer with evidence, quickly scan useful visual cards, and promote the work into a durable dashboard packet when the answer needs deeper analysis or management sharing.

## Solution

Rewrite the Ask AI analysis surface as a chat-led analyst workbench. The user starts with a natural-language question, chooses an output mode, and receives an answer generated through one governed analysis engine. The same engine powers text-only answers, visual answer cards, and full dashboard packets.

The default mode is **Answer + visuals**. The page also offers **Answer only** and **Full dashboard** through a segmented selector with hover help explaining exactly what each mode produces. There is one submit path, not separate Ask and Build buttons.

Every mode must use the same semantic layer, planner, query executor, deterministic fact engine, validator, and persistence model. AI may interpret the user request and write narrative, but code computes metrics, deltas, ranks, outliers, correlations, source notes, and insight facts. Every answer is saved as a durable analysis run that can be reopened, rerun, promoted to dashboard, and exported in later phases.

This is a big-bang rewrite. The legacy Ask/Build analysis design is replaced rather than patched. Old saved dashboards are deleted as part of cutover, and old Ask AI analysis chat/history is deleted only for the legacy analysis surface. Destructive data migrations must be explicitly approved before being applied to any shared or production database.

## User Stories

1. As a marketing analyst, I want to ask a plain-English performance question, so that I can start analysis without manually building a report first.
2. As a marketing analyst, I want the default response to include a text answer and key visuals, so that I can understand the data quickly.
3. As a marketing analyst, I want an answer-only mode, so that I can get a fast cited answer without charts.
4. As a marketing analyst, I want a full-dashboard mode, so that I can create a reusable analysis packet for deeper work.
5. As a user, I want hover help for each output mode, so that I know what will be generated before I submit.
6. As a user, I want one submit action, so that I do not have to choose between unclear Ask and Build paths.
7. As a user, I want follow-up questions to inherit visible context, so that I can refine an analysis without restating date ranges and filters.
8. As a user, I want inherited context shown as removable chips, so that I can see and change what the follow-up will use.
9. As a user, I want the system to clarify only risky ambiguity, so that simple questions do not get blocked unnecessarily.
10. As a user, I want visible assumptions when the system chooses defaults, so that I understand what was assumed.
11. As a user, I want source notes on every answer, so that I know the date range, filters, latest sync, and row counts behind the answer.
12. As a user, I want unsupported requests blocked with useful reasons, so that the app does not invent CRM, revenue, ROAS, staff, or website data.
13. As a user, I want the system to repair obvious chart requests, so that small prompt issues do not cause failure.
14. As a user, I want incompatible chart requests blocked with suggested fixes, so that I understand how to ask a valid question.
15. As a user, I want every answer to cite concrete values, so that I can trust the narrative.
16. As a user, I want every insight to name specific entities, so that recommendations are actionable.
17. As a user, I want every insight to include a comparison baseline, so that I can judge whether a result is good or bad.
18. As a user, I want likely drivers labeled as hypotheses, so that the AI does not overclaim certainty.
19. As a user, I want caveats when a metric is a leading proxy, so that I do not confuse messages or bookings with final sales outcome.
20. As a manager, I want text answers with a short executive summary, so that I can quickly see what changed and what matters.
21. As a manager, I want charts and tables that match the question, so that visuals clarify decisions rather than decorate the page.
22. As a manager, I want saved analysis runs, so that I can reopen the exact analysis later.
23. As a manager, I want durable saved data snapshots, so that management can see the same answer later even if live data changes.
24. As a manager, I want a full dashboard packet when needed, so that I can turn analysis into a presentation-ready view.
25. As a future presenter, I want PDF report export, so that I can share a management-ready analysis outside the app.
26. As an analyst, I want CSV export for tables, so that I can continue work in spreadsheets when needed.
27. As an analyst, I want PNG export for charts, so that I can reuse visuals in reports.
28. As an analyst, I want sortable tables, so that I can inspect winners and losers.
29. As an analyst, I want pivot tables, so that I can compare metrics across rows and columns like a real analysis workflow.
30. As an analyst, I want bar charts, so that I can compare entities such as campaigns, groups, ads, and creatives.
31. As an analyst, I want line charts, so that I can understand trends over time.
32. As an analyst, I want scatter charts, so that I can compare relationships such as spend versus cost per result by entity.
33. As an analyst, I want heatmaps, so that I can scan intersections across time and entity groups.
34. As an analyst, I want histograms, so that I can understand distribution of performance metrics.
35. As an analyst, I want waterfall charts, so that I can understand what contributed to a change.
36. As an analyst, I want metric cards, so that headline totals and deltas are easy to read.
37. As an analyst, I want flat tables, so that standard breakdowns and leaderboards are clear.
38. As an analyst, I want chart compatibility rules, so that the app does not render invalid or misleading visuals.
39. As an analyst, I want automatic visual selection, so that the system picks useful analyst visuals when I do not name a chart type.
40. As an analyst, I want explicit chart requests honored, so that I can ask for a specific visualization when I know what I need.
41. As an analyst, I want primary KPI labels to be explicit, so that I know which underlying metric is being used.
42. As an analyst, I want umbrella-specific KPI mapping, so that Book Appointments and product campaigns can use different meaningful result metrics.
43. As an analyst, I want blended primary KPI caveats, so that mixed units are never presented as a clean business outcome.
44. As an analyst, I want governed metric definitions, so that AI cannot invent unsupported fields.
45. As an analyst, I want governed dimension definitions, so that filters such as brand or campaign group cannot be hallucinated.
46. As an analyst, I want brand aliases and campaign group concepts validated, so that invalid filters do not silently produce empty dashboards.
47. As an analyst, I want the system to block empty required tables, so that a bad query is not presented as a useful answer.
48. As an analyst, I want query facts computed in code, so that numbers are deterministic and testable.
49. As an analyst, I want AI narrative generated only from computed facts, so that prose cannot invent evidence.
50. As an analyst, I want saved runs to show what was inherited versus changed in a follow-up, so that analysis history is explainable.
51. As an analyst, I want rerun controls, so that I can update an old analysis against the latest synced data.
52. As an analyst, I want promote-to-dashboard controls, so that a quick answer can become a durable dashboard without starting over.
53. As an analyst, I want controlled edits over governed objects, so that I can adjust date, filters, metrics, chart type, sorting, and titles safely.
54. As an analyst, I want to hide or pin insights, so that a dashboard focuses on what matters.
55. As an analyst, I want source health visible, so that stale syncs or low row counts are obvious.
56. As a stakeholder, I want management-ready dashboards to include answer, evidence, visuals, actions, and caveats, so that reports are useful without rebuilding.
57. As a stakeholder, I want old low-trust dashboards removed at cutover, so that legacy slop does not linger in the product.
58. As an admin, I want destructive deletion explicitly approved before production migration, so that old data is not removed accidentally.
59. As a developer, I want the new engine broken into deep testable modules, so that planner, query, facts, validation, and rendering can evolve independently.
60. As a developer, I want deterministic QA gates, so that the feature cannot ship if generated analysis falls below the no-slop bar.

## Implementation Decisions

- The rewrite is a big-bang replacement of the legacy Ask/Build analysis system. The new work replaces the old surface rather than keeping two user-facing implementations.
- The primary UX is chat-led analysis. Chat is the thinking path; dashboards are the durable presentation/workbench path.
- Output mode is a segmented selector with three mutually exclusive modes: **Answer only**, **Answer + visuals**, and **Full dashboard**.
- The default output mode is **Answer + visuals**.
- Each output mode includes a hover help icon with concrete descriptions:
  - **Answer only:** text answer with cited numbers, assumptions, and no charts.
  - **Answer + visuals:** text answer plus key chart/table cards for quick understanding.
  - **Full dashboard:** saved dashboard packet with editable charts, pivot tables, exports, and source notes.
- Every assistant response is an analysis run. A run stores prompt, output mode, interpreted intent, inherited context, query plan, computed facts, text answer, visual cards, source notes, validation results, and optional dashboard packet.
- Follow-up prompts inherit the previous run's date, filter, entity, metric, and grouping context. The UI shows inherited context chips that can be removed before submitting.
- All output modes use one governed data engine. Text-only answers do not use a loose chat path.
- The data boundary for v1 is governed Meta Ads data. Outcome data can be added later only behind explicit data-quality gates. Revenue, ROAS, CRM, social inbox, staff, and website analysis must not be answered as facts until their semantic layer support exists.
- The semantic layer is fixed and governed. It defines approved metrics, dimensions, filters, date grains, aliases, calculation rules, KPI mappings, visualization compatibility, and unsupported data boundaries.
- AI plans and interprets, but deterministic code computes all metrics, deltas, ranks, outliers, correlations, row counts, and insight facts.
- AI narrative must be generated only from computed fact objects. The narrative layer must not receive permission to invent numbers or unsupported fields.
- Primary KPI remains umbrella-specific. The semantic layer must make the mapping explicit and user-facing labels must explain the underlying metric.
- The planner is multi-stage: intent interpretation, data-boundary validation, governed query planning, visual-object planning, deterministic fact computation, narrative generation from facts, and final packet validation.
- The validator blocks critical failures and warns on quality risks. Critical failures include unsupported data answered as fact, invalid metric/dimension/filter, impossible chart, empty required table, missing date range, missing source transparency, or insight without evidence.
- Visual objects are first-class objects, not free-form prose. The full governed set includes metric cards, flat tables, pivot tables, bar charts, stacked bar charts, line charts, area charts, scatter charts, heatmaps, histograms, waterfall charts, insight summaries, and source notes.
- MVP visual objects are metric cards, flat tables, pivot tables, bar charts, line charts, and scatter charts.
- Full dashboard packets include a direct answer, primary evidence table, useful visuals, winners/losers/anomalies, next actions, assumptions, caveats, source notes, and export affordances.
- Chart selection is automatic by default but explicit user chart requests are honored when compatible.
- Incompatible chart requests are auto-repaired when the repair is obvious. Otherwise the system blocks the output and suggests a valid fix.
- Tables and dashboards allow controlled edits only in v1: date/filter changes, add/remove metrics, compatible chart-type swaps, sort, limit, object rename, insight pin/hide, and export.
- Full manual BI editing, custom formulas, and custom SQL are not part of v1.
- Recharts remains the standard chart renderer for common charts. Custom components handle pivot tables, advanced tables, and heatmaps.
- Export target order is PDF report, per-table CSV, and per-chart PNG. These are required for the larger product direction, but not required in the MVP vertical slice.
- Old saved dashboards are deleted at cutover instead of migrated.
- Old Ask AI analysis chat/history is deleted only for the legacy analysis surface. Unrelated app chat or messaging history must not be deleted.
- Destructive migrations must be written so they are reviewable, reversible where possible, and never applied to production without explicit approval.
- The first implementation milestone is an MVP vertical slice: one prompt creates one durable analysis run with text answer, visual cards, source notes, validation, saved/reopen, and rerun.

### Planned Deep Modules

- **Semantic catalog:** exposes the approved data model: metrics, dimensions, filters, grains, aliases, KPI rules, supported sources, unsupported boundaries, and chart compatibility.
- **Intent planner:** converts user prompt plus visible context into a structured analysis intent without executing queries.
- **Query planner:** turns a validated intent into governed aggregate requests and table shapes.
- **Fact engine:** computes totals, deltas, ranks, winners, losers, anomalies, correlations, baselines, caveats, and citation-ready facts from query results.
- **Visual planner:** selects compatible visual objects and table layouts from intent plus facts.
- **Validator:** blocks critical failures and returns user-facing repair suggestions, assumptions, warnings, and QA signals.
- **Narrative composer:** writes answer text only from computed facts, with citations and caveats.
- **Analysis run repository:** persists runs, snapshots, object specs, source notes, validation results, and run lineage.
- **Workbench renderer:** renders chat answers, visual cards, dashboard packets, context chips, object inspector, saved run history, and controlled edits.
- **Legacy cleanup migrator:** removes legacy analysis dashboards and legacy Ask AI analysis history at cutover with explicit approval.
- **Export service:** creates PDF reports, table CSVs, and chart PNGs after the MVP slice is stable.

## Testing Decisions

- Tests should verify external behavior and data contracts, not implementation details. A good test asks: given a prompt, context, and fixture data, does the system produce the right status, facts, answer shape, visual objects, source notes, and validation result?
- The semantic catalog must have unit tests for metric definitions, dimension definitions, KPI mappings, aliases, unsupported boundaries, and chart compatibility.
- The intent planner must have prompt-to-intent tests for analyst, manager, marketing, and edge-case requests.
- The query planner must have tests proving only governed fields are used and invalid filter values are rejected or repaired.
- The fact engine must have deterministic fixture tests for totals, deltas, ranks, anomalies, correlations, and zero/empty-row cases.
- The visual planner must have compatibility tests for pivot, bar, line, scatter, and invalid chart requests.
- The validator must have tests for every critical failure: unsupported source, invalid field, impossible chart, empty required table, missing source notes, and ungrounded insight.
- The narrative composer must be tested with numeric-claim scanning so every number in the answer maps to computed facts.
- The analysis-run repository must have integration tests for save, reopen, rerun, promote-to-dashboard, and follow-up context inheritance.
- The UI must have browser tests for output-mode selection, tooltip copy, prompt submit, answer rendering, visual card rendering, context chips, saved/reopen, and source notes.
- The existing Ask AI dashboard QA skill and persona suite are the release gate. Passing requires score at least 90, zero critical failures, and all required widgets/tables/charts present.
- The Meta Ads data-accuracy test playbook remains relevant for validating source truth and preventing unsupported numeric claims.
- Prior test patterns already exist for analysis route behavior, ad-hoc analytics planning, pivot-by-period data, dashboard query concurrency, Meta insight aggregates, and end-to-end data truth. The rewrite should reuse the same style: small deterministic tests around pure modules plus targeted API/browser verification for the page.

## Out of Scope

- No full manual BI builder in v1.
- No custom SQL or arbitrary formulas in v1.
- No CRM, revenue, ROAS, social inbox, staff, or website analytics answers until those sources have governed semantic-layer support and data-quality gates.
- No automatic migration of old saved dashboards.
- No preservation of old legacy analysis chat/history.
- No broad chart set in the MVP beyond metric cards, flat tables, pivot tables, bar charts, line charts, and scatter charts.
- No PDF/PNG export in the MVP vertical slice, though export is part of the larger product target immediately after MVP.
- No sales outcome attribution expansion in this PRD.
- No unrelated redesign of Optimize, Convert, Operate, or other app rooms.

## Further Notes

- Current code findings show the existing analysis system is structurally limited, not merely under-prompted. The legacy schema only permits a small widget set and the UI splits text answers from dashboard generation. The rewrite should not attempt to stretch that model.
- The product standard is "not AI slop." A run fails that standard if it answers unsupported data as fact, uses uncited numbers, omits source notes, produces decorative visuals, hides assumptions, or gives generic recommendations without entity names and metric evidence.
- MVP success means a user can ask one useful Meta Ads question, receive a trustworthy text answer plus useful visual cards, save/reopen/rerun the analysis run, and pass the QA persona gate.
- Cutover requires a separate destructive migration approval because old saved dashboards and legacy Ask AI analysis history are intentionally removed.
