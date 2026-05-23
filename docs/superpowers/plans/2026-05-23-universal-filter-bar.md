# Universal filter bar — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the filter bar across `/analyst`, `/analyst/creative-analysis`, and `/analysis` (Ask AI) by generalizing the existing `AnalystFilterBar` (sticky+collapsible) into a `UniversalFilterBar` and rendering page-specific filter sets through it.

**Architecture:** Rename + reshape the existing client component so it takes a generic `summary: ActiveFilterSummary` + `children: ReactNode` (instead of page-specific `filters` input). Each of the three pages builds its own summary via a small sibling export in `src/lib/active-filter-summary.ts` and wraps its existing filter UI in `<UniversalFilterBar>`. `/analyst` moves its `Search creatives` input out of the Performance table actions into the bar. `/analyst/creative-analysis` loses Min Spend entirely (state + UI + filter line). `/analysis` gains brand/group/status state + URL sync, wired to the existing-but-dormant backend filter path.

**Tech Stack:** Next.js App Router · React client components · Tailwind v4 with `@theme inline` in `globals.css` · `node --test --experimental-strip-types` for unit tests · Vercel preview for visual verification.

**Spec reference:** `docs/superpowers/specs/2026-05-23-universal-filter-bar-design.md`
**Visual companion:** `.superpowers/brainstorm/95027-1779551008/content/01-universal-bar-three-pages.html`

---

## File map

**Renamed:**
- `src/components/analyst-filter-bar.tsx` → `src/components/universal-filter-bar.tsx` — generic sticky+collapsible bar. Prop shape changes from `filters: ActiveFilterInput` to `summary: ActiveFilterSummary`.

**Touched:**
- `src/lib/active-filter-summary.ts` — keep existing `buildActiveFilterSummary` (renamed conceptually as the `/analyst` builder); add two sibling exports for the other pages.
- `tests/active-filter-summary.test.ts` — extend to cover the two new builders.
- `src/lib/analysis-route.ts` — add `resolveAnalysisRouteFilters(params)` sibling to the existing date-range resolver.
- `tests/analysis-route.test.ts` — extend to cover the new resolver.
- `src/components/dashboard-client.tsx` — swap `AnalystFilterBar` import for `UniversalFilterBar`; build summary inline; move `Search creatives` input from the Performance table actions into the filter region rendered as children.
- `src/components/creative-analysis-client.tsx` — wrap filter region in `<UniversalFilterBar>`; remove `minSpend` state, input, and filter chain entry; build summary via new helper.
- `src/components/v2/optimize/ai-panel.tsx` — add `useState` for `brand` / `group` / `status` / `startDate` / `endDate`; wrap filter UI in `<UniversalFilterBar>`; URL sync via `router.replace`; build summary via new helper.
- `src/app/(workspace)/analysis/page.tsx` — call the new `resolveAnalysisRouteFilters` alongside the existing date-range resolver; pass both as initial props.

**Conventions:**
- Tailwind classes only — use the existing editorial utilities (`bg-hp-card`, `text-hp-ink`, `border-hp-rule`, etc.). No new color tokens.
- Sharp corners only (no `rounded-*`), except round avatars (none here).
- Cardo serif body, Cormorant for titles (already loaded via `next/font/google`).
- Relative imports inside `src/lib/*.ts` use `.ts` extension so `node --test` ESM resolution works (existing convention: see `dashboard-performance-tree.ts`).
- TypeScript strict mode — never use `any`; explicit nullability on the new state.

---

## Phase 1 — Generalize the component

### Task 1: Rename `AnalystFilterBar` → `UniversalFilterBar` + reshape the prop surface

Goal: one rename + one prop swap. The component's internals (IntersectionObserver, sticky pinning, panel mount/close, focus restoration) stay identical.

**Files:**
- Rename: `src/components/analyst-filter-bar.tsx` → `src/components/universal-filter-bar.tsx`
- Modify: the renamed file (prop shape)

**Steps:**

- [ ] **Step 1: Rename the file**

```bash
git mv src/components/analyst-filter-bar.tsx src/components/universal-filter-bar.tsx
```

- [ ] **Step 2: Update the component to accept `summary` instead of `filters`**

Open `src/components/universal-filter-bar.tsx`. At the top, change the import of `buildActiveFilterSummary` (no longer needed inside the component) and the `Props` type:

Before:
```tsx
import {
  buildActiveFilterSummary,
  type ActiveFilterInput,
  type ActiveFilterSummary,
} from "@/lib/active-filter-summary";

type Props = {
  filters: ActiveFilterInput;
  children: ReactNode;
};

export function AnalystFilterBar({ filters, children }: Props) {
  const summary = buildActiveFilterSummary(filters);
  // ...
}
```

After:
```tsx
import { type ActiveFilterSummary } from "@/lib/active-filter-summary";

type Props = {
  /** Pre-computed standfirst segments. Each page builds its own. */
  summary: ActiveFilterSummary;
  /** The filter UI. Rendered once in-flow and a second time inside
   *  the expanded panel when the user opens it. */
  children: ReactNode;
};

export function UniversalFilterBar({ summary, children }: Props) {
  // body unchanged — `summary` is now a prop instead of computed
}
```

Remove the line `const summary = buildActiveFilterSummary(filters);` from inside the function body — `summary` is now a prop.

Update the JSDoc comment block at the top of the file to refer to "the analyst-room pages" (plural) and to mention it's a generic bar — not analyst-specific.

