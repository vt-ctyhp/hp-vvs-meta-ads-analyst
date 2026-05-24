# Phase 6 — Dead application code cleanup — design

**Date:** 2026-05-24
**Owner:** v3 plan Phase 6, scope per [v3-scope.md](../plans/2026-05-23-v3-scope.md). Evidence: [track-4c-dead-code.md](../spike/2026-05-23/track-4c-dead-code.md).
**Scope:** Application code only (`src/`, `tests/`). The Next.js app router lives at `src/app/`. Inventory items from Track 4c, organized into 7 small, independent batches. **Out of scope:** SQL surface, CRM table drops, RPC drops, `database.types.ts` regeneration (all deferred to Phase 7), file-size refactors, duplicated-UX consolidations.

## Summary

Track 4c found roughly **9.5–10.5K LOC of dead application code** plus ~800 LOC of dead tests in this codebase: orphan v2 components from the abandoned `/optimize` UX, a whole `executive-snapshot/` directory that no live route uses, the `top-navigation.tsx` that's hidden by `isV2Path` on every workspace route, 7 redirect-stub / placeholder pages, 6 orphan libs (with their cascading tests), and one dead API route.

This phase ships those deletions in **7 small PRs**, each surgically scoped and independently reverted. We treat the cleanup as a series of "verify-then-delete" passes, NOT a refactor — we are NOT moving code, renaming, or restructuring. Either a file is genuinely dead (no live caller) and it leaves the tree, or it isn't and we defer.

## Confirmed background

- Track 4c's inventory was a static analysis snapshot from 2026-05-23. The codebase moved forward (v3 Phase 1, 2, 2.5, 2.6 all merged) — Track 4c's claims must be re-verified at the start of each batch in case anything got newly imported.
- `lib/data-boundaries.ts` is a real firewall — no live route reads CRM tables. That keeps SQL surface out of this phase.
- Some legacy components in `src/components/` (NOT `src/components/v2/`) are imported by live code (per Track 4c entanglement section: `dashboard-client.tsx` and `v2/optimize/ai-panel.tsx` both reach into the legacy dir for `FilterChipGroup`, `UniversalFilterBar`, `StatusSentence`, `TechnicalId`, `Sparkline`). So we **cannot** wholesale delete `src/components/`; we only delete specific files Track 4c flagged as orphan, and we re-verify before each.

## Resolved decisions

1. **Application code only.** SQL drops, RPC drops, and `database.types.ts` regeneration belong to Phase 7 (schema-as-code).
2. **One PR per batch.** 7 PRs total. Easy review, easy revert. Each PR has its own commit, its own CI run, its own Vercel preview deploy.
3. **Delete dead tests alongside dead code in the same batch.** Tests that exclusively exercise a deleted file go with that file.
4. **No refactoring.** If we notice a duplicated UX pattern or a file-size outlier while deleting, we flag it for a follow-up — we don't touch it in this phase.
5. **Top-nav goes last, alone.** `top-navigation.tsx` is the highest-risk deletion (520 LOC, theoretically live but actually hidden everywhere). It gets its own PR with an extra-rigorous smoke check.

## The 7 batches

Ordered safest-first. Each batch is a single PR.

### Batch 1 — Redirect-stub + placeholder routes (~230 LOC)

| File | LOC | Why dead |
|---|---|---|
| `src/app/optimize/page.tsx` | 40 | Redirects to `/analyst` / `/analysis` / `/analyst/creative-analysis` |
| `src/app/creative-analysis/page.tsx` | 25 | Redirects to `/analyst/creative-analysis` |
| `src/app/inbox/page.tsx` | 29 | Redirects to `/convert/inbox` or `/m/inbox` |
| `src/app/users/page.tsx` | 5 | Redirects to `/operate/users` |
| `src/app/broadsheet/page.tsx` | 5 | Redirects to `/analyst` |
| `src/app/review/page.tsx` | 63 | Static "Coming in v1.5" placeholder |
| `src/app/outcomes/page.tsx` | 60 | Static "Coming in v2" placeholder |

**Verification:** `grep -rln "/optimize\b\|/creative-analysis\b\|/inbox\b\|/users\b\|/broadsheet\b\|/review\b\|/outcomes\b" src/` — only matches should be inside the files we're deleting (cross-reference comments) or `APP_NAV_ROUTES` (which we update if any of these were referenced).

