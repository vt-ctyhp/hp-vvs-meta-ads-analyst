# Universal filter bar across `/analyst`, `/analyst/creative-analysis`, and `/analysis` — design

**Date:** 2026-05-23
**Owner:** UI consistency enhancement layered on top of the sticky-collapsible filter bar (`2026-05-22-sticky-collapsible-filters-design.md`).
**Scope:** The three analyst-room pages — `/analyst`, `/analyst/creative-analysis`, `/analysis` (Ask AI).

## Summary

Today the three analyst-room pages each present their filter controls differently: `/analyst` uses an editorial filter strip with chip groups + date range + period controls + a separate umbrella tab row, `/analyst/creative-analysis` uses a similar strip plus four dropdowns + a min-spend input + a search input, and `/analysis` has no filter UI at all (only `?days=`/`?start=`/`?end=` URL params for a date range). This spec unifies all three under one sticky+collapsible bar pattern (the `UniversalFilterBar`, generalized from the `AnalystFilterBar` shipped on 2026-05-22).

Each page renders only the filters that are actually wired end-to-end on that page; the bar's behavior (sticky on scroll, collapsed standfirst, expanded overlay panel, four close paths) is identical across all three. `/analyst/creative-analysis` loses its Min Spend filter (state + UI + filter chain removed). `/analysis` gains a real filter UI for the first time — Brand, Umbrella, Delivery — by wiring up backend support that already exists but was never reached.

No data shape changes. No API additions. The Ask AI backend already accepts `brand` / `campaign_umbrella` / `delivery_status` filters via `/api/analysis/route.ts:92-101` and `/api/chat/route.ts`; the UI just hasn't supplied them.

## Resolved decisions (from brainstorming)

1. **Sticky+collapsible behavior on all three pages.** Same `IntersectionObserver` sentinel + `top: 64` pinning + expand-on-click overlay panel as `/analyst` ships today.
2. **Show every segment always.** The collapsed standfirst renders every page's filter segments at all times, regardless of active/default state. Active (non-default) segments get a faint `bg-hp-inset` background.
3. **Ask AI scope = liberal.** The page surfaces Brand, Umbrella, and Delivery in addition to the date range — wiring the backend hookups that exist but are dead.
4. **Search lives in the universal bar** on `/analyst` and `/analyst/creative-analysis`. On `/analyst` this means moving the existing "Search creatives" input out of the Performance table actions into the filter panel. State and behavior unchanged.
5. **Implementation pattern: Option 1** — generalize the existing `AnalystFilterBar` into `UniversalFilterBar`. Each page builds its own `ActiveFilterSummary` array via a small page-local builder and passes both `summary` and `children` to the bar.
6. **Remove Min Spend** from `/analyst/creative-analysis` entirely. Strip the input UI, the `minSpend` state, and the `row.spend >= minimumSpend` filter line.

## Architecture

Rename `src/components/analyst-filter-bar.tsx` → `src/components/universal-filter-bar.tsx`. Change the prop surface from page-specific to generic:

```ts
type Props = {
  /** Pre-computed standfirst segments. Each page builds its own
   *  array via a page-local builder. */
  summary: ActiveFilterSummary;
  /** The actual filter UI. Renders once in-flow and a second time
   *  inside the expanded panel when the user opens it. */
  children: ReactNode;
};
```

Everything else stays: sentinel for `IntersectionObserver` (rootMargin `-64px`), sticky `top: 64` pinning with `z-20`, expanded panel as `absolute top-full` overlay with `0 12px 32px rgba(42,39,37,0.10)` shadow, fade-in animation via the existing `.hp-bar-fade-in` keyframes, four close paths (✕ Close button, ✎ Edit toggle, click-outside, Escape key), focus restoration to the Edit button on close, page-content dim overlay via `position: fixed` at `top: 108`, auto-close on scroll-back-to-top.

`ActiveFilterSummary` stays as the existing `{ key, value, isActive }[]` shape from `src/lib/active-filter-summary.ts`. Each page gets its own builder function:

| Page | Builder file |
|---|---|
| `/analyst` | `src/lib/active-filter-summary.ts` (existing, `buildActiveFilterSummary`) |
| `/analyst/creative-analysis` | `src/lib/active-filter-summary.ts` — new sibling export `buildCreativeAnalysisFilterSummary` |
| `/analysis` | `src/lib/active-filter-summary.ts` — new sibling export `buildAskAiFilterSummary` |

All three live in one file so the shape stays in sync and they share helper functions (`formatShortRange`, etc.).

## Per-page filter set

### `/analyst` — 7 segments

