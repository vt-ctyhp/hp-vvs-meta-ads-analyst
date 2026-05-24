# Rebuild recommendation

_v1 completed: 2026-05-23 17:45 PDT — initial recommendation based on Tracks 1-3._
_v2 completed: 2026-05-23 19:30 PDT — updated after Track 4 (user pushback on UX, Ask AI, and code hygiene)._
_**v3 completed: 2026-05-23 22:00 PDT — superseded after Phase 1 diagnostic invalidated the spike's primary finding.**_

**Spike outputs:**
- [Track 1 reconciliation](track-1-reconciliation.md) — with invalidation banner
- [Track 1 rotten RPCs](track-1-rotten-rpcs.md) — finding #1 invalidated
- [Track 2 perf audit](track-2-perf-audit.md) — still valid
- [Track 3 stack risk](track-3-stack-risk.md) — still valid (stack exonerated)
- [Track 4a /convert visitor bug](track-4a-convert-visitor-bug.md) — still valid
- [Track 4b Ask AI quality](track-4b-ask-ai-quality.md) — layer 1 invalidated, layers 2-5 still valid
- [Track 4c dead code](track-4c-dead-code.md) — still valid
- [Phase 1 diagnostic](../../plans/2026-05-23-phase-1-execution/01-diagnostic.md) — the invalidating evidence
- [Post-fix verification](../../plans/2026-05-23-phase-1-execution/post-fix-verification/) — all-PASS reconciliation runs after the audit-tool fix

---

## TL;DR — v3

**Recommendation: tightest D-scope (2-3 weeks) or loose C-scope (3-4 weeks). NOT a full rebuild. NOT even a data-layer rebuild.**

The spike's primary finding (broken historical RPC) was a false positive caused by a pagination bug in the audit tool itself. After fixing the audit tool, the `aggregate_meta_daily_insights` RPC and all historical /analyst data are confirmed correct. The remaining real issues are concrete, small in aggregate, and independent of each other.

The user's original concerns map to fixable defects:
- **"Data feels wrong"** → was actually mostly correct; the audit tool was misleading. Real residual: /convert loader (visitor display) + ingestion NULLs (visitor_id, visit_date_time)
- **"Things are slow"** → real, but localized to `meta_daily_insights` index gaps that trigger statement timeouts for full-year queries (~1-2 days of index work)
- **"Things break when I add features"** → 0% framework-attributable; the firefighting is in domain logic (attribution, funnel, env-scoping). The recent fixes were chasing the audit-tool false positive.

---

## What changed from v2 to v3

| Spike finding | v2 status | v3 status | Effect on scope |
|---|---|---|---|
| /analyst RPC historical-window correctness | 🔴 broken, 429 mismatches | 🟢 **INVALIDATED** — RPC is correct | Removes 1-2 weeks of "Phase 1 RPC rewrite" |
| /analyst perf (full-year statement timeouts) | 🔴 slow | 🔴 slow — still real, now isolated as the only RPC issue | Replaces "rewrite" with "add indexes" (~1-2 days) |
| Ask AI layer 1 (inherits broken RPC) | 🔴 | 🟢 **INVALIDATED** | Saves ~1-2 days of work in Ask AI fix |
| Ask AI layers 2-5 | 🔴 | 🔴 still real | Unchanged |
| /convert visitor loader | 🔴 | 🔴 still real | Unchanged |
| Ingestion NULLs (visitor_id, visit_date_time) | 🔴 | 🔴 still real | Unchanged |
| Stack stability tax | 🟢 0% | 🟢 0% | Unchanged |
| 30% placeholder migrations | 🟡 | 🟡 still real | Unchanged |
| ~10K dead LOC | 🟡 cleanly separable | 🟡 cleanly separable | Unchanged |

**Net: rebuild scope shrinks from 5-8 weeks (v2 C) to 2-4 weeks (v3 D or loose C).**

---

## Decision matrix (v3)

| Concern | Finding | Implication | Cost |
|---|---|---|---|
| Data accuracy | /analyst correct for every tested window. Audit tool fixed. Real residual: /convert loader bug, website_conversions 50% NULL visitor_id, appointment_events 5.6% NULL visit_date_time. | Targeted bug fixes only. No rebuild. | /convert: 1-2 days. Each ingestion fix: 3-5 days. |
| Performance | RPC statement-timeouts for full-year queries (>10s). All other windows fast. | Add indexes on `meta_daily_insights` aligned with the env+date join pattern. | 1-2 days. |
| Stack stability | 0% of recent fixes attributable to framework. | Stay on bleeding-edge. | 0. |
| Ask AI quality | 4 layers of breakage (planner override, router duplication, render `<p>` dump, persistence drops). Layer 1 invalidated. | Targeted fixes. | 4-5 days. |
| Schema-as-code | 30% placeholder migrations. | Reconstruct from prod. | 1 week. Optional. |
| Dead code | ~10K LOC cleanly separable. | Delete-by-grep. | 1-2 sprints. Optional. |

---

## Decision rules (re-applied with v3 evidence)

From the spec's §Synthesis:
- _"If Track 1 finds ≥1 red discrepancy caused by 'wrong schema or fundamentally broken model' → escalate to B or A"_ → **No.** No red discrepancies remain after audit-tool fix.
- _"If Track 1 reds are all caused by RPCs/rollup logic, not schema → C"_ → **No more reds in this category.**
- _"If Track 1 finds only green/yellow and Track 2 shows perf is fixable → D"_ → **YES.** This is the matching condition now.
- _"Track 3's stack-tax modifies any answer (if >25%, include stack downgrade in scope)"_ → 0%, no downgrade.
- v2 addendum: _"If dead-code entanglement requires more cleanup effort than rewriting → escalate to B"_ → **No.** Cleanly separable.