**Risk:** External bookmarks / Slack-shared links would 404 after we delete the redirects. Mitigation: confirm with user whether any of these URLs are referenced externally. If yes, keep that specific redirect.

### Batch 2 — Dead API route (~70 LOC)

| File | LOC | Why dead |
|---|---|---|
| `src/app/api/optimize/pivot-children/route.ts` | 71 | Only caller is orphan `v2/optimize/tree-table.tsx` (deleted in Batch 5) |

**Verification:** `grep -rln "pivot-children\|/api/optimize/pivot-children" src/ tests/` — should match only inside Batch-5 orphan files.

**Risk:** External polling / monitoring of this endpoint. Low — it's an internal optimize-page API, never documented externally.

### Batch 3 — Orphan libs + cascading tests (~2.6K LOC)

| File | LOC | Why dead | Cascading test deletion |
|---|---|---|---|
| `src/lib/optimize-page-data.ts` | 398 | Only `tests/optimize-page-data.test.ts` references it | `tests/optimize-page-data.test.ts` (151) |
| `src/lib/design-tokens.ts` | 215 | Pure orphan | — |
| `src/lib/executive-headline.ts` | 128 | Only consumer is orphan executive-snapshot (Batch 4) | `tests/executive-headline.test.ts` (177) |
| `src/lib/attention-rules.ts` | 275 | Only consumer is orphan executive-snapshot (Batch 4) | `tests/attention-rules.test.ts` (309) |
| `src/lib/period-pivot-data.ts` | 631 | Shared between dead `/api/optimize/pivot-children` (Batch 2) + orphan `v2/optimize/tree-table.tsx` (Batch 5) | `tests/period-pivot-data.test.ts` |
| `src/lib/pivot-by-period.ts` | 135 | Only `period-pivot-data` and tests use it | `tests/pivot-by-period.test.ts` |

**Note:** Batches 3, 4, 5 have an ordering dependency. Batch 3 deletes libs that are referenced ONLY by Batch 4/5 components. If we delete the libs first, TypeScript fails on the orphan components until we delete those too. Pick one order: either delete Batch 3 LAST (after 4 and 5), or merge Batches 3+4+5 into one PR. **Decision: delete in 5→4→3 order** so each batch has zero new TS errors before the next starts. The PR order in the plan reflects this.

### Batch 4 — `executive-snapshot/` directory + cascading primitives (~1.7K LOC)

| File | LOC | Why dead |
|---|---|---|
| `src/components/executive-snapshot/index.tsx` | ~250 | Nothing in `src/` imports `ExecutiveSnapshot` |
| `src/components/executive-snapshot/*.tsx` (3 section files) | ~758 | Same — whole dir orphan |
| `src/components/hero-number.tsx` | 73 | Only consumer is orphan executive-snapshot |
| `src/components/maturity-badge.tsx` | 56 | Only consumer is `hero-number.tsx` (cascades) |
| `src/components/week-window-toggle.tsx` | 81 | Only consumer is orphan executive-snapshot |

**Verification:** `grep -rln "ExecutiveSnapshot\|hero-number\|maturity-badge\|week-window-toggle" src/ tests/` — must match only files in this batch.

**Special check for `sparkline.tsx`:** Track 4c notes `dashboard-client.tsx` (LIVE) uses one cell of `sparkline.tsx`. We **do NOT delete** `sparkline.tsx` in this phase even though executive-snapshot also used it.

### Batch 5 — Orphan v2 components (~3.2K LOC)

| File | LOC | Notes |
|---|---|---|
| `src/components/v2/optimize/creatives-panel.tsx` | 911 | Orphan |
| `src/components/v2/optimize/tree-table.tsx` | 784 | Orphan; depends on `period-pivot-data` (Batch 3) and `/api/optimize/pivot-children` (Batch 2) |
| `src/components/v2/optimize/creative-grid.tsx` | 375 | Only consumer is `creative-grid-with-drawer` (also dead) |
| `src/components/v2/optimize/creative-grid-with-drawer.tsx` | 249 | Orphan |
| `src/components/v2/optimize/creative-detail-drawer.tsx` | 219 | Only consumer is `tree-table` (also dead) |
| `src/components/v2/optimize/time-series-chart.tsx` | 189 | Orphan |
| `src/components/v2/optimize/triage-panel.tsx` | 174 | Orphan |
| `src/components/v2/optimize/optimize-controls.tsx` | 46 | Orphan |
| `src/components/v2/optimize/metric-format.ts` | 70 | Orphan |
| `src/components/v2/convert/conversation-queue.tsx` | 175 | Orphan |
| `src/components/v2/convert/customer-journey-drawer.tsx` | 810 | Only `customer-ledger.tsx` references it — but per Track 4c that import is also dead. **Re-verify before deleting.** |

