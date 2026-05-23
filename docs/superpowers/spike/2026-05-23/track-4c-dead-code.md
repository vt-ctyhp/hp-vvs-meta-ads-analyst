# Track 4c — Dead code and entanglement audit

_Investigated: 2026-05-23 (worktree `focused-brahmagupta-caa1af`)._

## Executive answer

The codebase carries roughly **10-12K LOC of clearly dead application code** (orphan v2 components from a prior optimize/inbox/CRM design, an orphan `executive-snapshot/` directory, an entire orphan top nav, plus a backing API route and several lib files) on top of **~50 dead CRM SQL tables and 19+ unused read-model RPCs** from the original HP/VVS ERP era. Critically, the dead surfaces are **cleanly separable, not entangled** — the prior CRM data layer is fire-walled by `lib/data-boundaries.ts`, and the live workspace pages (`/analyst`, `/convert`, `/operate/*`) only import a handful of shared primitives from the legacy components dir. This argues **against** B-scope and **in favor** of staying with C-scope (data-layer rebuild) plus a 1-2 week cleanup pass.

## Dead route inventory

| Route | Status | Evidence |
|---|---|---|
| `/optimize` | Redirect stub (40 LOC) | `app/optimize/page.tsx` → `redirect("/analyst" | "/analysis" | "/analyst/creative-analysis")` |
| `/creative-analysis` | Redirect stub (25 LOC) | → `/analyst/creative-analysis` |
| `/inbox` | Redirect stub (29 LOC) | → `/convert/inbox` or `/m/inbox` |
| `/users` | Redirect stub (5 LOC) | → `/operate/users` |
| `/broadsheet` | Redirect stub (5 LOC) | → `/analyst` |
| `/review` | Placeholder ("Coming in v1.5") | 63 LOC of static copy |
| `/outcomes` | Placeholder ("Coming in v2") | 60 LOC of static copy |
| `/attribution-ledger` | Live but off-nav | Not in `APP_NAV_ROUTES`; permission-only access |
| `/website-funnel` | Live but off-nav | Same |
| `/admin/backfill` | Live "legacy" page | README calls it legacy; 1541-LOC client `meta-backfill-client.tsx` |
| `/api/optimize/pivot-children` | Dead API (71 LOC) | Only caller is orphan `v2/optimize/tree-table.tsx` |
| 30 other API routes | Live | Auth-checked, called from active surfaces |

Net: **8 dead/placeholder page routes** of 26, **1 dead API route** of 32. Stubs are tiny — only ~200 LOC of routes, but they keep the surface area inflated.

## Dead component inventory

The `src/components/v2/optimize/` directory is the wreckage of the abandoned "/optimize" tabbed UX that got cut over to `/analyst` (`dashboard-client.tsx`). Eleven of its files are imported by **nothing live**:

| Component | LOC | Status |
|---|---|---|
| `v2/optimize/creatives-panel.tsx` | 911 | Orphan |
| `v2/optimize/tree-table.tsx` | 784 | Orphan |
| `v2/optimize/creative-grid.tsx` | 375 | Orphan (only used by `creative-grid-with-drawer`) |
| `v2/optimize/creative-grid-with-drawer.tsx` | 249 | Orphan |
| `v2/optimize/creative-detail-drawer.tsx` | 219 | Orphan (only used by `tree-table`) |
| `v2/optimize/time-series-chart.tsx` | 189 | Orphan |
| `v2/optimize/triage-panel.tsx` | 174 | Orphan |
| `v2/optimize/optimize-controls.tsx` | 46 | Orphan |
| `v2/optimize/metric-format.ts` | 70 | Orphan |
| `v2/convert/conversation-queue.tsx` | 175 | Orphan |
| `v2/convert/customer-journey-drawer.tsx` | 810 | Orphan (only `customer-ledger.tsx` references it) |
| `executive-snapshot/index.tsx` + 3 sections | 1008 | Whole directory orphan; nothing in `src/` imports `ExecutiveSnapshot` |
| `top-navigation.tsx` | 520 | Functionally dead — hidden by `isV2Path` on every workspace route (`/analyst`, `/convert`, `/operate/*`, `/analysis`, `/m/*`). Only renders on `/login`, `/no-access`, and a couple of orphan/legacy paths. |
| `hero-number.tsx` | 73 | Only consumer is the orphan executive-snapshot |
| `maturity-badge.tsx` | 56 | Only consumer is `hero-number.tsx` (also dead) |
| `sparkline.tsx` | 54 | Only consumers are `dashboard-client.tsx` (live, one cell) + orphan executive-snapshot |
| `week-window-toggle.tsx` | 81 | Only consumer is orphan executive-snapshot |
| `filter-bar.tsx` (legacy) | 206 | Imported nowhere |
| `status-sentence.tsx` (legacy, non-v2) | 60 | Live in some places, but a duplicate of `v2/status-sentence.tsx` (74 LOC) |

