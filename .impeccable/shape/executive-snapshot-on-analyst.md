# Shape Brief: Strip `/analyst` to working data

**Supersedes**: the prior version of this file (which proposed adopting ExecutiveSnapshot — rejected by the user; that composition delivered narrative slop, a redundant scorecard, rule-derived noise, and decoration without analysis).

**Source critique**: `.impeccable/critique/2026-05-24T14-16-43Z__src-app-workspace-analyst-page-tsx.md` (note: critique's P0 #1 was wrong; ExecutiveSnapshot adoption is **not** the direction)

**Date**: 2026-05-24
**Register**: product (per PRODUCT.md)

## 1. Feature Summary

Strip `/analyst` down to what the marketing operator actually uses: filters, then table. Delete every layer above the filter region that doesn't serve daily triage. No "Today's briefing." No verdict pull-quote. No masthead-as-publication. No 5-tile MetricTile strip. No standalone trend chart. The data is the analysis; the table is the workspace.

What stays: top navigation, `StatusSentence` (the page-state line, kept per PRODUCT.md's "status sentence first" principle — it names the slice, it isn't narrative), `DataCoverageNotice` when present, the filter region (reflowed into two rows), the nested performance table (with its existing per-row sparkline columns covering trend-at-a-glance), and the creative drawer.

What gets deleted in this PR: `src/components/dashboard-client.tsx` MetricTile strip (L565–606) + the `MetricTile` component (L902–930), the standalone trend chart (L687–735), the H1 "AI Analyst Command Center" (L842–844), and the entire `src/components/executive-snapshot/` directory (4 files, ~1000 lines).

Primary persona: marketing operator. JTBD reframed by today's call: *"Open `/analyst`, see what slice I'm on, work the table, leave."*

## 2. Primary User Action

**Pick the slice (filters), read the table.**

No verdict layer between the operator and the data. The operator trusts their own eyes on the rows.

## 3. Design Direction

- **Color strategy**: Restrained, unchanged.
- **Theme**: Light, forced by *"Mid-morning, marketing operator at a 27-inch monitor in a daylit room with a coffee on the desk, opening the dashboard to see what HP and VVS did last week before clearing today's queue."*
- **Anchor references**: a printed leather-bound operator's ledger (working layer); a Bloomberg Terminal layout, *but* in the warm cream/serif register (density without decoration). The Editorial Broadsheet North Star still applies to the chrome — hairlines, smallcaps, oldstyle figures — but is **not** invoked as a publication metaphor on this page. No "Vol. I · Issue №" wordmark.
- **Anti-direction**: anything that smells like a verdict / briefing / summary above the table. If a designer wants to add a "lede," the answer is no.

## 4. Scope

Production-ready, full surface, shipped-quality. One coherent PR that:
1. Removes the dead code (MetricTile strip + MetricTile component + standalone trend chart + H1 + entire `executive-snapshot/` directory).
2. Reflows the filter region into two semantically grouped rows.
3. Fixes the `UniversalFilterBar` duplicate-DOM bug (`L127 + L181`) as part of the sticky-on-scroll rework.
4. Lands the polish items on this surface (em-dashes, glass blur on `hero-number.tsx` and `universal-filter-bar.tsx`, `text-red-700`, `bg-white` outside inputs, the umbrella-scorecard side-stripe — though note the side-stripe is in code being deleted).

Note: P1 work on the `DataCoverageNotice` recolor (pink → warning) stays as the planned separate `colorize` pass — out of scope here.

## 5. Layout Strategy

```
Top navigation (existing)
─ hairline ─
DataCoverageNotice (only when present)
StatusSentence
─ hairline ─
Filter region
  Row 1 (Range):  date-range chips · custom start · custom end · brand chips · Apply · PDF export
  Row 2 (Refine): delivery chips · search · periods select · metric select · vs prior period toggle
─ hairline ─
Nested performance table (with sparkline columns, lazy hierarchy, existing structure)
Creative drawer (existing side panel)
```

- Width: `max-w-7xl` throughout.
- Rhythm: hairline rules separate sections; spacing variance (looser around StatusSentence, denser at the table) carries the broadsheet feel without ornament.
- No `❦` ornament on this page. The gilt-mark budget is unspent here; saved for surfaces that earn it.
- No masthead band. The top navigation is sufficient page identity.

### Filter region reflow (unchanged from previous brief — this part survives)

- **Row 1 (`Range`)**: smallcaps eyebrow + date-range chips (7D / 14D / 30D / custom) + custom start + custom end + brand chips (HP / VVS) + Apply button (enabled only when form is dirty) + PDF export button right-flushed.
- **Row 2 (`Refine`)**: smallcaps eyebrow + delivery chips + search input + periods select + metric select + "vs prior period" segmented toggle.
- Heights: `h-9` chips, `h-10` inputs, square corners (per DESIGN.md).
- Hairline rule between rows.
- Reflow: no row wraps on desktop ≥1280px; on smaller breakpoints rows reflow into a third row in declared order (no reordering).
- Sticky-on-scroll: rows collapse to a single summary line (e.g., *"Last 7D · HP · vs prior period · 6 periods"*) + one "Adjust filters" button. **Single DOM tree** — fixes the duplicate-subtree bug at `universal-filter-bar.tsx:127 + 181`.

## 6. Key States

| State | What the user sees |
|---|---|
| **Default** | StatusSentence + filter region + table. No briefing zone, no metric strip, no chart. |
| **Empty (no Meta env)** | StatusSentence shows the empty-state copy. Filter region hidden. Table region shows: *"No Meta access has been configured yet."* + link to Operate room. |
| **Empty (zero data in range)** | StatusSentence reads the current slice. Filter region visible (so operator can widen). Table region shows: *"No campaigns delivered during the selected range."* |
| **Loading (initial)** | Server-rendered. No client-side spinner. |
| **Loading (filter Apply)** | Apply label → `Updating`. Table dims to 60% opacity during navigation. No layout shift. |
| **Error (data fetch)** | StatusSentence shows the error tone. Table region: *"Meta returned an error. Try again."* + smallcaps link. |
| **Partial (coverage gap)** | `DataCoverageNotice` renders above StatusSentence. Recolor + primary action land in the planned separate `colorize` pass. |
| **Reduced motion** | Opacity dim on Apply is instant (no fade). All `.fade-up` are removed from this page (they were tied to ExecutiveSnapshot rhythm; no longer relevant). |
| **Permission-limited (read-only stakeholder)** | Filter region renders without Apply/PDF; chips become read-only labels showing the current state. Table renders without per-row actions. |
| **Mobile (<768px)** | StatusSentence stacks. Filter region collapses into "Adjust filters" → vaul drawer. Table goes horizontal-scroll. Read-only per PRODUCT.md. |

## 7. Interaction Model

- **Filter Row 1/2 change**: form-dirty enables Apply. Click → `window.location.assign` with new URL params (existing behavior). Table dims 60% during navigation.
- **Sticky filter on scroll**: rows collapse to summary + single "Adjust filters" button; no duplicate React subtree.
- **PDF export**: moves to Row 1 right edge. Exports the current filtered table.
- **Table row interactions**: existing behavior (lazy hierarchy expand, CreativeDrawer open). Unchanged.
- **Keyboard**: `Cmd+K` palette (existing), `Escape` closes drawer + sticky overlay (existing). No new shortcuts.

## 8. Content Requirements

Locked changes on this surface:

- **Delete** the H1 "AI Analyst Command Center" (`dashboard-client.tsx:842–844`). The top nav identifies the app; the StatusSentence identifies the page state. No H1.
- **Delete** the `<MetricTile>` strip (`dashboard-client.tsx:565–606`) and the `MetricTile` component (L902–930).
- **Delete** the standalone trend chart (`dashboard-client.tsx:687–735`) — sparkline columns in the table cover trend.
- **Delete** the entire `src/components/executive-snapshot/` directory (index, top-story-section, needs-attention-section, umbrella-scorecard-section). Verify no remaining imports first.
- **Row labels**: smallcaps **"Range"** (Row 1), **"Refine"** (Row 2).
- **Sticky summary** when scrolled past: `{range} · {brand} · {vs} · {N} periods`. Period-separated; no em-dashes.

Glossary discipline (lands in the planned `polish` pass; asserted here):
- "vs Prev" → **"vs prior period"** everywhere on this surface (matches `dashboard-client.tsx:299`).
- "Umbrella" standalone → **"Group"** per PRODUCT.md glossary.
- All em-dashes on this surface → periods, colons, or `·`.

No images. No ornament glyphs on this page.

## 9. Recommended References

For implementation:
- `reference/product.md` — register laws (consistency, density, familiar affordances).
- `reference/spatial-design.md` — hairline use, spacing variance for rhythm.
- `reference/interaction-design.md` — sticky-filter collapse pattern.
- `reference/cognitive-load.md` — verify the two-row filter passes chunking (Row 1: 5 elements; Row 2: 5 elements — both within 4±1 working-memory budget if Row 1's date chips are grouped as one unit).

## 10. Open Questions

Asserted defaults; only the genuinely open are listed.

1. **Masthead?** Asserting **no separate masthead band**. The top navigation is sufficient page identity. (If you want a one-line page title like "Performance · HP/VVS" between the nav and StatusSentence, say so.)
2. **StatusSentence content**. Today it's largely structural ("scope: HP, 7D · vs prior period"). Worth a separate `clarify` pass on what it actually says, since it's now the only page-level element above the working data. Out of scope for this brief; flagging for follow-up.
3. **The `attention-rules.ts` engine** that ExecutiveSnapshot's NeedsAttentionSection consumed — does it have any other consumer, or also dead code? **Assertion**: scan and delete if orphaned; flag if anything else depends on it.
