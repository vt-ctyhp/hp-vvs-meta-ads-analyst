# Rebuild recommendation

_v1 completed: 2026-05-23 17:45 PDT — initial recommendation based on Tracks 1-3._
_v2 completed: 2026-05-23 19:30 PDT — updated after Track 4 (user pushback on UX, Ask AI, and code hygiene)._

**Spike outputs:**
- [Track 1 reconciliation](track-1-reconciliation.md) — data correctness
- [Track 1 rotten RPCs](track-1-rotten-rpcs.md) — ranked
- [Track 2 perf audit](track-2-perf-audit.md) — query timing
- [Track 3 stack risk](track-3-stack-risk.md) — framework exonerated
- [Track 4a /convert visitor bug](track-4a-convert-visitor-bug.md) — UX symptom diagnosis
- [Track 4b Ask AI quality](track-4b-ask-ai-quality.md) — 5-layer breakage
- [Track 4c dead code](track-4c-dead-code.md) — entanglement audit
- [Reconciliation runs](reconcile/) — 10 runs, 12+ CSVs
- [Query log](queries.sql)

---

## TL;DR (v2 — strengthened, not changed)

**Recommendation: C (targeted data-layer + UI surface + Ask AI fix + cleanup) — ~5-8 weeks.**

After investigating the user's full set of concerns (data, perf, stack, /convert UX, Ask AI quality, dead-code entanglement), the recommendation is **the same direction (C) but with a wider, more honest scope**. Total cost bumps from "3-5 weeks for data layer alone" to "5-8 weeks for everything you raised" — still well under any rebuild option.

**Critical: every problem you raised has a concrete, bounded fix.** Nothing in the full investigation argues that the framework, the database design, or the integration layer needs to be rebuilt. The pain is concentrated in:
1. One RPC with broken historical-window join semantics
2. Two ingestion paths leaving NULLs in attribution-critical columns
3. One loader with the wrong key axis (/convert is appointment-keyed, should be visitor-keyed)
4. One AI surface broken at 5 independent layers
5. ~10K LOC of cleanly-removable dead code from the prior CRM product direction

---

## Decision matrix (v2 — Track 4 rows added)

| Concern | Finding | Implication |
|---|---|---|
| **Data accuracy** (Track 1) | /analyst correct for last 30 days, **wrong for all historical windows** (429 mismatches across Q1 2026, full 2025, full 2024). Single RPC `aggregate_meta_daily_insights` is the root cause. Plus: 50% of `website_conversions` rows have NULL `visitor_id`; 5.6% of `appointment_events` have NULL `visit_date_time`. | Data layer is fixable. One RPC + two ingestion paths to repair. Schema is sound. |
| **Performance** (Track 2) | Same RPC: 400ms-1s for recent queries, **8-10s statement timeouts** for historical. Cold/warm load times not measured because the query-side finding already explains the slow loads. | Perf problem is the SAME problem as the correctness problem. One fix resolves both. |
| **Stack stability** (Track 3) | **0% of recent fixes** trace to Next 16 / React 19 / Tailwind v4. 79% APP-LOGIC, 13% SUPABASE (same RPC), 8% EXTERNAL-API (Meta CDN). | Stack is exonerated. Rewriting on a different stack would carry the same domain bugs forward. |
| **Schema-as-code** (Track 3) | **30% of migrations** are placeholder stubs from out-of-band Supabase project edits. | Real but bounded smell. Reconstruction is a 1-week task. |
| **/convert visitor display** (Track 4a) | **Structurally broken, not cosmetic.** Loader is appointment-keyed: a visitor who browsed but didn't book is structurally unreachable. 584 total visitors, 112 active in 30d, but only ~2 visitor rows surface; the other rows are visitor-less appointment shells displayed as em-dashes. | Loader needs inversion (visitor-first, union appointment rows). 1-2 days. C-scope. |
| **Ask AI dashboards** (Track 4b) | **Broken at 5 independent layers**: (a) inherits broken RPC, (b) spec planner hallucinates filter values and silently overrides explicit LLM dates, (c) router has two parallel duplicate backends (`/api/chat` + `/api/analysis`), (d) render dumps 4k-token markdown into a single `<p>` tag, (e) persistence drops diagnostic data so QA replay is impossible. | All 5 are concrete, citable, fixable. ~1 week + the shared RPC repair. C-scope. |
| **Dead code / prior CRM** (Track 4c) | **~10K LOC dead (~20% of 51K hand-written) BUT cleanly separable.** `lib/data-boundaries.ts` is a real type-checked firewall between dead CRM and live ads code. 5 redirect-stub routes, 11 orphan v2 components, entire `executive-snapshot/` dir, 6 orphan libs, 1 dead API route, ~50 CRM tables + 19 read-model RPCs all unreferenced from `src/`. Only 4-5 shared primitives bridge legacy and v2 dirs. | Cleanup is straightforward — delete-by-grep with confidence. 1-2 sprints. C-scope. |

