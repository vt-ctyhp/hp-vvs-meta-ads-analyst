# Rebuild-decision diagnostic spike — design

**Date:** 2026-05-23
**Owner:** Pre-rebuild diagnostic work. Output is a decision-ready report, not production code.
**Scope:** Read-only investigation of the existing app. No production changes. No rebuild work begins until this spike is reviewed.

## Summary

The user is considering a full rebuild of the HP/VVS Meta Ads AI Analyst app due to (a) distrust of dashboard data, (b) slow loading, and (c) constant breakage when adding features. Before committing to a rebuild scope (full rewrite, app-only rewrite, targeted data-layer rewrite, or in-place stabilization), this spike will produce evidence-backed answers to three questions:

1. **Is the data actually wrong, and if so, where does the rot live?** (Track 1)
2. **What specifically is slow, and what would realistic fixes buy us?** (Track 2)
3. **How much of the firefighting is caused by the bleeding-edge stack itself?** (Track 3)

The synthesis step combines all three into one decision matrix and a concrete recommendation: A (full rebuild + new DB), B (full app rebuild, keep DB), C (targeted data-layer + dashboards rebuild), or D (stabilize in place). If the answer is C, the spike's reconciliation report and ranked rotten-RPC list become the input for the rebuild spec.

**Total budget:** ≤5 working days. **Output:** one markdown report + reconciliation tables + ranked backlog.

## Context: what we already know

From the initial audit (commit `acc502e`):

- ~61K LOC TypeScript (26 pages, 32 API routes, 69 lib files, 52 components)
- 92 migration files (28 placeholders) = 64 real migrations, ~11K LOC of SQL
- **61 RPC functions** defined in migrations — concentration of business logic in PL/pgSQL
- 45 test files (better than expected)
- 1 file with TODOs, 7 `as any` casts (TypeScript layer is clean)
- **41/100 recent commits are fixes/hotfixes** — confirmed firefighting pattern
- Stack: Next.js 16.2.6, React 19.2.4, Tailwind v4 (all bleeding-edge)
- An existing UI rebuild PRD (`docs/ui-rebuild-prd.md`, 48KB) and editorial rebuild already shipped — this would be at least the second rebuild attempt
- No specific numbers have been verified-wrong yet; distrust is general, spanning `/analyst`, `/analyst/creative-analysis`, `/website-funnel`, `/convert`

## Resolved decisions (from brainstorming)

1. **Direction = Option E (diagnostic spike first).** Defer rebuild scope decision until evidence is in.
2. **Spike covers all three tracks** (correctness + perf + stack), not just correctness.
3. **Execution model:** Claude runs Tracks 2 & 3 largely autonomously. Track 1 is collaborative — user steers on source-of-truth definitions for each dashboard.
4. **DB access:** read-only via existing service-role key. No writes, no schema changes.
5. **Output is decision-ready, not implementation-ready.** This spike does NOT begin the rebuild; it sizes and scopes it.

## Goals

- Produce a one-page recommendation: A, B, C, or D, with reasoning the user can challenge.
- For Track 1: an auditable reconciliation table showing dashboard value vs source-of-truth value vs delta for ≥3 metrics × 4 dashboards = 12+ data points, time-windowed.
- For Track 2: a ranked list of the 5 slowest dashboards/queries with realistic improvement estimates.
- For Track 3: a verdict on whether downgrading the stack (Next 15 stable, React 18, Tailwind v3) would eliminate a meaningful share of firefighting.
- If the recommendation is C, hand off a ranked "rebuild this, in this order" backlog directly usable by the next spec.

## Non-goals

- No code changes to fix anything found during the spike. Findings get logged; fixes get scheduled.
- No deep refactoring of any individual RPC or component during the spike.
- No premature commitment to a stack for the rebuild. Stack selection happens during the rebuild spec, informed by Track 3's findings.
- No reconciliation of every metric on every dashboard — sampling is sufficient to make a build/rebuild decision.

---

## Track 1 — Data correctness audit

**Budget:** ~2 days. **Mode:** collaborative.

### Method

For each of the 4 distrusted dashboards, in this order: `/analyst`, `/convert`, `/website-funnel`, `/analyst/creative-analysis`.

1. **Define source of truth (user-led, ~15 min per dashboard):** which external system holds the canonical version of each metric? Likely:
   - `/analyst` → Meta Ads Manager (web UI export) for spend, impressions, CTR, reach
   - `/convert` → Acuity (bookings), Supabase raw `customer` tables (customer counts), Shopify admin (orders) for the ledger
   - `/website-funnel` → Shopify Analytics or first-party event logs (raw `website_events` table) for sessions, bookings, conversions
   - `/analyst/creative-analysis` → Meta Ads Manager creative-level breakdown for spend/impressions per ad, plus internal score formula audit

