---
target: /analyst (post-rebuild)
total_score: 24
p0_count: 2
p1_count: 2
timestamp: 2026-05-24T20-24-02Z
slug: src-app-workspace-analyst-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Strong: status sentence, sticky standfirst, Apply→Updating cycle. Missing: no skeleton during full-page reload (`window.location.assign` at L336/349), standfirst shows stale values during reload. |
| 2 | Match System / Real World | 2 | Sticky standfirst still says "UMBRELLA" / "VS PREV" / "ACTIVE" (`active-filter-summary.ts` L68, L80, L95) while in-flow chips say "GROUP" / "vs prior period" / "LIVE". One screen, two vocabularies. |
| 3 | User Control and Freedom | 2 | Periods, Metric, and date Apply all do full-page `window.location.assign` (L336, L349). No back-out mid-change, no one-click "Clear all filters". |
| 4 | Consistency and Standards | 2 | Same concept rendered three ways in one viewport: "Group" (table column, L1079/L1493) + "Groups" (section eyebrow, L753) + "UMBRELLA" (sticky standfirst). |
| 5 | Error Prevention | 3 | Apply disables during pending; Apply verb cycles honestly. No confirm before page-reloading filters that reset drawer/scroll state. |
| 6 | Recognition Rather Than Recall | 3 | Per-control smallcaps eyebrows are clean; sticky standfirst keeps active filters present while scrolling. Help text absent at point-of-use. |
| 7 | Flexibility and Efficiency | 3 | URL-persisted metric, quick chips, custom range. No keyboard shortcuts, no saved presets, comparison toggle is a checkbox-as-chip. |
| 8 | Aesthetic and Minimalist Design | 3 | Substantially quieter than prior version. Row 2 still sprouts ~10 controls when comparison enabled (Delivery + search + vs-prior + Periods + Metric + period chips row). Table hits 8 columns in flat mode. |
| 9 | Error Recovery | 2 | `ChildStateRow` shows raw server `error.message` (L1882). PDF failure is a `window.alert` (L2148). `text-red-700` raw color leak. DataCoverageNotice now has a recovery link (+). |
| 10 | Help and Documentation | 1 | Only the comparison checkbox has a `title=` tooltip (L664-669). No info affordances on "Cost / Result", "Δ oldest→current", "Frequency", "Risk", "Primary KPI". "Off" status exists in glossary but can't be filtered on. |
| **Total** | | **24/40** | **Up from 20/40 (+4).** Quieter and more on-brand. The standfirst regression + help/reload gaps held it under 25. |

## Anti-Patterns Verdict

**LLM assessment**: The visual register holds — border-collapse tables, hairline rules, smallcaps eyebrows, square corners, Cormorant titles, muted palette. The structural rebuild is real. But four DESIGN.md / glossary bans are still active, three of them visible in the sticky standfirst (the most-trafficked chrome on the page):

- **`src/lib/active-filter-summary.ts:68`** — sticky-bar key is the literal `"vs Prev"` (locked to "vs prior period").
- **`src/lib/active-filter-summary.ts:80`** — sticky-bar key is the literal `"Umbrella"` (should be `TERMS.campaignUmbrella` = "Group").
- **`src/lib/active-filter-summary.ts:95`** — delivery value returns `"Active"` (glossary-locked to "Live").
- **`src/lib/active-filter-summary.ts:86, 107, 109`** — em-dashes in the standfirst (range separator + empty-query placeholder).
- **`src/components/dashboard-client.tsx:1882`** — `text-red-700` raw Tailwind on child-row error message (should be `text-signal-danger`).
- **`src/components/dashboard-client.tsx:2054`** — `bg-white` on the ad-preview iframe (sandboxed-iframe edge case; defensible but worth noting).

All other DESIGN.md rules pass on a code read: pink ≤10%, no #000/#fff outside the iframe edge case, no backdrop-blur except the workspace header (existing project convention, not my code), square corners on action elements, no side-stripe borders, two-family serif consistent. MetricTile strip kept per your earlier approval — not re-flagged.

**Deterministic scan**: Still **unavailable.** `detect.mjs` exited with `Error: bundled detector not found.` Shim looks at `scripts/detector/detect-antipatterns.mjs` and `cli/engine/detect-antipatterns.mjs`; neither ships. Same as prior run.

**Visual overlays**: **Authenticated and inspected.** Browser inspection at viewport 1440×900, scrollY=1200 confirmed:

- ✓ Workspace header is sticky at top: 0, `backdrop-filter: blur(8px)` (existing project pattern, not my code)
- ✓ DataCoverageNotice renders amber: `border-color: oklab(0.51 0.03 0.09 / 0.7)` (signal-warning), `background: rgb(246,236,214)` (signal-warning-bg), no backdrop-filter
- ✓ MetricTiles equal-height (5 × 136.5px)
- ✓ Row 1 form + Row 2 div both `flex flex-wrap items-center gap-x-5 gap-y-3 py-3`, hairline border between, no row eyebrows
- ✓ 0 console errors, 2 dev-mode Fast Refresh warnings (no code defects)
- **Caveat**: Assessment B reported `.hp-bar-fade-in` (sticky filter bar) not in DOM at scrollY=1200. The init-check I added covers page-load-with-restored-scroll; but if the page mounts at scrollY=0 and the user programmatically jumps to a deeper scroll without firing a real scroll event, the IO may not recompute. Real user scrolls trigger IO reliably; the agent's `scrollTo` test does not. Flagging as a low-priority edge case, not a regression.