- [ ] **Step 3: Update call sites that import the renamed component**

Run: `grep -rn "AnalystFilterBar\|analyst-filter-bar" src/ tests/ 2>/dev/null`

Replace every match. There is exactly one call site at this point:

In `src/components/dashboard-client.tsx`:

Before:
```tsx
import { AnalystFilterBar } from "./analyst-filter-bar";
```

After:
```tsx
import { UniversalFilterBar } from "./universal-filter-bar";
```

And in the JSX, change:
```tsx
<AnalystFilterBar
  filters={{
    brand, delivery, startDate, endDate, compareEnabled,
    periodCount, periodMetric,
    primaryResultLabel: currentPrimaryResultLabel,
    umbrella,
  }}
>
```

to:
```tsx
<UniversalFilterBar
  summary={buildActiveFilterSummary({
    brand, delivery, startDate, endDate, compareEnabled,
    periodCount, periodMetric,
    primaryResultLabel: currentPrimaryResultLabel,
    umbrella,
  })}
>
```

If `buildActiveFilterSummary` isn't already imported in `dashboard-client.tsx`, add to the existing `active-filter-summary` import group (or create one):

```tsx
import { buildActiveFilterSummary } from "@/lib/active-filter-summary";
```

- [ ] **Step 4: Run build + lint + tests**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `npm test`
Expected: all tests pass (the existing 344 tests should be unaffected).

Run: `npm run lint`
Expected: no new errors; pre-existing warnings in `creative-grid.tsx` are not new.

- [ ] **Step 5: Smoke the dev server**

Run (if not already running): `npm run dev -- -p 3002`
Open `http://localhost:3002/analyst`, scroll past the filter region. Confirm the collapsed bar still pins and behaves identically.

- [ ] **Step 6: Commit**

```bash
git add src/components/universal-filter-bar.tsx src/components/dashboard-client.tsx
git commit -m "refactor(analyst): rename AnalystFilterBar to UniversalFilterBar with summary prop"
```

---

## Phase 2 — Per-page summary builders

### Task 2: Add `buildCreativeAnalysisFilterSummary` with tests

Goal: pure function — given the creative-analysis filter state, return the standfirst segments array.

**Files:**
- Modify: `src/lib/active-filter-summary.ts`
- Modify: `tests/active-filter-summary.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

In `tests/active-filter-summary.test.ts`, append (do not delete existing tests):

```ts
import {
  buildActiveFilterSummary,
  buildCreativeAnalysisFilterSummary,
  type ActiveFilterInput,
  type CreativeAnalysisFilterInput,
} from "../src/lib/active-filter-summary.ts";

const CREATIVE_DEFAULTS: CreativeAnalysisFilterInput = {
  brand: "all",
  delivery: "all",
  startDate: "2026-04-23",
  endDate: "2026-05-22",
  umbrella: "all",
  campaign: "all",
  adSet: "all",
  status: "all",
  query: "",
};

test("creative analysis · all defaults → 8 segments, only Range is non-default, nothing active", () => {
  const summary = buildCreativeAnalysisFilterSummary(CREATIVE_DEFAULTS);
  assert.equal(summary.length, 8);
  assert.deepEqual(
    summary.map((s) => s.key),
    ["Brand", "Delivery", "Range", "Umbrella", "Campaign", "Ad Set", "Status", "Query"],
  );
  assert.deepEqual(
    summary.map((s) => s.isActive),
    [false, false, false, false, false, false, false, false],
  );
});

test("creative analysis · range formats short month names", () => {
  const range = buildCreativeAnalysisFilterSummary(CREATIVE_DEFAULTS)
    .find((s) => s.key === "Range");
  assert.equal(range?.value, "Apr 23 — May 22");
});

test("creative analysis · brand non-default → segment shows brand code and is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, brand: "HP" });
  const brand = summary.find((s) => s.key === "Brand");
  assert.equal(brand?.value, "HP");
  assert.equal(brand?.isActive, true);
});

test("creative analysis · delivery non-default uses title case and is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, delivery: "paused" });
  const delivery = summary.find((s) => s.key === "Delivery");
  assert.equal(delivery?.value, "Paused");
  assert.equal(delivery?.isActive, true);
});

test("creative analysis · umbrella/campaign/ad set cascade — each non-default is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({
    ...CREATIVE_DEFAULTS,
    umbrella: "Facebook US Product",
    campaign: "CBI_Evergreen_FB_Product_2026",
    adSet: "Lookalike 1% — US",
  });
  assert.equal(summary.find((s) => s.key === "Umbrella")?.value, "Facebook US Product");
  assert.equal(summary.find((s) => s.key === "Campaign")?.value, "CBI_Evergreen_FB_Product_2026");
  assert.equal(summary.find((s) => s.key === "Ad Set")?.value, "Lookalike 1% — US");
  for (const key of ["Umbrella", "Campaign", "Ad Set"]) {
    assert.equal(summary.find((s) => s.key === key)?.isActive, true);
  }
});

test("creative analysis · status non-default shows label as-is and is active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, status: "ACTIVE" });
  const status = summary.find((s) => s.key === "Status");
  assert.equal(status?.value, "ACTIVE");
  assert.equal(status?.isActive, true);
});

test("creative analysis · empty query → '—' and not active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, query: "" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "—");
  assert.equal(q?.isActive, false);
});

test("creative analysis · non-empty query → quoted and active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, query: "ring" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "\"ring\"");
  assert.equal(q?.isActive, true);
});

