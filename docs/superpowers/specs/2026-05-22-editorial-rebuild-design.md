# Editorial UI rebuild — design

**Date:** 2026-05-22
**Owner:** UI rebuild (purely visual; no behavior changes)
**Anchor reference:** `/analyst` (DashboardClient) as it ships today

## Summary

Apply the existing editorial broadsheet vocabulary defined in `src/app/globals.css` (System B) — Cardo + Cormorant Garamond serifs, warm beige foundation, paper grain, HP pink accent, severity CSS variables — across every workspace surface. Take `/analyst` as the anchor reference; every other room inherits the same masthead → KPI grid → filter strip → section card → editorial table pattern. Retire the parallel utility palette (Tailwind stone-* + `bg-[#F8F4EE]` flat fills + `rounded-xl` cards) used by the current `(workspace)` shell and the v2 panels.

**No data, filter, behavior, route, permission, or workflow changes.** Pure className/color/font/border treatment. The `Ask anything… ⌘K` disabled stub is removed (one line in the workspace layout).

## Direction

Two design systems coexist in the codebase today: an editorial broadsheet system (System B — `globals.css`, the `*-client.tsx` legacy components, the unused `executive-snapshot/` family) and a utility internal-tool system (System A — `design-tokens.ts`, the `v2/` components, the current `(workspace)` shell). Both are well-executed in isolation. The pain is at the seams — most sharply at `/analyst`, where the utility shell wraps an editorial client, producing a visual whiplash within a single scroll inch.

The decision is **System B everywhere**, with `/analyst`'s current rendering as the anchor. Concretely:

- Background atmosphere from `globals.css` (paper grain, dual radial vignettes, `--bg-foundation`) shows through on every surface, including the workspace shell.
- Typography is Cardo (body) + Cormorant Garamond (titles and metrics). Both already load via `next/font/google` in `src/app/layout.tsx`.
- Cards are sharp-corner `border border-hp-rule bg-hp-card` (no `rounded-*`). Pink (`--accent`, `#e91d79`) is reserved for one signature touch per surface — focus rings, the unread mail rail, the primary-button hover state.
- Severity colors use the existing `severityColor()` helper hex values (`#1F7A4D` / `#7A4900` / `#7A1A1A` / `#5A5346`), now paired with subtle bg fills so chips read against the cream card.

## Risk verdict — Low-Medium

| Bucket | Severity | Notes |
|---|---|---|
| Data table density | Medium | Editorial padding (`p-6 sm:p-8`) inflates rows. `/attribution-ledger` already proves the fix: editorial frame, dense cells inside. Same treatment for the optimize tree-table and pipelines run log. |
| Severity legibility | Medium | `/operate/health` shows critical/warn/info side by side. Keep editorial chrome but use the saturated `severityColor()` values inside chips with bg fills so urgency reads at a glance. |
| Mobile (`/m/inbox`) | Low | Cardo 14 holds up. Keep the cramped utility shell layout; align colors, wordmark, chip pink to the system. |
| ⌘K stub removal | Low | One line in `(workspace)/layout.tsx`. No layout shift — slot is `ml-auto` with siblings absorbing the gap. |
| Three pinks colliding | Low | Consolidate to `#e91d79` (the warmer one). `#E14B7B` and `border-pink-400` go away. |
| Build / runtime / a11y | Low | No new dependencies. Contrast pairs (`--ink-primary` on `--bg-foundation`, `--ink-body` on `--surface-card`, `--ink-muted` on `--surface-card`) clear WCAG AA. Paper grain SVG already ships. |

## Visual companion artifacts

All sketches live in `.superpowers/brainstorm/78371-1779458624/content/` and were iterated through the brainstorming session:

| File | Subject |
|---|---|
| `01-direction-and-risk.html` | Risk verdict + `/analyst` DNA extraction |
| `02-pattern-kit.html` | Full kit (14 primitives) |
| `03-pattern-kit-v2.html` | Editorial table with creative thumbnails + Primary KPI column; filter strip with vs Prev; drawer with thumbnail |
| `04-corrections-round-2.html` | Metric numbers bumped to 17px Cormorant; period chips wrap full-width without clipping |
| `06-convert.html` | `/convert` full page + drawer |
| `07-convert-corrections.html` | Three-line status sentence; Time-to-book with dynamic unit |
| `08-operate-health.html` | `/operate/health` with severity stripes, chips, JSON snapshot |
| `09-m-inbox.html` | `/m/inbox` list view + detail view (390 × 800 mobile) |
| `10-m-inbox-composer-fix.html` | Composer two-step send: confirm banner as own row above buttons |

