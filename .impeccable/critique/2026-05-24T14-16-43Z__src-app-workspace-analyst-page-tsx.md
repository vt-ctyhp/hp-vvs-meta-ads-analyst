---
target: the /analyst page
total_score: 20
p0_count: 2
p1_count: 2
timestamp: 2026-05-24T14-16-43Z
slug: src-app-workspace-analyst-page-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | `ChildStateRow` exposes loading/error/empty per level (dashboard-client.tsx:1770–1853). Comparison range hidden in a `title` tooltip (L1085–1089) instead of being visible. |
| 2 | Match System / Real World | 2 | H1 reads "AI Analyst Command Center" (L842–844). Abbreviations like "vs Prev" (L1102) and "Umbrella" (L1528) leak template/jargon. The operator's own verbs ("today's decisions") don't appear. |
| 3 | User Control and Freedom | 3 | Escape closes the drawer (L153) and the filter panel (L91); date Apply does `window.location.assign` (no undo). No single "reset all filters" affordance. |
| 4 | Consistency and Standards | 2 | Three scorecards in three visual treatments (MetricTile strip L565–606, inline UmbrellaScorecard L1168, plus the dead ExecutiveSnapshot/UmbrellaScorecardSection). Em dashes used both as separators *and* missing-data placeholders. Drawer has two close patterns (X overlay + literal word "Close"). |
| 5 | Error Prevention | 2 | `applyDateRange` (L367) doesn't validate end-before-start. `text-red-700` (L2017) for error rows breaks the muted signal palette. No PDF export preview. |
| 6 | Recognition Rather Than Recall | 2 | Sticky standfirst hides delivery filter and query string conditionally. Period chips are easy to miss (L1141–1156). Umbrella tab strip overflows with no count/order indicator. |
| 7 | Flexibility and Efficiency | 1 | No keyboard shortcuts on the surface itself. No bulk select on the nested table. Power users must Cmd+K to even change date range. Quick-range buttons (L1073–1082) are the one bright spot. |
| 8 | Aesthetic and Minimalist Design | 2 | The same week of spend is rendered four times before the table: MetricTile strip, trend chart, UmbrellaScorecard, then per-row in the nested table. 12–16 controls in a single filter region (L623–672). The 5 MetricTiles are the hero-metric template DESIGN.md bans. |
| 9 | Error Recovery | 2 | `text-red-700` rows show server `error.message` verbatim (L2017, L472–477) with no suggested action. DataCoverageNotice says what's missing but offers no path to backfill. No error state for trend chart or scorecard. |
| 10 | Help and Documentation | 1 | A single `title` attribute on "Cost / Result" (umbrella-scorecard-section.tsx:121–124) is the only contextual help on the entire page. No tooltips on Frequency / CPC / Primary KPI / Periods. Empty state is "No rows match the selected filters." |
| **Total** | | **20/40** | **Acceptable, leaning Poor.** Held up by strong tokens, not by experience design. |

## Anti-Patterns Verdict

**Start here.** Does this look AI-generated?

**LLM assessment**: Not by typography or palette — the warm cream + serif + signal colors hold. But by *structure*, *control density*, and *copy*, the page is template-shaped. A reader can immediately tell two design languages are fighting in this product: the broadsheet on `/` and a Stripe-shaped admin on `/analyst`. The brand-defining ExecutiveSnapshot composition (masthead, gilt-rule pull-quote, "What needs attention" list) lives in `src/components/executive-snapshot/*` but never renders on `/analyst` — `src/app/(workspace)/analyst/page.tsx:22` returns `<DashboardClient>` directly. The most-visited screen of the product gets the templated treatment.

