---
name: HP/VVS Meta Ads AI Analyst
description: Editorial-broadsheet visual system for an internal Meta Ads intelligence and customer-conversation tool.
colors:
  foundation: "#f7f1eb"
  vignette-1: "#f3ebe1"
  vignette-2: "#efe7dc"
  card: "#fbf7f1"
  inset: "#efe8dd"
  ink: "#2a2725"
  ink-body: "#423d38"
  ink-muted: "#756c62"
  rule: "#d4cfc4"
  rule-soft: "#e6dfd2"
  hp-pink: "#e91d79"
  gilt: "#9c7b3f"
  platinum: "#bdc1c6"
  positive: "#245d4d"
  warning: "#8b5b19"
  danger: "#8d2e2e"
  info: "#0f4c75"
  positive-bg: "#e6efe9"
  warning-bg: "#f6ecd6"
  danger-bg: "#f5dedb"
  info-bg: "#e0f0fa"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(2.5rem, 5vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1.02
    letterSpacing: "normal"
    fontFeature: "'onum' 1, 'pnum' 1"
  headline:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.625rem"
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "1.25rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "normal"
  body:
    fontFamily: "Cardo, Georgia, serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
    fontFeature: "'kern' 1, 'liga' 1, 'calt' 1"
  label:
    fontFamily: "Cardo, Georgia, serif"
    fontSize: "0.6875rem"
    fontWeight: 400
    lineHeight: 1.1
    letterSpacing: "0.14em"
rounded:
  none: "0"
  sm: "4px"
  md: "8px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  "2xl": "24px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.foundation}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.ink-body}"
    textColor: "{colors.foundation}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-body}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.inset}"
    textColor: "{colors.ink}"
  chip-default:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-body}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  chip-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.foundation}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "36px"
  input-text:
    backgroundColor: "#ffffff"
    textColor: "{colors.ink-body}"
    typography: "{typography.body}"
    rounded: "{rounded.none}"
    padding: "0 12px"
    height: "40px"
  card-surface:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-body}"
    rounded: "{rounded.none}"
    padding: "20px 24px"
  status-dot:
    backgroundColor: "{colors.positive}"
    rounded: "{rounded.full}"
    width: "8px"
    height: "8px"
---

# Design System: HP/VVS Meta Ads AI Analyst

## 1. Overview

**Creative North Star: "The Editorial Broadsheet"**

The interface reads like a printed broadsheet laid on a desk — a warm cream paper foundation with a faint radial vignette and a low-opacity grain that gives the page tooth instead of fill. Two type families do all the work: Cormorant Garamond for display and headlines, Cardo for body. Numerals are oldstyle in prose and lining-tabular in money columns. Rules are hairlines; ornament is a single gilt mark on a divider. The accent — Hung Phat Pink, `#e91d79` — appears rarely, on selection chrome, links, the section ornaments. The page does not raise its voice.

The job this system serves is daily ad-triage and customer-conversation work for HP/VVS jewelry, so density matters. Editorial does not mean sparse; the broadsheet packs a lot onto a page without losing composure. Section rhythm comes from spacing variance and hairline rules, not from card stacking. The signal palette (positive forest, burnt amber warning, brick danger, ink blue info) is muted enough to sit on cream without shouting.

This system explicitly rejects: the Linear / Vercel / Stripe cool-grey SaaS shell with neon accents; Datadog / Grafana cold-observability dark mode; consumer-fintech glassmorphism with gradient blob backgrounds; Bootstrap and Material admin templates with rounded cards and breadcrumbs everywhere. It also rejects the two currently-saturated category reflexes: the "AI tool that's cream-plus-violet-plus-sparkle-icon" lane, and the "luxury brand that's black-plus-gold-plus-serif" lane. The pink and the gilt are the differentiators — they are used sparingly and on purpose.

