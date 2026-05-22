# Editorial UI rebuild — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the existing editorial broadsheet vocabulary (Cardo + Cormorant Garamond serifs, warm beige foundation, paper grain, HP pink accent, severity CSS variables) across every workspace surface. `/analyst` is the anchor reference. No data, filter, behavior, route, permission, or workflow changes.

**Architecture:** Three layers of change, applied in dependency order. (1) Foundation tokens — add severity bg-fill CSS variables to `globals.css` and consolidate `severityColor()` to read CSS vars. (2) Workspace shell — drop the flat-beige override + `Ask anything ⌘K` stub so the body paper texture shows through every room. (3) Room-by-room restyle of the `*-client.tsx` legacy and `v2/*` components, replacing Tailwind `stone-*` / `rounded-xl` / `bg-white` patterns with `border-hp-rule bg-hp-card` editorial chrome and Cormorant titles. Pure className/color/font/border treatment; underlying state, handlers, data shapes, and routing untouched.

**Tech Stack:** Next.js App Router, Tailwind CSS v4 (`@theme inline` in `globals.css`), Cardo + Cormorant Garamond fonts (already loaded via `next/font/google`), recharts + Visx for charts, `@tanstack/react-table` for ledgers, `node --test` for unit tests, Vercel preview for visual verification.

**Visual reference:** All mockups at `.superpowers/brainstorm/78371-1779458624/content/` — see `01-direction-and-risk.html` through `10-m-inbox-composer-fix.html`. The locked spec is at `docs/superpowers/specs/2026-05-22-editorial-rebuild-design.md`.

---

## File map

**Foundation files (Phase 0):**
- Modify `src/app/globals.css` — add severity bg-fill CSS variables + theme inline mappings
- Create `src/lib/time-to-book.ts` — pure formatter
- Create `tests/time-to-book.test.ts` — unit tests for the formatter
- Modify `src/components/v2/operate/health-panel.tsx` — `severityColor()` reads CSS vars

**Shell (Phase 1):**
- Modify `src/app/(workspace)/layout.tsx` — drop flat-beige override, drop ⌘K stub, restyle nav/identity/health-pill
- Modify `src/components/v2/workspace-nav.tsx` — pink accent restyle
- Modify `src/components/v2/health-pill.tsx` — severity color migration
- Modify `src/components/v2/identity-menu.tsx` — sharp-corner editorial restyle

**Anchor (Phase 2):**
- Modify `src/components/dashboard-client.tsx` — metric font-size, period-chip layout, three-line status sentence

**`/convert` (Phase 3):**
- Modify `src/components/v2/status-sentence.tsx` — three-line rendering of `StatusHighlight[]`
- Modify `src/components/v2/convert/funnel-viz.tsx` — editorial chrome
- Modify `src/components/v2/convert/customer-ledger.tsx` — editorial table
- Modify `src/components/v2/convert/customer-journey-drawer.tsx` — 5-field summary row + Time-to-book + Attributed creative

**`/operate` (Phase 4):**
- Modify `src/components/v2/operate/health-panel.tsx` — editorial chrome + chip bg fills
- Modify `src/components/v2/operate/pipelines-panel.tsx` — editorial chrome
- Modify `src/components/v2/operate/backfill-month-table.tsx` — editorial chrome

**`/m/inbox` (Phase 5):**
- Modify `src/app/m/inbox/layout.tsx` — Cormorant wordmark + paper-grain pass-through
- Modify `src/app/m/inbox/page.tsx` — editorial status card
- Modify `src/components/v2/inbox/conversation-list-mobile.tsx` — editorial rows + unread rail
- Modify `src/components/v2/inbox/conversation-detail.tsx` — editorial bubble thread
- Modify `src/components/v2/inbox/reply-composer.tsx` — confirm banner row

**Tidy (Phase 6):**
- Sweep `bg-stone-*`, `border-stone-*`, `rounded-xl`, `#E14B7B`, `border-pink-400`, `bg-[#F8F4EE]` literals across remaining files

**Conventions to follow:**
- Tailwind v4 with `@theme inline` (already configured in `globals.css`). Use the existing `bg-hp-*`, `text-hp-*`, `border-hp-*` utilities — do not introduce new color literals.
- Sharp corners everywhere (no `rounded-*` classes). Editorial system has no border-radius. The single exception is round identity avatars (`rounded-full` on the 7×7 or 8×8 user-initials circle).
- Cormorant for titles and right-aligned tabular figures; Cardo for body, prose, table cells.
- Pink (`--accent` / `bg-hp-pink`) appears only on focus rings, primary-button hover, and the inbox unread rail.
- Severity uses `--positive` / `--warning` / `--danger` / `--info` with the new bg-fill variants for chips.
- **`❦` ornament placement**: place `<div className="ornament-rule" />` between major sections inside long pages. Specifically — `/analyst`: between the Trend Analysis card and the Performance Scorecard card; `/convert`: between the Funnel card and the Customer Ledger card. The class is already defined in `globals.css`; no new CSS needed. Skip for short pages (`/operate/coverage`, mobile, login).

---

## Phase 0 — Foundations

### Task 1: Add severity bg-fill design tokens

Goal: define the four severity background-fill hex values in `globals.css` so chips can render against the cream card without re-declaring colors per component.

**Files:**
- Modify: `src/app/globals.css`

**Steps:**

- [ ] **Step 1: Read the current globals.css color block**

Run: open `src/app/globals.css` and locate the `:root { ... }` block (lines 3-21 currently) and the `@theme inline { ... }` block (lines 23-40).

- [ ] **Step 2: Add severity bg-fill CSS variables under `:root`**

In `src/app/globals.css`, inside the `:root { ... }` block, after the existing `--positive`, `--warning`, `--danger` lines (lines 18-20), add:

```css
  --positive-bg: #e6efe9;
  --warning-bg: #f6ecd6;
  --danger-bg: #f5dedb;
  --info: #0f4c75;
  --info-bg: #e0f0fa;
```

- [ ] **Step 3: Expose them as Tailwind utilities under `@theme inline`**

In the same file, inside the `@theme inline { ... }` block, after the existing `--color-signal-danger` line, add:

```css
  --color-signal-positive-bg: var(--positive-bg);
  --color-signal-warning-bg: var(--warning-bg);
  --color-signal-danger-bg: var(--danger-bg);
  --color-signal-info: var(--info);
  --color-signal-info-bg: var(--info-bg);
```

- [ ] **Step 4: Run the build to verify the CSS compiles**

Run: `npm run build`
Expected: PASS. Build completes without CSS errors. Tailwind picks up the new `bg-signal-positive-bg`, `text-signal-info`, etc. as valid utility classes.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add severity bg-fill tokens for editorial chips"
```

---

### Task 2: Time-to-book formatter (TDD)

Goal: pure function that takes a millisecond delta (or null) and returns a `{ value, unit }` object the drawer can render.

**Files:**
- Create: `src/lib/time-to-book.ts`
- Create: `tests/time-to-book.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing tests**

