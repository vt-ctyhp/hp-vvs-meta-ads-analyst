# Ask AI Natural-Language Robustness PRD

| Field | Value |
| --- | --- |
| Status | Draft ready for implementation breakdown |
| Owner | viv |
| Date | 2026-05-26 |
| Scope | Make Ask AI answer natural-language Meta Ads questions more robustly |
| Target surface | `/analysis` Ask AI |
| Release shape | Incremental vertical slices behind governed validation |

## Problem Statement

Ask AI can generate useful structured dashboards for some explicit prompts, but it still behaves like a dashboard-spec parser instead of a senior analyst. Users ask normal business questions like "why did performance drop?", "what should I turn off this week?", "did HP improve compared with VVS?", or "show April spend by campaign group." The current planner can miss the real intent, treat calendar dates as rolling windows, flatten comparisons into one filtered query, and answer decision questions with generic totals.

The result is a trust gap. The system may return valid Meta Ads numbers, but it does not always answer the question the user asked. It needs stronger natural-language interpretation while preserving the core safety rule: AI can interpret and write, but governed code validates data boundaries and computes every number.

## Solution

Add a hybrid governed natural-language planner to Ask AI. In production, every new prompt is converted into a strict structured intent by an LLM that only sees the governed Meta Ads schema, allowed values, and interpretation rules. The existing deterministic planner remains as a fallback for missing API keys, malformed planner JSON, tests, and low-risk simple prompts.

The structured intent includes both query fields and a higher-level `questionType`. The first supported question types are:

1. `leaderboard`: top or bottom entities by a metric.
2. `trend`: one or more metrics over time.
3. `comparison`: entity-vs-entity or period-vs-period comparison.
4. `diagnosis`: "why changed/dropped/improved?" questions using computed deltas and driver facts.
5. `recommendation`: "what should I scale/pause/fix?" questions using governed advisory heuristics.

The semantic validator remains the safety boundary. It blocks unsupported data such as revenue, ROAS, CRM, staff, website, and social inbox analysis. It repairs obvious safe aliases, asks for clarification only when ambiguity changes the meaning of the answer, and otherwise answers with visible assumptions.

The fact engine expands from basic totals/ranks into question-type-specific fact packs. Code computes totals, comparisons, deltas, top movers, high-spend/low-result waste, low-spend/high-result opportunities, and fatigue signals. LLM prose is allowed only after facts exist, and numeric grounding continues to block uncited numbers.

## User Stories

1. As a marketing analyst, I want to ask normal business questions, so that I do not need to phrase prompts like a dashboard schema.
2. As a marketing analyst, I want "top", "best", "worst", and "lowest" questions to resolve to the right grain and metric, so that leaderboards match my intent.
3. As a marketing analyst, I want trend questions to choose a time grain automatically, so that I can see performance movement over time.
4. As a marketing analyst, I want "HP vs VVS" questions to produce a true side-by-side comparison, so that filters do not collapse the answer into one scope.
5. As a marketing analyst, I want "this week vs last week" questions to compare two explicit periods, so that deltas are meaningful.
6. As a marketing analyst, I want "why did performance drop?" questions to compute what changed and where, so that diagnosis is based on evidence.
7. As a marketing analyst, I want likely drivers labeled as hypotheses, so that the system does not overclaim causality.
8. As a marketing analyst, I want "what should I pause?" questions to use governed waste signals, so that recommendations are actionable but not arbitrary.
9. As a marketing analyst, I want "what should I scale?" questions to use governed opportunity signals, so that recommendations show evidence.
10. As a marketing analyst, I want "performance" to mean a bundle of primary KPI, spend, and efficiency metrics, so that Ask AI does not rank only by spend.
11. As a marketing analyst, I want primary KPI caveats visible when mixed campaign groups are compared, so that blended proxy metrics are not mistaken for final outcomes.
12. As a manager, I want recommendations to remain advisory, so that Ask AI never claims it changed Meta campaigns.
13. As a manager, I want short executive answers with source notes, so that I can trust the answer quickly.
14. As a user, I want unsupported mixed requests to block instead of silently substituting proxies, so that a ROAS question does not become a spend answer.
15. As a user, I want a supported rewrite suggestion when a request is blocked, so that I know how to ask a valid Meta Ads question.
16. As a user, I want April, Q1, since May 1, and last month to resolve predictably, so that calendar language does not become rolling 30 days.
17. As a user, I want "last month" to mean the previous complete calendar month, so that common business reporting language matches expectations.
18. As a user, I want "past month" and "trailing month" to mean rolling 30 days, so that rolling-window language still works.
19. As a user, I want exact quoted entity names to become text filters, so that I can ask about a named campaign, ad set, ad, or creative.
20. As a user, I want unquoted generic entity phrases to clarify or stay broad, so that normal words are not mistaken for campaign names.
21. As a user, I want visible assumptions when Ask AI chooses defaults, so that I know what date, metric, and grouping were used.
22. As a user, I want clarification only for risky ambiguity, so that simple questions do not get blocked.
23. As a developer, I want the LLM planner constrained by an explicit intent schema, so that planner output is testable and safe to validate.
24. As a developer, I want deterministic fallback planning, so that tests and local development do not require OpenAI.
25. As a developer, I want question-type-specific tests, so that regressions in natural-language behavior are caught before release.
26. As a developer, I want numeric claim grounding on generated prose, so that no answer can invent numbers.
27. As a developer, I want persona QA prompts for analyst, manager, marketing, and edge cases, so that useful natural-language coverage is a release gate.