2. **Pick 3–5 key metrics per dashboard.** Pick metrics the user actually relies on for decisions, not all available metrics.

3. **Pick reconciliation window.** Default: last 30 complete days. If the dashboard supports it, also spot-check one historical week (e.g. 60–90 days ago) to detect rollup drift.

4. **Pull both values for the same window:**
   - Dashboard value: via the same RPC/query the page uses, executed independently.
   - Source-of-truth value: from the external system. For Meta Ads Manager, user provides a CSV export or screenshot. For Acuity, user provides report data. For Shopify, an export or admin screenshot. For first-party raw tables, Claude queries them directly.

5. **Build the reconciliation table** (one row per metric × dashboard):

   | Dashboard | Metric | Window | Dashboard value | Source-of-truth value | Delta | Delta % | Suspected cause |
   |---|---|---|---|---|---|---|---|

6. **For every delta >2% (default threshold), trace the SQL path:**
   - Identify the RPC or view feeding the metric
   - Read the SQL: where is the join ambiguity, the missing filter, the stale rollup, the timezone mismatch, the de-dup logic that drops rows?
   - Add the suspected cause to the row and a confidence rating (high/medium/low)

7. **Categorize root causes** across all discrepancies:
   - Stale denormalized rollup tables (e.g. `aggregate_meta_insights` not refreshed)
   - Wrong join semantics (e.g. attribution joins that double-count or under-count)
   - Environment mixing (the `environment_scope` migrations suggest prod/staging data could bleed)
   - Timezone / date-bucket mismatches
   - Source-of-truth mismatch is actually correct on our side (e.g. our de-dup is right and Meta UI is the one that's "wrong")

### Track 1 outputs

- `docs/superpowers/spike/2026-05-23/reconciliation.md` — the table above
- `docs/superpowers/spike/2026-05-23/rotten-rpcs.md` — ranked list of RPCs/views/tables identified as the source of meaningful discrepancies
- A traffic-light summary: how many metrics audited, how many ≤2% delta (green), how many 2–10% delta (yellow), how many >10% delta (red)

### Track 1 success criteria

- ≥12 metrics reconciled (3 metrics × 4 dashboards minimum)
- Every red-status discrepancy has a named suspected cause with confidence rating
- The "rotten RPCs" list has clear ordering — most-impactful first

---

## Track 2 — Performance audit

**Budget:** ~1 day. **Mode:** Claude-autonomous.

### Method

1. **Baseline measurements** on Vercel production for the 4 dashboards:
   - Cold load TTFB and full page load (LCP) — fresh deploy or after 10+ min idle
   - Warm load TTFB and LCP — second navigation
   - Total RSC payload size
   - Number of distinct DB round-trips per page render (from Supabase logs)

2. **Identify the 5 slowest queries** across all 4 dashboards using Supabase query performance views (`pg_stat_statements` or the Supabase dashboard's query log).

3. **For each of the slowest 5:**
   - Run `EXPLAIN ANALYZE` (read-only)
   - Note: missing indexes? Sequential scans on big tables? Hash joins blowing memory?
   - Estimate realistic improvement: "adding index X would cut this from 1.8s to ~50ms" or "this query fundamentally cannot be faster without denormalization"

4. **Identify N+1 patterns** by inspecting the page's server-component query graph.

5. **Compare cold vs warm load gap.** A large gap = Vercel cold start tax, fixable. Small gap = the DB/app itself is the bottleneck.

### Track 2 outputs

- `docs/superpowers/spike/2026-05-23/perf-audit.md` containing:
  - Baseline table (cold/warm × 4 dashboards)
  - Top 5 slow queries with EXPLAIN ANALYZE summary and realistic improvement estimate
  - N+1 findings
  - "If we fix the top 5, expect load times to go from X to Y" projection

### Track 2 success criteria

- Each of the 4 dashboards has a hard cold-load and warm-load number
- Each of the top 5 slow queries has a concrete, actionable next step
- The projection is grounded — not "we'd be fast" but "TTFB X→Y, LCP X→Y"

---

## Track 3 — Stack & architecture risk

**Budget:** ~1 day. **Mode:** Claude-autonomous.

### Method

1. **Catalog stack-induced breakage in the last 100 commits.** For each fix/hotfix commit (41 of last 100), classify the root cause:
   - Caused by Next 16 specifics (new APIs, removed APIs, breaking changes)
   - Caused by React 19 specifics (new concurrent behaviors, hooks changes)
   - Caused by Tailwind v4 specifics (config format, plugin changes)
   - Caused by Supabase / data layer (RPCs, schema, RLS)
   - Caused by app logic (feature bugs unrelated to stack)
   - Caused by external API changes (Meta, Acuity, OpenAI)

2. **Score the "stack stability tax"** = (Next + React + Tailwind classified fixes) / total fixes. If >25%, the bleeding-edge stack is a meaningful drag on velocity.

3. **Identify load-bearing patterns at stack-version risk:**
   - Where does the app rely on Next 16-specific APIs (vs ones that exist in Next 15)?
   - Where does it use React 19-only features (use(), useFormStatus, server actions specific to 19)?
   - Where does it use Tailwind v4-only syntax (`@theme`, container queries, new arbitrary value behaviors)?
   - Score migration cost back to stable (Next 15 + React 18 + Tailwind v3): trivial / moderate / heavy / requires-rewrite

4. **Survey of architectural smells beyond stack:**
   - 28 placeholder migration files: are people editing the DB outside the migration system? If so, schema-as-code is broken.
   - 61 RPCs: is business logic in SQL because TypeScript was inconvenient, or because performance required it? The former is fixable by moving logic to lib/; the latter is real.
   - Mixed server-action vs API-route patterns: are there inconsistencies that confuse contributors?

### Track 3 outputs

- `docs/superpowers/spike/2026-05-23/stack-risk.md` containing:
  - Commit classification table with counts
  - Stack stability tax percentage
  - Downgrade cost estimate per stack component
  - Architectural smell findings beyond stack
  - Recommendation: stay bleeding-edge / downgrade selectively / downgrade fully

### Track 3 success criteria

- Every recent fix commit is classified
- The stack stability tax is a concrete percentage
- The downgrade-cost estimate is specific enough to inform the rebuild stack choice

---

## Synthesis

**Budget:** ~1 day. **Mode:** Claude-autonomous with user review checkpoints.

### Method

1. **Build the decision matrix:**

   | Concern | Track 1 finding | Track 2 finding | Track 3 finding | Implication |
   |---|---|---|---|---|
   | Data accuracy | Reds: N, Yellows: M | — | — | If reds >0, data layer rebuild required |
   | Perf | — | Cold load avg X, top fix wins Y | — | If gap to acceptable is small, no rebuild needed for perf |
   | Stability | — | — | Stack tax: Z% | If >25%, stack downgrade is in scope of rebuild |

2. **Decision rules:**
   - If Track 1 finds ≥1 red discrepancy with cause = "wrong schema or fundamentally broken model" → escalate to B (rebuild app, keep DB only if schema can be fixed) or A (rebuild including DB).
   - If Track 1 finds red discrepancies all caused by RPCs/rollup logic, not schema → C (targeted data-layer rebuild) is justified.
   - If Track 1 finds only green/yellow and Track 2 shows perf is fixable in place → D (stabilize) wins.
   - Track 3's stack-tax score modifies the recommendation: high stack tax pushes any of C/D toward "include stack downgrade in scope."

3. **Produce the final recommendation** with:
   - The chosen option (A/B/C/D)
   - The reasoning chain referencing specific findings
   - Estimated cost in weeks
   - The specific scope: which RPCs/dashboards/components to rebuild, in what order
   - Known risks and what could change the answer

### Synthesis output

- `docs/superpowers/spike/2026-05-23/recommendation.md` — the final report, ~2 pages
- Final user review checkpoint before any rebuild work begins

---

## Risks and unknowns

- **Service-role DB access risk.** All queries are read-only by intent, but service-role bypasses RLS. Mitigation: every query is logged to `docs/superpowers/spike/2026-05-23/queries.sql` for review. No `INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP`.
- **Source-of-truth availability.** If user cannot easily export from Meta Ads Manager / Acuity / Shopify in the spike's time budget, Track 1 falls back to internal-consistency checks (e.g. "the same metric computed three different ways across our own tables disagrees by X%") which is weaker but still informative.
- **Time budget overrun.** If any track exceeds its budget by >50%, stop and check in with the user before continuing. Better to ship a partial recommendation on schedule than a perfect one late.
- **Confirmation bias toward rebuild.** The user has already gravitated toward "rebuild" — the spike must be willing to recommend D (stabilize) if the evidence supports it. Explicit guard: if Track 1 returns all-green and Track 2 shows perf is fixable, the synthesis must recommend D.

## Out of scope

- Anything that touches production data write-side.
- Rebuilding any RPC, view, page, or component during the spike.
- Choosing a new stack — that happens in the rebuild spec if C/B/A is selected.
- Auditing pages outside the 4 named dashboards.
- Security audit (separate concern).
- Test coverage analysis beyond what's already known (45 test files exist).

## Hand-off

If the synthesis recommends **C or B**, the next step is to invoke the writing-plans skill with this spike's outputs as input, scoped to whatever the synthesis identifies as the rebuild scope.

If the synthesis recommends **A**, that warrants its own brainstorming session (much larger spec — stack selection, data migration, cutover plan) before writing-plans.

If the synthesis recommends **D**, the next step is a much smaller writing-plans pass focused on the specific top-priority fixes the spike identified.
