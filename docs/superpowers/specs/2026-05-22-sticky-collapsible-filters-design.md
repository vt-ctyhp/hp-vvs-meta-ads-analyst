# Sticky &amp; collapsible filters on `/analyst` — design

**Date:** 2026-05-22
**Owner:** UI enhancement layered on top of the editorial rebuild (`2026-05-22-editorial-rebuild-design.md`)
**Scope:** `/analyst` only. `/analyst/creative-analysis` may inherit the same pattern as a follow-up if the same scroll-fatigue problem applies there.

## Summary

On `/analyst`, when the user scrolls past the filter region to reach the performance breakdown table at the bottom of the page, all filter context disappears above the fold. The user has to scroll back up to read what they're filtering by, and back up again to change anything. This spec adds a sticky, collapsible filter bar that pins under the workspace nav header once the original filter region scrolls past, presenting the current filter state as a single editorial standfirst with click-to-expand affordance.

No data, filter logic, URL params, computation, or routing changes. Pure UI behavior addition: sticky positioning + collapse/expand state + an `IntersectionObserver` to detect the trigger point.

## Problem

The `/analyst` page (rendered by `DashboardClient` in `src/components/dashboard-client.tsx`) renders three stacked horizontal control regions between the KPI tiles and the trend chart:

1. **Filter strip** — Brand chips, Delivery chips, date range + Apply, 7D/14D/30D quick ranges, vs Prev toggle, Periods select, Metric select.
2. **Period chips row** — current and prior period windows; visible only when vs Prev is on.
3. **Umbrella tabs** — campaign-umbrella filter (All / Facebook US Product / Book Appts US / etc.).

Combined, the three bands occupy roughly 200-300px of vertical real estate. The performance breakdown table at the bottom of the page is the most-used data surface on the room. By the time the user is reading or interacting with the table, every filter that scoped the table's data is offscreen.

## Solution

Three states for the filter region:

### State A · At top of page (default)

Filter region renders in normal layout flow under the editorial masthead and KPI tiles. Identical to the post-editorial-rebuild appearance — `border-y border-hp-rule py-4` filter strip, period chip row below, umbrella tabs below that. Only the workspace nav header is sticky (already pinned at the top via the editorial shell). Nothing else.

### State B · Scrolled past (collapsed sticky bar)

When the user scrolls and the bottom edge of the original filter region (i.e. the bottom edge of the umbrella-tabs row) crosses above the nav header's bottom edge (top: 64px), a thin sticky bar fades in. It pins to `top: 64px` under the nav header. Layout:

- Single horizontal line, ~44px tall.
- Background: `bg-hp-card/96` with `backdrop-filter: blur(6px)`, hairline `border-b border-hp-rule`, soft drop shadow `0 4px 14px rgba(42,39,37,0.05)`.
- Content reads as a journalist's standfirst — six segments separated by `·` dividers:

  > `BRAND All  ·  DELIVERY All  ·  RANGE Apr 23 — May 22  ·  VS PREV × 2 periods  ·  METRIC Spend  ·  UMBRELLA All`

  Each segment uses smallcaps Cardo for the key and italic Cormorant for the value.
- Active toggles (e.g. `vs Prev × 2 periods` when on; brand other than `All`; delivery other than `All`) get a faint `bg-hp-inset border border-hp-rule` background and tighter padding so they read as visually distinct from "default" segments.
- Right side: a `✎ Edit ▾` button (sharp-corner, `border border-hp-ink`, smallcaps Cardo) that opens the expanded panel.

Each segment is its own click target. Clicking a segment opens the expanded panel and scrolls/focuses the corresponding control inside the panel (e.g. clicking `BRAND All` focuses the Brand chip group).

When the user scrolls back up and the bottom edge of the original filter region re-enters the viewport, the sticky bar fades out (120ms ease-out) and the original region is the only filter UI visible.

### State C · Expanded panel (user clicked Edit or a segment)

The full filter UI overlays the page as a panel:

- Rendered as an `absolute` element directly below the sticky collapsed bar (still pinned at `top: 64px`).
- Background: `bg-hp-card`, `border-b border-hp-rule`, drop shadow `0 12px 32px rgba(42,39,37,0.10)`.
- Internal padding: `p-5` (matches editorial card padding).
- Inside: the same three control bands as the in-flow layout (filter strip / period chips row / umbrella tabs), in the same order, with the same chips, inputs, and selects. No chrome difference from the original — only the surrounding overlay is new.
- Header above the bands: a smallcaps eyebrow `Filters · changes apply on click` left-aligned, and a `✕ Close` button right-aligned.
- Chevron on the sticky bar's `✎ Edit` button rotates to ▴ and the button fills ink (active state) while the panel is open.
- Page content beneath the panel dims via an overlay `<div>` at `opacity: 0.55` with `pointer-events: none` so clicks pass through to the panel only.

Filter changes inside the panel apply immediately (no separate panel-apply step) — identical to the existing behavior in the in-flow filter region. The page re-renders behind the dimmed overlay as the user changes filters.

The panel closes via any of four interactions:
- Click the `✕ Close` button
- Click the `✎ Editing ▴` button (toggle off)
- Click anywhere outside the panel
- Press `Escape`

All four paths use the same collapse animation (120ms ease-in-out, the existing motion base token).

## Visual companion

`.superpowers/brainstorm/48424-1779487444/content/01-sticky-filters.html` — three states stacked top to bottom; interaction spec annotated under each state.

## Interaction spec

### Sticky trigger
An `IntersectionObserver` watches a `<div>` sentinel placed immediately after the original filter region (after the umbrella tabs row). The observer's `rootMargin` is `-64px 0px 0px 0px` (the nav header height) so the sentinel is considered "out of view" once it crosses above the nav header bottom. When the sentinel's `isIntersecting` flips to `false`, set `isStuck = true`. When it flips back to `true`, set `isStuck = false`.

The collapsed bar renders only when `isStuck`. Fade-in is `opacity 0 → 1` over 120ms with `transform: translateY(-4px) → 0`. Fade-out is the reverse.

### Pinning
The collapsed bar uses `position: sticky; top: 64px;` and lives inside the workspace `<main>` content wrapper (not the layout shell — keeps it scoped to `/analyst` only). z-index 20 — below the workspace nav header (z 30) and below dropdowns/popovers/identity menu (z 40+), above page content (z 0).

### Click targets in the collapsed bar
Each segment is a `<button type="button">` with smallcaps key + Cormorant italic value. On click:
1. Open the expanded panel (`isPanelOpen = true`)
2. Move keyboard focus to the corresponding control in the panel
3. Smoothly scroll the panel's interior so that control is visible (relevant only if the panel ever scrolls, which it won't at standard viewport widths)

The `✎ Edit` button on the right has the same effect as clicking the bar's empty area: opens the panel and focuses the first control (Brand chip group).