Create `tests/time-to-book.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { formatTimeToBook } from "../src/lib/time-to-book.ts";

test("returns dash for null delta", () => {
  assert.deepEqual(formatTimeToBook(null), { value: "—", unit: null });
});

test("returns dash for non-finite delta", () => {
  assert.deepEqual(formatTimeToBook(Number.NaN), { value: "—", unit: null });
  assert.deepEqual(formatTimeToBook(-1), { value: "—", unit: null });
});

test("renders seconds when delta is under 60s", () => {
  assert.deepEqual(formatTimeToBook(45_000), { value: "45", unit: "sec" });
  assert.deepEqual(formatTimeToBook(1_000), { value: "1", unit: "sec" });
});

test("renders minutes when delta is under 60min", () => {
  assert.deepEqual(formatTimeToBook(32 * 60_000), { value: "32", unit: "min" });
  assert.deepEqual(formatTimeToBook(60_000), { value: "1", unit: "min" });
});

test("renders hours when delta is under 24h", () => {
  assert.deepEqual(formatTimeToBook(5 * 3_600_000), { value: "5", unit: "hr" });
  assert.deepEqual(formatTimeToBook(3_600_000), { value: "1", unit: "hr" });
});

test("renders day(s) at 24h+ with singular on 1", () => {
  assert.deepEqual(formatTimeToBook(24 * 3_600_000), { value: "1", unit: "day" });
  assert.deepEqual(formatTimeToBook(10 * 24 * 3_600_000), { value: "10", unit: "days" });
});

test("computes delta from two ISO strings", () => {
  const start = "2026-05-12T14:08:00.000Z";
  const end = "2026-05-22T09:14:00.000Z";
  const result = formatTimeToBook(Date.parse(end) - Date.parse(start));
  assert.equal(result.value, "9");
  assert.equal(result.unit, "days");
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- --test-name-pattern="time-to-book"` (or just `npm test` if the runner doesn't support filters).
Expected: FAIL with `Cannot find module '../src/lib/time-to-book.ts'`.

- [ ] **Step 3: Implement the formatter**

Create `src/lib/time-to-book.ts`:

```ts
/**
 * Pure formatter for the "Time to book" mini-metric on the Customer
 * Journey drawer. Takes the millisecond delta between the credited touch
 * `capturedAt` and the conversion `occurredAt` and returns a value/unit
 * pair tailored to the magnitude.
 *
 * The unit identifier is rendered as smallcaps Cardo next to the
 * Cormorant tabular figure (see editorial rebuild design spec §
 * "Customer Journey drawer").
 */

const MS_PER_SEC = 1_000;
const MS_PER_MIN = 60 * MS_PER_SEC;
const MS_PER_HR = 60 * MS_PER_MIN;
const MS_PER_DAY = 24 * MS_PER_HR;

export type TimeToBook = {
  value: string;
  unit: "sec" | "min" | "hr" | "day" | "days" | null;
};

export function formatTimeToBook(deltaMs: number | null): TimeToBook {
  if (deltaMs === null || !Number.isFinite(deltaMs) || deltaMs < 0) {
    return { value: "—", unit: null };
  }
  if (deltaMs < MS_PER_MIN) {
    return { value: String(Math.floor(deltaMs / MS_PER_SEC)), unit: "sec" };
  }
  if (deltaMs < MS_PER_HR) {
    return { value: String(Math.floor(deltaMs / MS_PER_MIN)), unit: "min" };
  }
  if (deltaMs < MS_PER_DAY) {
    return { value: String(Math.floor(deltaMs / MS_PER_HR)), unit: "hr" };
  }
  const days = Math.floor(deltaMs / MS_PER_DAY);
  return { value: String(days), unit: days === 1 ? "day" : "days" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS. All 7 tests green; no other tests in the suite break.

- [ ] **Step 5: Commit**

```bash
git add src/lib/time-to-book.ts tests/time-to-book.test.ts
git commit -m "feat(lib): add formatTimeToBook unit-aware helper"
```

---

### Task 3: Consolidate severityColor() to read CSS variables

Goal: replace the hardcoded hex returns in `severityColor()` with reads from the CSS variables defined in `globals.css`. Optical colors stay indistinguishable for operators; the value set is unified.

**Files:**
- Modify: `src/components/v2/operate/health-panel.tsx:148-154`
- Create: `tests/severity-color.test.ts`

**Steps:**

- [ ] **Step 1: Write the failing test**

Create `tests/severity-color.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";

import { severityColor } from "../src/components/v2/operate/health-panel.tsx";

test("ok and healthy return positive token hex", () => {
  assert.equal(severityColor("ok"), "var(--positive)");
  assert.equal(severityColor("healthy"), "var(--positive)");
  assert.equal(severityColor("HEALTHY"), "var(--positive)");
});

test("warning and warn return warning token", () => {
  assert.equal(severityColor("warning"), "var(--warning)");
  assert.equal(severityColor("warn"), "var(--warning)");
});

test("critical, error, fail return danger token", () => {
  assert.equal(severityColor("critical"), "var(--danger)");
  assert.equal(severityColor("error"), "var(--danger)");
  assert.equal(severityColor("fail"), "var(--danger)");
});

test("unknown returns ink-muted token", () => {
  assert.equal(severityColor("snoozed"), "var(--ink-muted)");
  assert.equal(severityColor(""), "var(--ink-muted)");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL. The current `severityColor()` returns hex strings (`"#1F7A4D"`), not `"var(--positive)"`.

- [ ] **Step 3: Export `severityColor` and update it to return CSS var references**

In `src/components/v2/operate/health-panel.tsx`, modify the function at lines 148-154:

```ts
export function severityColor(value: string): string {
  const v = (value || "").toLowerCase();
  if (v === "ok" || v === "healthy") return "var(--positive)";
  if (v === "warning" || v === "warn") return "var(--warning)";
  if (v === "critical" || v === "error" || v === "fail") return "var(--danger)";
  return "var(--ink-muted)";
}
```

Note the addition of `export` so the test can import it. Also note the change from `#5A5346` (which was the legacy stone fallback) to `var(--ink-muted)` (which evaluates to `#8a8178` from `globals.css`). This is a faint optical lightening of the neutral state; acceptable per the spec's "consolidation" goal.

- [ ] **Step 4: Run the tests to verify all pass**

Run: `npm test`
Expected: PASS. The 4 new severity-color tests pass; no existing tests break.

- [ ] **Step 5: Verify the page still renders**

Run: `npm run dev` (in another shell), open `http://localhost:3000/operate/health`.
Expected: The page renders. Severity stripes and chips show in the same visual colors as before (the CSS vars resolve to nearly identical hex values).

- [ ] **Step 6: Commit**

```bash
git add src/components/v2/operate/health-panel.tsx tests/severity-color.test.ts
git commit -m "refactor(operate): severityColor reads CSS vars instead of hex literals"
```

---

## Phase 1 — Workspace shell

### Task 4: Editorial workspace shell + remove ⌘K stub

Goal: drop the flat `bg-[#F8F4EE]` override on the workspace `<div>` so the body's paper-grain background shows through. Restyle the header chrome to use `bg-hp-card/90` + `border-hp-rule`. Remove the disabled `CommandPaletteTrigger` button.

**Files:**
- Modify: `src/app/(workspace)/layout.tsx`
- Modify: `src/components/v2/workspace-nav.tsx`
- Modify: `src/components/v2/health-pill.tsx`
- Modify: `src/components/v2/identity-menu.tsx`

**Steps:**

- [ ] **Step 1: Edit `(workspace)/layout.tsx`**

Open `src/app/(workspace)/layout.tsx`. Replace the entire `return` block (currently lines 49-77) with:

```tsx
  return (
    <div className="min-h-screen text-hp-body">
      <header className="sticky top-0 z-30 border-b border-hp-rule bg-hp-card/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-6">
          <a
            href={homeHref}
            className="font-[family-name:var(--font-title)] text-lg font-medium tracking-tight text-hp-ink"
          >
            HP / VVS
          </a>
          <WorkspaceNav rooms={rooms} permissions={profile.permissions} />
          <div className="ml-auto flex items-center gap-2">
            <HealthPill />
            <IdentityMenu
              email={profile.email}
              fullName={profile.fullName}
              initials={profile.initials}
              roles={profile.roles}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
```

Then delete the entire `CommandPaletteTrigger` function (currently lines 79-96) and remove the `hasPermission` import on line 20 if it is now unused (check whether other lines use it — at the time of writing only `CommandPaletteTrigger` did).

- [ ] **Step 2: Edit `workspace-nav.tsx` — unify accent and use editorial palette**

Open `src/components/v2/workspace-nav.tsx`. Find the active-pill className (currently line 87 or near it: `"bg-[var(--workspace-accent,#E14B7B)] text-white shadow-sm"`) and replace with `"bg-hp-pink text-hp-foundation"`. Find the inactive-pill className and replace `text-stone-700 hover:bg-stone-200/70` with `text-hp-body hover:bg-hp-inset`. Find the dropdown active item (`bg-stone-900 text-stone-50`) and replace with `bg-hp-ink text-hp-foundation`. Find any `bg-stone-100` hover and replace with `bg-hp-inset`.

If unsure which lines, run `grep -n "stone-\|workspace-accent\|E14B7B" src/components/v2/workspace-nav.tsx` and replace each match with the editorial equivalent below:

| Old | New |
|---|---|
| `bg-[var(--workspace-accent,#E14B7B)]` | `bg-hp-pink` |
| `text-white` (on active pill) | `text-hp-foundation` |
| `text-stone-700` | `text-hp-body` |
| `text-stone-800` | `text-hp-ink` |
| `hover:bg-stone-200/70` | `hover:bg-hp-inset` |
| `bg-stone-900` | `bg-hp-ink` |
| `text-stone-50` | `text-hp-foundation` |
| `bg-stone-100` | `bg-hp-inset` |
| `border-stone-200` | `border-hp-rule` |
| `rounded-full` (on pills) | _delete_ |
| `rounded-md` / `rounded-xl` | _delete_ |

- [ ] **Step 3: Edit `health-pill.tsx` — severity migration**

Open `src/components/v2/health-pill.tsx`. Find the three status-class branches (likely `bg-emerald-50 text-emerald-800 border-emerald-200` for ok, `bg-amber-...` for warn, `bg-rose-...` for critical) and replace:

| Status | Old | New |
|---|---|---|
| ok | `bg-emerald-50 text-emerald-800 border-emerald-200` | `bg-signal-positive-bg text-signal-positive border-signal-positive` |
| warn | `bg-amber-50 text-amber-800 border-amber-200` | `bg-signal-warning-bg text-signal-warning border-signal-warning` |
| crit | `bg-rose-50 text-rose-800 border-rose-200` | `bg-signal-danger-bg text-signal-danger border-signal-danger` |

Find the outer `rounded-full h-10` and replace `rounded-full` with `''` (delete) so the pill is sharp-cornered. Replace `border-stone-200` with `border-hp-rule`. Replace any inner dot color hex with the matching `bg-signal-*` utility.

- [ ] **Step 4: Edit `identity-menu.tsx` — sharp-corner editorial**

Open `src/components/v2/identity-menu.tsx`. Find the trigger button className containing `rounded-full border border-stone-300 bg-white` and replace with `border border-hp-rule bg-hp-card`. Find the avatar circle (`h-7 w-7 rounded-full bg-stone-900 text-white`) — keep `rounded-full` here ONLY for the avatar (round avatars are still acceptable in editorial), and replace `bg-stone-900 text-white` with `bg-hp-ink text-hp-foundation`. Find the dropdown panel `rounded-xl border border-stone-200 bg-white` and replace with `border border-hp-rule bg-hp-card`. Replace all `text-stone-*` with `text-hp-body` / `text-hp-ink` per role.

- [ ] **Step 5: Build + lint + dev server smoke**

Run in parallel: `npm run build` and `npm run lint`.
Expected: PASS for both. No type errors. No unused-import warnings (if `hasPermission` is now unused in step 1, remove the import).

Then run `npm run dev` and open each workspace room to confirm:
- `/analyst` — header has cream `bg-hp-card/90` backdrop; "HP / VVS" wordmark in Cormorant ink; no ⌘K stub visible
- `/convert` — same shell chrome; the paper texture shows behind any gap between cards
- `/operate/health` — same shell chrome

- [ ] **Step 6: Commit**

```bash
git add src/app/\(workspace\)/layout.tsx src/components/v2/workspace-nav.tsx src/components/v2/health-pill.tsx src/components/v2/identity-menu.tsx
git commit -m "feat(shell): editorial workspace chrome + remove disabled ⌘K stub"
```

---

## Phase 2 — Anchor (`/analyst`)

### Task 5: Bump metric numbers, full-width period chips, three-line status sentence

Goal: three concrete tweaks to `dashboard-client.tsx` so it cleanly anchors the editorial system.

**Files:**
- Modify: `src/components/dashboard-client.tsx` — three locations (NestedPerformanceTable td.r font-size; DateRangeControls period chip container; ShellHeader status sentence rendering)

**Steps:**

- [ ] **Step 1: Bump editorial-table metric font-size**

In `src/components/dashboard-client.tsx`, find each right-aligned numeric `<td>` in `MetricTreeRow` (lines 1414, 1418-1422). Each currently uses className `"px-3 py-4 text-right tabular-nums"`. Replace with `"px-3 py-4 text-right tabular-nums font-[family-name:var(--font-title)] text-[17px] leading-tight text-hp-ink"`.

That's lines 1414 (spend), 1418-1420 (cost-per-result), 1421 (ctr), 1422 (cpc). The `ResultCell` on line 1416 already wraps the primary KPI; restyle it in `ResultCell` itself — find the inner count rendering (`row.primaryResults`) and apply the same `font-[family-name:var(--font-title)] text-[17px]` class to its container. Sub-label stays at its current 10-11px Cardo style.

- [ ] **Step 2: Make the period-window chip row flow full-width with wrap**

In `src/components/dashboard-client.tsx`, find the period-windows container (around lines 927-940 — the `<div>` rendered when `compareEnabled && periodWindows.length`). Replace the className:

Before:
```tsx
<div className="flex min-h-8 max-w-full items-center gap-2 overflow-x-auto text-[10px] uppercase tracking-[0.12em] text-hp-muted lg:max-w-[360px]">
```

After:
```tsx
<div className="mt-2 flex w-full flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.12em] text-hp-muted">
```

This drops the `lg:max-w-[360px]`, the `overflow-x-auto`, and the `min-h-8`, and adds `flex-wrap` + `w-full` so chips spill onto a second row instead of scrolling sideways. The chip pills themselves (currently `shrink-0 border px-2 py-1`) are unchanged.

Note: this requires moving the period-windows out of the inline `DateRangeControls` form into its own block below the form. Find the parent wrapper that holds `<DateRangeControls />` (around line 481-495 in the page-level `ConvertStatus` callsite — but in `DashboardClient` it's the section around line 458-496). Refactor so the period chips render in a sibling element below the filter row, full-width.

Concrete refactor: in `DateRangeControls` (line 813+), split the return into two siblings — the existing `<form>` and a new `<div>` below it that renders the chip row when `compareEnabled && periodWindows.length > 0`. Then have the caller wrap both in a `<>` fragment so the chip row sits as a full-width row below the filter strip.

- [ ] **Step 3: Render status sentence as three lines**

`StatusSentence` is a separate component (`src/components/status-sentence.tsx` for the v1 version used by analyst). Open it. It accepts `highlights: StatusHighlight[]` and currently inlines them in a paragraph. Change the rendering so each highlight renders on its own line.

Find the paragraph that maps `highlights` (likely a `<p>` with `flex flex-wrap` or similar inlining). Replace with:

```tsx
{summary.highlights?.length ? (
  <div className="space-y-1">
    {summary.highlights.map((highlight, idx) => (
      <p
        key={idx}
        className="font-[family-name:var(--font-title)] text-xl leading-snug text-hp-ink md:text-2xl"
      >
        <span className={highlightColorClass(highlight.severity)}>
          {highlight.leadNumber}
        </span>{" "}
        <span className="text-hp-body">{highlight.body}</span>
      </p>
    ))}
  </div>
) : null}
```

And add the helper near the bottom of the file:

```tsx
function highlightColorClass(severity: StatusHighlight["severity"]): string {
  switch (severity) {
    case "positive": return "text-signal-positive italic";
    case "warning":  return "text-signal-warning italic";
    case "critical": return "text-signal-danger italic";
    default:         return "text-hp-ink";
  }
}
```

If the existing `StatusHighlight` type does not already split into `leadNumber` + `body`, check `src/lib/executive-headline.ts` (or wherever `StatusHighlight` is defined) — the current type likely renders `text: string` only. If so, leave the rendering as a single-line wrap of the existing text and add the three-line treatment as a follow-up in a later task once the data shape supports it. Document the gap in the PR description.

- [ ] **Step 4: Build + lint + visual smoke**

Run: `npm run build && npm run lint`
Expected: PASS.

Run `npm run dev` and open `/analyst`. Verify:
- Right-column metric numbers in the performance table read visibly larger (the "HP" / "VVS" brand letters and the metric figures sit at the same optical weight)
- With vs Prev enabled and Periods = 8, all 8 chips are visible (wrap to second line if needed; no horizontal scroll)
- Masthead status sentence renders on three lines if `highlights.length === 3` (or single line if the type doesn't split yet — see Step 3 note)

- [ ] **Step 5: Commit**

```bash
git add src/components/dashboard-client.tsx src/components/status-sentence.tsx
git commit -m "feat(analyst): bump metric font, wrap period chips, line-break status sentence"
```

---

## Phase 3 — `/convert`

### Task 6: Editorial three-line status sentence (v2 component)

Goal: update `StatusSentence` v2 used by `/convert`, `/operate/pipelines`, `/operate/coverage`, `/operate/health` to render with the editorial chrome.

**Files:**
- Modify: `src/components/v2/status-sentence.tsx`

**Steps:**

- [ ] **Step 1: Replace the container chrome**

Open `src/components/v2/status-sentence.tsx`. Find the outer `<section>` className (`rounded-xl border border-stone-200 bg-white px-6 py-4 ...`) and replace with `border border-hp-rule bg-hp-card px-6 py-5 md:flex-row md:items-center md:justify-between`. Drop any `relative`/`absolute` left-stripe code that uses `style={{ background: ... }}` — replace with a real `border-l-[3px]` class whose color comes from a `borderColor` prop or default `border-hp-pink`.

- [ ] **Step 2: Restyle the title text and metrics**

Inside the same component:
- Title (Cormorant): change `text-stone-900` → `text-hp-ink`, drop `font-semibold` if it was set (Cormorant 500 is correct), bump size to `font-[family-name:var(--font-title)] text-2xl leading-snug`.
- Metric label: replace `text-stone-500 uppercase tracking-wider` → `text-hp-muted uppercase tracking-[0.14em]`.
- Metric value: replace `text-stone-900 font-semibold tabular-nums` → `font-[family-name:var(--font-title)] text-hp-ink tabular-nums text-xl`.

- [ ] **Step 3: Build + lint smoke**

Run: `npm run build && npm run lint`. Expected: PASS.

Run: `npm run dev` and open `/convert`, `/operate/pipelines`, `/operate/coverage`, `/operate/health` — confirm each StatusSentence shows the editorial chrome.

- [ ] **Step 4: Commit**

```bash
git add src/components/v2/status-sentence.tsx
git commit -m "feat(v2): editorial StatusSentence chrome"
```

---

### Task 7: `/convert` FunnelViz editorial chrome

Goal: keep Visx bar logic + pink fillIntensity exactly as today; restyle the surrounding card.

**Files:**
- Modify: `src/components/v2/convert/funnel-viz.tsx`

**Steps:**

- [ ] **Step 1: Replace card chrome**

In `funnel-viz.tsx`, find the outer `<section>` className (`overflow-hidden rounded-xl border border-stone-200 bg-white`) and replace with `overflow-hidden border border-hp-rule bg-hp-card`.

Find the header `<header className="flex items-baseline justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-[10px] uppercase tracking-wider text-stone-600">` and replace with:

```tsx
<header className="flex items-baseline justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
  <span>Funnel</span>
  <span>{steps.length} stages</span>
</header>
```

- [ ] **Step 2: Restyle the empty state**

Find the empty fallback `<div className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-600">` and replace with `<div className="border border-hp-rule bg-hp-card px-4 py-10 text-center text-sm text-hp-muted">`.

- [ ] **Step 3: Restyle the SVG label fills inline**

The SVG `<text>` elements (e.g. lines 84-90 in the funnel-viz.tsx body) use `style={{ fill: "#1F1A14" }}` and `style={{ fill: "#5A5346" }}`. Replace both with `var(--ink-primary)` and `var(--ink-muted)` respectively. The pink bar `fill={accent}` (already reading from `tokens.color.light.accent`) stays unchanged — bar color logic is preserved.

- [ ] **Step 4: Build + dev server smoke**

Run: `npm run build && npm run lint`. Open `/convert` and confirm the funnel chrome is editorial; bars still render with the same pink-fade progression.

- [ ] **Step 5: Commit**

```bash
git add src/components/v2/convert/funnel-viz.tsx
git commit -m "feat(convert): editorial FunnelViz chrome"
```

---

### Task 8: `/convert` CustomerLedger editorial table

Goal: restyle the customer ledger's table chrome, header, and rows; replace Tailwind `stone-*` with HP utilities; bump right-aligned metric font to 17px Cormorant. Table column logic, sort, and click-to-open-drawer all preserved.

**Files:**
- Modify: `src/components/v2/convert/customer-ledger.tsx`

**Steps:**

- [ ] **Step 1: Replace the outer section + header chrome**

Find the outer `<section>` (likely `overflow-hidden rounded-xl border border-stone-200 bg-white`) and replace with `overflow-hidden border border-hp-rule bg-hp-card`.

Find the inner header row (`border-b border-stone-200 bg-stone-50 px-4 py-3`) and replace with `border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted`.

- [ ] **Step 2: Restyle the table cells**

Find each `<th>` rendered by `flexRender` — they pick up className from the column def or the wrapper. Locate the `<thead>` styling block (likely a `<thead className="...">` near the top of the `<table>` and a `<th className="...">` mapper). Replace:

| Old | New |
|---|---|
| `bg-stone-50` | `bg-hp-inset` |
| `text-stone-500` | `text-hp-muted` |
| `border-stone-200` | `border-hp-rule` |
| `divide-stone-100` | `divide-hp-rule-soft` (or just `border-b border-hp-rule-soft` on each row) |
| `text-stone-900` | `text-hp-ink` |
| `text-stone-700` | `text-hp-body` |
| `hover:bg-stone-50` | `hover:bg-hp-inset` |

For the right-aligned metric cells (if the columns use `text-right`), wrap their contents in a Cormorant span: replace `<td className="...text-right...">{value}</td>` with `<td className="...text-right..."><span className="font-[family-name:var(--font-title)] text-[17px] tabular-nums text-hp-ink">{value}</span></td>`. If the column header is `Activity` (date/time), keep Cardo (not a metric). Same for the Customer, Location, Brand, Source, CAPI, Type columns — those are text, not figures.

- [ ] **Step 3: Restyle the CAPI status pill column**

The CAPI column currently renders a pill with status-dependent classes (look for the `capiStatus` accessor and its cell renderer — around line 215 of the file). Replace the pill styling with:

```tsx
const capiPillClass = (status: string): string => {
  switch (status?.toLowerCase()) {
    case "sent":
    case "ok":
      return "inline-flex h-[22px] items-center gap-1 border border-signal-positive bg-signal-positive-bg px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-signal-positive";
    case "missing":
    case "skipped":
      return "inline-flex h-[22px] items-center gap-1 border border-signal-warning bg-signal-warning-bg px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-signal-warning";
    case "error":
    case "failed":
      return "inline-flex h-[22px] items-center gap-1 border border-signal-danger bg-signal-danger-bg px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-signal-danger";
    default:
      return "inline-flex h-[22px] items-center gap-1 border border-hp-rule bg-hp-card px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-hp-muted";
  }
};
```

Apply via `<span className={capiPillClass(row.original.capiStatus)}>{row.original.capiStatus}</span>`. Preserve whatever status strings the data layer emits — case-insensitive match.

- [ ] **Step 4: Brand column → brand chip**

Find the `accessorKey: "brand"` cell renderer (line 194-196) and replace the plain text rendering with a chip: `<span className="inline-block border border-hp-rule px-2 py-[1px] text-[11px] uppercase tracking-[0.10em] text-hp-ink">{value}</span>`.

- [ ] **Step 5: Build + dev smoke**

Run: `npm run build && npm run lint`.

Open `/convert` and confirm:
- Table chrome is editorial (cream card, sharp corners, hairline rules)
- Right-aligned currency / counts read in Cormorant 17px tabular
- CAPI column shows severity-filled pills (Sent green, Missing ochre, etc.)
- Brand column shows the editorial chip
- Row click still opens the drawer

- [ ] **Step 6: Commit**

```bash
git add src/components/v2/convert/customer-ledger.tsx
git commit -m "feat(convert): editorial CustomerLedger chrome + severity CAPI pills"
```

---

### Task 9: `/convert` CustomerJourneyDrawer summary row + Time-to-book + Attributed creative

Goal: keep the existing three mini-metrics (Match, Meta CAPI, Timeline), add Time-to-book using the formatter from Task 2, add an Attributed creative row below.

**Files:**
- Modify: `src/components/v2/convert/customer-journey-drawer.tsx`

**Steps:**

- [ ] **Step 1: Locate the summary section**

In `src/components/v2/convert/customer-journey-drawer.tsx`, find the `<section>` rendering Match / Meta CAPI / Timeline (lines ~147-168 — the block with `<DetailMiniMetric icon={ShieldCheck} label="Match" ...>`).

- [ ] **Step 2: Compute the time-to-book delta**

Above the section, add the derivation:

```tsx
const conversionAt = row.occurredAt;
const creditedTouchAt = detail.creditedTouch?.capturedAt ?? null;
const deltaMs =
  conversionAt && creditedTouchAt
    ? Date.parse(conversionAt) - Date.parse(creditedTouchAt)
    : null;
const timeToBook = formatTimeToBook(deltaMs);
const attributedCreative =
  detail.creditedTouch?.content || detail.creditedTouch?.adId || null;
```

Add the import at the top of the file:
```tsx
import { formatTimeToBook } from "@/lib/time-to-book";
```

- [ ] **Step 3: Restructure the section into 4-up + full-width row**

Replace the existing summary section with:

```tsx
<section className="border-b border-hp-rule p-5">
  <p className="text-sm leading-6 text-hp-body">
    {detail.summary || "No booking conversion was found for this visitor."}
  </p>
  <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
    <DetailMiniMetric
      icon={ShieldCheck}
      label="Match"
      value={confidenceLabel(detail.confidence.level)}
    />
    <DetailMiniMetric
      icon={Activity}
      label="Meta CAPI"
      value={detail.capi.status || row.capiStatus || "n/a"}
    />
    <DetailMiniMetric
      icon={Clock3}
      label="Timeline"
      value={`${formatNumber(detail.timeline.length)} events`}
    />
    <DetailMiniMetric
      icon={Clock3}
      label="Time to book"
      value={
        timeToBook.unit ? (
          <span>
            <span className="font-[family-name:var(--font-title)] tabular-nums">
              {timeToBook.value}
            </span>{" "}
            <span className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              {timeToBook.unit}
            </span>
          </span>
        ) : (
          "—"
        )
      }
    />
  </div>
  <div className="mt-4 border-t border-hp-rule-soft pt-4">
    <p className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
      Attributed creative
    </p>
    <p className="mt-1 font-[family-name:var(--font-title)] text-lg italic text-hp-ink">
      {attributedCreative ?? "—"}
    </p>
  </div>
</section>
```

If `DetailMiniMetric` currently types `value` as `string`, widen it to `value: ReactNode` (find its signature near line 323 and change accordingly). Add `ReactNode` to the import list at the top: `import { type ReactNode } from "react";` if not already imported.

- [ ] **Step 4: Restyle the drawer chrome**

In the same file, find the outer `<aside>` className (`border-l border-stone-200 bg-white shadow-[-12px_0_32px_rgba(41,37,36,0.16)]`) and replace with `border-l border-hp-rule bg-hp-card shadow-[-12px_0_32px_rgba(42,39,37,0.10)]`.

Find the header `<header className="border-b border-stone-200 bg-stone-50 px-5 py-4">` and replace with `<header className="border-b border-hp-rule bg-hp-inset px-5 py-4">`.

Find every `text-stone-*` and replace with `text-hp-*` per role (ink for titles, body for prose, muted for labels). Find every `border-stone-200` and replace with `border-hp-rule`. Find any `rounded-md` / `rounded-xl` on inner cards (TouchSummaryCard's `<section>` for instance, around line 388) and delete the `rounded-*` class.

- [ ] **Step 5: Restyle the presence pills (fbclid, _fbc, _fbp)**

Find `PresencePills` around line 400 and replace the present/absent class branches:

| Old | New |
|---|---|
| `border-emerald-200 bg-emerald-50 text-emerald-800` | `border-signal-positive bg-signal-positive-bg text-signal-positive` |
| `border-stone-200 bg-stone-50 text-stone-500` | `border-hp-rule bg-hp-card text-hp-muted` |

Drop the `rounded-full` class on the pill (sharp-corner per editorial).

- [ ] **Step 6: Build + lint + visual smoke**

Run: `npm run build && npm run lint`. Expected: PASS.

Run: `npm run dev`, open `/convert`, click any customer ledger row. Verify:
- Drawer opens at 720px
- Summary section shows 4-up grid: Match, Meta CAPI, Timeline, Time to book (with the unit identifier in smallcaps)
- Below the 4-up: Attributed creative row with the creative name (or `—`) in italic Cormorant
- Chrome is editorial throughout (cream, sharp corners, hairlines)
- All sections below (CreativePreviewPanel, TouchSummaryCard, TimelineSection) still render correctly
- Close button + Copy Link button still work

- [ ] **Step 7: Commit**

```bash
git add src/components/v2/convert/customer-journey-drawer.tsx
git commit -m "feat(convert): drawer summary row adds Time-to-book + Attributed creative"
```

---

## Phase 4 — `/operate`

### Task 10: `/operate/health` editorial chrome + severity chip bg fills

Goal: restyle the three sections (overall card, issues list, JSON snapshot) to editorial; upgrade severity chips to use bg fills.

**Files:**
- Modify: `src/components/v2/operate/health-panel.tsx`

**Steps:**

- [ ] **Step 1: Overall status card**

In `src/components/v2/operate/health-panel.tsx`, find the overall section (around lines 25-70):

```tsx
<section
  aria-label="Overall health"
  className="rounded-xl border border-stone-200 bg-white p-4"
  style={{ borderLeft: `3px solid ${overallSeverity}` }}
>
```

Replace with:

```tsx
<section
  aria-label="Overall health"
  className="border border-hp-rule bg-hp-card p-5"
  style={{ borderLeftWidth: 3, borderLeftColor: overallSeverity, borderLeftStyle: "solid" }}
>
```

Note: `severityColor()` now returns `"var(--positive)"` (a CSS variable reference), which works directly in `style.borderLeftColor`. The visual remains identical.

- [ ] **Step 2: Overall section header + state word**

Inside that section, replace the existing `<h2 className="text-sm font-semibold text-stone-900">` with `<h2 className="font-[family-name:var(--font-title)] text-xl text-hp-ink">`. The `<span style={{ color: overallSeverity }}>{snapshot.status}</span>` stays — its color comes from the CSS var.

Replace the generated timestamp `<span className="text-[11px] text-stone-500">` with `<span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">`.

- [ ] **Step 3: Stat row restyle**

The stat row `<dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-5">` becomes `<dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:grid-cols-5 border-t border-hp-rule-soft pt-4">`.

In the `Stat` helper (line 137):
- `<dt className="text-[10px] uppercase tracking-wider text-stone-500">` → `<dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">`
- `<dd className="text-stone-900 tabular-nums">` → `<dd className="font-[family-name:var(--font-title)] text-[17px] text-hp-ink tabular-nums">`

- [ ] **Step 4: Issues list chrome**

Find the issues section:

```tsx
<section
  aria-label="Open issues"
  className="overflow-hidden rounded-xl border border-stone-200 bg-white"
>
```

Replace with:

```tsx
<section aria-label="Open issues" className="overflow-hidden border border-hp-rule bg-hp-card">
```

Header `<header className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">` → `<header className="border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">Issues ({snapshot.issues.length})</header>`.

`<ul className="divide-y divide-stone-100">` → `<ul className="divide-y divide-hp-rule-soft">`.

`<li className="flex flex-col gap-1 px-4 py-3" style={{ borderLeft: \`3px solid ${severityColor(issue.level)}\` }}>` → `<li className="flex flex-col gap-1 px-5 py-4" style={{ borderLeftWidth: 3, borderLeftColor: severityColor(issue.level), borderLeftStyle: "solid" }}>`.

- [ ] **Step 5: Issue title + level chip**

Within each `<li>`:
- Title `<span className="text-sm font-medium text-stone-900">` → `<span className="font-[family-name:var(--font-title)] text-base text-hp-ink">`.
- Level chip — the inline-style version currently sets color + border. Replace with a more saturated chip using the new bg fills:

```tsx
<span
  className="inline-flex h-[22px] items-center gap-1 border px-2 text-[10px] font-bold uppercase tracking-[0.14em]"
  style={{
    color: severityColor(issue.level),
    borderColor: severityColor(issue.level),
    backgroundColor: severityBg(issue.level),
  }}
>
  {issue.level}
</span>
```

Add a `severityBg()` helper next to `severityColor()`:

```ts
function severityBg(value: string): string {
  const v = (value || "").toLowerCase();
  if (v === "ok" || v === "healthy") return "var(--positive-bg)";
  if (v === "warning" || v === "warn") return "var(--warning-bg)";
  if (v === "critical" || v === "error" || v === "fail") return "var(--danger-bg)";
  return "transparent";
}
```

- [ ] **Step 6: Issue detail + link**

Detail `<p className="text-xs text-stone-700">` → `<p className="text-[13px] text-hp-body leading-relaxed">`.

Link `<a className="text-xs font-medium underline hover:no-underline">` → `<a className="mt-1 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.14em] text-hp-ink border-b border-hp-ink pb-[1px] hover:text-hp-pink hover:border-hp-pink">`.

- [ ] **Step 7: Empty state banner**

Find the no-issues fallback `<p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">No open issues. ...</p>` and replace with:

```tsx
<p className="border border-signal-positive bg-signal-positive-bg px-5 py-4 text-sm text-signal-positive">
  <span className="font-bold uppercase tracking-[0.14em] mr-2">All clean</span>
  <span className="text-hp-ink">No open issues. All checks reporting clean.</span>
</p>
```

- [ ] **Step 8: JSON snapshot block**

```tsx
<section aria-label="Health detail JSON" className="overflow-hidden rounded-xl border border-stone-200 bg-white">
  <header className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">Full snapshot</header>
  <pre className="max-h-96 overflow-auto bg-stone-50 px-4 py-3 text-[11px] text-stone-700">
```

becomes:

```tsx
<section aria-label="Health detail JSON" className="overflow-hidden border border-hp-rule bg-hp-card">
  <header className="border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">Full snapshot</header>
  <pre className="max-h-80 overflow-auto bg-hp-card px-5 py-4 text-[11px] text-hp-ink font-mono leading-relaxed">
```

- [ ] **Step 9: Snapshot-unavailable fallback (in the page file)**

Open `src/app/(workspace)/operate/health/page.tsx` and find the line 19-21 fallback `<p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">`. Replace with `<p className="border border-signal-danger bg-signal-danger-bg px-5 py-4 text-sm text-signal-danger">`.

- [ ] **Step 10: Build + dev smoke**

Run: `npm run build && npm run lint`.

Open `/operate/health` (force a warning state if possible via env, otherwise just confirm chrome). Verify the editorial chrome, severity chips with bg fills, JSON pre block in cream.

- [ ] **Step 11: Commit**

```bash
git add src/components/v2/operate/health-panel.tsx src/app/\(workspace\)/operate/health/page.tsx
git commit -m "feat(operate): editorial health panel with severity bg-fill chips"
```

---

### Task 11: `/operate/pipelines` editorial chrome

**Files:**
- Modify: `src/components/v2/operate/pipelines-panel.tsx`

**Steps:**

- [ ] **Step 1: Survey the file**

Run: `grep -nE "rounded-|stone-|pink-400|bg-white|bg-amber|bg-emerald|bg-rose" src/components/v2/operate/pipelines-panel.tsx`. Note every match; each maps to an editorial replacement per the table in Task 4 Step 2.

- [ ] **Step 2: Card chrome pass**

For every outer `<section>` or card-like wrapper using `rounded-xl border border-stone-200 bg-white`, replace with `border border-hp-rule bg-hp-card`. Drop all `rounded-*` classes. Replace section headers using `border-b border-stone-200 bg-stone-50` with `border-b border-hp-rule bg-hp-inset`. Bump header padding from `px-4 py-2` to `px-5 py-3` for editorial breathing room.

- [ ] **Step 3: Text color pass**

| Old | New |
|---|---|
| `text-stone-900` | `text-hp-ink` |
| `text-stone-800` | `text-hp-ink` |
| `text-stone-700` | `text-hp-body` |
| `text-stone-600` | `text-hp-muted` |
| `text-stone-500` | `text-hp-muted` |

- [ ] **Step 4: Pink and severity literals**

Find `border-pink-400` (the manual-sync hint) and replace with `border-hp-pink`. Find any `text-emerald-*`, `bg-emerald-*`, `border-emerald-*` and migrate to `text-signal-positive`, `bg-signal-positive-bg`, `border-signal-positive` (same for amber → warning, rose → danger).

- [ ] **Step 5: Right-aligned metric numbers**

If the panel renders a sync-runs table, find each right-aligned numeric `<td>` and add `font-[family-name:var(--font-title)] text-[17px] tabular-nums text-hp-ink` to the className.

- [ ] **Step 6: Build + lint + dev smoke**

Run: `npm run build && npm run lint`. Open `/operate/pipelines` in dev server. Verify editorial chrome.

- [ ] **Step 7: Commit**

```bash
git add src/components/v2/operate/pipelines-panel.tsx
git commit -m "feat(operate): editorial pipelines panel chrome"
```

---

### Task 12: `/operate/coverage` editorial chrome

**Files:**
- Modify: `src/components/v2/operate/backfill-month-table.tsx`

**Steps:**

- [ ] **Step 1: Apply the same survey + replacement pass as Task 11**

Run the same `grep` pass and apply the same className mappings: rounded-* deleted, stone-* → hp-*, emerald/amber/rose → signal-*. Right-aligned numbers get Cormorant 17px tabular.

- [ ] **Step 2: Build + lint + dev smoke + commit**

```bash
npm run build && npm run lint
git add src/components/v2/operate/backfill-month-table.tsx
git commit -m "feat(operate): editorial backfill month table chrome"
```

---

## Phase 5 — `/m/inbox`

### Task 13: `/m/inbox` layout + index page editorial

Goal: Cormorant wordmark, paper-grain pass-through, editorial status card, editorial conversation row chrome.

**Files:**
- Modify: `src/app/m/inbox/layout.tsx`
- Modify: `src/app/m/inbox/page.tsx`
- Modify: `src/components/v2/inbox/conversation-list-mobile.tsx`

**Steps:**

- [ ] **Step 1: Layout shell**

In `src/app/m/inbox/layout.tsx`, replace the return block:

```tsx
return (
  <div className="min-h-screen text-hp-body">
    <header className="sticky top-0 z-30 border-b border-hp-rule bg-hp-card/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-4">
        <span className="font-[family-name:var(--font-title)] text-2xl font-medium tracking-tight text-hp-ink">
          Inbox
        </span>
        <div className="ml-auto">
          <IdentityMenu
            email={profile.email}
            fullName={profile.fullName}
            initials={profile.initials}
            roles={profile.roles}
          />
        </div>
      </div>
    </header>
    <main className="mx-auto max-w-3xl px-4 py-4">{children}</main>
  </div>
);
```

Drop `bg-[#F8F4EE]` from the outer div so the body's paper grain shows through. Drop `text-stone-900` for the inherited `text-hp-body`.

- [ ] **Step 2: Index status card**

Open `src/app/m/inbox/page.tsx`. Find the header card (lines 36-43):

```tsx
<header className="rounded-xl border border-stone-200 bg-white px-4 py-3">
  <p className="text-sm font-medium text-stone-900">{sentence}</p>
  <p className="pt-0.5 text-[11px] text-stone-500">
```

Replace with:

```tsx
<header className="border border-hp-rule bg-hp-card px-4 py-4">
  <p className="font-[family-name:var(--font-title)] text-lg text-hp-ink leading-snug">
    {sentence}
  </p>
  <p className="mt-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
```

- [ ] **Step 3: Conversation rows**

In `src/components/v2/inbox/conversation-list-mobile.tsx`, find each conversation row anchor:

```tsx
<Link
  href={item.href}
  className="block rounded-xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:bg-stone-50 active:bg-stone-100"
>
```

Replace with a conditional className that adds the pink unread rail when `unread`:

```tsx
<Link
  href={item.href}
  className={`relative block border border-hp-rule bg-hp-card px-4 py-3 transition-colors hover:bg-hp-inset ${
    item.kind === "thread" && item.data.unread_count > 0 ? "pl-[18px]" : ""
  }`}
>
  {item.kind === "thread" && item.data.unread_count > 0 ? (
    <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px] bg-hp-pink" />
  ) : null}
```

Then `</Link>` closes as usual.

- [ ] **Step 4: Name, snippet, time, unread chip**

Inside the row, replace:
- `text-stone-900` (name) → `font-[family-name:var(--font-title)] text-base font-medium text-hp-ink`
- `text-stone-700` (snippet) → `text-hp-body`
- `text-stone-500` (time) → `text-hp-muted`
- The pink chip `bg-[#E14B7B]` → `bg-hp-pink`. Drop `rounded-full`. Replace `text-white` with `text-hp-foundation`.

- [ ] **Step 5: Search input**

Find the sticky search (`sticky top-14 z-20 -mx-4 border-b border-stone-200 bg-[#F8F4EE]/95 px-4 py-2 backdrop-blur`) and replace with `sticky top-14 z-20 -mx-4 border-b border-hp-rule bg-hp-foundation/95 px-4 py-2 backdrop-blur`. The input `rounded-full border border-stone-300 bg-white ... focus:ring-stone-400` → `border border-hp-rule bg-hp-card text-hp-ink placeholder:text-hp-muted focus:border-hp-pink focus:outline-none` (drop `rounded-full`, drop ring).

- [ ] **Step 6: Empty state**

`rounded-xl border border-dashed border-stone-300 bg-white/60 px-4 py-10 text-center text-sm text-stone-600` → `border border-dashed border-hp-rule bg-hp-card/60 px-4 py-10 text-center text-sm text-hp-muted`.

- [ ] **Step 7: Build + dev smoke on a phone-width browser**

Run: `npm run build && npm run lint`. Open `/m/inbox` in dev server with the device toolbar at iPhone width (390px). Verify:
- Wordmark in Cormorant 22-24px
- Paper grain visible through gaps
- Conversation rows show pink rail on unread items
- Search input is sharp-corner cream

- [ ] **Step 8: Commit**

```bash
git add src/app/m/inbox/layout.tsx src/app/m/inbox/page.tsx src/components/v2/inbox/conversation-list-mobile.tsx
git commit -m "feat(m/inbox): editorial mobile shell + conversation rows"
```

---

### Task 14: `/m/inbox/[id]` detail + composer banner fix

Goal: editorial bubble thread + restructure the composer so the confirm chip becomes a full-width banner row above the action buttons.

**Files:**
- Modify: `src/components/v2/inbox/conversation-detail.tsx`
- Modify: `src/components/v2/inbox/reply-composer.tsx`

**Steps:**

- [ ] **Step 1: Detail header**

In `conversation-detail.tsx`, find the header section (lines 60-72):

```tsx
<header className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3">
```

Replace with:

```tsx
<header className="flex items-center gap-3 border border-hp-rule bg-hp-card px-4 py-3">
```

Replace the back-link className `rounded-full border border-stone-300 bg-white px-3 text-xs font-medium text-stone-800 hover:bg-stone-50` with `border border-hp-ink bg-transparent px-3 text-[10px] uppercase tracking-[0.14em] text-hp-ink hover:bg-hp-ink hover:text-hp-foundation` (sharp corners, editorial outline).

Replace `text-stone-900` (participant name) → `font-[family-name:var(--font-title)] text-base text-hp-ink`. Replace `text-stone-500` (platform line) → `text-[10px] uppercase tracking-[0.14em] text-hp-muted`.

- [ ] **Step 2: Bubble thread**

Find the messages section (around line 75):

```tsx
<section aria-label="Messages" className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
```

Replace with `<section aria-label="Messages" className="space-y-3 border border-hp-rule bg-hp-card p-4">`.

Find `Bubble` component definition (search for `function Bubble`). Inside, find the inbound/outbound class branches. Replace:

| Direction | Old | New |
|---|---|---|
| inbound | `bg-stone-100 text-stone-900` (or similar) | `bg-hp-inset text-hp-ink border border-hp-rule` |
| outbound | `bg-stone-900 text-white` (or similar) | `bg-hp-ink text-hp-foundation border border-hp-ink` |

Drop any `rounded-2xl` / `rounded-md` from the bubble — sharp corners. Time stamp under each bubble: `text-stone-500` → `text-[10px] uppercase tracking-[0.14em] text-hp-muted`. For outbound bubbles, the time stamp goes `text-stone-300` (or whatever the muted-on-dark color is) → `text-hp-foundation/60`.

- [ ] **Step 3: Unread inbound emphasis**

If the codebase passes an `isUnread` or similar flag to `Bubble`, add a `border-l-2 border-hp-pink` modifier in the className for inbound unread bubbles. If no such flag exists today, leave a comment `// TODO: surface unread bubbles when SocialInboxMessage carries a read flag` and move on (no functional change).

- [ ] **Step 4: Composer head**

In `reply-composer.tsx`, find the composer head row (likely a `<div>` near the top of the form with "Reply as ..." label). Replace `bg-stone-50 border-b border-stone-200 px-4 py-2 text-xs text-stone-600` with `bg-hp-inset border-b border-hp-rule px-4 py-3 text-[10px] uppercase tracking-[0.14em] text-hp-muted`.

The brand name inside the "Reply as" sentence: wrap in `<span className="font-[family-name:var(--font-title)] italic text-hp-ink">{brand}</span>`.

- [ ] **Step 5: Composer textarea**

Find the `<textarea>` className (`rounded-md border border-stone-200 ...`) and replace with `border-0 bg-transparent w-full px-4 py-3 text-[14px] text-hp-ink placeholder:text-hp-muted focus:outline-none resize-none min-h-[84px]`.

- [ ] **Step 6: Move confirm chip to its own banner row**

Find the actions row at the bottom of the composer form. It currently renders the Ask AI + Send buttons + confirm chip inline. Split into TWO siblings:

```tsx
{state.confirming ? (
  <div className="border-t border-signal-warning bg-signal-warning-bg px-4 py-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] font-bold text-signal-warning">
    <span aria-hidden>⚠</span>
    <span>Send as {brand}? Tap Send again to confirm.</span>
  </div>
) : null}

<div className="border-t border-hp-rule-soft px-4 py-3 flex gap-2 items-center justify-between">
  {state.confirming ? (
    <>
      <button
        type="button"
        className="h-9 px-3 border border-hp-rule text-[10px] uppercase tracking-[0.14em] text-hp-muted hover:border-hp-ink hover:text-hp-ink"
        onClick={() => setState((s) => ({ ...s, confirming: false }))}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={!canSend || state.status === "sending"}
        className="h-9 px-4 border border-signal-warning bg-signal-warning text-hp-foundation text-[10px] uppercase tracking-[0.14em] hover:bg-signal-danger hover:border-signal-danger disabled:opacity-50"
      >
        Send as {brand} →
      </button>
    </>
  ) : (
    <>
      <button
        type="button"
        onClick={requestSuggestion}
        disabled={state.generating}
        className="h-9 px-3 border border-hp-rule text-[10px] uppercase tracking-[0.14em] text-hp-muted hover:border-hp-ink hover:text-hp-ink disabled:opacity-50"
      >
        ✦ Ask AI
      </button>
      <button
        type="submit"
        disabled={!state.text.trim() || !canSend}
        className="h-9 px-4 border border-hp-ink bg-hp-ink text-hp-foundation text-[10px] uppercase tracking-[0.14em] hover:bg-hp-pink hover:border-hp-pink disabled:opacity-50"
      >
        Send →
      </button>
    </>
  )}
</div>
```

Note: this preserves the existing `state.confirming` state machine and the `canSend` permission gate. The wiring of `requestSuggestion`, `state.text.trim()`, and the submit handler logic must come from whatever the file already implements — only the JSX layout + className changes; do not rewrite the state machine or the suggest-reply POST.

- [ ] **Step 7: Build + lint + dev smoke**

Run: `npm run build && npm run lint`.

Open `/m/inbox/t-...` (any thread URL) at iPhone width. Verify:
- Back button, name, platform line all editorial
- Bubbles sharp-cornered with editorial bg/text colors
- Composer textarea has no rounded border
- In idle state: Ask AI + Send visible, both 36-38h
- Click Send once → confirm banner appears between textarea and buttons; action row swaps to Cancel + "Send as HP →"

- [ ] **Step 8: Commit**

```bash
git add src/components/v2/inbox/conversation-detail.tsx src/components/v2/inbox/reply-composer.tsx
git commit -m "feat(m/inbox): editorial detail view + composer banner row"
```

---

## Phase 6 — Tidy

### Task 15: Legacy hybrids tidy

Goal: the legacy hybrid pages (`/attribution-ledger`, `/website-funnel`, `/login`, `/no-access`, `/outcomes`, `/review`) already use the editorial CSS vars. Sweep for stray `border-stone-*`, `bg-stone-*`, `text-stone-*`, `pink-400`, `#E14B7B`, `rounded-xl` literals and replace.

**Files (each file may or may not have stray literals):**
- Modify: `src/components/attribution-ledger-client.tsx`
- Modify: `src/components/website-funnel-client.tsx`
- Modify: `src/components/login-client.tsx`
- Modify: `src/components/no-access-client.tsx`
- Modify: `src/app/outcomes/page.tsx`
- Modify: `src/app/review/page.tsx`
- Modify: `src/components/users-client.tsx`
- Modify: `src/components/social-inbox-client.tsx`
- Modify: `src/components/creative-analysis-client.tsx`
- Modify: `src/components/meta-backfill-client.tsx`
- Modify: `src/components/executive-snapshot/*.tsx`
- Modify: `src/components/filter-bar.tsx`
- Modify: `src/components/hero-number.tsx`
- Modify: `src/components/maturity-badge.tsx`
- Modify: `src/components/status-sentence.tsx` (v1)
- Modify: `src/components/technical-id.tsx`
- Modify: `src/components/top-navigation.tsx`
- Modify: `src/components/week-window-toggle.tsx`

**Steps:**

- [ ] **Step 1: Run the survey grep**

Run:
```bash
grep -rnE "stone-[0-9]|pink-400|#E14B7B|rounded-(md|lg|xl|2xl|3xl|full)|bg-\[#F8F4EE\]|bg-amber-|bg-emerald-|bg-rose-|border-amber-|border-emerald-|border-rose-|text-amber-|text-emerald-|text-rose-" src/components/ src/app/outcomes src/app/review src/app/login 2>/dev/null
```

Capture the output. Each match is a candidate replacement.

- [ ] **Step 2: Apply the standard mappings**

For each match, replace per the table in Task 4 Step 2 PLUS:

| Old | New |
|---|---|
| `text-amber-*` | `text-signal-warning` |
| `bg-amber-50` | `bg-signal-warning-bg` |
| `border-amber-*` | `border-signal-warning` |
| `text-emerald-*` | `text-signal-positive` |
| `bg-emerald-50` | `bg-signal-positive-bg` |
| `border-emerald-*` | `border-signal-positive` |
| `text-rose-*` | `text-signal-danger` |
| `bg-rose-50` | `bg-signal-danger-bg` |
| `border-rose-*` | `border-signal-danger` |
| `rounded-full` (avatars only) | _keep_ |
| `rounded-full` (chips, pills, buttons) | _delete_ |
| `rounded-md` / `rounded-lg` / `rounded-xl` / `rounded-2xl` | _delete_ |

The avatar exception: round avatars stay round. Pill chips become sharp.

- [ ] **Step 3: Special-case the executive-snapshot directory**

If decision is made to keep the executive-snapshot family in case it's revived (per the spec's "Acknowledged gaps"), still run the sweep on those files so their style is consistent should they ever render. Otherwise skip.

- [ ] **Step 4: Build + lint + dev smoke**

Run: `npm run build && npm run lint`. Open `/attribution-ledger`, `/website-funnel`, `/login`, `/no-access`, `/outcomes`, `/review`. Confirm each renders without console errors and looks editorial.

- [ ] **Step 5: Commit**

```bash
git add -A
git diff --cached --name-only | xargs -I {} echo "modified: {}"
git commit -m "chore(ui): sweep stray stone/pink/rounded literals from legacy components"
```

---

### Task 16: Final pink + beige unification sweep

Goal: catch any remaining `#E14B7B`, `bg-[#F8F4EE]`, or `--workspace-accent` references and consolidate.

**Files:**
- Sweep all `src/**/*.{ts,tsx,css}`

**Steps:**

- [ ] **Step 1: Run the final grep**

```bash
grep -rnE "#E14B7B|#e14b7b|bg-\[#F8F4EE\]|--workspace-accent|border-pink-400|bg-pink-400|text-pink-400" src/ 2>/dev/null
```

Every match is a stragler. Replace per:

| Old | New |
|---|---|
| `#E14B7B` / `#e14b7b` | `var(--accent)` (in CSS) or `bg-hp-pink` (in Tailwind) |
| `bg-[#F8F4EE]` | (delete — let body bg show through) OR `bg-hp-foundation` if a card explicitly needs the foundation tone |
| `--workspace-accent` | `--accent` (it was a CSS variable indirection that's no longer needed; replace with the unified accent var) |
| `border-pink-400` / `bg-pink-400` / `text-pink-400` | `border-hp-pink` / `bg-hp-pink` / `text-hp-pink` |

- [ ] **Step 2: Verify no instances remain**

Re-run the same `grep`. Expected: zero matches.

- [ ] **Step 3: Build + lint + full dev sweep**

Run `npm run build && npm run lint && npm test`. Expected: all pass.

Run `npm run dev` and walk through every route in the visual companion artifact list: `/`, `/analyst`, `/analyst/creative-analysis`, `/analysis`, `/convert`, `/convert/inbox`, `/operate/health`, `/operate/pipelines`, `/operate/coverage`, `/operate/users`, `/attribution-ledger`, `/website-funnel`, `/login`, `/no-access`, `/m/inbox`, `/m/inbox/[any-id]`. Confirm no `#E14B7B` pink anywhere, no flat stone grays, no Tailwind `rounded-*` (except round avatars), no `bg-[#F8F4EE]` flat fills.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ui): finalize pink and beige unification sweep"
```

---

## Verification + handoff

After Task 16, the rebuild is complete. The branch should be ready for PR review with:

- Every workspace surface rendering against the body's paper-grain foundation
- One pink (`#e91d79`), one beige (`#f7f1eb`)
- All severity chips with bg fills
- Time-to-book + Attributed creative on the Customer Journey drawer
- ⌘K stub gone
- All existing tests green (`npm test`)
- All existing routes, permissions, redirects, state machines functional
- Visual diff visible on Vercel preview

Open the Vercel preview link side-by-side with the spec's visual companion artifacts (`.superpowers/brainstorm/78371-1779458624/content/*.html`) for visual sign-off.