Hard skill/DESIGN.md bans currently violated on this surface:
- **No-Glass Rule** — `backdrop-blur-[1px]` on the hero number tile (`src/components/hero-number.tsx:45`) and `backdrop-blur` on the sticky filter bar (`src/components/universal-filter-bar.tsx:137`).
- **Side-stripe borders (absolute ban)** — `w-[2px]` gilt left bar as a row hover/active accent (`src/components/executive-snapshot/umbrella-scorecard-section.tsx:189–196`). This is a new violation discovered during the critique; the teach pass had only flagged the `v2/status-sentence.tsx` one.
- **Em-dashes in prose/labels (absolute ban)** — `src/components/executive-snapshot/top-story-section.tsx:83`, `executive-snapshot/needs-attention-section.tsx:146`, plus 9 occurrences in `dashboard-client.tsx` (L945, 954, 1031, 1492, 1512, 2138, 2160, 2717, 2726). Some are separators, some are missing-data placeholders — both are banned.
- **Muted-signal palette violation** — `text-red-700` for error rows (`dashboard-client.tsx:2017`) instead of `text-hp-danger`.
- **Warm-Neutral Rule** — `bg-white` on a config card and on iframe creative previews (`dashboard-client.tsx:534, 2189`). White is sanctioned only inside `<input>` fields.
- **Hero-metric template (banned)** — `dashboard-client.tsx:565–606` and the `MetricTile` component at L902–930. Card frame + smallcaps label + 28–32px serif number + delta chip + sparkline, repeated five times.
- **Pink ≤10% / One Voice Rule strain** — `border-hp-pink/70` + pink `AlertTriangle` icon on the DataCoverageNotice (`dashboard-client.tsx:983–984`). Pink is being spent on alarm chrome, not identity.

**Deterministic scan**: **Unavailable.** `detect.mjs` exited with `Error: bundled detector not found.` The shim resolves only `<scripts>/detector/detect-antipatterns.mjs` or `<skill>/../../cli/engine/detect-antipatterns.mjs`; neither path exists in this checkout (`.claude/skills/impeccable/scripts/detector/`, `.claude/skills/impeccable/cli/`, `.agents/skills/impeccable/scripts/detector/`, `.agents/skills/impeccable/cli/`, and `~/.claude/skills/impeccable/` all empty for that path). The detector module appears omitted from the shipped skill bundle. **Assessment independence: degraded (Assessment B detector unavailable; browser visualization also skipped, see below).**

**Visual overlays**: **Skipped.** `/analyst` requires Supabase auth and Meta API env vars that aren't available in this critique session. Without those, the route redirects to `/login` or returns no-access — no DOM to overlay. **No reliable user-visible overlay is available; the report is source-only.**

## Overall Impression