**Dead component LOC: ~6.0K** (excluding cascading deletes of `analysis-route.ts` test fixtures, etc.).

## Dead lib inventory

| Lib | LOC | Status |
|---|---|---|
| `lib/optimize-page-data.ts` | 398 | Orphan; only `tests/optimize-page-data.test.ts` references it |
| `lib/design-tokens.ts` | 215 | Pure orphan |
| `lib/executive-headline.ts` | 128 | Only consumer is orphan `executive-snapshot/top-story-section.tsx` |
| `lib/attention-rules.ts` | 275 | Only consumer is orphan `executive-snapshot/needs-attention-section.tsx` |
| `lib/period-pivot-data.ts` | 631 | Shared between dead `/api/optimize/pivot-children` route + orphan `v2/optimize/tree-table.tsx`; and also `tests/period-pivot-data.test.ts`. Not used by any live page. |
| `lib/pivot-by-period.ts` | 135 | Only used by `period-pivot-data` (cascading dead) and tests |

**Dead lib LOC: ~1.8K.** Plus the cascading test files (`executive-headline.test.ts` 177, `attention-rules.test.ts` 309, `optimize-page-data.test.ts` 151, `period-pivot-data.test.ts`, `pivot-by-period.test.ts`) — roughly **800 LOC of dead tests**.

Note: `database.types.ts` (8735 LOC) is generated — half its tables/RPCs are dead CRM. Regenerating against a pruned schema would slim it considerably.

## Dead SQL surface (CRM import RPCs + tables)

The application explicitly partitions the schema in `lib/data-boundaries.ts`:

- `SALES_ERP_CORE_TABLES` — **52 tables** (customers, appointments, diamonds, payments, tasks, schedules, documents, design decks, recordings, …). **Zero live `.from('<table>')` queries** in `src/` reference any of them except `appointment_events` (now used by the new convert ledger via `customer-journey-ledger.ts`).
- `ANALYST_OWNED_TABLES` — 31 tables, all actively queried.

The 19 `apply_*_read_model_import` RPCs (customer, appointment, diamond, payment, etc., migrations `0014`-`0018`, `0102`-`0105`) are **not invoked anywhere in the application** — `grep -rn "apply_.*_read_model_import" src/` only matches enum/string identifiers inside `data-boundaries.ts` and `database.types.ts`. They exist exclusively for an out-of-band ERP-side importer that this app no longer ships.

Of 92 migrations, **31 (0001-0105) are pre-ads-era CRM** and **61 (2026…) are the ads-analyst direction**. The CRM half could be archived to a "phase 0" baseline migration with no impact on the running app — but it's not entangled, just bulky.

## Estimated dead LOC

Across `src/` + `tests/`:

- Orphan v2/optimize components: ~3.2K LOC
- Orphan v2/convert components (`conversation-queue`, `customer-journey-drawer`): ~1.0K LOC
- Orphan `executive-snapshot/` (4 files): ~1.0K LOC
- Effectively dead `top-navigation.tsx`: ~520 LOC
- Orphan small primitives (`hero-number`, `maturity-badge`, `week-window-toggle`, `filter-bar` legacy): ~420 LOC
- Orphan/cascading libs (`optimize-page-data`, `design-tokens`, `executive-headline`, `attention-rules`, `period-pivot-data`, `pivot-by-period`): ~1.8K LOC
- Redirect stubs + placeholder pages: ~230 LOC
- Dead API route + cascading tests: ~1.0K LOC

**~9.5-10.5K dead application LOC out of ~51K (excluding 9K generated `database.types.ts` and ~10K tests).** Call it **18-20% of hand-written app code**.

On top of that: ~30 SQL migrations and ~50 SQL tables that no live route reads.

## Entanglement findings

The good news — entanglement is **shallow and consistent**, not pervasive:

1. **Shared primitives between legacy and live components.** `dashboard-client.tsx` (LIVE, the `/analyst` page) imports `FilterChipGroup`, `UniversalFilterBar`, `StatusSentence`, `TechnicalId`, `Sparkline` from `src/components/` (the legacy dir). `v2/optimize/ai-panel.tsx` (LIVE, the `/analysis` page) imports the same legacy `FilterChipGroup` + `UniversalFilterBar`, plus `AnalysisOutput` from `analysis-client.tsx` (1097 LOC). So the legacy dir cannot be wholesale deleted; a handful of primitives need to move into the v2 namespace first.
2. **Two parallel pivot APIs.** `/api/optimize/pivot-children` (71 LOC) and `/api/analyst/performance-children` (50 LOC) do nearly the same job. The first is dead. Both share libs (`period-pivot-data`, `dashboard-performance-tree`) and there's textual evidence of duplicated concepts.
3. **Two status-sentence components** (`components/status-sentence.tsx` 60 LOC + `components/v2/status-sentence.tsx` 74 LOC) — live code uses both depending on which dir it lives in.
4. **`lib/data-boundaries.ts` is the entanglement guard rail.** It explicitly enumerates the 52-table CRM partition and is referenced by `ads-analyst-db.ts` + `runtime-guardrails.ts`. The boundary is real, type-checked, and live. CRM dead code is fire-walled — not entangled.
5. **No live code touches CRM tables.** Greppable: zero `.from('customers')`, `.from('diamonds')`, `.from('payments')`, etc., in `src/`. The only crossover is `appointment_events` which has been re-purposed for the new convert funnel.