**Key Characteristics:**
- Warm cream foundation with paper grain and corner vignette; never `#fff`, never pure black
- Two-family serif system (Cormorant display, Cardo body); no sans-serif anywhere in the chrome
- Square corners on action elements (buttons, chips, inputs, data cards); `rounded-full` reserved for status dots and pills
- Hairline borders (`rule` / `rule-soft`) as the primary container treatment; no thick or colored strokes
- Smallcaps eyebrow labels with 0.14em tracking; oldstyle figures in prose, lining-tabular in money columns
- Ambient warm shadow (`0 8px 24px rgba(42,39,37,0.08)`) only on lifted surfaces (dropdowns, overlays); flat at rest
- Single gilt ornament (❦) on dividers; never two on the same view
- Hung Phat Pink (`#e91d79`) used on ≤10% of any surface

## 2. Colors

A warm-cream palette tuned for paper feel. Every neutral is tinted toward the cream hue. Two accent metals (pink and gilt) and a muted signal set complete the system.

### Primary
- **Hung Phat Pink** (`#e91d79`): The single brand accent. Used on selection chrome (active chip fill via ink, not pink — pink appears as link color, focus rings, ornament marks, the section mark on top of hero cards). Limited to ≤10% of any given surface. Treat as a sparingly-spent identity color, not a decorative tool.

### Secondary
- **Editorial Gilt** (`#9c7b3f`): A warm restrained metallic. Used on the hairline ornament mark (❦) atop hero numbers, on the centered ornament rule between Executive Snapshot sections, and on hairlines that need a touch more weight than `rule`. One gilt mark per view; never two.

### Tertiary
- **Cool Platinum** (`#bdc1c6`): A cooler metallic counterpart, reserved for technical IDs and inactive secondary chrome. Used sparingly; the system is warm by default.

### Neutral
- **Foundation Cream** (`#f7f1eb`): Page background. Carries the radial vignette and grain layer. Never replace with `#fff`.
- **Vignette Shade 1** (`#f3ebe1`) and **Vignette Shade 2** (`#efe7dc`): The two radial-gradient stops that pull warmth into the corners. Decorative; not for text.
- **Card Cream** (`#fbf7f1`): The brighter cream used on lifted card surfaces, the top-nav backdrop (at 90% opacity over the page), and any panel that should read as "set on top of the page."
- **Inset Cream** (`#efe8dd`): A darker cream used for inset states, hover backdrops on secondary chips, and pressed surfaces.
- **Ink Deep** (`#2a2725`): Primary text color. Warm near-black. Use for headlines, body emphasis, primary buttons, active chip fills. Never `#000`.
- **Ink Body** (`#423d38`): Default body text. Mid-warm-brown. The workhorse.
- **Ink Muted** (`#756c62`): Smallcaps labels, secondary metadata, captions. Darkened to clear WCAG AA (~4.6:1) on the cream foundation while staying a clear tier below `ink-body`.
- **Rule Warm** (`#d4cfc4`): The default hairline border. Used on cards, dividers, table cell separators.
- **Rule Soft** (`#e6dfd2`): A lighter hairline for ornament rules and quiet group separators.

### Signal
A four-role signal set, each with a tinted background companion. All muted; none of these are saturated.
- **Positive Forest** (`#245d4d`) on `#e6efe9`: ≥ baseline, "Live" status, success states.
- **Warning Burnt Amber** (`#8b5b19`) on `#f6ecd6`: attention required, partial coverage, queued.
- **Danger Brick** (`#8d2e2e`) on `#f5dedb`: failed runs, blocked permissions, errors that need a human.
- **Info Ink Blue** (`#0f4c75`) on `#e0f0fa`: neutral context, informational anomalies, "still syncing" notes.

### Named Rules
**The One Voice Rule.** Hung Phat Pink covers ≤10% of any rendered surface. Its rarity is the point. If pink occupies more than a tenth of the visible page, recolor with neutrals.

**The One Gilt Mark Rule.** Editorial Gilt appears once per visible view. The ornament rule between sections is one instance; the hairline section mark above a hero number is another. Two on one screen reads as decoration, not punctuation.

**The Warm Neutral Rule.** Every neutral is tinted toward the cream hue (chroma 0.005–0.01 against the OKLCH equivalent of `#f7f1eb`). Pure `#fff`, pure `#000`, and cool greys are prohibited in the chrome.