## Overall Impression

The rebuild moved the score from 20 to 24, primarily on Aesthetic, Recognition, and Error Prevention. The page is quieter, more typographically considered, and reads closer to PRODUCT.md's "editorial broadsheet" register. The DataCoverageNotice colorize and the single-tree filter refactor are both genuinely well-executed. **But the sticky standfirst still speaks the pre-rebuild vocabulary**, and that contradicts the brand-discipline work everywhere else on the page. Fixing `active-filter-summary.ts` is a 10-minute change that would push the score to ~26.

## What's Working

- **Status sentence is the page's brand peak** — `dashboard-client.tsx:279–321` + `status-sentence.tsx`. Two-clause editorial headline with semantic tone (positive / warning / neutral) that reads like a broadsheet pull-quote. Genuinely on-brand.
- **DataCoverageNotice (`dashboard-client.tsx:990–1012`)** — warning band, recovery link, AAA-contrast sub-text, `role="status"`, `aria-hidden` icon. Textbook execution.
- **UniversalFilterBar single-tree refactor** — `universal-filter-bar.tsx` is 149 lines, no duplicate-DOM, sound init-check (L58–59) that handles browser-restored scroll position cleanly.

## Priority Issues

### [P0] Sticky-bar standfirst leaks pre-rebuild vocabulary into the most-visible chrome
**Why it matters**: the sticky bar is the only thing visible during scroll. It currently renders `UMBRELLA / VS PREV / ACTIVE` while the in-flow region renders `GROUP / vs prior period / LIVE`. Same screen, two vocabularies. Confidence-killer for the operator persona, who expects the platform to know its own language.
**Fix**: `src/lib/active-filter-summary.ts`
- L68 → `"vs prior"` or `"Comparing"`
- L80 → `TERMS.campaignUmbrella` (= "Group")
- L95 → `"Live"`
- L86, L107, L109 → replace em-dashes with `" to "` (range) or empty string (placeholder)
**Suggested command**: `distill`

### [P0] One concept, three names in one viewport
**Why it matters**: `Group` (column header, L1079/L1493) + `Groups` (section eyebrow, L753) + `UMBRELLA` (sticky standfirst, L80) all visible at once. PRODUCT.md glossary maps unambiguously to "Group".
**Fix**: lock every user-visible site to `TERMS.campaignUmbrella` / `TERMS.umbrellaShort`. Audit with `rg -in '\bumbrellas?\b' src/` to catch regressions.
**Suggested command**: `distill` (same pass as above)

### [P1] Filter changes nuke the page via `window.location.assign`
**Why it matters**: changing Periods (L349) or applying a date range (L336) does a hard navigation. White flash, lost scroll, lost drawer state. The persona JTBD is "act on each decision then leave" — every reload re-litigates the decision they just made. Also defeats the smooth-scroll back-to-filters affordance built into the sticky bar.
**Fix**: swap to `router.replace(...)` with a local fetch + state update. The data-fetching path already exists for child rows (`fetchAnalystPerformanceChildren`); generalize.
**Suggested command**: `optimize`

### [P1] Help / glossary affordances are absent at point-of-use
**Why it matters**: "Primary KPI", "Cost / Result", "Δ oldest→current", "Frequency", "Risk: low/medium/high", "Live vs Paused (where is Off?)" are all undefined in-page. Only the comparison checkbox has a tooltip. Marketing operator can fake it, but cross-functional readers (analytics partner, founder) will guess. Heuristic #10 = 1/4.
**Fix**: tiny `info` affordance (Lucide `Info` icon, size 12, `text-hp-muted`) next to each column header that opens a popover with a one-sentence glossary entry sourced from a `KPI_GLOSSARY` map. Single component, ~80 lines, applies everywhere.
**Suggested command**: `clarify`

### [P2] Delivery chip lies about coverage; PeriodDeltaCell signaling is color-only
**Why it matters**: Delivery chip exposes `All / Live / Paused` (L649–653) but glossary defines a fourth state `"Off"`, used by `deliveryStatusLabel` (L2580) and `formatAdDelivery` (L73). User can see "Off" in a cell but can't filter on it. Separately, `PeriodDeltaCell` (L1366–1374) signals good/bad **only** via inline color `#245D4D` / `#8D2E2E` with no glyph, no `aria-label`. DeltaChip got fixed in polish; this one didn't.
**Fix**: add "Off" chip (or rename "Paused"→"Not delivering" and merge). Add `aria-label="Down X% vs OLDEST"` + ▲/▼/→ glyph to `PeriodDeltaCell` mirroring DeltaChip at L966–980.
**Suggested command**: `harden`