## Design vocabulary (the kit)

### Color

Source of truth stays `src/app/globals.css`. Consolidations needed:

| Token | Hex | Purpose |
|---|---|---|
| `--bg-foundation` | `#f7f1eb` | Page background (paper, vignettes layered) |
| `--surface-card` | `#fbf7f1` | Cards, panels, drawers |
| `--surface-inset` | `#efe8dd` | Subtle inset (table headers, hover) |
| `--rule` | `#d4cfc4` | Hairline borders |
| `--rule-soft` | `#e6dfd2` | Soft dividers between table rows / sections |
| `--ink-primary` | `#2a2725` | Titles, headings, key numbers |
| `--ink-body` | `#4a4540` | Body prose |
| `--ink-muted` | `#8a8178` | Captions, eyebrows, meta |
| `--accent` | `#e91d79` | One pink. Replaces `#E14B7B` and `pink-400` everywhere |
| `--gilt` | `#9c7b3f` | Ornaments only (❦, signature marks) |
| `--positive` | `#245d4d` | Signal positive (consolidates with `severityColor()` — see note below) |
| `--warning` | `#8b5b19` | Signal warning |
| `--danger` | `#8d2e2e` | Signal danger |
| Severity bg fills | `#e6efe9` / `#f6ecd6` / `#f5dedb` / `#e0f0fa` | New — to be added — for chips reading against cream cards |

**Severity consolidation note**: today there are two parallel severity hex sets:
- `globals.css` defines `--positive: #245d4d`, `--warning: #8b5b19`, `--danger: #8d2e2e`.
- `severityColor()` in `src/components/v2/operate/health-panel.tsx` returns `#1F7A4D` / `#7A4900` / `#7A1A1A`.

These render at indistinguishable optical weight but mean the source of truth is split. **Resolution**: update `severityColor()` to read the CSS variables (or matching constants) so a single set drives every surface. Pure refactor, no visible color change to the operator at the values they currently see.

### Typography ramp

Both faces already loaded in `src/app/layout.tsx` as `--font-cardo` and `--font-title` (Cormorant Garamond). No new font dependencies.

| Token | Spec | Use |
|---|---|---|
| `display` | Cormorant 56 / 57, -1% tracking | Login, room landing hero |
| `h1` | Cormorant 40 / 42, -0.5% tracking | Room titles (analyst masthead) |
| `h2` | Cormorant 26 / 30 | Page-level section titles |
| `h3` | Cormorant 18 / 22 | In-card section titles |
| `eyebrow` | Cardo 11 / 15, UPPER, 0.14em tracking | Section labels above titles |
| `body` | Cardo 15 / 23 | Prose, body |
| `body-sm` | Cardo 13 / 19 | Table cells, meta lines |
| `metric-lg` | Cormorant 36, tabular | KPI tiles |
| `metric` | Cormorant 22, tabular | Drawer mini-metrics, masthead metric chips |
| `metric-sm` | Cormorant 17, tabular | Editorial table right-aligned numbers (**bumped from 14 so they read at the same optical size as Cardo 14 body letters**) |

### Component primitives

1. **RoomMasthead** — three variants. (A) Rich: eyebrow + Cormorant title + status sentence + right-aligned metric chips. (B) Status only: eyebrow + status sentence + right-aligned status pill. (C) Static page: centered eyebrow + Cormorant display title + body paragraph.

   Status sentence on data-rich rooms (`/convert`, `/analyst`) renders as **three parallel lines**, each leading with a colored number — positive green, warning ochre, neutral ink. Reads top-to-bottom like a journalist's lede.

2. **KPI tile** — `border border-hp-rule bg-hp-card p-5` (no rounded corners). Smallcaps Cardo label, Cormorant tabular value (26–36px depending on tile prominence), optional severity-colored delta chip, optional sparkline (1px stroke `--ink-primary`).