**Result: D is now the rule-driven answer.** Optional escalation to "loose C" if you want the dead-code cleanup and schema-as-code reconstruction included.

---

## Recommended scope

### D-scope (tightest, ~2-3 weeks)
Bare-minimum to address the real defects:

1. **Add `meta_daily_insights` indexes** (~1-2 days)
   Eliminates the full-year statement timeouts. Likely candidates: `(environment, date_start, campaign_id)` covering index, possibly `(brand_id, environment, date_start)` and `(meta_account_id, environment, date_start)`. Profile with EXPLAIN ANALYZE first.

2. **Invert /convert loader to be visitor-keyed** (~1-2 days)
   Per Track 4a. Replace the appointment-keyed structure in `src/lib/customer-journey-ledger.ts` with a visitor-first union approach. Update the table columns to render meaningfully per row type.

3. **Fix Ask AI 4 layers** (~4-5 days)
   - Unhide diagnostic panel on /analysis (1 line)
   - Fix `applyRuntimeContext` silent date override
   - Constrain spec planner to filter values that actually exist in the data
   - Consolidate `/api/chat` and `/api/analysis` to one backend
   - Port the chat-side markdown render fix to dashboards
   - Stop dropping diagnostic fields in `ai_analysis_runs.result_preview`

4. **Fix `website_conversions` NULL visitor_id ingestion** (~3-5 days)
   Investigate `/api/website/conversions` route. Add write-side validation or fallback identifier resolution.

5. **Fix `appointment_events` NULL visit_date_time ingestion** (~3-5 days)
   Audit the Acuity webhook path. Either backfill the existing NULLs or block-at-ingest.

### Loose C-scope (extends D, ~3-4 weeks total)

6. **Dead-code cleanup** (~1-2 sprints, can run in parallel)
   Per Track 4c inventory. Cleanly separable. Removes the cognitive overhead of the prior-product CRM surface.

7. **Schema-as-code reconstruction** (~1 week)
   Dump live schema, replace 28 placeholder stubs with one squashed authoritative migration. Adopt rule: schema changes happen only via migrations going forward.

---

## Cost comparison (v3)

| Option | Cost | What you get | Notes |
|---|---|---|---|
| A — Full + new DB | 3-6 months | Greenfield | Reintroduces the same domain bugs per Track 3. Strongest contraindication: the spike's headline justification was a false positive. |
| B — Full app rewrite, keep DB | 2-4 months | New code on existing data | Same contraindication — there's nothing structurally wrong with the data layer. |
| C — Targeted data-layer rebuild | 1-2 months | Rewrite RPCs, etc. | The data layer didn't need rebuilding. Reduced to "loose C-scope" = D + cleanup = 3-4 weeks. |
| **D — Targeted bug fixes** | **2-3 weeks** | All concrete defects addressed | **Recommended.** |
| Status quo | 0 | Nothing | The /convert loader bug, Ask AI 4 layers, ingestion NULLs, and full-year timeouts are real defects. Leaving them costs daily friction. |

---

## How the v2→v3 reframe affects historical work

- **The recent commit `3724f11 fix(ai): prevent Ask AI dashboard query timeouts`** (which landed on main while the spike was running) was reacting to the perf issue. Still useful. Now we know there's no correctness issue compounding it.
- **The `20260522120000_aggregate_meta_insights_environment_scope.sql` migration** (env-scoped join predicates added to prevent prod/staging duplication) is correct and doing the right thing. Keep it.
- **The `.agents/skills/meta-ads-data-accuracy/` skill** documents an actually-paranoid posture about data accuracy. Useful posture, with one bug fixed. Keep the skill.

---

## Known risks for v3 D-scope

- **Adding indexes is non-trivial in prod.** Use `CREATE INDEX CONCURRENTLY` and monitor for lock contention. Test on staging first.
- **The /convert loader inversion** changes what's rendered. There's a UI regression risk — design a smoke test before shipping.
- **Ask AI router consolidation** affects two routes. Either delete one and migrate callers, or keep both as facades that share one implementation. Decide before starting.
- **Ingestion fixes touch write paths.** Higher risk than read-only changes. Stage carefully, monitor error rates after deploy.
- **The boundary view error from Track 1 (`analytics.sales_appointment_conversions_v1`)** wasn't investigated. Could be a permissions issue worth a separate spike.

## What would change the v3 answer back to a larger scope

- If, during D-scope implementation, the /convert loader inversion proves to require touching ~30%+ of the dashboard's code → reconsider whether the dashboard's whole shape is wrong
- If, after the index fix, the full-year RPC is still >5s and indexes don't help → suggests the RPC's query shape (not just the index plan) needs rework
- If user finds OTHER real correctness issues in dashboards I haven't audited (`/operate/*`, `/analyst/creative-analysis`, etc.) → re-scope per finding

---

## Hand-off

Next step: invoke `superpowers:writing-plans` to draft an implementation plan for v3 D-scope. The plan should be one document with five phases (one per fix), each independently shippable, with explicit gates for the higher-risk write-path changes (ingestion fixes).

**Do NOT begin any rebuild-style work.** The v3 recommendation is targeted fixes only.