**The Muted Signal Rule.** Positive/warning/danger/info colors are intentionally desaturated to sit on cream. Do not "fix" them to brighter web-app defaults; the muting is the brand fit.

## 3. Typography

**Display Font:** Cormorant Garamond (with Georgia, serif fallback). 400 and 500 weights only.
**Body Font:** Cardo (with Georgia, serif fallback). 400 and 700 weights only.
**Label Font:** Cardo at smallcaps treatment (uppercase, 0.14em tracking). No dedicated label face; the system stays on two families.

**Character:** Cormorant carries the broadsheet's quiet authority — flared serifs, generous counters, set in old-style figures by default. Cardo is the workhorse text face: even color on dense tables, true small caps, oldstyle and lining figures both available. The pairing is a single serif voice at two registers, not a contrast pairing. There is no sans-serif anywhere in the chrome. Number formatting is part of typography here, not styling — oldstyle in prose, lining-tabular in money columns.

### Hierarchy
- **Display** (Cormorant 400, `52–56px`, `1.02` line-height): The hero number on Executive Snapshot cards. Old-style figures (`oldstyle-nums proportional-nums`). Never paired with another display element above the fold.
- **Headline** (Cormorant 500, `1.625rem` / `26px`, `1.2`): The status sentence at the top of every room. The lead voice on each page.
- **Title** (Cormorant 500, `1.25rem` / `20px`, `1.25`): Section titles inside a page, dropdown headers, card titles.
- **Body** (Cardo 400, `0.9375rem` / `15px`, `1.55`, capped at `65–75ch`): Paragraphs, descriptions, AI analysis prose, conversation messages. Oldstyle figures by default.
- **Label** (Cardo 400, `0.6875rem` / `11px`, `0.14em` letter-spacing, uppercase): Smallcaps eyebrow labels above hero numbers, chip text, button text, table column headers, status pill text.

### Named Rules
**The Two-Family Rule.** Cormorant Garamond and Cardo only. Do not introduce a sans-serif, a mono, or a third serif. If a screen feels mechanical, switch to lining-tabular numerals before reaching for a new face.

**The Oldstyle-In-Prose Rule.** Inline figures in body text and headlines use oldstyle (`.oldstyle-nums`). Columns of money in tables use lining-tabular (`.lining-nums`) so digits align. Mixing them inside the same paragraph is wrong.

**The Smallcaps Eyebrow Rule.** Every section, every chip, every primary metric label uses the `.smallcaps` class with `0.14em` tracking and `text-[10px]–text-[11px]`. This is the unifying micro-element; do not invent new label styles.

**The Line-Length Rule.** Body prose blocks cap at `65–75ch`. The data UI is dense, but reading copy never spans the full broadsheet width.

## 4. Elevation

Flat by default; ambient warm shadow only on lifted surfaces.

The page is composed of layers (foundation cream → card cream → inset cream) and of hairline rules — not of stacked drop-shadows. Cards at rest sit flat on the page, separated by 1px `rule` borders and by spacing variance. Depth is conveyed by tone shift first (card cream is brighter than foundation cream), by hairline second, and by shadow only when an element actually lifts off the page.

### Shadow Vocabulary
- **Ambient Lift** (`box-shadow: 0 8px 24px rgba(42, 39, 37, 0.08)`): The single shadow in the system. Warm-tinted (the rgba derives from `ink` `#2a2725`, not pure black). Use it on dropdowns, the user-menu panel, modal overlays, and any popover. Never on a static card.

### Named Rules
**The Flat-At-Rest Rule.** Static surfaces — cards, panels, table rows — never carry a shadow. If a card feels like it needs lift, the layout is wrong; rework spacing or tone shift instead.

**The Warm-Shadow Rule.** Any shadow in the system is tinted with the `ink` hue, not pure black. Pure-black or cool-grey shadows look pasted-on against the cream foundation.

**The No-Glass Rule.** `backdrop-filter: blur` is forbidden as a decorative treatment. The top-nav's 90% card-cream opacity is the one allowed translucency, and it reads as paper sitting on paper, not as glass.