---

## Applying the spec's decision rules (re-checked with v2 findings)

- _"If Track 1 finds ≥1 red discrepancy caused by 'wrong schema or fundamentally broken model' → escalate to B or A"_
  → **No.** Schema is sound. Track 4c confirms data-boundaries enforce a clean partition. Discrepancies caused by join predicates and loader shape, not data model.
- _"If Track 1 reds are all caused by RPCs/rollup logic, not schema → C"_
  → **Yes.** Confirmed. Even after Track 4 deepens the investigation, the pattern holds.
- _"If Track 1 finds only green/yellow and Track 2 shows perf is fixable → D"_
  → **No.** Real reds exist.
- _"Track 3's stack-tax modifies any answer (if >25%, include stack downgrade in scope)"_
  → Tax is **0%**. No stack downgrade.
- **Track 4 addendum (not in original spec):** _"If dead-code entanglement requires more cleanup effort than rewriting → escalate to B"_
  → **No.** Entanglement is shallow (4-5 shared primitives). Type-checked boundary already exists. Delete-by-grep is feasible.

**Result: C remains the rule-driven answer with strengthened evidence.**

---

## Why NOT a full rebuild (v2 — strengthened)

The user's pushback was specifically: "Take a step back and consider the other concerns and complaints about the current web app." Track 4 took that step back. Results:

1. **Every UX complaint has a specific code-level cause.** /convert visitor bug = wrong loader axis (1 file, 1 function). Ask AI = 5 specific files, 5 specific bugs. None of these are "the whole architecture is wrong" — they're targeted defects.
2. **The dead code is genuinely dead, not entangled.** This was the strongest pro-rebuild argument and it didn't hold up. `lib/data-boundaries.ts` enforces a real type-checked partition. The CRM tables aren't queried from `src/` at all. The dead UI is in identifiable directories (`executive-snapshot/`, redirect stubs, half of `components/v2/`).
3. **The bugs are not in the framework.** Track 3 = 0% stack tax. Track 4 confirms: the convert loader bug, the AI planner bug, the dead code — none of these are "Next.js fault" or "React fault" or "Tailwind fault." A rewrite on a different stack reintroduces all of them.
4. **The code is cleaner than it feels.** 45 tests, 7 `as any` casts, 1 TODO file, type-safe Supabase types, type-checked data boundary. The TypeScript surface is in good shape.
5. **A rebuild was just done.** [`docs/ui-rebuild-prd.md`](../../ui-rebuild-prd.md) (48KB) and editorial workspace rebuild shipped recently. The user is unsatisfied AFTER that rebuild. A third rebuild is high-risk to land in the same place.
6. **The unsatisfying experience is the additive product of fixable bugs**, not a structural failure. Fix the 5 things and the experience becomes coherent.

---

## Recommended scope for C (v2 — expanded)

Phased so each phase is independently shippable.

### Phase 1 — Data correctness foundation (1-2 weeks)
Highest leverage. Until this is fixed, every other fix is built on sand.

1. **Fix `aggregate_meta_daily_insights` RPC.** Two paths, pick one:
   - **Path A: Backfill metadata env values.** UPDATE every `brands` / `meta_campaigns` / `meta_ad_sets` / `meta_ads` row to have `environment = 'production'` where currently NULL. One migration + verification reconciliation runs across 2024-2026.
   - **Path B: Rewrite RPC join semantics.** Treat `meta_daily_insights.environment` as authoritative. Drop env predicates from joined metadata. Add appropriate indexes. Simpler RPC, faster, retroactively correct.
   - **Done = `reconcile-meta-ads-data.mjs` passes for all year windows 2024-2026.** Add as pre-merge gate.

### Phase 2 — Targeted UX bug fixes (1-2 weeks)
2. **Invert /convert loader** to be visitor-keyed. Fetch visitors-in-window first, union appointment rows. Restructure table columns to be meaningful per row type. Add visible window-selector chip. (1-2 days per Track 4a)
3. **Fix Ask AI 5-layer breakage**:
   - Unhide the diagnostic panel on /analysis (1 line per Track 4b)
   - Fix `applyRuntimeContext` to NOT silently override LLM-explicit dates (1 day)
   - Constrain spec planner to filter values that exist in the data (1-2 days; needs a value-lookup step before LLM call)
   - Consolidate `/api/chat` and `/api/analysis` to a single backend (2-3 days)
   - Fix `AnalysisOutput` markdown render — port the same fix that was applied to chat in `87119f4` (1 day)
   - Fix `ai_analysis_runs.result_preview` to retain answer/warnings/totals for QA replay (1 day)