3. **Filter strip** — `border-y border-hp-rule py-4`, no card chrome. FilterChip groups (Brand, Delivery), date range with calendar + Apply, 7D/14D/30D quick-range buttons, `vs Prev` toggle (filled ink when on), `Periods` select (2/4/8) shown only when vs Prev is on. **Period chips render on their own row below the strip, full-width, `flex-wrap: wrap`** — no horizontal scroll, no clipping at 8 periods.

4. **Section card** — `border border-hp-rule bg-hp-card p-6 sm:p-8` (sharp corners). Section header pattern: eyebrow + Cormorant title (22px) + hairline rule + optional actions slot. Card holds tables, charts, lists, drawer body.

5. **Editorial table** — three row levels (campaign / ad set / creative) with progressive indent. Header row: `bg-hp-inset` with smallcaps headers. Body cells: 14px Cardo for text, **17px Cormorant tabular** for right-aligned numbers. Creative rows render the existing `<CreativePreview compact />` at 56×56 — same iframe / `<img>` / placeholder cascade as today. **Primary KPI column header** is `TERMS.primaryKpi` ("Primary KPI"); per-row sub-label is `row.primaryResultLabel` truncated to 28 chars ("Messages", "Appointments", "Purchases").

6. **Buttons** — sharp corners. Primary: filled `bg-hp-ink text-hp-foundation`, hover transitions to `--accent`. Secondary: outline ink, hover fills ink. Subtle: outline `--rule`, hover ink. Destructive: outline `--danger`, hover fills danger. Icon: 38×38 square. All 38h default, 28h compact.

7. **Inputs** — three variants. Underline (login, table search): bottom border, accent on focus-within. Bordered text: 38h sharp-corner border, accent on focus. Select: sharp-corner border with custom caret built from two `linear-gradient` triangles.

8. **Severity chips** — 22h pill with severity-colored 1px border, severity bg fill, severity text. Dot ⏺ leading the label. Five variants: `ok` (positive), `info` (info-blue), `warn` (warning ochre), `crit` (danger oxblood), `muted` (neutral for paused/n/a). Used in `/operate/health`, run statuses, inbox triage, delta chips, KPI delta indicators.

9. **Tabs and segmented control** — top tabs are flat (no card) with a 2px ink underline on the active tab and smallcaps labels. Segmented control inline for binary/ternary toggles (`Last 7 / 14 / 30 / QTD`).

10. **Right-side drawer** — sharp left border, soft `-8px 0 24px rgba(42,39,37,0.08)` shadow into the dimmed page. Header on `--surface-inset`. Width: 420 (creative drawer) or 720 (customer journey drawer) — matches existing dimensions. Header pattern: eyebrow + Cormorant title + meta line + Close button. Section pattern: padded 18×22 sections with bottom hairline. **Drawer thumbnail** uses the same `<CreativePreview />` component at 112×112 — the iframe path that fixed the prior rendering issue is preserved verbatim.

11. **Inbox conversation row** — sharp-corner card per row. Platform badge 28×28 (faint pink IG, faint blue FB, neutral comment). Cormorant 16 name, Cardo 13 snippet (2-line clamp), smallcaps relative time top-right. **Unread state earns a 3px pink left rail + pink unread-count chip** — the only place the accent appears outside focus rings and primary-button hover.

12. **Ornament rule** — `position: relative` hairline `var(--rule-soft)` with a centered `❦` in `var(--gilt)` on `var(--bg-foundation)` ground. Already defined in `globals.css` (`.ornament-rule`); currently unused. Reintroduce between major sections inside long pages (between Trend Analysis and Performance Scorecard on `/analyst`, between Funnel and Customer Ledger on `/convert`).

## Representative rooms

### `/analyst` — anchor reference

The `DashboardClient` rendering becomes the spec for every other room. No template changes; only the workspace shell wrapping it changes (see Shell, below). The visible chrome already follows the kit: masthead with `border-b border-hp-rule pb-6`, KPI grid with `border border-hp-rule bg-hp-card p-6`, filter strip with `border-y border-hp-rule py-4`, section cards with eyebrow + Cormorant title.

Three concrete tweaks the audit surfaced:

- Bump right-aligned table numbers from 14 → 17px Cormorant (so they read at the same optical weight as the brand-column letters).
- Drop the periods-row 380px max-width and `overflow-x: auto`; let chips flow full-width and wrap.
- Restructure the masthead status sentence to render three parallel lines via the existing `StatusHighlight[]` array, one highlight per line.

### `/convert`

- **StatusSentence**: same composed sentence from `buildCustomerLedgerStatusSentence()`. Layout shifts to three parallel lines, each leading with a colored number. Right side: three metric chips (Customers / Bookings / CAPI gaps; ochre when CAPI gaps > 0).
- **FunnelViz**: same 8 stages from `funnel.funnel`. Visx scale and bar order preserved. Bar fillIntensity progression from `tokens.color.light.accent` retained (this is the existing color logic). Surrounding card chrome shifts from `rounded-xl border border-stone-200 bg-white` to sharp-corner editorial; stage labels move to Cormorant 14 ink, meta to smallcaps Cardo muted.
- **CustomerLedger**: all eight columns preserved in order (creative · customer · activity · location · brand · source · CAPI · type). `@tanstack/react-table` config untouched. Creative thumbnail uses the existing `enrichCustomerLedgerRowsWithCreativePreviews()` pipeline. CAPI status renders as severity chip (`Sent` / `Missing` / `n/a`).
- **CustomerJourneyDrawer**: 720px width preserved. Header on `--surface-inset` with eyebrow + Cormorant participant name + brand chip + CAPI severity chip + Copy Link / Close.
  - **Summary section — five fields total** (per Resolved decision 1): a 4-up grid row with Match, Meta CAPI, Timeline (all existing today, restyled), and Time-to-book (NEW), followed by a full-width Attributed creative row beneath. Icons preserved from lucide where they exist; labels become smallcaps Cardo; values become Cormorant 22 tabular. Time-to-book renders the figure + smallcaps Cardo unit: `{n} sec` / `{n} min` / `{n} hr` / `{n} day(s)`. Null `creditedTouch` renders both Time-to-book and Attributed creative as `—`.
- **Timeline section** below: dot-and-line list rendered from `detail.timeline`. Three dot states — paid touch (pink), neutral (empty), booking confirmed (positive green). Times in smallcaps, titles in Cormorant 16, meta in Cardo 12 muted. The existing `CreativePreviewPanel`, `TouchSummaryCard`, and downstream sections stay structurally — only chrome shifts to editorial.

### `/operate/health`

- **StatusSentence**: from `buildHealthSentence(health?.status)`. Same sentence, editorial layout.
- **Overall status card**: preserves the existing severity-colored left stripe via inline `style={{ borderLeft: \`3px solid ${overallSeverity}\` }}`. Title: "Overall status: *warning*" with the state word in italic Cormorant tinted to `severityColor()`. 5-up stat row underneath — Latest sync, Sync status, Website reconcile, Missing env, Open issues — same fields, same `tabular-nums`, same data sources.
- **Issues list**: each row keeps its severity-colored 3px left stripe and severity chip. Chips upgraded with bg fills so they read against the cream card. Issue title in Cormorant 16, detail in Cardo 13, optional link as smallcaps underline.
- **Empty state**: "No open issues. All checks reporting clean." rendered as an editorial callout banner using `--positive-bg`.
- **JSON snapshot**: bottom card. Full `JSON.stringify(snapshot, null, 2)` preserved. Light syntax highlighting (keys in info-blue, strings in ink, numbers in warning) at 11px ui-monospace. Max-height 320, overflow scrollable.
- **Failure state**: when `getSystemHealth()` rejects, the existing "Health snapshot unavailable. Try refreshing." message restyles to use `--sev-crit` tokens.

### `/m/inbox` (mobile)