## 5. Components

### Buttons
- **Shape:** Square (`rounded: 0`). No radius on action elements. Sharpness is part of the editorial register.
- **Primary:** `ink` (`#2a2725`) fill, `foundation` (`#f7f1eb`) text, `40px` height, `0 16px` padding, label-style typography (smallcaps, 0.14em tracking). Hover lifts the fill to `ink-body`. No transform on hover.
- **Secondary / Ghost:** `card` background, `ink-body` text, 1px `rule` border, `36px` height. Hover swaps border to `ink` and background to `inset`. Used as the default action chip.
- **Tertiary / Text-only:** No background, no border, `ink-body` text with `text-decoration: underline` and `text-decoration-thickness: 1px` on hover. Pink underline (`hp-pink` at 60% opacity) is the link treatment.
- **Disabled:** 55% opacity, `cursor: not-allowed` (already global in `globals.css`).

### Chips
- **Style:** Same shape as buttons (square, hairline border, smallcaps label). `36px` height, `0 12px` padding.
- **Default:** `card` background, `ink-body` text, `rule` border. Hover swaps to `ink` border.
- **Active / Selected:** `ink` fill, `foundation` text, same `rule` border (now optical). Used on filter chips, segmented toggles.
- **With count badge:** A nested 1px-bordered pill (`px-1 py-px text-[9px]`) sits inside the chip; not a separate floating dot.