4. **Fix `website_conversions` ingestion** — investigate why 6 of 12 conversions have NULL `visitor_id`. Add write-side validation or fallback resolution. (3-5 days)
5. **Fix `appointment_events` ingestion** — 29 of 522 rows have NULL `visit_date_time`. Backfill or block-at-ingest. (3-5 days)

### Phase 3 — Cleanup (1-2 sprints, ~2 weeks)
6. **Delete dead routes and components** per Track 4c inventory:
   - 5 redirect-stub pages (or convert to real pages if any user still hits them)
   - 2 placeholder pages
   - Orphan v2 components (~3K LOC)
   - Entire `executive-snapshot/` directory (1008 LOC)
   - 6 orphan/cascading libs (1.8K LOC)
   - Dead API route
7. **Delete CRM/diamond/payment surface** — verify with user that prior CRM is not load-bearing, then drop 19 read-model RPCs, their tables, and the read-model migrations. Removes meaningful complexity surface area.

### Phase 4 — Schema-as-code (1 week)
8. **Reconstruct authoritative migrations from prod.** Dump live schema. Replace the 28 placeholder stubs with one squashed authoritative migration. Adopt a rule: schema changes happen ONLY via migrations going forward.

### Estimated total: 5-8 weeks of focused work.

---

## Cost comparison (v2)

| Option | Cost | What you get | Risk |
|---|---|---|---|
| A — Full + new DB | 3-6 months, zero new features | Truly clean slate | Highest. Reintroduces the SAME bugs (per Track 3). Throws away 45 tests, working integrations, the data-boundary firewall. |
| B — Full app, keep DB | 2-4 months, zero new features | New app code on existing data layer | High. Doesn't fix the data layer (which is the actual problem per Track 1). Throws away ~50K LOC of working code to escape ~10K LOC of dead code that's cleanly removable. |
| **C — Targeted (v2)** | **5-8 weeks** | **Correctness + perf + UX + AI + cleanup. Keeps working code.** | **Low-medium. Bounded scope per phase. Reconciliation script gives objective gates. Each phase independently shippable.** |
| D — Stabilize only | 2-3 weeks | Phase 1 + critical Phase 2 fixes only | Low but leaves dead code, AI bugs, and schema-as-code mess as ongoing debt |

---

## Known risks for C (v2)

- **Backfill (Phase 1 path A) could expose data we didn't predict.** If some metadata legitimately spans environments, blanket UPDATE would be wrong. Mitigation: reconciliation runs before and after.
- **The boundary view error** (`analytics.sales_appointment_conversions_v1`) returned an empty-message error to service role — not investigated. Could indicate broken grants from a prior boundary refactor.
- **/creative-analysis (1162-line) and /website-funnel (3054-line) loaders** were not internally validated. They may have similar shape bugs to /convert. A Phase 2.5 may be needed.
- **External source-of-truth comparison** (Meta Ads Manager / Acuity / Shopify) was not performed. The /analyst recent-window numbers could be internally consistent but externally wrong (unlikely but unproven).
- **CRM deletion (Phase 3 step 7) is irreversible without a backup.** Confirm with user before dropping. Tag a DB backup first.

## What would change the answer to B

- **If external SoT (Meta Ads Manager) shows recent-window /analyst is ALSO wrong** → ingestion is fundamentally broken; data layer needs deeper rework
- **If the boundary view error is the tip of a permissions disaster** → reassess
- **If the user confirms the dead CRM is actually load-bearing for another product** → Track 4c's main argument weakens, but the rest of C still holds

What does NOT change the answer to B (no matter how strong it feels):
- Frustration with the current state (Track 3 already proved a rewrite carries the fire forward)
- The amount of dead code (it's cleanly removable per Track 4c)
- The number of UX bugs (each one has a 1-day fix per Track 4)

---

## Hand-off

The next step is `superpowers:writing-plans` on a new spec targeting **Phase 1** — it's the highest-leverage move and the reconciliation script gives a clean done/not-done gate. Phase 2-4 each get their own spec + plan after Phase 1 ships.

**Do NOT start any rebuild work until the user reviews this v2 recommendation and either accepts it or explicitly identifies what the spike missed.**
