# Ask AI Dashboard QA Rubric

## Pass Bar

Pass only when:

- Score is at least `90`.
- Critical failures count is `0`.
- Every required widget/table/chart is present.
- Generated dashboard is useful enough that a senior ads analyst would not need to rebuild it from scratch.

## Critical Failures

Any critical failure fails the test regardless of score:

- Wrong status: expected `ready` but got `unsupported` or `needs_clarification`, or expected unsupported but returned ready.
- Missing required table/chart/widget.
- Missing required metric, dimension, filter, or date range.
- Empty table when the request requires rows.
- Unsupported CRM/website/social-inbox/revenue/ROAS request is answered as if supported.
- Source transparency missing for a ready dashboard.
- Runtime context filters/date range are ignored.
- Saved-dashboard edit drops prior required context without being asked.

## Scoring Dimensions

Total deterministic score: 100.

- Request fit (25): correct metrics, dimensions, filters, date range, sort, grain, and table layout.
- Output completeness (25): required widgets, chart types, table columns, table row count, saved/edit output.
- Data trust (20): source transparency, analyst debug, resolved date range, record counts, no unsupported hallucination.
- Senior usefulness (20): answer contains concrete numbers, comparison/baseline, entity names, root-cause language, and action recommendations.
- Edge-case handling (10): clear unsupported response, no vague filler, no false ROAS/revenue claims, no overbroad defaults.

LLM judge score is advisory unless the user asks to make it gating. Use it to identify gaps deterministic rules miss: weak insight, missing business context, no prioritization, and no next action.

## Senior Analyst Quality

A useful dashboard should:

- Answer the business question directly before showing generic metrics.
- Pick the most relevant segmentation: umbrella, campaign, ad set, ad, creative, or time grain.
- Include table and chart forms that help the request, not decorative widgets.
- Surface winners, losers, deltas, anomalies, and what changed.
- Explain likely causes without pretending certainty beyond the data.
- Include at least one concrete action: scale, pause, inspect, shift budget, refresh creative, monitor, or ask for missing data.
- State unsupported sources honestly.

## Persona Expectations

- Analyst: wants diagnostic depth, drilldowns, anomalies, exact metrics, and source transparency.
- Manager: wants priority, decision, budget movement, risk, and brief executive summary.
- Sales lead: wants bookings, appointment quality proxies, customer/outcome caveats, and no fake revenue claims.
- Marketing: wants creative/campaign messaging insight, winner/loser patterns, audience/offer hypotheses, and next creative tests.

## Common Failure Patterns

- Spec chooses spend/CTR only when user asked for business result or primary KPI.
- Chart appears but table misses the breakdown needed to act.
- Prompt asks for weekly comparison but dimensions are only campaign umbrella.
- Dashboard answers with generic advice and no cited values.
- Unsupported CRM/revenue/ROAS request gets fake or inferred output.
- Runtime date range from Optimize panel is ignored.
- Follow-up edit adds widget but drops existing date/filter context.