### Cards / Containers
- **Corner Style:** Square (`rounded: 0`) on data-UI cards. Small radius (`rounded-md` / `rounded-lg`) is acceptable only on rare lifted surfaces where the editorial register can flex — never on the main dashboard or table cards.
- **Background:** `card` (`#fbf7f1`) on lifted surfaces; `foundation` (`#f7f1eb`) when the card is just a content region with hairline separators.
- **Border:** 1px `rule` on all four sides. Side-stripe borders are prohibited (see Don'ts).
- **Internal padding:** `20px 24px` standard; tighten to `16px 20px` for dense tables, loosen to `24px 32px` for Executive Snapshot hero cards.
- **Shadow:** None at rest. Ambient lift only when the card is a popover.

### Inputs / Fields
- **Style:** `#ffffff` background (the only place pure white appears in the system; inputs read as paper-on-paper), 1px `rule` border, `40px` height, square corners, `0 12px` padding. Body typography (`Cardo`, `15px`, normal tracking — not smallcaps).
- **Focus:** Border shifts to `ink`. No glow ring, no offset shadow. A 1px `hp-pink` underline (`box-shadow: 0 1px 0 0 var(--accent)`) can be used for the canonical primary search field to mark it as the page's main input; do not use this on every input.
- **Error:** Border shifts to `danger`, helper text in `danger` with `danger-bg` fill on the helper block.
- **Disabled:** `inset` background, `ink-muted` text, 55% opacity.

### Navigation
- **Top nav:** `card` background at 90% opacity over the page, 1px `rule` bottom border, height `~64px`. Brand mark uses `font-title` at `20px`. Nav-group items render as h-9 square chips with smallcaps labels.
- **Active nav item:** `ink` fill, `foundation` text. Inactive: `rule` border, `body` text, hover to `ink` border.
- **Mobile (sales `/m/inbox`):** No top nav. Single full-screen shell with a back chevron when in conversation detail.

### Signature Components
- **Hero Number** (Executive Snapshot cards): A `card`-tinted block at 60% opacity with a 1px `gilt` hairline at the top edge as a section mark. The number itself is `font-title` at `52–56px` with oldstyle proportional figures. Smallcaps eyebrow above. Optional italic caption below in `text-xs italic`. The gilt hairline is the section mark; do not add an additional rule above or below.
- **Status Sentence:** A two-row layout at the top of every room — `font-title` headline (`24–26px`) on row 1, an optional action button on the right. Separated from content by a 1px `rule` bottom border with `pb-5`. Carries the canonical glossary verbatim ("Live", "Paused", "Off", "Queued", "Running", "Done", "Failed", "Snoozed").
- **Ornament Rule:** A 1px `rule-soft` horizontal line with a centered gilt "❦" mark on a `foundation` swatch. Used between the three sections of the Executive Snapshot. One per view.
- **Sparkline:** Visx-driven 60×16 inline trendline with the data-line stroked at 1px in `ink-body`. No fill, no axis, no tooltip on the inline variant. Pink dot marker for the most recent point only when the sparkline carries a delta.

## 6. Do's and Don'ts

### Do:
- **Do** use `#f7f1eb` (foundation cream) as the page background. Tint every other neutral toward this hue.
- **Do** open every room and detail screen with a status sentence in `font-title` `24–26px`, followed by a `border-b border-hp-rule` divider. Charts and tables support the sentence; they don't replace it.
- **Do** keep square corners on buttons, chips, inputs, and data cards (`rounded: 0`). `rounded-full` is for status dots and pills only.
- **Do** use hairline 1px borders (`rule` for active, `rule-soft` for quiet) on all containers. Borders are the primary separator; spacing is the second.
- **Do** put oldstyle figures (`.oldstyle-nums`) in prose and headlines, and lining-tabular figures (`.lining-nums`) in money columns. Mixing them in one paragraph is wrong.
- **Do** keep the gilt mark and the pink accent at one-per-view and ≤10%-per-surface respectively.
- **Do** use the `Ambient Lift` shadow (`0 8px 24px rgba(42,39,37,0.08)`) only on popovers, dropdowns, and overlays. Static cards stay flat.
- **Do** name every state with the locked glossary verbs (Live / Paused / Off / Queued / Running / Done / Failed / Snoozed) and action verbs (Save / Delete / Open / Dismiss / Apply / Send / Cancel) from PRODUCT.md and the UI Rebuild PRD.

### Don't:
- **Don't** use side-stripe borders (`border-l-[3px]` or any `border-left` / `border-right` greater than 1px as a colored accent on cards, list items, callouts, or alerts). The skill's absolute ban applies. Rewrite with full borders, background tints, leading numbers, or nothing. *Currently violated by [src/components/v2/status-sentence.tsx:32](src/components/v2/status-sentence.tsx:32) — fix on next touch of that file.*
- **Don't** use gradient text (`background-clip: text` with a gradient). Emphasis comes from weight, size, or the pink accent applied as a solid color.
- **Don't** use glassmorphism (`backdrop-filter: blur(...)`) decoratively. The single allowed translucency is the top-nav `bg-hp-card/90`.
- **Don't** build the hero-metric template (big number + small label + supporting stats with a gradient accent). The Executive Snapshot's Hero Number is the *only* sanctioned big-number pattern, and it uses a gilt hairline section mark instead of a gradient.
- **Don't** stack identical card grids of icon + heading + text. If three rectangles look the same, redesign one of them.
- **Don't** reach for a modal as the first option. Inline expand, drawer (vaul), and side panel come first; modal is the last resort.
- **Don't** introduce a sans-serif, a monospace, or a third serif. Cormorant Garamond and Cardo carry the system.
- **Don't** use `#000` or `#fff` anywhere except inside `<input>` fields (the one sanctioned use of pure white). Tinted `ink` (`#2a2725`) and tinted cream (`#f7f1eb`) are the extremes.
- **Don't** ship the Linear / Vercel / Stripe cool-grey SaaS look, the Datadog / Grafana cold-observability dark mode, consumer-fintech glassmorphism, or Bootstrap / Material admin templates. These are the four anti-references from PRODUCT.md and they are guardrails, not preferences.
- **Don't** default to dark mode. Dark theme is never the default here; if a screen ever goes dark, the scene sentence has to force it (see `superpowers:platform-foundations` and PRODUCT.md).
- **Don't** add a notification dot, a "NEW" badge, or any attention-grabbing micro-element. Information density is high; visual shouting is not the answer.
- **Don't** use `em dashes` in prose or labels. Commas, colons, semicolons, periods, or parentheses instead. Also not `--`.