This page is functional and the design tokens are strong, but the experience design is fighting the brand promise. The marketing operator opens `/analyst` expecting a daily-briefing broadsheet (per PRODUCT.md's North Star and the work already built in `executive-snapshot/*`) and instead gets a generic admin-template surface: 4xl serif H1 saying "Command Center", a five-card metric strip, a trend chart, and a 12–16-control filter region — all before any ranked queue of decisions. The biggest single opportunity isn't to add anything; it's to render the ExecutiveSnapshot composition that already exists.

## What's Working

- **`status-sentence.tsx:38–59`** — clean two-row layout with optional action and tone-colored highlights and a hairline bottom border. This matches DESIGN.md spec exactly and should be the model for every room.
- **`dashboard-client.tsx:1770–1778, 1845–1853`** — lazy hierarchy with distinct loading/error/empty rows per level. More thoughtful than most analytics surfaces.
- **`dashboard-client.tsx:1141–1156`** — DateRange + period chip row with `period.isCurrent` getting the ink treatment is a nice domain-aware affordance.

## Priority Issues

### [P0] `/analyst` never renders the brand-defining ExecutiveSnapshot composition
- **What**: `src/app/(workspace)/analyst/page.tsx:22` returns `<DashboardClient>` directly. The broadsheet masthead, the pull-quote headline pattern (`top-story-section.tsx:80–89`), the gilt-ornament rule, and the rule-derived "What needs attention" list — all built in `src/components/executive-snapshot/*` — never appear on the operator's primary surface.
- **Why it matters**: PRODUCT.md's primary persona lands here daily. The promise of "quiet authority, status sentence first, decisive verdict" is broken on the most-visited screen. The page that's supposed to make the operator feel "the publication welcomes them in" instead makes them feel they opened a spreadsheet.
- **Fix**: Adopt the ExecutiveSnapshot pattern on `/analyst`. Pull-quote headline above the filter region. UmbrellaScorecardSection inline (not boxed as a card). The rule-derived "What needs attention" list as the *first* actionable element below the verdict, before the chart and the table.
- **Suggested command**: `shape`

### [P0] Five MetricTiles form the exact "hero-metric template" DESIGN.md bans
- **What**: `dashboard-client.tsx:565–606` renders a 5-up MetricTile grid. The MetricTile (L902–930) is a literal card frame + smallcaps label + serif number + delta chip + sparkline. DESIGN.md §6 Don'ts: *"Don't build the hero-metric template (big number + small label + supporting stats with a gradient accent). The Executive Snapshot's Hero Number is the only sanctioned big-number pattern."*
- **Why it matters**: This is the most visually dominant element on the page and it's the exact Linear/Vercel/Stripe SaaS-shell anti-reference. It also exceeds the working-memory chunk limit of 4 (5 tiles).
- **Fix**: Replace with a single `HeroNumber` for the headline metric (Spend). Demote the remaining four to a single horizontal "running line" of `label: value` pairs separated by hairlines, or absorb them into the per-umbrella scorecard. Drop four of five to silence the noise.
- **Suggested command**: `distill`

### [P1] 12–16 controls in a single filter region; umbrella tabs unbounded
- **What**: `dashboard-client.tsx:623–672` puts brand chips, delivery chips, search, two date inputs, Apply, three quick-range buttons, "vs Prev" toggle, Periods select, and Metric select all in one horizontal sprawl. Below the chart, the umbrella tab strip (L1524–1551) scrolls horizontally with no upper bound, no ordering, and no count badges.
- **Why it matters**: Cognitive load checklist fails Minimal Choices and Chunking. The operator's JTBD is *"show me today's decisions in order"*, not *"build me a query first"*.
- **Fix**: Default to the operator's primary view (last 7D, all brands, vs prev period). Move every secondary filter behind the existing `<FilterBar>`'s "More filters" disclosure (the primitive at `filter-bar.tsx:76–111` is already correct — it just isn't used here). Demote Brand to a single segmented control. Replace the umbrella tab strip with "Top 5 by spend" tabs + a "More" disclosure.
- **Suggested command**: `quieter`

### [P1] DataCoverageNotice uses pink as alarm chrome and offers no recovery action
- **What**: `dashboard-client.tsx:983–984` renders the data-coverage warning with `border-hp-pink/70` + pink `AlertTriangle` + no primary action. Pink — the brand identity color — is now the alarm color on `/analyst`, and the only "ornament" on the page is this alert.
- **Why it matters**: One Voice Rule is strained (pink's *meaning slot* has been hijacked from identity to error). When sync gaps happen, the operator gets a pink rectangle that does nothing — no "Backfill", no "Open sync".
- **Fix**: Recolor to `border-hp-warning` + `bg-hp-warning-bg` + warning icon (the system has `signal-warning` for exactly this). Add a primary action ("Open sync log →"). Reserve pink for selection chrome and links per DESIGN.md §2 Primary.
- **Suggested command**: `colorize`

### [P2] Em-dashes scattered across the surface; one side-stripe border still in the wild
- **What**: 9 em-dash occurrences in `dashboard-client.tsx` (placeholder + separator both), plus `top-story-section.tsx:83` and `needs-attention-section.tsx:146`. Separately, `umbrella-scorecard-section.tsx:189–196` uses `w-[2px]` as a gilt left bar on hover/active rows — the side-stripe absolute ban.
- **Why it matters**: Both are stated absolute bans. DESIGN.md §6 Don'ts already flagged the v2 side-stripe; this critique found another instance in a different file. Em-dashes have an entry too, and the violation list is larger than the original note suggested.
- **Fix**: Replace placeholder em-dashes with the locked glossary or a clean `·` (the page already uses `·` correctly at L787–789). Rewrite the hero blockquote's leading dash as an italic eyebrow ("A weekly lede:"). Replace the entity/headline separator on attention rows with a colon or comma. Rewrite the umbrella-scorecard row hover/active state to use a full hairline border shift or a tone change instead of the 2px gilt stripe.
- **Suggested command**: `polish`

## Persona Red Flags

**Marketing operator (primary, from PRODUCT.md).** Lands on `/analyst` expecting a pull-quote verdict and a ranked queue of today's decisions. Instead gets a Bootstrap-shaped H1 (`dashboard-client.tsx:842–844` — "AI Analyst Command Center"), a 5-tile metric strip, and a 12+-control filter region before any rule-derived attention list. To clear today's queue under five minutes (the stated success metric in PRODUCT.md), they must scroll past the trend chart, scan the umbrella scorecard, expand the nested table, and read row by row. There's no ranked queue on this surface — the ranked queue exists in `needs-attention-section.tsx` but isn't rendered. Quick action verbs from the locked glossary (Scale / Watch / Fix) live in dead code; the operator does the ranking work mentally.

**Sam (accessibility, from `personas.md`).** `text-red-700` for error states (L2017) bypasses `signal-danger` and may fail the contrast budget the system was tuned for. Sticky filter standfirst (`filter-bar.tsx:210–238`) uses italic display-serif at 12px on cream — likely fails AA legibility on small viewports. Drawer (`dashboard-client.tsx:2038–2143`) is `role="dialog"` `aria-modal="true"` but does not move focus into the drawer on open. Δ delta column conveys "good vs bad" through inline `color` style with no textual cue (L1383). Delivery status pills (L1949–1952) appear to be color-only.

**Riley (deliberate stress tester, from `personas.md`).** `applyDateRange` (L367–375) accepts end-before-start silently. Period mode + many umbrellas creates `tableMinWidth` of 1800–2400px (L1589–1591) — overflows horizontally on a 1440px laptop with no shadow/fade cue that there's hidden content. `UniversalFilterBar` (L127, L181) renders the filter children twice when the sticky panel opens — any imperative DOM in a child (focus, autocomplete) will fight. Lazy-load error message (L472–477) surfaces `error.message` verbatim from the server. DataCoverageNotice doesn't defensively format `coverage.missingDays` (L991) — could render as a stringified array.

## Minor Observations

- `dashboard-client.tsx:842–844` — H1 "AI Analyst Command Center" should become the ExecutiveSnapshot masthead pattern ("Performance broadsheet, Vol. N · Week W").
- `dashboard-client.tsx:1102` — "vs Prev" should be "vs prior period" (the status sentence at L299 already uses the full phrase). Standardize.
- `dashboard-client.tsx:1383` — `↕` Unicode glyph for inactive sort headers is crude on a serif-heavy surface. Use a typographically-considered chevron pair.
- `dashboard-client.tsx:2074` — drawer "Close" button text vs. outer `aria-label="Close drawer"` button — two close affordances, two patterns.
- `dashboard-client.tsx:1626–1648` — table column headers `Δ` with subscript `oldest→current` should use the smallcaps eyebrow per the design system, not a Unicode arrow.
- `dashboard-client.tsx:1979, 1985, 1988, 1991` — `font-[family-name:var(--font-title)]` inlined four times. Extract to a single class (the design system exposes `font-title` already).
- `dashboard-client.tsx:687` — `recharts` `Tooltip` has no aria-summary. PRODUCT.md §Accessibility requires charts to include an accessible summary.
- `umbrella-scorecard-section.tsx:451` — `bg-hp-ink/55` share bar reads thick at typical row heights.
- `executive-snapshot/index.tsx:35` — `min-h-screen` on the ExecutiveSnapshot wrapper, max-width capped at `max-w-6xl`; DashboardClient uses `max-w-7xl`. Inconsistent width tokens for the same product.
- `universal-filter-bar.tsx:170–172` — "Filters · changes apply on click" is too system-y. Try "Adjust filters."

## Questions to Consider

- If the marketing operator's JTBD is *"show me today's decisions in order"* — why is the first thing on `/analyst` a five-metric overview grid and a trend chart, instead of the ranked queue from `attention-rules.ts` and `needs-attention-section.tsx`?
- The design system has built two scorecard surfaces (`UmbrellaScorecard` in `dashboard-client.tsx:1168` and `UmbrellaScorecardSection` in `executive-snapshot/`) with different visual languages for the same data. Which one is the *real* scorecard, and what is the role of the other?
- The pull-quote headline pattern (`top-story-section.tsx:80–89`) is the most brand-correct moment in the entire codebase — and it's never rendered on the page where the operator lives. What would change if `/analyst` literally embedded `<ExecutiveSnapshot>` above the filter region and pushed the table down a screen?
- The page renders the same week of spend across four visual treatments before the table (MetricTile strip, trend chart, UmbrellaScorecard, then per-row in nested table). If you could only show two of those, which two do operators actually use, and what does the answer say about the other two?