- **Layout shell**: 56h sticky header with Cormorant 22 "Inbox" wordmark + 34×34 IdentityMenu initials. `max-w-3xl` stays. Background gains the paper grain (currently flat `bg-[#F8F4EE]`).
- **Status card**: from existing `inbox.threads` derivation — "3 waiting. Oldest 22 min ago." Lead number colored by severity (warning when > 0 waiting).
- **Sticky search**: pins at top: 56 (matches new header). Sharp-corner 44h input with leading icon. Search logic in `ConversationListMobile.useMemo` untouched.
- **Conversation rows**: sharp-corner cards, ≥64h. Platform badge 28×28 (faint platform tint). Cormorant name, Cardo 2-line snippet, smallcaps relative time top-right. **Unread rows** get a 3px `--accent` left rail + the existing pink chip. Snooze chip uses warning palette.
- **Detail view**: Back button (sharp outline) + Cormorant participant name + smallcaps platform/kind/brand line. Bubble list: inbound on `--inset`, outbound on `--ink` foundation-color, sharp corners. Unread inbound bubble gets a 2px accent left border.
- **Reply composer**: preserves the full `DraftState` machine — text → Ask AI → POST `/api/social-inbox/suggest-reply` → draft inserted → Send → confirm → Send again. Layout fix: the confirm warning lives on its **own row as a banner** between the textarea and the action buttons (not inline with the buttons). When confirming, the action row swaps to Cancel + "Send as HP →" (ochre fill). Both buttons stay at 38h on a 390px viewport.

## Workspace shell

Replace the current shell in `src/app/(workspace)/layout.tsx`:

- Drop `bg-[#F8F4EE]` from the outer div so the body's paper grain shows through.
- Drop `text-stone-900` in favor of inheriting `--ink-body` (Cardo serif body) from `globals.css`.
- Header: keep sticky/backdrop, swap `border-b border-stone-200 bg-white/85` for `border-b border-hp-rule bg-hp-card/90`. Wordmark already uses `--font-title` — fine.
- `WorkspaceNav` pill buttons restyle: active pill background becomes `--accent` (the unified pink); inactive text becomes `--ink-body` with `--surface-inset` hover.
- `HealthPill` colors map to the unified severity palette (drop the Tailwind emerald/amber/rose).
- `IdentityMenu` button restyles to sharp-corner `border border-hp-rule bg-hp-card` with the avatar circle keeping its `bg-hp-ink` fill.
- **Remove `CommandPaletteTrigger`** entirely from the layout. The disabled `Ask anything… ⌘K` stub goes. The `ml-auto` on the sibling div absorbs the gap; no layout shift.

## What we explicitly do not change

The rebuild is purely className/color/font/border. The following are untouched:

- **State + handlers**: every `useState` / `useCallback` / `useMemo` in `DashboardClient`, `CustomerLedger`, `ConversationListMobile`, `ReplyComposer`. Filters, sort, search, expand, drawer open/close, period count, compare toggle, PDF export, hide-financials checkbox, send guardrail.
- **Data shape + loaders**: `loadDashboardPagePayload`, `DashboardPayload`, `PerformanceRow`, `buildPerformanceTree`, `rollingAnalystPeriods`, `ANALYST_PERIOD_COUNTS`, `fetchWebsiteFunnelData`, `fetchCustomerJourneyLedgerData`, `customerJourneyLedgerRequestFromSearchParams`, `enrichCustomerLedgerRowsWithCreativePreviews`, `getSystemHealth`, `getSocialInboxData`.
- **Glossary terms**: `TERMS.primaryKpi`, `TERMS.primaryKpiFallback`, `TERMS.campaignUmbrella`, `TERMS.umbrellaShort`.
- **Thumbnail rendering**: `<CreativePreview />` component code unchanged in `dashboard-client.tsx`. Same iframe / `<img>` / "No Preview" cascade. Same `referrerpolicy="no-referrer"`. Same `previewSource === "ad_preview"` gate. (This is the path that fixed the previous render regression.)
- **Routes + permissions**: 3-room IA preserved. `permission-routing.ts`, `access-control.ts`, all redirects unchanged. `/analyst` still renders `DashboardClient`; `/convert` still renders the same three components; `/operate/health` still mounts `HealthPanel`; `/m/inbox` still mounts `ConversationListMobile`.
- **Charts**: recharts and Visx data props, tooltip behavior, series keys unchanged. Stroke colors map to the existing CSS vars (already the case for HP charts on `/analyst`).
- **Severity helper**: `severityColor()` in `health-panel.tsx` returns the same hex values for the same input strings.
- **Mobile send guardrail**: `DraftState` machine and the "Send wiring lands in verification phase" notice both stay.

## Acknowledged gaps (not addressed in this rebuild)

