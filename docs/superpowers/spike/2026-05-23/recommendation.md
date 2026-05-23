# Rebuild recommendation

_Completed: 2026-05-23 17:45 PDT_

**Spike outputs:**
- [Track 1 reconciliation](track-1-reconciliation.md)
- [Track 1 rotten RPCs](track-1-rotten-rpcs.md)
- [Track 2 perf audit](track-2-perf-audit.md)
- [Track 3 stack risk](track-3-stack-risk.md)
- [Reconciliation runs](reconcile/) (10 runs, 12+ CSVs)
- [Query log](queries.sql)

---

## TL;DR

**Recommendation: C (targeted data-layer + ingestion rebuild) — ~3-5 weeks.**

Not A (full + new DB), not B (full app rewrite), not D (in-place patching alone). The evidence says one RPC and two ingestion paths are the root cause of ~90% of the user's pain. Fix those and most of the firefighting disappears without touching the framework, the auth, the integrations, the UI shell, the 45 tests, or the working data flows.

A full rebuild (A or B) would cost **3-6 months of zero new features** and — per Track 3 — would carry the same domain bugs forward because the bugs aren't in the framework. The recent UI rebuild already happened and didn't fix what the user is upset about; a second one would land in the same place.

---

## Decision matrix

| Concern | Finding | Implication |
|---|---|---|
| **Data accuracy** (Track 1) | /analyst correct for last 30 days, **wrong for all historical windows** (429 mismatches across Q1 2026, full 2025, full 2024). Single RPC `aggregate_meta_daily_insights` is the root cause. Plus: 50% of `website_conversions` rows have NULL `visitor_id`; 5.6% of `appointment_events` have NULL `visit_date_time`. | Data layer is fixable. One RPC + two ingestion paths to repair. Schema is sound. |
| **Performance** (Track 2) | Same RPC: 400ms-1s for recent queries (fine), **8-10s statement timeouts** for historical windows. Cold/warm load times not measured because the query-side finding already explains the slow loads. | Perf problem is the SAME problem as the correctness problem. One fix resolves both. |
| **Stack stability** (Track 3) | **0% of recent fixes** trace to Next 16 / React 19 / Tailwind v4. 79% APP-LOGIC (attribution/funnel domain), 13% SUPABASE (this same RPC). | Stack is exonerated. Rewriting on a different stack would carry the same domain bugs forward. |
| **Schema-as-code** (Track 3) | **30% of migrations** are placeholder stubs from out-of-band Supabase project edits. | Real but bounded smell. C must include a "reconstruct migrations from prod" step. |
| **Cruft from prior product direction** (Track 3) | **19 of 41 RPCs** are customer/appointment/diamond/payment CRM import functions called only via triggers/import flow. Unused product leakage. | Optional cleanup. Worth including in C if scope allows. |

---

## Applying the spec's decision rules

The spec defines these rules in §Synthesis. Working through each:

- _"If Track 1 finds ≥1 red discrepancy caused by 'wrong schema or fundamentally broken model' → escalate to B or A"_
  → **No.** The schema is sound. The discrepancies are caused by **join predicates in one RPC**, not by the data model.
- _"If Track 1 reds are all caused by RPCs/rollup logic, not schema → C"_
  → **Yes.** This is the matching condition.
- _"If Track 1 finds only green/yellow and Track 2 shows perf is fixable → D"_
  → **No.** Track 1 has reds, just narrowly scoped ones.
- _"Track 3's stack-tax modifies any answer (if >25%, include stack downgrade in scope)"_
  → Tax is **0%**. No stack downgrade in scope.

**Result: C is the rule-driven answer.**

**Confirmation-bias guard (per spec):** the spike was required to recommend D if data turned out fine. Data did NOT turn out fine for historical windows. C is the honest answer; D would be too narrow given the historical-data problem affects a major use case (AI deep analysis, year-over-year reporting).

---

## Why NOT a full rebuild

The user's instinct was to rebuild from scratch. The evidence argues strongly against this:

1. **The bugs aren't in the framework.** Track 3 proved 0/39 recent fixes are stack-attributable. A new stack would inherit every single bug we just catalogued.
2. **The code is cleaner than it feels.** 45 tests, 7 `as any` casts, 1 TODO file, type-safe Supabase generated types. The TypeScript surface is in good shape.
3. **A rebuild was just done.** [`docs/ui-rebuild-prd.md`](../../ui-rebuild-prd.md) (48KB) and the editorial workspace rebuild shipped recently. The user is unsatisfied AFTER that rebuild — so a third one is high-risk to land in the same place.
4. **The rebuild cost is 3-6 months of zero new features.** During which the existing wrong-historical-data problem persists and likely gets worse (more drift from prod schema).
5. **The current 30-day data is correct.** The dashboards the user looks at most often (recent performance) are not actually wrong. The systemic distrust is real but the cause is bounded.