## Code hygiene smells beyond dead code

- **File-size outliers (all live, all worth a hard look):**
  - `dashboard-client.tsx` 2986 LOC — single React file, the `/analyst` page client.
  - `lib/ad-hoc-analytics.ts` 3392 LOC, `lib/website-analytics.ts` 3053 LOC, `lib/customer-journey-ledger.ts` 2596 LOC, `lib/meta.ts` 2302 LOC, `lib/analytics.ts` 1995 LOC, `lib/creative-analysis.ts` 1161 LOC, `lib/social-inbox.ts` 1128 LOC.
  - Client components: `creative-analysis-client.tsx` 1682, `meta-backfill-client.tsx` 1541, `v2/optimize/ai-panel.tsx` 1242.
  - These are not dead but they're entanglement smells — a fix in `website-analytics` could touch the funnel, the attribution ledger, AND the ad-hoc analyzer.
- **Duplicated UX patterns:** "we built X twice" appears in (a) the pivot table (`v2/optimize/tree-table` 784 vs `dashboard-client`'s inline table); (b) the status-sentence component (legacy vs v2); (c) the filter bar (`filter-bar.tsx` 206, `universal-filter-bar.tsx` 240, `v2/optimize/filter-bar.tsx` 278, `v2/convert/convert-filter-bar.tsx` 160 — four filter-bar implementations); (d) two pivot-children API routes.
- **Consistent patterns where it counts:** auth is uniform — 29 of 32 API routes use `requirePermissionFromRequest` or `requireCronAuth`; only `/api/health`, `/api/website/events`, `/api/meta/webhook` are intentionally public (correct — they're public endpoints). No server actions (all writes go through API routes) — consistent.
- **Dead tests:** `tests/executive-headline.test.ts`, `tests/attention-rules.test.ts`, `tests/optimize-page-data.test.ts`, `tests/optimize-ai-panel.test.ts` (402 LOC — partially testing orphan path), `tests/pivot-by-period.test.ts`, `tests/snapshot-by-entity.test.ts` all exercise dead surfaces.

## Verdict

**Moderately entangled. C-scope can address it but takes longer (~2-3 weeks for cleanup alone, on top of the data-layer fixes).**

The dead code is sizable (~20% of hand-written app code) but it is overwhelmingly orphan-clustered, not strewn through live files. Three concrete deletions get most of the value:

1. `rm -r src/components/v2/optimize/` minus the few files imported by `/analysis` (`ai-panel.tsx`, `filter-bar.tsx`, `optimize-tabs.tsx`, `period-controls.tsx`, `sync-button.tsx`, `status-sentence` deps) — recovers ~3.2K LOC, deletes the orphan duplicate pivot stack.
2. `rm -r src/components/executive-snapshot/` plus `lib/executive-headline.ts`, `lib/attention-rules.ts`, `components/hero-number.tsx`, `components/maturity-badge.tsx`, `components/week-window-toggle.tsx` — recovers ~1.6K LOC.
3. Delete `top-navigation.tsx` and the bootstrap nav-hide logic; move shared primitives (`FilterChipGroup`, `UniversalFilterBar`, `StatusSentence`, `TechnicalId`, `Sparkline`) into `components/v2/` — recovers ~520 LOC and ends the "two component systems" awkwardness.

After that, the CRM SQL surface can be archived to a single squashed baseline migration without touching app code.

## How this affects the rebuild decision

This finding **supports staying with C-scope**, not escalating to B. The user's instinct that "it's all entangled" is understandable — there's a LOT of dead code visually, the migration list is intimidating, two design systems coexist, and the live `/analyst` page client is 2986 LOC. But the entanglement is shallow: dead code lives in identifiable cluster directories (`v2/optimize/`, `executive-snapshot/`, the prior-CRM migrations), the data layer has an explicit fire-wall (`data-boundaries.ts`), and only a handful of shared primitives bridge the legacy and v2 component dirs. A 1-2 sprint cleanup deletes ~10K LOC of orphans and resolves the duplicate filter-bar / status-sentence / pivot-table situations without rewriting any business logic. That is dramatically cheaper than a B-scope rebuild, which would have to re-derive `website-analytics.ts` (3053 LOC), `meta.ts` (2302 LOC), `customer-journey-ledger.ts` (2596 LOC), and `dashboard-client.tsx` (2986 LOC) — none of which are dead, all of which encode subtle product behavior earned over many fixes. **Recommendation unchanged: C-scope, with an explicit "dead-code cleanup" milestone added.**