**Verification:** For each file, `grep -rln "<basename without extension>" src/ tests/`. Any match outside the orphan set means defer that one file.

### Batch 6 — Legacy primitive components (~270 LOC)

| File | LOC | Why suspect | Risk |
|---|---|---|---|
| `src/components/filter-bar.tsx` | 206 | Per Track 4c imported nowhere | Low if verified. |
| `src/components/status-sentence.tsx` (legacy, NOT v2) | 60 | Duplicate of `v2/status-sentence.tsx` (74 LOC). Per Track 4c some live code uses this. | **High** — needs per-import audit. |

**Decision: split this batch in half if needed.** If `status-sentence.tsx` (legacy) has any live caller, leave it and ship only `filter-bar.tsx`.

### Batch 7 — `top-navigation.tsx` (520 LOC) — RISKIEST, ALONE

| File | LOC | Why dead |
|---|---|---|
| `src/components/top-navigation.tsx` | 520 | Hidden by `isV2Path` on every workspace route (`/analyst`, `/convert`, `/operate/*`, `/analysis`, `/m/*`). Per Track 4c, only renders on `/login`, `/no-access`, and a couple of legacy/orphan paths. |

**Pre-deletion verification:**
1. `grep -rln "TopNavigation\|top-navigation" src/ app/` to find all importers and call sites.
2. For each importer, grep the route to check whether `isV2Path` actually hides it.
3. Smoke-test EVERY route in Chrome / Playwright after deletion. The "default" no-isV2Path routes (`/login`, `/no-access`) need extra attention — if they actually rendered the top nav, deleting it will visibly break them.
4. If any route depends on it, REVERT and split the work.

## Out of scope

- **SQL drops** (52 CRM tables, 19 read-model RPCs) — Phase 7.
- **`database.types.ts` regeneration** — Phase 7.
- **File-size outliers** (`dashboard-client.tsx` 2986 LOC, `lib/ad-hoc-analytics.ts` 3392 LOC, etc.) — not dead, just big. Their own refactor phase later.
- **Duplicated UX patterns** (4 filter-bar implementations, 2 status-sentence components, 2 pivot APIs) — consolidation is its own design conversation.
- **Migration archival** (31 CRM-era migrations into a phase-0 baseline) — Phase 7.

## Risks

1. **Static analysis stale.** Track 4c was a 2026-05-23 snapshot. The v3 work merged since (Phases 1, 2, 2.5, 2.6) may have made some "dead" code live. Mitigation: re-grep at the start of every batch; treat the inventory as a hypothesis, not a contract.
2. **External URL bookmarks.** Deleting redirect stubs (Batch 1) breaks any bookmark / shared Slack link pointing to `/optimize` etc. Mitigation: ask user up front; keep specific stubs alive if needed.
3. **Cascading import chains.** Deleting Lib A breaks Component B even though "B only uses A and B is dead too" — order matters (Batches 5 → 4 → 3). Mitigation: enforced PR order, `npm run build` gate per batch.
4. **`top-navigation.tsx` is theoretically dead but visually catastrophic** if any route actually rendered it. Mitigation: per-route Playwright smoke + headed verification by user before merge.
5. **Generated types reference deleted code.** `database.types.ts` mentions some CRM tables we're NOT touching this phase. If any deleted TS source re-exports types from `database.types.ts`, deleting the source doesn't affect the generated file. No action needed.
6. **CI / Vercel cache might serve a deleted route briefly.** Mitigation: validate each PR's preview deploy returns 404 for the deleted route before merging.

## Success criteria

- ~9.5–10.5K LOC removed from `src/` + `app/` + `tests/`, distributed across 7 merged PRs.
- `npm test` green after every batch.
- `npm run build` green after every batch.
- Vercel preview deploys green for every PR.
- No regressions on the live workspace routes (`/analyst`, `/convert`, `/operate/*`, `/website-funnel`, `/m/*`).
- No SQL changes, no `database.types.ts` change, no refactoring of unrelated code.