| Standfirst segment | Control in the panel | State owner | Default value display |
|---|---|---|---|
| `BRAND` | `FilterChipGroup` | existing `useState<string>("all")` | `All` |
| `DELIVERY` | `FilterChipGroup` | existing `useState<DeliveryFilter>("all")` | `All` |
| `RANGE` | `DateRangeControls` start/end + Apply + 7D/14D/30D | existing `useState<string>` start/end | always shows the range (`Apr 23 — May 22`) |
| `VS PREV` | inline toggle + `Periods` select | existing `compareEnabled` + `periodCount` | `off` / `× 2 periods` |
| `METRIC` | inline `Metric` select | existing `useState<PeriodMetric>` + `periodMetricLabel()` | `Spend` / live KPI name |
| `UMBRELLA` | `UmbrellaTabs` chips | existing `useState<string>("all")` | `All` |
| `QUERY` | text input *(moved into the panel from the Performance table actions)* | existing `useState<string>("")` | `—` / `"text"` |

The performance-table `Sort` dropdown and the `Hide financials` checkbox stay in the Performance table card — they're table actions, not filters.

### `/analyst/creative-analysis` — 8 segments

| Standfirst segment | Control | State | Default |
|---|---|---|---|
| `BRAND` | `FilterChipGroup` | existing `useState<string>("all")` | `All` |
| `DELIVERY` | `FilterChipGroup` | existing `useState<DeliveryFilter>("all")` | `All` |
| `RANGE` | `DateRangeControls` | existing start/end + Apply + 7D/14D/30D | `Apr 23 — May 22` |
| `UMBRELLA` | select dropdown | existing `useState<string>("all")` | `All` |
| `CAMPAIGN` | select dropdown — cascades from Umbrella | existing `useState<string>("all")` | `All` |
| `AD SET` | select dropdown — cascades from Campaign | existing `useState<string>("all")` | `All` |
| `STATUS` | select dropdown | existing `useState<string>("all")` | `All` |
| `QUERY` | text input | existing `useState<string>("")` | `—` / `"text"` |

Cascading behavior preserved exactly: changing Umbrella resets Campaign + Ad Set; changing Campaign resets Ad Set.

**Removed:** Min Spend. The `minSpend` state, the number input in the panel, and the `row.spend >= minimumSpend` line in `filteredRows` are all deleted.

### `/analysis` (Ask AI) — 4 segments

| Standfirst segment | Control | State | Default |
|---|---|---|---|
| `BRAND` | `FilterChipGroup` | **NEW** `useState<string \| null>(null)` in `OptimizeAiPanel` | `All` |
| `DELIVERY` | `FilterChipGroup` | **NEW** `useState<string \| null>(null)` | `All` |
| `UMBRELLA` | select dropdown | **NEW** `useState<string \| null>(null)` | `All` |
| `RANGE` | `DateRangeControls` start/end + Apply + 7D/14D/30D | **NEW** `useState<string>` start/end (seeded from the `dateRange` prop) | `Apr 23 — May 22` |