### Expanded panel mount + close
The panel mounts and unmounts (rather than always being in the DOM with display toggled) — keeps focus management simple. On open: `aria-expanded="true"` on the trigger, focus moves into the first control, body scroll is NOT locked (the user can keep scrolling the page beneath; the panel travels with the sticky bar because it's anchored to the sticky element). On close: `aria-expanded="false"`, focus returns to whatever trigger opened it (the specific segment, or the Edit button).

The four close paths:
- `✕ Close` button — `onClick`
- `✎ Editing` toggle — same handler
- Click outside — a `useEffect` that adds a `mousedown` listener on `document`. The listener ignores clicks within the panel itself AND within the sticky collapsed bar (clicking a sticky-bar segment is treated as "switch focus to that filter," not "close." Clicking the Edit button is the toggle, handled separately.)
- `Escape` key — a `useEffect` that adds a `keydown` listener and checks `e.key === "Escape"`

### Persistence
`isPanelOpen` and `isStuck` are component-local React state. No URL params, no localStorage. If the user scrolls back to the top while the panel is open, the panel auto-closes (no reason to keep an overlay sticky over the original full filter UI that just reappeared). Implementation: a `useEffect` that calls `setIsPanelOpen(false)` whenever `isStuck` transitions to `false`.

### Accessibility
- Sticky bar segments are `<button type="button">` with descriptive `aria-label` text — e.g. `aria-label="Brand: All. Click to edit."`
- `✎ Edit` button: `aria-expanded={isPanelOpen}`, `aria-controls="analyst-filter-panel"`
- Panel: `<div role="region" aria-label="Filters" id="analyst-filter-panel">`
- Focus management as described above
- Escape closes the panel (standard pattern)
- The collapsed bar respects `prefers-reduced-motion` — fades become instant transitions when reduced motion is requested

## File map

**New component:**
- `src/components/analyst-filter-bar.tsx` (client) — wraps the filter region with the sticky/collapsible behavior. Renders three modes: in-flow (children render as-is), collapsed sticky bar, expanded panel.

**Touched component:**
- `src/components/dashboard-client.tsx` — wrap the existing filter region + period chips row + umbrella tabs in `<AnalystFilterBar>`. No changes to the filter controls themselves; only the wrapping element.

**New small utility (if extracted):**
- `src/lib/active-filter-summary.ts` (optional) — pure function that takes the current filter state (brand, delivery, dateRange, compareEnabled, periodCount, metric, umbrella) and returns the array of `{ key, value, isActive }` segments the collapsed bar renders. Extracting it keeps `analyst-filter-bar.tsx` focused on rendering + behavior; the summary text logic gets unit-tested independently.

## What changes vs. what stays

**Changes:**
- The three filter bands on `/analyst` are wrapped in a new `<AnalystFilterBar>` component.
- A sticky collapsed bar appears on scroll and an expandable overlay panel becomes the editing surface in that state.
- A sentinel `<div>` is inserted after the umbrella tabs row for the IntersectionObserver.

**Stays:**
- All filter controls (chips, date inputs, vs Prev toggle, Periods select, Metric select, umbrella tabs) — same components, same props, same state, same handlers, same change-applies-immediately behavior.
- All filter state lives in `DashboardClient` and is passed down — `AnalystFilterBar` is presentational chrome; it does not own filter state.
- Existing URL param sync (date range, compareEnabled, periodCount, umbrella, etc.) unchanged.
- KPI tiles, trend chart, umbrella scorecard, performance tree table — all unchanged.
- Workspace nav header at `h-16` (64px) unchanged.

## Out of scope

- **Mobile.** The `/analyst` page is desktop-first today. The sticky bar would need a different treatment on phones (probably a bottom-sheet filter or a dedicated `/m/analyst` page). Flag as a follow-up.
- **Other rooms.** `/convert`, `/operate/*`, `/m/inbox` have different filter chrome (or none) and are not in scope.
- **`/analyst/creative-analysis`.** May benefit from the same pattern; revisit after this lands and we see whether users hit the same scroll-fatigue problem on that page.
- **Filter presets / saved views.** Not in scope; preset UI would belong inside the expanded panel as a future addition.
- **Persisting `isPanelOpen` across navigations.** Component-local state only.

## Resolved decisions (from brainstorming)

1. **Scope of sticky region** — Option C: all three bands (filter strip + period chips + umbrella tabs) collapse into one sticky bar.
2. **Collapse behavior** — Option 1: sticky + auto-collapse on scroll, click to expand into an overlay panel.
3. **Expanded panel layout** — overlay (not push). Page content stays in place visually, dims to 55% behind the panel.
4. **Collapsed bar content** — editorial standfirst (`KEY value · KEY value · ...`) with smallcaps Cardo keys and italic Cormorant values. Each segment clickable. Active toggles get a faint inset background.
5. **Close paths** — ✕ Close button, Edit toggle, click outside, Escape key. All four use the same animation.
6. **Persistence** — component-local state, no URL or localStorage. Auto-closes on scroll-back-to-top.
