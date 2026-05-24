# Phase 6 — Dead application code cleanup — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove ~9.5–10.5K LOC of dead application code from `src/` + `tests/` (the Next.js app router lives at `src/app/`) across 7 small, independently revertable PRs. No SQL changes. No refactoring. No regeneration of generated files.

**Architecture:** Verify-then-delete in batches. Each batch is its own branch, its own PR, its own merge. Order is intentional (Batches 5 → 4 → 3 inverted) to avoid transient "lib gone but consumer not yet deleted" build failures.

**Tech Stack:** Bash + grep + `rm` + `git`. `npm run build` + `npm test` as the regression gate. Playwright + browser smoke for Batch 7.

**Companion documents:**
- Spec: [../specs/2026-05-24-phase-6-dead-code-cleanup-design.md](../specs/2026-05-24-phase-6-dead-code-cleanup-design.md)
- Evidence (inventory): [../spike/2026-05-23/track-4c-dead-code.md](../spike/2026-05-23/track-4c-dead-code.md)
- v3 plan: [./2026-05-23-v3-scope.md](2026-05-23-v3-scope.md) §Phase 6

**Hard rules:**
1. No commits or merges without explicit user approval (per project AGENTS.md). Each batch ends with a "ready to commit?" gate AND a "ready to merge?" gate at the PR.
2. Verify-before-delete. For every file: `grep -rln <basename-or-export-name> src/ tests/` MUST show zero callers outside the batch. If it shows live callers, defer that file and report.
3. `npm run build` + `npm test` must pass after every batch's deletions. If they fail, the "dead" assumption was wrong — revert and investigate.
4. No file edits beyond `rm`. If a deletion produces a dangling import, do NOT edit the importer to "fix" it — that means the file wasn't actually dead. Defer.
5. Branch per batch under `claude/phase-6-batch-N-<slug>`. Each PR title `chore(cleanup): batch N — <description>`.

---

## Pre-flight (one-time)

- [ ] **Step 1: Confirm with user whether any of the redirect routes have external bookmarks**

Ask: "Batch 1 deletes redirect stubs at `/optimize`, `/creative-analysis`, `/inbox`, `/users`, `/broadsheet` and placeholder pages `/review`, `/outcomes`. Anyone bookmarked these externally? If yes, list which URLs to keep alive."

Record the answer in this plan (replace the placeholder list below) before starting Batch 1:

> **Routes to keep alive (per user, pre-flight):** _(none / list URLs)_

- [ ] **Step 2: Confirm worktree state**

```bash
cd "/Users/viv/Meta Ads AI Analysis"
git fetch origin --quiet
git log --oneline origin/main -1  # should be ba98446 or later
```

Pre-flight done.

---

## Batch 1 — Redirect-stub + placeholder routes (~230 LOC, 7 files)

**Why:** Smallest, safest batch — pure route deletions, no shared code touched.

**Branch:** `claude/phase-6-batch-1-redirect-stubs`

- [ ] **Step 1: Create the branch + worktree**

```bash
cd "/Users/viv/Meta Ads AI Analysis"
git worktree add .claude/worktrees/phase-6-batch-1-redirects -b claude/phase-6-batch-1-redirect-stubs origin/main
cd .claude/worktrees/phase-6-batch-1-redirects
```

- [ ] **Step 2: Verify each route is genuinely a redirect-stub or placeholder**

For each file below, `cat` it and confirm the content matches the inventory (single `redirect()` call or static placeholder). If any contains business logic, defer it.

```bash
for f in src/app/optimize/page.tsx src/app/creative-analysis/page.tsx src/app/inbox/page.tsx src/app/users/page.tsx src/app/broadsheet/page.tsx src/app/review/page.tsx src/app/outcomes/page.tsx; do
  echo "=== $f ==="; wc -l "$f"; head -10 "$f"
done
```

- [ ] **Step 3: Verify no other code references these routes**

```bash
for r in /optimize /creative-analysis /inbox /users /broadsheet /review /outcomes; do
  echo "=== $r ==="
  grep -rln --exclude-dir=node_modules --exclude-dir=.next "\"$r\"\\|'$r'" src/ tests/ docs/ | head
done
```