## Implementation Decisions

- Use a hybrid planner. Production prompts use an LLM to produce strict structured JSON; deterministic parsing remains as fallback.
- The LLM planner outputs query fields plus `questionType`. Query fields alone are too flat for diagnosis and recommendations.
- The first supported question types are `leaderboard`, `trend`, `comparison`, `diagnosis`, and `recommendation`.
- Defer `distribution`, `forecast`, hard causal attribution, and custom cohort analysis.
- The planner must only see governed Meta Ads schema, aliases, supported filter values, date semantics, and output schema. It must not see raw rows.
- The semantic validator remains authoritative. It can repair safe aliases and chart layouts, but it blocks unsupported metrics, dimensions, filters, sources, and mixed unsupported requests.
- Every unsupported mixed request blocks as a whole. The response should offer supported rewrites such as spend, primary KPI, CPL, CTR, or messaging contacts by campaign.
- "Performance" defaults to a metric bundle: primary KPI, spend, and an efficiency metric when the intent makes one clear. It must not mean highest spend only.
- Calendar language is strict. "Last month" means the previous complete calendar month. "Past month", "recent month", and "trailing month" mean rolling 30 days. "Month to date" means current month start through the latest synced Meta Ads date.
- Exact dates must be supported for "since/from/starting May 1", "April", "April 2026", and quarter phrases such as "Q1 2026".
- Clarification is required only when ambiguity changes answer meaning: unclear performance metric, unclear entity grain, ambiguous exact business period, or risky advisory action.
- Most defaults should answer with visible assumptions: no date means latest 30 synced days, no metric means the performance bundle, and no grouping means campaign group.
- Comparison plans need explicit scopes. Period-vs-period and entity-vs-entity comparisons should not be modeled as one flat filter set.
- Diagnosis fact packs must compute what changed, where the change concentrated, which metrics moved together, and which caveats apply.
- Diagnosis prose must use "likely drivers" or "signals" language. It must not claim hard causality.
- Recommendation fact packs must compute advisory signals such as high spend with low results, high CPL, falling CTR, rising frequency, and low-spend/high-result opportunity.
- Recommendations are human decision advice only. Ask AI may say "consider scaling", "review", "pause candidate", or "shift budget", but it must never claim to perform Meta mutations.
- Named campaign, ad set, ad, and creative filters are supported when the user quotes text or says "named", "containing", or "includes". Broad unquoted phrases should not be guessed as entity filters.
- LLM narrative may write the final human answer only from computed fact packs and source notes.
- Numeric claim grounding remains mandatory. Any uncited number blocks the generated answer.
- Source notes must show data source, date range, filters, grouping, row counts, latest sync basis, assumptions, and caveats.

## Testing Decisions

- Tests should focus on external behavior: prompt plus context in, structured intent, query plan, fact pack, answer shape, source notes, and validation result out.
- Planner tests should cover common natural-language structures for all five question types.
- Date tests should cover calendar periods, rolling windows, since/from dates, quarter phrases, month-to-date, and clarification cases.
- Comparison tests should verify distinct scopes, side-by-side totals, deltas, percent deltas, and winner labels.
- Diagnosis tests should verify driver facts, source notes, caveats, and no hard causality.
- Recommendation tests should verify advisory language, no mutation claims, and evidence for every suggested action.
- Unsupported-boundary tests should verify mixed unsupported requests block as a whole and include supported rewrite suggestions.
- Named-entity tests should verify quoted and "containing" filters work while generic unquoted phrases do not become unsafe filters.
- Narrative tests should scan generated prose so every numeric claim maps to computed facts or source notes.
- API tests should exercise the `/analysis` path with production-like request bodies and saved-run previews.
- UI or browser tests should verify assumptions, clarifications, unsupported rewrites, source notes, and advisory labels render clearly.
- Persona QA should include analyst, manager, marketing, and edge-case prompts. Release requires no critical unsupported-data answers and no uncited numbers.

## Out of Scope

- No custom SQL or arbitrary user formulas.
- No direct Meta Ads mutations.
- No revenue, ROAS, CRM, staff, website, or social inbox facts until those sources have governed semantic support.
- No forecast, budget simulator, or causal attribution proof.
- No migration of legacy saved dashboards in this PRD.
- No broad redesign of Optimize, Convert, Operate, or Inbox.
- No manual BI builder beyond controlled Ask AI planning and generated visuals.

## Further Notes

- Current Ask AI already has useful precedent: AI can produce a strict JSON spec that is normalized, validated, aggregated through governed Meta Ads data, and optionally interpreted by a deeper model.
- The missing layer is analyst intent. Robust natural language needs question type, comparison scopes, explicit date semantics, and fact packs that match decision questions.
- The safest implementation path is incremental. Ship one vertical slice per question type or guardrail, with deterministic tests before UI polish.