---

## Recommended scope for C

In priority order:

### 1. Fix `aggregate_meta_daily_insights` RPC (1-2 weeks)

Two paths, pick one:

- **Path A: Backfill metadata environment values.** UPDATE every `brands` / `meta_campaigns` / `meta_ad_sets` / `meta_ads` row to have `environment = 'production'` where currently NULL. Low risk if NULL is the issue (likely). One migration + verification reconciliation runs across 2024-2026.
- **Path B: Rewrite the RPC join semantics.** Treat `meta_daily_insights.environment` as authoritative. Drop env predicates from joined metadata. Add appropriate indexes. Simpler RPC, faster, and retroactively correct. Higher upfront work but cleaner long-term.

**Either way: re-run the reconciliation script across full year windows after the fix.** It already exists at `.agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs` — make passing it a pre-merge gate.

### 2. Fix website_conversions ingestion (3-5 days)

- Investigate why 6 of 12 conversions in the last 30 days have NULL `visitor_id`. Likely a bug in `/api/website/conversions` route ingestion.
- Either ensure visitor_id is populated at write time, or add a fallback resolution step (visitor lookup by other identifiers like email or fbclid).
- Add a constraint or a write-side validation so future ingests can't silently land with NULL visitor_id.

### 3. Fix appointment_events ingestion (3-5 days)

- 29 of 522 appointments have NULL `visit_date_time`. They're silently invisible to any time-windowed dashboard query.
- Identify the source of NULLs (likely the Acuity webhook path) and either backfill or block-at-ingest.

### 4. Reconstruct schema-as-code (1 week)

- 30% of migration files are placeholder stubs. The actual schema lives only in the Supabase project.
- Dump the live schema. Replace the 28 placeholders with a single squashed authoritative migration. Adopt a rule: schema changes happen ONLY via migrations going forward.

### 5. (Optional, scope-permitting) Delete unused CRM-import RPCs (3-5 days)

- 19 of 41 RPCs serve a customer/appointment/diamond/payment import flow that appears to be leakage from a prior product direction.
- Confirm with user that this flow is unused, then delete the RPCs, their tables, and the read-model migrations.
- Removes meaningful complexity surface area.

**Estimated total: ~3-5 weeks of focused work.**

---

## Estimated cost comparison

| Option | Cost | What you get | Risk |
|---|---|---|---|
| A — Full + new DB | 3-6 months, zero new features | Truly clean slate | Highest. Likely re-introduces the SAME bugs (per Track 3). Throws away 45 tests and 64 working migrations. |
| B — Full app, keep DB | 2-4 months, zero new features | New app code on existing data layer | High. Doesn't fix the data layer (which is the actual problem). Throws away working integrations + auth. |
| **C — Targeted data-layer + ingestion fix** | **3-5 weeks** | **Correctness + perf + cleanup. Keeps working code.** | **Low. Bounded scope. Reconciliation script gives objective pass/fail gates.** |
| D — Stabilize only | 1-2 weeks | Just the RPC + ingestion fixes | Low but leaves the 19 unused CRM RPCs + schema-as-code mess as ongoing debt |

---

## Known risks for C

- **Backfill (path A) could expose data we didn't expect.** If some metadata rows legitimately exist in multiple environments, blanket-updating to `production` would be wrong. Mitigation: run the reconciliation script BEFORE and AFTER the backfill and verify the deltas resolve as predicted.
- **The boundary view error** (`analytics.sales_appointment_conversions_v1`) returned an empty-message error to service role. Not investigated. Could be a separate bug that bites mid-C work.
- **The /creative-analysis 1162-line aggregator and /convert 3054-line aggregator** were not internally validated. There may be bugs there that this spike didn't catch.
- **External source-of-truth comparison** (Meta Ads Manager, Acuity, Shopify exports) was not performed. The spike only validated internal consistency. The /analyst recent-window numbers could be internally consistent but externally wrong — unlikely given the RPC matches raw rows, but not proven.

## What would change the answer

- **If the user provides Meta Ads Manager exports and they DON'T match recent-window /analyst numbers** → escalate to B (the entire ingestion is wrong, not just the historical query).
- **If the boundary view error turns out to indicate a schema/grants disaster** → reassess scope; possibly C+.
- **If the `meta_daily_insights` table itself has integrity issues** (which this spike did NOT check) → escalate to deeper Track 1.
- **If the user decides the unused CRM RPC surface is actually load-bearing** → step 5 of C is out of scope; the rest stands.

---

## Hand-off

The next step is `superpowers:writing-plans` on a new spec targeting fix #1 (the RPC) — it's the highest-leverage move and the reconciliation script gives a clean done/not-done gate. Once #1 is in production and reconciliation passes for all historical windows, schedule #2 / #3 / #4 / #5 sequentially.

**Do NOT start any rebuild work until the user reviews this recommendation.**