test("creative analysis · whitespace-only query is not active", () => {
  const summary = buildCreativeAnalysisFilterSummary({ ...CREATIVE_DEFAULTS, query: "   " });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.isActive, false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/active-filter-summary.test.ts 2>&1 | tail -10`
Expected: FAIL with `Cannot find name 'buildCreativeAnalysisFilterSummary'` or similar import error.

- [ ] **Step 3: Implement the builder**

In `src/lib/active-filter-summary.ts`, add the new type + builder beneath the existing `buildActiveFilterSummary` (do not remove existing exports):

```ts
export type CreativeAnalysisFilterInput = {
  brand: string;
  delivery: "all" | "active" | "paused";
  startDate: string;
  endDate: string;
  umbrella: string;
  campaign: string;
  adSet: string;
  status: string;
  query: string;
};

export function buildCreativeAnalysisFilterSummary(
  input: CreativeAnalysisFilterInput,
): ActiveFilterSummary {
  const trimmedQuery = input.query.trim();
  return [
    {
      key: "Brand",
      value: input.brand === "all" ? "All" : input.brand,
      isActive: input.brand !== "all",
    },
    {
      key: "Delivery",
      value: deliveryLabel(input.delivery),
      isActive: input.delivery !== "all",
    },
    {
      key: "Range",
      value: formatShortRange(input.startDate, input.endDate),
      isActive: false,
    },
    {
      key: "Umbrella",
      value: input.umbrella === "all" ? "All" : input.umbrella,
      isActive: input.umbrella !== "all",
    },
    {
      key: "Campaign",
      value: input.campaign === "all" ? "All" : input.campaign,
      isActive: input.campaign !== "all",
    },
    {
      key: "Ad Set",
      value: input.adSet === "all" ? "All" : input.adSet,
      isActive: input.adSet !== "all",
    },
    {
      key: "Status",
      value: input.status === "all" ? "All" : input.status,
      isActive: input.status !== "all",
    },
    {
      key: "Query",
      value: trimmedQuery ? `"${trimmedQuery}"` : "—",
      isActive: trimmedQuery.length > 0,
    },
  ];
}
```

Note: `deliveryLabel` and `formatShortRange` already exist in this file (private helpers used by `buildActiveFilterSummary`). The new builder reuses them.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass; the new 8 tests for `buildCreativeAnalysisFilterSummary` go green; existing tests stay green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/active-filter-summary.ts tests/active-filter-summary.test.ts
git commit -m "feat(lib): add buildCreativeAnalysisFilterSummary"
```

---

### Task 3: Add `buildAskAiFilterSummary` with tests

Goal: pure function — given the Ask AI filter state (with nullable filter values), return the 4 standfirst segments.

**Files:**
- Modify: `src/lib/active-filter-summary.ts`
- Modify: `tests/active-filter-summary.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

In `tests/active-filter-summary.test.ts`, append:

```ts
import { buildAskAiFilterSummary, type AskAiFilterInput } from "../src/lib/active-filter-summary.ts";

const ASK_AI_DEFAULTS: AskAiFilterInput = {
  brand: null,
  delivery: null,
  umbrella: null,
  startDate: "2026-04-23",
  endDate: "2026-05-22",
};

test("ask AI · all defaults → 4 segments, only Range is non-default", () => {
  const summary = buildAskAiFilterSummary(ASK_AI_DEFAULTS);
  assert.equal(summary.length, 4);
  assert.deepEqual(
    summary.map((s) => s.key),
    ["Brand", "Delivery", "Umbrella", "Range"],
  );
  assert.deepEqual(
    summary.map((s) => s.isActive),
    [false, false, false, false],
  );
});

test("ask AI · null filters render as 'All'", () => {
  const summary = buildAskAiFilterSummary(ASK_AI_DEFAULTS);
  assert.equal(summary.find((s) => s.key === "Brand")?.value, "All");
  assert.equal(summary.find((s) => s.key === "Delivery")?.value, "All");
  assert.equal(summary.find((s) => s.key === "Umbrella")?.value, "All");
});

test("ask AI · non-null brand → segment is active and shows brand code", () => {
  const summary = buildAskAiFilterSummary({ ...ASK_AI_DEFAULTS, brand: "HP" });
  const brand = summary.find((s) => s.key === "Brand");
  assert.equal(brand?.value, "HP");
  assert.equal(brand?.isActive, true);
});

test("ask AI · non-null delivery shows title case and is active", () => {
  const summary = buildAskAiFilterSummary({ ...ASK_AI_DEFAULTS, delivery: "active" });
  const delivery = summary.find((s) => s.key === "Delivery");
  assert.equal(delivery?.value, "Active");
  assert.equal(delivery?.isActive, true);
});

test("ask AI · non-null umbrella → segment is active and shows umbrella name", () => {
  const summary = buildAskAiFilterSummary({ ...ASK_AI_DEFAULTS, umbrella: "Book Appts US" });
  const um = summary.find((s) => s.key === "Umbrella");
  assert.equal(um?.value, "Book Appts US");
  assert.equal(um?.isActive, true);
});

test("ask AI · range always renders short month format", () => {
  const range = buildAskAiFilterSummary(ASK_AI_DEFAULTS).find((s) => s.key === "Range");
  assert.equal(range?.value, "Apr 23 — May 22");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/active-filter-summary.test.ts 2>&1 | tail -10`
Expected: FAIL with `Cannot find name 'buildAskAiFilterSummary'`.

- [ ] **Step 3: Implement the builder**

In `src/lib/active-filter-summary.ts`, add beneath `buildCreativeAnalysisFilterSummary`:

```ts
export type AskAiFilterInput = {
  brand: string | null;
  delivery: "active" | "paused" | null;
  umbrella: string | null;
  startDate: string;
  endDate: string;
};

export function buildAskAiFilterSummary(
  input: AskAiFilterInput,
): ActiveFilterSummary {
  return [
    {
      key: "Brand",
      value: input.brand ?? "All",
      isActive: input.brand !== null,
    },
    {
      key: "Delivery",
      value: input.delivery === null ? "All" : deliveryLabel(input.delivery),
      isActive: input.delivery !== null,
    },
    {
      key: "Umbrella",
      value: input.umbrella ?? "All",
      isActive: input.umbrella !== null,
    },
    {
      key: "Range",
      value: formatShortRange(input.startDate, input.endDate),
      isActive: false,
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass; the new 6 Ask AI tests go green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/active-filter-summary.ts tests/active-filter-summary.test.ts
git commit -m "feat(lib): add buildAskAiFilterSummary for /analysis page"
```

---

## Phase 3 — Analysis route resolver

### Task 4: Add `resolveAnalysisRouteFilters` with tests

Goal: pure function — read `?brand=`/`?group=`/`?status=` from the search params and return `{ brand, group, status }`.

**Files:**
- Modify: `src/lib/analysis-route.ts`
- Modify: `tests/analysis-route.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

In `tests/analysis-route.test.ts`, append (do not delete existing tests):

```ts
import { resolveAnalysisRouteFilters } from "../src/lib/analysis-route.ts";

test("resolveAnalysisRouteFilters · empty params → all null", () => {
  assert.deepEqual(resolveAnalysisRouteFilters({}), {
    brand: null,
    group: null,
    status: null,
  });
});

test("resolveAnalysisRouteFilters · reads brand/group/status verbatim", () => {
  assert.deepEqual(
    resolveAnalysisRouteFilters({
      brand: "HP",
      group: "Facebook US Product",
      status: "active",
    }),
    {
      brand: "HP",
      group: "Facebook US Product",
      status: "active",
    },
  );
});

test("resolveAnalysisRouteFilters · ignores empty strings", () => {
  assert.deepEqual(
    resolveAnalysisRouteFilters({ brand: "", group: "  ", status: "" }),
    {
      brand: null,
      group: null,
      status: null,
    },
  );
});

test("resolveAnalysisRouteFilters · handles array-valued params (Next.js can pass arrays)", () => {
  assert.deepEqual(
    resolveAnalysisRouteFilters({
      brand: ["VVS", "HP"],
      group: ["Book Appts US"],
      status: ["paused"],
    }),
    {
      brand: "VVS",
      group: "Book Appts US",
      status: "paused",
    },
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types tests/analysis-route.test.ts 2>&1 | tail -10`
Expected: FAIL with `Cannot find name 'resolveAnalysisRouteFilters'`.

- [ ] **Step 3: Implement the resolver**

In `src/lib/analysis-route.ts`, add to the bottom of the file (do not modify existing exports):

```ts
export type AnalysisRouteFilters = {
  brand: string | null;
  group: string | null;
  status: string | null;
};

export function resolveAnalysisRouteFilters(
  params: AnalysisRouteSearchParams,
): AnalysisRouteFilters {
  return {
    brand: stringParam(params.brand),
    group: stringParam(params.group),
    status: stringParam(params.status),
  };
}

function stringParam(value: string | string[] | undefined): string | null {
  const raw = firstParam(value);
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}
```

Note: `firstParam` already exists privately in this file (used by `resolveAnalysisRouteDateRange`). Reuse it.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: all tests pass; the new 4 `resolveAnalysisRouteFilters` tests go green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/analysis-route.ts tests/analysis-route.test.ts
git commit -m "feat(lib): add resolveAnalysisRouteFilters URL resolver for /analysis"
```

---

## Phase 4 — Migrate `/analyst` (move search into bar)

### Task 5: Move `Search creatives` input from the Performance table into the universal bar's panel

Goal: relocate the search input. The `query` state, the `setQuery` handler, the filter chain — all stay. Only the JSX position moves.

**Files:**
- Modify: `src/components/dashboard-client.tsx`

**Steps:**

- [ ] **Step 1: Locate the search input in the Performance table actions**

Run: `grep -n "Search creatives\|placeholder=\"Search\|setQuery" src/components/dashboard-client.tsx | head`

The input is in the Performance table card actions block (around lines 645-700 — verify with grep). It's a `<label>` containing a `<Search>` icon (lucide) and an `<input>` bound to `query`/`setQuery`.

Cut the entire `<label>` element (the search input wrapper). Save the JSX for the next step.

- [ ] **Step 2: Add the search input to the UniversalFilterBar's children**

The `<UniversalFilterBar>` wrap is around line 485-540 in `dashboard-client.tsx`. The children today are two `<section>` elements: the filter strip and the umbrella tabs.

Add a third `<section>` between them (or place the search input in the existing filter strip — choose whichever has more room). Recommended: add as the last child of the existing filter strip `<section>` so it sits inline with the chip groups:

In the existing filter strip section (search for `<FilterChipGroup label="Delivery"`), after the closing `</div>` of the chip group container and before `<DateRangeControls>`, insert:

```tsx
<label className="flex min-w-0 items-center gap-2 border-b border-hp-rule px-1 py-2 focus-within:border-hp-pink sm:w-64">
  <Search size={16} className="text-hp-muted" />
  <input
    value={query}
    onChange={(event) => setQuery(event.target.value)}
    placeholder="Search creatives"
    className="w-full bg-transparent text-sm outline-none placeholder:text-hp-muted"
  />
</label>
```

Note: this is the *same* JSX that was in the Performance table actions block — same className, same handlers. Verify the `Search` icon is already imported at the top of the file; if not, ensure `import { Search } from "lucide-react";` exists.

- [ ] **Step 3: Add Query to the summary**

The `buildActiveFilterSummary` builder in `src/lib/active-filter-summary.ts` does not currently include a `Query` segment for `/analyst`. Extend `ActiveFilterInput` and the builder:

In `src/lib/active-filter-summary.ts`, modify the existing type:

```ts
export type ActiveFilterInput = {
  brand: string;
  delivery: "all" | "active" | "paused";
  startDate: string;
  endDate: string;
  compareEnabled: boolean;
  periodCount: number;
  periodMetric: PeriodMetric;
  primaryResultLabel?: string | null;
  umbrella: string;
  query: string;  // NEW
};
```

In the same file, modify `buildActiveFilterSummary` — append a new segment to the returned array (last position):

```ts
    {
      key: "Query",
      value: input.query.trim() ? `"${input.query.trim()}"` : "—",
      isActive: input.query.trim().length > 0,
    },
```

- [ ] **Step 4: Update the existing summary tests for the new Query segment**

In `tests/active-filter-summary.test.ts`, find the test `"all defaults — every segment renders, only Range is non-default, no segment is active"`. The current `DEFAULTS` object lacks `query`. Update the default and assertions:

```ts
const DEFAULTS: ActiveFilterInput = {
  brand: "all",
  delivery: "all",
  startDate: "2026-04-23",
  endDate: "2026-05-22",
  compareEnabled: false,
  periodCount: 2,
  periodMetric: "spend",
  umbrella: "all",
  query: "",  // NEW
};
```

Update the assertion that checks segment keys:

```ts
assert.deepEqual(
  summary.map((s) => s.key),
  ["Brand", "Delivery", "Range", "vs Prev", "Metric", "Umbrella", "Query"],
);
assert.deepEqual(
  summary.map((s) => s.isActive),
  [false, false, false, false, false, false, false],
);
```

Update the length assertion:

```ts
assert.equal(summary.length, 7);
```

Update the `"everything customised"` test similarly to add `query: "ring"` and to expect `Query` active:

```ts
test("everything customised → every segment except Range is active", () => {
  const summary = buildActiveFilterSummary({
    brand: "HP",
    delivery: "active",
    startDate: "2026-01-20",
    endDate: "2026-01-25",
    compareEnabled: true,
    periodCount: 8,
    periodMetric: "ctr",
    umbrella: "Facebook US Product",
    query: "ring",
  });
  assert.deepEqual(
    summary.map((s) => ({ key: s.key, isActive: s.isActive })),
    [
      { key: "Brand", isActive: true },
      { key: "Delivery", isActive: true },
      { key: "Range", isActive: false },
      { key: "vs Prev", isActive: true },
      { key: "Metric", isActive: true },
      { key: "Umbrella", isActive: true },
      { key: "Query", isActive: true },
    ],
  );
});
```

Add a small new test specifically for the Query segment:

```ts
test("/analyst · empty query → '—' and not active", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, query: "" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "—");
  assert.equal(q?.isActive, false);
});

test("/analyst · non-empty query → quoted and active", () => {
  const summary = buildActiveFilterSummary({ ...DEFAULTS, query: "ring" });
  const q = summary.find((s) => s.key === "Query");
  assert.equal(q?.value, "\"ring\"");
  assert.equal(q?.isActive, true);
});
```

- [ ] **Step 5: Pass `query` into the summary call**

Back in `src/components/dashboard-client.tsx`, find the `<UniversalFilterBar summary={buildActiveFilterSummary({...})}>` call from Task 1. Add `query` to the object literal:

```tsx
<UniversalFilterBar
  summary={buildActiveFilterSummary({
    brand,
    delivery,
    startDate,
    endDate,
    compareEnabled,
    periodCount,
    periodMetric,
    primaryResultLabel: currentPrimaryResultLabel,
    umbrella,
    query,  // NEW
  })}
>
```

- [ ] **Step 6: Run type check + tests**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 7: Smoke the dev server**

Open `http://localhost:3002/analyst`. Verify:
- The `Search creatives` input now sits in the filter strip (no longer in the Performance table actions area).
- Typing in it filters the performance tree exactly as before.
- The sticky standfirst includes a `QUERY` segment at the end. With empty query: `QUERY —`. With text: `QUERY "ring"` (active inset background).

- [ ] **Step 8: Commit**

```bash
git add src/components/dashboard-client.tsx src/lib/active-filter-summary.ts tests/active-filter-summary.test.ts
git commit -m "feat(analyst): relocate search input into universal filter bar"
```

---

## Phase 5 — Migrate `/analyst/creative-analysis`

### Task 6: Wrap creative-analysis filter UI in `UniversalFilterBar` and remove Min Spend

Goal: bring the creative-analysis page under the universal bar pattern. Also delete `minSpend` state, input, and filter chain entry.

**Files:**
- Modify: `src/components/creative-analysis-client.tsx`

**Steps:**

- [ ] **Step 1: Locate the existing filter strip + state**

In `src/components/creative-analysis-client.tsx`:
- State declarations: around lines 75-90 — find `const [brand`, `const [delivery`, `const [umbrella`, `const [campaign`, `const [adSet`, `const [status`, `const [minSpend`, `const [query`, `const [startDate`, `const [endDate`.
- Filter UI: around lines 400-520 — the existing filter strip JSX.
- Filter chain: around lines 146-172 — the `filteredRows = useMemo(...)` that applies all filters.

- [ ] **Step 2: Remove Min Spend (state, UI, filter chain)**

In `src/components/creative-analysis-client.tsx`:

1. Delete the line `const [minSpend, setMinSpend] = useState("");` (around line 81).

2. Find the JSX for the Min Spend input (around line 495 — a `<input>` bound to `minSpend`/`setMinSpend`, may live in a `<label>` with text "Min spend" or similar). Delete the entire `<label>` (or wrapper element) that contains the Min Spend input.

3. In the `filteredRows = useMemo(...)` block, delete the line:

```ts
.filter((row) => !Number.isFinite(minimumSpend) || row.spend >= minimumSpend)
```

Also delete the supporting line above it:

```ts
const minimumSpend = Number(minSpend);
```

4. Find the `activeFilters` useMemo (search for `if (minSpend`) and delete the Min Spend entry there too.

5. Run `grep -n "minSpend\|minimumSpend\|Min spend\|Min Spend" src/components/creative-analysis-client.tsx` to confirm no remaining references.

- [ ] **Step 3: Wrap filter UI in `<UniversalFilterBar>`**

Add the imports at the top:

```tsx
import { UniversalFilterBar } from "./universal-filter-bar";
import { buildCreativeAnalysisFilterSummary } from "@/lib/active-filter-summary";
```

In the JSX, locate the existing filter strip `<section>` (search for `<section.*filter` or the surrounding context — it contains the FilterChipGroups). Wrap it (and any sibling filter rows) in:

```tsx
<UniversalFilterBar
  summary={buildCreativeAnalysisFilterSummary({
    brand,
    delivery,
    startDate,
    endDate,
    umbrella,
    campaign,
    adSet,
    status,
    query,
  })}
>
  {/* existing filter strip + cascading dropdown rows go here */}
</UniversalFilterBar>
```

The children of `<UniversalFilterBar>` are the existing filter JSX — same FilterChipGroups, same dropdowns, same date inputs, same search input. No styling changes; the bar just adds sticky+collapsible behavior.

- [ ] **Step 4: Run type check + tests + lint**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `npm test`
Expected: all tests pass.

Run: `npm run lint`
Expected: no new errors. (If the `Search` import from lucide-react is now unused after Min Spend removal, lint will flag it — remove the import.)

- [ ] **Step 5: Smoke the dev server**

Open `http://localhost:3002/analyst/creative-analysis`. Verify:
- All filter controls render (no Min Spend input anywhere).
- Filters still affect the creative grid (try changing Brand or Umbrella).
- Scroll past the filter region — the sticky bar pins under the workspace nav header.
- Click `✎ Edit` — the panel opens with all 8 filter controls.
- Cascading still works: change Umbrella → Campaign + Ad Set reset to "All".

- [ ] **Step 6: Commit**

```bash
git add src/components/creative-analysis-client.tsx
git commit -m "feat(creative-analysis): adopt universal filter bar, remove Min Spend"
```

---

## Phase 6 — Migrate `/analysis` (Ask AI · new filter UI)

### Task 7: Add brand/group/status state to `OptimizeAiPanel` + URL sync + wrap in `UniversalFilterBar`

Goal: the page that has zero filter UI today gets a real filter bar wired to the existing-but-dormant backend filter path. State lives in the client component; URL sync via `router.replace`.

**Files:**
- Modify: `src/components/v2/optimize/ai-panel.tsx`
- Modify: `src/app/(workspace)/analysis/page.tsx`

**Steps:**

- [ ] **Step 1: Extend the page route to pass resolved initial filter values**

In `src/app/(workspace)/analysis/page.tsx`:

Before:
```tsx
import {
  resolveAnalysisRouteDateRange,
  type AnalysisRouteSearchParams,
} from "@/lib/analysis-route";
// ...
return (
  <OptimizeAiPanel
    initialSaved={savedDashboards}
    canUseAdHocAnalysis
    dateRange={resolveAnalysisRouteDateRange(params)}
  />
);
```

After:
```tsx
import {
  resolveAnalysisRouteDateRange,
  resolveAnalysisRouteFilters,
  type AnalysisRouteSearchParams,
} from "@/lib/analysis-route";
// ...
return (
  <OptimizeAiPanel
    initialSaved={savedDashboards}
    canUseAdHocAnalysis
    dateRange={resolveAnalysisRouteDateRange(params)}
    initialFilters={resolveAnalysisRouteFilters(params)}
  />
);
```

- [ ] **Step 2: Update `OptimizeAiPanel` props to accept `initialFilters`**

In `src/components/v2/optimize/ai-panel.tsx`, update the `Props` type:

Before:
```tsx
type Props = {
  initialSaved: SavedAnalysisDashboard[];
  canUseAdHocAnalysis: boolean;
  dateRange: {
    days: number;
    startDate: string | null;
    endDate: string | null;
  };
  filters?: {
    brand: string | null;
    group: string | null;
    status: string | null;
  };
};

const DEFAULT_FILTERS = {
  brand: null,
  group: null,
  status: null,
};
```

After:
```tsx
type Props = {
  initialSaved: SavedAnalysisDashboard[];
  canUseAdHocAnalysis: boolean;
  dateRange: {
    days: number;
    startDate: string | null;
    endDate: string | null;
  };
  initialFilters?: {
    brand: string | null;
    group: string | null;
    status: string | null;
  };
};

const DEFAULT_INITIAL_FILTERS: NonNullable<Props["initialFilters"]> = {
  brand: null,
  group: null,
  status: null,
};
```

- [ ] **Step 3: Replace the `filters` prop usage with internal state + URL sync**

In the same file, change the function signature and add state:

Before:
```tsx
export function OptimizeAiPanel({
  initialSaved,
  canUseAdHocAnalysis,
  dateRange,
  filters = DEFAULT_FILTERS,
}: Props) {
  // ...
```

After:
```tsx
export function OptimizeAiPanel({
  initialSaved,
  canUseAdHocAnalysis,
  dateRange,
  initialFilters = DEFAULT_INITIAL_FILTERS,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [brand, setBrand] = useState<string | null>(initialFilters.brand);
  const [delivery, setDelivery] = useState<"active" | "paused" | null>(
    initialFilters.status === "active" || initialFilters.status === "paused"
      ? initialFilters.status
      : null,
  );
  const [umbrella, setUmbrella] = useState<string | null>(initialFilters.group);
  const [startDate, setStartDate] = useState<string>(dateRange.startDate ?? "");
  const [endDate, setEndDate] = useState<string>(dateRange.endDate ?? "");
  // ...
```

Add imports near the top of the file:

```tsx
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UniversalFilterBar } from "@/components/universal-filter-bar";
import {
  buildAskAiFilterSummary,
} from "@/lib/active-filter-summary";
```

Replace the existing `runtimeFilters` useMemo (which used the `filters` prop) with one that reads the new state:

```tsx
const runtimeFilters = useMemo<AnalysisFilter[]>(() => {
  const next: AnalysisFilter[] = [];
  if (brand) {
    next.push({ field: "brand", operator: "equals", value: brand });
  }
  if (umbrella) {
    next.push({
      field: "campaign_umbrella",
      operator: "equals",
      value: umbrella,
    });
  }
  if (delivery) {
    next.push({
      field: "delivery_status",
      operator: "equals",
      value: delivery,
    });
  }
  return next;
}, [brand, delivery, umbrella]);
```

Find every other reference to `filters.brand` / `filters.group` / `filters.status` in the file (search: `grep -n "filters\." src/components/v2/optimize/ai-panel.tsx`). Replace them:

- `filters.brand` → `brand`
- `filters.group` → `umbrella`
- `filters.status` → `delivery`

Update the `useMemo` and `useCallback` dependency arrays accordingly.

- [ ] **Step 4: Wire URL sync via `router.replace`**

Add a `useEffect` that writes the current state to URL params on every change (matches the `/analyst` pattern of `router.replace` with no scroll):

```tsx
useEffect(() => {
  const params = new URLSearchParams(searchParams.toString());

  setOrDelete(params, "brand", brand);
  setOrDelete(params, "group", umbrella);
  setOrDelete(params, "status", delivery);
  setOrDelete(params, "start", startDate || null);
  setOrDelete(params, "end", endDate || null);

  const next = params.toString();
  const current = searchParams.toString();
  if (next !== current) {
    router.replace(`${pathname}?${next}`, { scroll: false });
  }
}, [brand, delivery, umbrella, startDate, endDate, pathname, router, searchParams]);
```

Add the helper function at the bottom of the file (with other helpers):

```ts
function setOrDelete(params: URLSearchParams, key: string, value: string | null) {
  if (value) {
    params.set(key, value);
  } else {
    params.delete(key);
  }
}
```

- [ ] **Step 5: Extract `FilterChipGroup` into its own file (so both pages can import it)**

Today `FilterChipGroup` is a `memo` defined inside `dashboard-client.tsx` and not exported. Move it out so `ai-panel.tsx` can use it too.

1. Run: `grep -n "const FilterChipGroup\|^FilterChipGroup" src/components/dashboard-client.tsx` to find the definition (around line 1410-1450 — verify).
2. Cut the entire `const FilterChipGroup = memo(...)` block from `dashboard-client.tsx`.
3. Create `src/components/filter-chip-group.tsx` with the cut content. Wrap in a default `"use client"` directive at the top if not already a client context (the parent file is a client component). Export `FilterChipGroup` as a named export.
4. In `dashboard-client.tsx`, add the import:

```tsx
import { FilterChipGroup } from "./filter-chip-group";
```

5. Verify the file still compiles:

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: exit 0.

- [ ] **Step 6: Wrap the panel's content in `<UniversalFilterBar>` with the filter UI as children**

Locate the top of the rendered JSX in `OptimizeAiPanel` (the outermost return). Insert the bar before the existing prompt area:

```tsx
return (
  <div className="space-y-6">
    <UniversalFilterBar
      summary={buildAskAiFilterSummary({
        brand,
        delivery,
        umbrella,
        startDate: startDate || dateRange.startDate || "",
        endDate: endDate || dateRange.endDate || "",
      })}
    >
      <section className="mx-auto flex max-w-7xl flex-col gap-4 border-y border-hp-rule py-4 xl:flex-row xl:flex-wrap xl:items-center xl:justify-between xl:gap-x-6">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <FilterChipGroup
            label="Brand"
            value={brand ?? "all"}
            onChange={(value) => setBrand(value === "all" ? null : value)}
            options={[
              { value: "all", label: "All" },
              { value: "HP", label: "HP" },
              { value: "VVS", label: "VVS" },
            ]}
          />
          <FilterChipGroup
            label="Delivery"
            value={delivery ?? "all"}
            onChange={(value) =>
              setDelivery(value === "all" ? null : (value as "active" | "paused"))
            }
            options={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
            ]}
          />
          <label className="flex h-10 items-center gap-2 border border-hp-rule px-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            <span>Umbrella</span>
            <select
              value={umbrella ?? "all"}
              onChange={(event) =>
                setUmbrella(event.target.value === "all" ? null : event.target.value)
              }
              className="h-6 bg-transparent text-hp-ink outline-none"
            >
              <option value="all">All</option>
              {/* The umbrella option list comes from the Ask AI page's static
                  CAMPAIGN_GLOSSARY shipped with ad-hoc-analytics. Map them here. */}
              <option value="Book Appts US">Book Appts US</option>
              <option value="Facebook US Product">Facebook US Product</option>
              <option value="Facebook VN Product">Facebook VN Product</option>
              <option value="US Promotions">US Promotions</option>
              <option value="Cash for Gold US">Cash for Gold US</option>
            </select>
          </label>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            setStartDate(String(formData.get("start") ?? startDate));
            setEndDate(String(formData.get("end") ?? endDate));
          }}
          className="flex items-center gap-2"
        >
          <div className="flex items-center gap-2 border border-hp-rule px-3 py-2">
            <input
              aria-label="Start date"
              name="start"
              type="date"
              defaultValue={startDate || dateRange.startDate || ""}
              className="h-8 bg-transparent text-sm outline-none"
            />
            <span className="text-hp-muted">to</span>
            <input
              aria-label="End date"
              name="end"
              type="date"
              defaultValue={endDate || dateRange.endDate || ""}
              className="h-8 bg-transparent text-sm outline-none"
            />
            <button
              type="submit"
              className="h-8 border border-hp-ink px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink transition-colors hover:bg-hp-ink hover:text-hp-foundation"
            >
              Apply
            </button>
          </div>
        </form>
      </section>
    </UniversalFilterBar>

    {/* existing prompt + chat + dashboards UI continues here, unchanged */}
    {/* ... */}
  </div>
);
```

Add imports at the top of `ai-panel.tsx`:

```tsx
import { FilterChipGroup } from "@/components/filter-chip-group";
```

- [ ] **Step 7: Update existing `runAnalysis` and `sendChatMessage` call sites to pass current filter state**

Find the `runAnalysis` and chat fetch call sites (search: `grep -n "filters: runtimeFilters\|filters:" src/components/v2/optimize/ai-panel.tsx`). They should already receive `filters: runtimeFilters` from the existing code — confirm. Same for the chat request body's brand/group/status fields (search: `body.brand`, `body.group`, `body.status` in the file). Update any literal `filters.brand`/`filters.group`/`filters.status` to the new state variables (`brand`/`umbrella`/`delivery`).

- [ ] **Step 8: Run type check + lint + tests**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: exit 0.

Run: `npm run lint`
Expected: no new errors. (Unused imports? Remove them.)

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 9: Smoke the dev server**

Open `http://localhost:3002/analysis`. Verify:
- Filter bar renders at the top with Brand chips, Delivery chips, Umbrella select, and date inputs + Apply.
- Picking a Brand updates the URL to `?brand=HP`. Reload preserves the selection.
- Picking an Umbrella → URL gets `?group=Facebook+US+Product`.
- Picking a Delivery → URL gets `?status=active`.
- Standfirst on scroll-past shows BRAND/DELIVERY/UMBRELLA/RANGE segments.
- Submitting an analysis with `brand: "HP"` produces a request body that includes `brand: "HP"` (check Network tab).

- [ ] **Step 10: Commit**

```bash
git add src/components/v2/optimize/ai-panel.tsx src/app/\(workspace\)/analysis/page.tsx src/components/filter-chip-group.tsx src/components/dashboard-client.tsx
git commit -m "feat(analysis): wire universal filter bar + brand/group/status URL state"
```

---

## Verification + handoff

After Task 7, the branch is ready for PR review with:

- One `UniversalFilterBar` component used by three pages
- `/analyst` Search input relocated into the bar (no Performance-table search anymore)
- `/analyst/creative-analysis` Min Spend fully gone (state, UI, filter chain)
- `/analysis` (Ask AI) gains real Brand/Umbrella/Delivery filter state + URL sync, wired to the existing backend filter path
- All existing tests green (`npm test`)
- All existing routes, permissions, redirects, behavior preserved

Run a final visual sweep on the dev server:
1. `/analyst` — open, scroll past filter region, verify sticky standfirst with QUERY segment last. Click Search segment → panel opens → search input is focusable.
2. `/analyst/creative-analysis` — same flow, verify 8-segment standfirst, cascading dropdowns still cascade, no Min Spend anywhere.
3. `/analysis` — pick a brand chip, watch the URL update. Submit an analysis with filters set and confirm the request body carries them (Network tab).

Open the Vercel preview link side-by-side with the visual companion artifact (`.superpowers/brainstorm/95027-1779551008/content/01-universal-bar-three-pages.html`) for sign-off.