Allowed matches: comments referring to deleted routes, `APP_NAV_ROUTES` (we'll update that). Any other source reference means a live page links to these — defer that specific route.

- [ ] **Step 4: Check `APP_NAV_ROUTES` and any nav files**

```bash
grep -rn "APP_NAV_ROUTES\|NAV_ROUTES" src/ | head
```

If any of the deletion candidates appears in a nav constant, remove just that entry in the same commit.

- [ ] **Step 5: Skip any route the user asked us to keep (per Pre-flight Step 1).** Update the plan to reflect what shipped.

- [ ] **Step 6: Delete the remaining routes**

```bash
# Delete only the route directories that don't contain anything else.
# (Some routes may have sibling files like loading.tsx; check first.)
for d in optimize creative-analysis inbox users broadsheet review outcomes; do
  echo "=== src/app/$d ==="
  ls "src/app/$d" 2>/dev/null
done
# Then `git rm -r src/app/<dir>` for each one that is truly only the dead route.
```

- [ ] **Step 7: Build + test**

```bash
set -a && source .env.local && set +a
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

Both must pass.

- [ ] **Step 8: Commit + push + open PR (with user approval)**

Ask: "Batch 1 deletes N redirect/placeholder routes (~M LOC). Tests + build green. OK to commit and open PR?"

If approved:
```bash
git add -A
git commit -m "chore(cleanup): batch 1 — remove redirect-stub and placeholder routes

Per Phase 6 of v3-scope. These routes were either single-line
redirects to live destinations or 'Coming in vNext' static
placeholders. Removed: <list>.

Refs: docs/superpowers/specs/2026-05-24-phase-6-dead-code-cleanup-design.md"
git push -u origin claude/phase-6-batch-1-redirect-stubs
gh pr create --title "chore(cleanup): batch 1 — remove redirect-stub and placeholder routes" \
  --body "Phase 6 batch 1. See spec. Tests + build green locally. Awaiting Vercel."
```

- [ ] **Step 9: Wait for Vercel green, then `gh pr merge --merge` (with user approval)**

---

## Batch 2 — Dead API route (~70 LOC, 1 file)

**Branch:** `claude/phase-6-batch-2-dead-api`

- [ ] **Step 1: Create branch + worktree** (same pattern as Batch 1, substitute names)

- [ ] **Step 2: Verify dead**

```bash
grep -rln --exclude-dir=node_modules --exclude-dir=.next "pivot-children\\|/api/optimize/pivot-children" src/ tests/
```

Expected matches: only inside `src/app/api/optimize/pivot-children/route.ts` itself and orphan `v2/optimize/tree-table.tsx` (Batch 5). Any other match → defer.

- [ ] **Step 3: Delete**

```bash
git rm -r src/app/api/optimize/pivot-children/
```

- [ ] **Step 4: Build + test + commit/push/PR/merge** (same pattern)

---

## Batch 5 — Orphan v2 components (~3.2K LOC) — runs BEFORE Batch 4 and 3 to avoid transient TS errors

**Branch:** `claude/phase-6-batch-5-orphan-v2`

- [ ] **Step 1: Create branch + worktree**

- [ ] **Step 2: Verify each file is orphan**

```bash
for f in \
  creatives-panel tree-table creative-grid creative-grid-with-drawer creative-detail-drawer \
  time-series-chart triage-panel optimize-controls metric-format \
  conversation-queue customer-journey-drawer; do
  echo "=== $f ==="
  grep -rln --exclude-dir=node_modules --exclude-dir=.next "$f" src/ tests/
done
```

For each file:
- `creatives-panel`, `time-series-chart`, `triage-panel`, `optimize-controls`, `metric-format`, `conversation-queue`: must match ONLY the file itself.
- `tree-table`, `creative-grid-with-drawer`: must match ONLY siblings in the orphan set (they reference each other).
- `creative-grid`: only `creative-grid-with-drawer` references it.
- `creative-detail-drawer`: only `tree-table` references it.
- `customer-journey-drawer`: per Track 4c, `customer-ledger.tsx` references it BUT that import is also dead. Re-confirm — if `customer-ledger.tsx` actually invokes it (not just imports it), defer.

If any file fails the test, defer it and proceed with the rest.

- [ ] **Step 3: Delete the orphans**

```bash
git rm src/components/v2/optimize/creatives-panel.tsx
git rm src/components/v2/optimize/tree-table.tsx
git rm src/components/v2/optimize/creative-grid.tsx
git rm src/components/v2/optimize/creative-grid-with-drawer.tsx
git rm src/components/v2/optimize/creative-detail-drawer.tsx
git rm src/components/v2/optimize/time-series-chart.tsx
git rm src/components/v2/optimize/triage-panel.tsx
git rm src/components/v2/optimize/optimize-controls.tsx
git rm src/components/v2/optimize/metric-format.ts
git rm src/components/v2/convert/conversation-queue.tsx
git rm src/components/v2/convert/customer-journey-drawer.tsx
```

If `customer-ledger.tsx` still imports `customer-journey-drawer` (verified in Step 2), DO NOT delete that file — only delete the unambiguous orphans.

- [ ] **Step 4: Delete corresponding orphan tests if any**

```bash
grep -lE "creatives-panel|tree-table|creative-grid|customer-journey-drawer|conversation-queue|time-series-chart|triage-panel|optimize-controls" tests/ 2>/dev/null
```

If matches exist and the test ONLY exercises a now-deleted file, `git rm` it.

- [ ] **Step 5: Build + test**

```bash
set -a && source .env.local && set +a
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

- [ ] **Step 6: Commit/push/PR/merge** (same pattern as Batch 1)

---

## Batch 4 — `executive-snapshot/` directory + cascading primitives (~1.7K LOC)

**Branch:** `claude/phase-6-batch-4-executive-snapshot`

- [ ] **Step 1: Create branch + worktree**

- [ ] **Step 2: Verify `ExecutiveSnapshot` and the cascading primitives have no live consumers**

```bash
for n in ExecutiveSnapshot hero-number maturity-badge week-window-toggle; do
  echo "=== $n ==="
  grep -rln --exclude-dir=node_modules --exclude-dir=.next "$n" src/ tests/
done
```

Expected: every match is inside the executive-snapshot dir or one of the listed primitive files. If `hero-number`, `maturity-badge`, or `week-window-toggle` has a live caller, defer that file.

- [ ] **Step 3: Confirm `sparkline.tsx` is NOT deleted** (Track 4c notes one live use in `dashboard-client.tsx`):

```bash
grep -rn "sparkline" src/components/dashboard-client.tsx src/app/ src/components/v2/
```

If `dashboard-client.tsx` (or any live file) imports `sparkline.tsx`, leave it alone for this phase.

- [ ] **Step 4: Delete**

```bash
git rm -r src/components/executive-snapshot/
git rm src/components/hero-number.tsx
git rm src/components/maturity-badge.tsx
git rm src/components/week-window-toggle.tsx
```

- [ ] **Step 5: Build + test + commit/push/PR/merge** (same pattern)

---

## Batch 3 — Orphan libs + cascading tests (~2.6K LOC)

**Branch:** `claude/phase-6-batch-3-orphan-libs`

- [ ] **Step 1: Create branch + worktree**

- [ ] **Step 2: Re-verify each lib is now fully orphan (post-Batches 5 + 4)**

```bash
for n in optimize-page-data design-tokens executive-headline attention-rules period-pivot-data pivot-by-period; do
  echo "=== $n ==="
  grep -rln --exclude-dir=node_modules --exclude-dir=.next "$n" src/ tests/
done
```

After Batches 5 + 4 merged, every match should be inside the lib itself or its test file.

- [ ] **Step 3: Delete libs + their tests**

```bash
git rm src/lib/optimize-page-data.ts tests/optimize-page-data.test.ts
git rm src/lib/design-tokens.ts
git rm src/lib/executive-headline.ts tests/executive-headline.test.ts
git rm src/lib/attention-rules.ts tests/attention-rules.test.ts
git rm src/lib/period-pivot-data.ts tests/period-pivot-data.test.ts
git rm src/lib/pivot-by-period.ts tests/pivot-by-period.test.ts
```

- [ ] **Step 4: Build + test + commit/push/PR/merge** (same pattern)

---

## Batch 6 — Legacy primitive components (~270 LOC, split if needed)

**Branch:** `claude/phase-6-batch-6-legacy-primitives`

- [ ] **Step 1: Create branch + worktree**

- [ ] **Step 2: Verify `filter-bar.tsx` (legacy) has no callers**

```bash
grep -rln --exclude-dir=node_modules --exclude-dir=.next "from \\\"\\(\\.\\./\\)*components/filter-bar\\\"\\|from '\\(\\.\\./\\)*components/filter-bar'" src/ tests/
# Also grep the basename:
grep -rln --exclude-dir=node_modules --exclude-dir=.next "components/filter-bar" src/ tests/
```

If no callers, delete:
```bash
git rm src/components/filter-bar.tsx
```

- [ ] **Step 3: Audit `status-sentence.tsx` (LEGACY, NOT v2)**

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.next "from \\\"\\(\\.\\./\\)*components/status-sentence\\\"\\|from '\\(\\.\\./\\)*components/status-sentence'" src/
```

Per Track 4c, some live code uses this legacy version. **If ANY live file imports `components/status-sentence` (without the `v2/` prefix), leave the file alone — do NOT delete in this phase.** Migration to the v2 version is a separate consolidation task.

- [ ] **Step 4: Build + test + commit/push/PR/merge** (same pattern)

If only `filter-bar.tsx` was deletable, ship that alone and mark `status-sentence.tsx` for a follow-up consolidation phase.

---

## Batch 7 — `top-navigation.tsx` (520 LOC) — HIGHEST RISK, ALONE

**Branch:** `claude/phase-6-batch-7-top-nav`

- [ ] **Step 1: Create branch + worktree**

- [ ] **Step 2: Find every import and call site**

```bash
grep -rn --exclude-dir=node_modules --exclude-dir=.next "TopNavigation\\|top-navigation" src/
```

Expected: imports in `app/layout.tsx` (or workspace layouts), conditional renders gated by `isV2Path`. List every importer.

- [ ] **Step 3: Confirm every importer hides the nav via `isV2Path`**

For each importer found in Step 2, read the file and verify the `TopNavigation` render is wrapped in a check that evaluates to false on every workspace route (`/analyst`, `/convert`, `/operate/*`, `/analysis`, `/m/*`).

Per Track 4c, the only routes that would actually render it are `/login`, `/no-access`, and a "couple of legacy/orphan paths." Confirm those paths are themselves dead (deleted in Batches 1-6) OR genuinely render with no top-nav today.

- [ ] **Step 4: Smoke-test the live UI BEFORE deleting**

Start a fresh dev server in this worktree:
```bash
npm run dev  # in another terminal
```

Open in browser, log in, and visit:
- `/analyst` → top nav should already be hidden (no change expected)
- `/convert`, `/operate/users`, `/operate/health`, `/analysis`, `/m/inbox` → same
- `/login` → does the top nav render here? If yes, it WILL be visibly affected by deletion. Note before/after.
- `/no-access` → same question.

Record the BEFORE state with screenshots or notes.

- [ ] **Step 5: Delete `top-navigation.tsx` AND remove its imports / conditional renders**

```bash
git rm src/components/top-navigation.tsx
# Edit each importer to remove the (now dangling) import line and
# the `<TopNavigation .../>` JSX render. Do NOT touch any other logic.
```

This batch IS allowed to edit importers — but only to remove the dangling import + the JSX render, nothing else.

- [ ] **Step 6: Build + test**

```bash
npm run build 2>&1 | tail -5
npm test 2>&1 | tail -5
```

- [ ] **Step 7: Re-smoke the same routes**

Compare to the BEFORE state from Step 4. If any route looks different where it shouldn't, REVERT.

- [ ] **Step 8: Commit/push/PR**

Ask: "Batch 7 (top-nav) ready. Tests + build + smoke green. OK to push + open PR?"

PR title: `chore(cleanup): batch 7 — remove dead top-navigation.tsx`

PR body should include the BEFORE/AFTER smoke notes and an explicit "I verified every route" checklist.

- [ ] **Step 9: Wait for Vercel preview deploy, smoke-test the preview URL too**

Vercel preview deploys are a real production build. The dev-mode top-nav-hiding behavior MIGHT differ from a prod build (rare, but possible). Smoke the preview before merging.

- [ ] **Step 10: Merge (with user approval)**

---

## Closing

After all 7 batches merge, verify the deletion totals:

```bash
cd "/Users/viv/Meta Ads AI Analysis"
git fetch origin --quiet
git log --oneline ba98446..origin/main  # ba98446 = pre-Phase-6 main tip
git diff --stat ba98446..origin/main | tail -3
```

Expected: ~9.5–10.5K LOC of `-` deletions across `src/` + `app/` + `tests/`. ~7 merge commits.

Update this plan's title section to mark Phase 6 done. Optionally update [2026-05-23-v3-scope.md](2026-05-23-v3-scope.md) to mark Phase 6 complete.

## Hand-off

After Phase 6 ships:
- **Phase 7** (schema-as-code) becomes more attractive — the SQL surface is the next big chunk of dead weight.
- **File-size outliers** (`dashboard-client.tsx`, `lib/website-analytics.ts`, etc.) deserve their own design conversation; not part of v3 plan today.
- **Duplicated UX patterns** (4 filter-bar implementations, 2 status-sentence components) need a UX/architecture pass before consolidation. Track as separate work.