- **vs Prev table wiring**: today the vs Prev toggle drives the KPI tiles, the trend chart's dashed prior-period lines, the status sentence text, and the umbrella scorecard — but NOT the bottom `NestedPerformanceTable`. The performance-tree cells render only current-period values regardless of vs Prev state. The user picked option 1: leave as today, document the gap. This rebuild renders current-only numbers in the performance table; adding a delta column or hover comparison is a separate functional ticket.
- **Executive snapshot resurrection**: `ExecutiveSnapshot`, `TopStorySection`, `NeedsAttentionSection`, `UmbrellaScorecardSection`, `ornament-rule`, `fade-up*` animations, `oldstyle-nums`, `lining-nums` are all wired in `globals.css` / `src/components/executive-snapshot/` and rendered nowhere. Either revive them on the analyst dashboard or delete them. Not in scope here — flag as a follow-up.
- **`Ask anything… ⌘K` real wiring**: removed in this rebuild. Phase 9 (the actual cmdk palette) is a separate piece of work.

## Rollout sequencing

Surfaces touched by the rebuild, ordered by impact and dependency:

1. **Shared primitives + shell first.** Define new Tailwind utility classes (or extend `@theme inline` in `globals.css`) for the consolidated severity bg fills. Restyle `(workspace)/layout.tsx` (the four bullets in Workspace shell above). Remove the `CommandPaletteTrigger`. This unblocks every room.
2. **`/analyst`**. Apply the three concrete tweaks (17px metric numbers, full-width period chips, three-line status sentence). Highest traffic; biggest seam fix.
3. **`/convert`**. Editorial chrome on the three child components. Add `Time to book` with dynamic unit. Existing `<StatusSentence>` (v2) gets restyled in place.
4. **`/operate/health`**. Editorial chrome; severity chips gain bg fills; JSON pre block syntax-highlights.
5. **`/operate/pipelines`**, **`/operate/coverage`**. Same StatusSentence pattern; restyle the v2 panels in place.
6. **`/m/inbox`** layout + index. Composer fix (banner row).
7. **`/m/inbox/[id]`** detail. Bubble restyle.
8. **Legacy hybrids tidy** — `/attribution-ledger`, `/website-funnel`, login family. These already use System B; align border colors, drop any stray `border-stone-200` / `pink-400` / `#E14B7B` literals.
9. **Pink + beige unification sweep**. Codemod `#E14B7B` → `#e91d79`; `border-pink-400` → arbitrary `border-[#e91d79]` (or new utility); `bg-[#F8F4EE]` literals → `bg-hp-foundation`. Run after the rooms above are done so the codemod is small and safe.

Each step is a separate PR. Visual diff via the Vercel preview is the primary verification surface; the existing test suites remain green because nothing functional changes.

## Resolved decisions

1. **Customer Journey drawer summary row** — Option C+: keep the existing three mini-metrics (Match / Meta CAPI / Timeline) AND add Time-to-book AND Attributed creative. Five fields total. Layout: a 4-up `grid-cols-2 sm:grid-cols-4` row containing the four numeric/short fields (Match, Meta CAPI, Timeline, Time-to-book), followed by a full-width row below labeled "Attributed creative" with the creative name in italic Cormorant 18 (more horizontal space — creative names are long strings, not figures). Derived from existing `CustomerJourneyLedgerDetailData`:
   - **Match**: `confidenceLabel(detail.confidence.level)` — already rendered.
   - **Meta CAPI**: `detail.capi.status || row.capiStatus` — already rendered.
   - **Timeline**: `{detail.timeline.length} events` — already rendered.
   - **Time-to-book**: NEW. Compute `detail.creditedTouch.first_touch.timestamp → row.occurredAt`. Format via the unit-aware helper (sec/min/hr/day(s) per the spec). Render `—` when `creditedTouch` is null.
   - **Attributed creative**: NEW. Read `detail.creditedTouch.creative_name` (or fall back to `creative_id` if name missing). Render `—` when `creditedTouch` is null.
2. **`❦` ornament** — yes, keep it between major sections inside long pages. The existing `.ornament-rule` class in `globals.css` becomes a live element again.
3. **`ResultCell`** — restyle in place. No new component.
4. **Drawer widths** — keep both. Creative drawer 420px; Customer Journey drawer 720px.