## Persona Red Flags

**Marketing operator (primary)**. Confident in Row 1 (clean). Hesitates in Row 2 when comparison is on (~10 controls). Hits the "VS PREV / UMBRELLA / ACTIVE" standfirst and squints — it doesn't match what they just configured. The full-page-reload-on-filter-change trains them to make all decisions in one shot, defeating the iterative-exploration shape the page wants.

**Founder / time-poor exec (auto-selected)**. Loves the status sentence + sticky standfirst. Doesn't understand the Δ oldest→current column, Frequency, or what "Risk" means — no inline glossary. Either ignores the right-hand columns or asks the operator, defeating the "show me today's decisions" promise.

**Analyst / cross-functional partner (auto-selected)**. Loves the data-coverage band and the technical-id chips in the drawer. Frustrated by `text-red-700` raw color in error rows (can't tell signal-danger from a random red) and `window.alert` for PDF failures (L2148) — feels like a 2010 line-of-business app.

## Minor Observations

- `dashboard-client.tsx:854` — ShellHeader `·` separator uses `text-hp-rule`; reads slightly too faint as a typographic separator. Consider `text-hp-muted`.
- `dashboard-client.tsx:1502–1503` + L1086–1087 — "oldest→current" Unicode arrow in `text-[9px]` subscript. Only Unicode arrow that survived the Lucide migration in `ScorecardHeader`. Consider Lucide `ArrowRight` size 10 or spell "OLDEST TO CURRENT".
- `dashboard-client.tsx:1357` — `PeriodDeltaCell` empty state renders `<span aria-hidden>·</span>`. A middot for "no data" reads as a value. Empty or "n/a" would be cleaner.
- `dashboard-client.tsx:1809` — `row.adName || "Creative"` as fallback row sub-label is generic. Consider "Unnamed creative" or hide the sub-label.
- `dashboard-client.tsx:2003` — drawer-footer fallback "No ad ID on record. Open Ads Manager directly." — second sentence is an instruction that doesn't link anywhere. Either remove or make it a link.
- `dashboard-client.tsx:1097/L1166` — scorecard rows are `cursor-pointer` with `onClick` but no `role="button"` / `tabIndex` / keyboard handler. Mouse-only affordance.
- `dashboard-client.tsx:1903–1909` — drawer click-out + X overlay + "Close" word button = three close affordances. SR users hear "Close drawer button" stacked.
- The brief / craft tasks said "per-row sparklines in the table cover trend at-a-glance" — they don't. `MetricTreeRow` (L1761–1862) has no sparkline cells. When the standalone trend chart was deleted, the row-level trend affordance was not added to compensate.

## Questions to Consider

- If the operator's JTBD is "act on each decision then leave," why are Periods and Metric (which only affect comparison framing) on the same toolbar as Delivery and Brand (which gate the row set)? Should those two live in a "compare against …" cluster downstream of the table?
- The status sentence is the page's brand peak. Why is it bracketed by (a) a 5-tile metric strip above and (b) a scorecard table below — both restating variations of the same numbers? Could `[ShellHeader] → [StatusSentence] → [FilterBar] → [Table]` work, with tiles + scorecard collapsed into an "Overview" disclosure?
- Δ oldest→current is mathematically meaningful only when periods ≥ 3. With periods = 2 (the default!) it's the same as the DeltaChip on the previous column. Should the column auto-hide when `periodWindows.length === 2`?
- "Risk: low/medium/high" appears in the drawer (L2078–2091) and in the PDF export. It's never shown in the in-page table. If risk is real, why hidden? If not real enough to surface in the table, why in the drawer?

## Delta from prior critique (20/40 → 24/40, +4)

| Heuristic | Prior | Now | Δ | Why |
|---|---|---|---|---|
| 1 Visibility | 3 | 3 | 0 | StatusSentence is excellent; full-page reload on filter still hurts |
| 2 Match real-world | 2 | 2 | 0 | In-flow fixed; standfirst regression cancels gain |
| 3 User control | 3 | 2 | **-1** | Lost a point: `window.location.assign` is now the primary friction |
| 4 Consistency | 2 | 2 | 0 | In-flow consistent; standfirst-vs-in-flow split is new gap |
| 5 Error prevention | 2 | 3 | +1 | Apply disabled state, coverage warning band |
| 6 Recognition | 2 | 3 | +1 | Per-control smallcaps eyebrows + sticky standfirst (when it matches!) |
| 7 Flexibility | 1 | 3 | +2 | Quick chips, URL-persisted metric, comparison toggle, cleaner controls |
| 8 Aesthetic | 2 | 3 | +1 | Substantially quieter; row 2 still expands too much when comparing |
| 9 Error recovery | 2 | 2 | 0 | DataCoverageNotice +; `text-red-700` + `window.alert` still present |
| 10 Help | 1 | 1 | 0 | No new contextual help added |