State lives inside `OptimizeAiPanel` (it's already a client component). The four new state values feed the existing `filters` and `dateRange` paths that already forward to every `/api/chat` and `/api/analysis` request body. The backend (`src/app/api/analysis/route.ts:92-101`) already converts these into `AnalysisFilter[]` entries and applies them to the runtime query. **Setting any filter narrows the dataset the AI analyses.** Nothing decorative.

URL sync: write `?brand=`, `?group=`, `?status=`, `?start=`, `?end=` on every filter change (matches the existing `/analyst` pattern of `router.replace` with the new search params, no scroll/refetch). The page route reads them on mount and passes resolved initial values to `OptimizeAiPanel`. Add a new resolver `resolveAnalysisRouteFilters(params): { brand: string | null; group: string | null; status: string | null }` in `src/lib/analysis-route.ts` (sibling to the existing `resolveAnalysisRouteDateRange`); the existing date-range resolver stays untouched.

## Standfirst rendering rules

These rules apply uniformly across all three pages:

- Each segment renders `KEY value` — `KEY` in smallcaps Cardo (`text-[10px] uppercase tracking-[0.14em] text-hp-muted`), `value` in italic Cormorant (`font-[family-name:var(--font-title)] italic text-hp-ink`).
- Active segments (non-default) get `border border-hp-rule bg-hp-inset` — a faint inset background that draws the eye.
- Default segments are transparent — same fonts, no background.
- Segments are separated by a `·` divider in `text-hp-rule`.
- Each segment is a `<button type="button">` — clicking opens the expanded panel and (per existing `/analyst` behavior) focuses the corresponding control.
- The right-side `✎ Edit ▾` button (sharp-corner, `border border-hp-ink`) opens the panel and focuses the first control. Fills ink when the panel is open (`✎ Editing ▴`).

Date range renders as `Apr 23 — May 22` (short month names, em-dash separator) via `formatShortRange()` in `active-filter-summary.ts`.

Density check: 7- and 8-segment standfirsts fit within `max-w-7xl` (1232px content width inside `(workspace)/layout.tsx`'s `px-6` padding) at standard desktop widths. On narrower viewports the flex layout wraps `✎ Edit` to a second row gracefully.

## Visual companion

`.superpowers/brainstorm/95027-1779551008/content/01-universal-bar-three-pages.html` — three bars rendered side-by-side (collapsed + expanded for each), in the editorial vocabulary shipped today.

## File map

**New:**
- `src/components/universal-filter-bar.tsx` — rename of `src/components/analyst-filter-bar.tsx`. Prop shape change: `summary: ActiveFilterSummary` + `children: ReactNode`. No new behavior; same sticky + panel + close paths.
- *(no new lib files — three builders all live in `src/lib/active-filter-summary.ts`)*

**Touched:**
- `src/lib/active-filter-summary.ts` — keep the existing `buildActiveFilterSummary` (`/analyst`); add `buildCreativeAnalysisFilterSummary` and `buildAskAiFilterSummary` sibling exports. The existing `formatShortRange` helper is shared.
- `tests/active-filter-summary.test.ts` — add tests for the two new builders covering defaults, active states, cascading dropdown values.
- `src/components/dashboard-client.tsx` — swap `AnalystFilterBar` import for `UniversalFilterBar`. Build the summary inline via `buildActiveFilterSummary` and pass `summary={...}` instead of `filters={...}`. Move the `Search creatives` input from the Performance table actions into the bar's expanded panel.
- `src/components/creative-analysis-client.tsx` — wrap the filter region in `<UniversalFilterBar>`. Remove `minSpend` state + input + filter line. Build the summary via the new `buildCreativeAnalysisFilterSummary`. Existing filter UI (FilterChipGroups, dropdowns, search input) gets reused as children of the bar.
- `src/components/v2/optimize/ai-panel.tsx` — add `useState` for `brand` / `group` / `status` / `startDate` / `endDate`. Wrap the top of the panel in `<UniversalFilterBar>`. Build the summary via the new `buildAskAiFilterSummary`. Pass current state into the existing `filters` and `dateRange` paths so the existing request body wiring carries them.
- `src/app/(workspace)/analysis/page.tsx` — call the new `resolveAnalysisRouteFilters(params)` alongside the existing `resolveAnalysisRouteDateRange(params)` and pass both resolved values as initial props to `OptimizeAiPanel`.
- `src/lib/analysis-route.ts` — add `resolveAnalysisRouteFilters(params): { brand: string \| null; group: string \| null; status: string \| null }`. Existing `resolveAnalysisRouteDateRange` stays untouched.

**Old / removed:**
- `src/components/analyst-filter-bar.tsx` — renamed; no leftover.
- `minSpend` state in `creative-analysis-client.tsx` — removed.
- `Search creatives` JSX in the Performance table card actions area (`dashboard-client.tsx`) — removed.

## What changes vs. what stays

**Changes:**
- One sticky+collapsible bar component instead of one page-local one.
- `/analyst/creative-analysis` and `/analysis` gain the sticky+collapsible behavior.
- `/analyst` search input relocates from the Performance table to the filter panel.
- `/analyst/creative-analysis` loses Min Spend (state + UI + filter line).
- `/analysis` gains Brand / Umbrella / Delivery filter state + URL sync + UI.

**Stays:**
- Every filter's underlying state hook, change handler, useMemo filter chain, URL sync behavior (date range on `/analyst`).
- Cascading reset logic on `/analyst/creative-analysis` (Umbrella → resets Campaign + Ad Set).
- The `DateRangeControls` component (used by both `/analyst` and the new `/analysis` filter UI).
- The `FilterChipGroup` component (used by all three pages).
- Backend request shapes (the Ask AI `runAnalysis` body already carries `filters` and `dateRange` — those wires don't move).
- Existing Suspense boundaries, server-side data loaders, permission gates, routes.

## Out of scope

- **Mobile.** All three pages are desktop-first today. The sticky bar's mobile treatment is a separate design (likely a bottom-sheet filter or a dedicated `/m/*` shell).
- **Filter presets / saved views.** Saved AI analyses already exist on `/analysis`; turning the saved-dashboard mechanism into a generic "filter preset" system is a separate ticket.
- **Other workspace rooms** (`/convert`, `/operate/*`, `/m/inbox`). They have different filter shapes (or none) and aren't part of the analyst-room consistency goal.
- **vs Prev / Periods / Metric on `/analyst/creative-analysis` or `/analysis`.** Those controls only mean something on `/analyst` (period breakdown table). The other two pages don't get them.

## Open questions

*(None remaining — all six brainstorming decisions are resolved above.)*
