# Product

## Register

product

Primary register is product — internal operations tool with dashboards, app shell, inbox, and settings, where design serves the workflow. The editorial broadsheet visual treatment is the identity-carrying layer; treat it as the house style, not as marketing surface.

## Users

Four personas, in priority order.

**Marketing operator (primary).** Daily driver. Mid-morning, mostly desktop, occasionally checks signals on phone. Decides which creatives to scale, kill, or refresh; which campaign groups need attention; whether the website funnel is leaking; whether AI chat can explain a specific drop. JTBD: *"Show me today's decisions in order, let me act on each one, then leave."*

**Sales / client advisor.** Lives in the inbox. Between client appointments, mostly on phone. Reads and replies to Facebook and Instagram DMs and comments with brand-correct tone. JTBD: *"Reply to waiting customers quickly with the right voice."*

**Admin / owner.** Configures the team, monitors data health, manages backfill operations. Mostly desktop. JTBD: *"Keep the pipes flowing and the team configured."*

**Read-only stakeholder (executive, finance).** Looks at dashboards and reports, doesn't trigger workflows. Mixed devices. JTBD: *"Understand business performance at a glance."*

## Product Purpose

A read-only Meta Ads intelligence and customer-conversation tool for HP (Hung Phat) and VVS jewelry brands. It collapses Meta Marketing API data, Shopify website-funnel events, Acuity bookings, and Facebook/Instagram social inbox into a three-room information architecture (Optimize / Convert / Operate) plus a sales-only mobile inbox shell.

The job is triage, not reporting: rank each day's decisions, surface what changed, give the operator a primary action per signal, then get out of the way. Success looks like a marketing operator clearing the signal queue in under five minutes per session, and a sales advisor sending a brand-correct reply to a waiting customer between appointments without leaving their phone.

Ads integration is strictly read-only. No `ads_management`, no editing, pausing, creating, or duplicating campaigns from this surface.

## Brand Personality

**Quiet, premium, decisive.**

Quiet — the interface does not raise its voice. No marketing-hype copy, no badges shouting "NEW," no notification dots competing for attention. Information density is high, but the page reads like a printed broadsheet on a desk, not a control panel.

Premium — the operator is a craftsperson at HP/VVS, which are luxury jewelry brands. The tool should feel like a private members' instrument: refined typography, restrained ornament (the gilt mark, the ornament rule, oldstyle figures), surfaces that look composed rather than templated.

Decisive — every screen leads with the answer. The signal strip ranks today's decisions; the dashboard opens with a status sentence; the inbox surfaces the waiting reply, not a tour. Hedge language ("approximately," "roughly," "you may want to") is banned from UX copy; numbers and verbs do the work.

Voice in UX copy: short, declarative, second-person where it matters ("Reply to waiting customers"). Action verbs come from the locked glossary: Save, Delete, Open, Dismiss, Apply, Send, Cancel.

## Anti-references

This product should explicitly not look like any of these. If a design choice would be at home in one of these, rework it.

- **Generic SaaS dashboard.** Linear / Vercel / Stripe cool-grey app shells with neon accents. Cookie-cutter shadcn-plus-Tailwind starters. Identical card grids of icon + heading + text. Hero-metric templates (big number, gradient accent, supporting stats).
- **Cold observability tool.** Datadog / Grafana / Sentry dark-mode-by-default, walls of charts, no warmth, no register. Dark theme is never the default here; if a screen ever goes dark, the scene sentence has to force it.
- **Consumer fintech / glassmorphism.** Big rounded cards, gradient blob backgrounds, glassy blurs as decoration, gradient text. Lifestyle-app cheer.
- **Bootstrap / Material admin template.** Default Bootstrap blues, Material chips, AdminLTE sidebars, breadcrumbs everywhere. Anything that screams "template I downloaded."

Currently-saturated category reflexes to also reject: the "AI tool that looks like every other AI tool" lane (cream beige plus violet accents plus a sparkle icon), and the "luxury brand site that's just black-and-gold-and-serif" lane. The pink and the gilt are the differentiators — use them sparingly and on purpose.

## Design Principles

Five principles, derived from the personas, the PRD, and the platform-foundations rules already cited in the codebase.

1. **Status sentence first.** Every room, every detail screen, every empty state opens with a plain-English sentence that answers "what's the state of this right now?" Charts and tables support that sentence; they don't replace it.
2. **Workflow first, decoration second.** Every screen anchors to one persona and one job. Components earn their place by helping that job — no decoration for its own sake, no "while you're here" cross-sells, no nested cards.
3. **Quiet authority.** The tool reads like an instrument owned by someone who knows what they're doing. Restraint over loudness, hairline rules over thick borders, oldstyle figures over lining numerals in prose, the gilt mark used once on a page, not five times.
4. **Mobile-equal where the job lives there.** The inbox and conversation surfaces are mobile-equal because sales lives on a phone. The dashboards are read-only on mobile because the operator's real work happens on a 27-inch monitor. Don't force feature parity where the job doesn't ask for it.
5. **Honest data, honest copy.** Use the canonical glossary (Booking, Customer, Conversation, Reply, Group, Creative, Ad, Group of Ads, Campaign, Brand, Score, Signal, Run, Coverage) and the locked action verbs and status words. Never invent labels in AI output. Missing data is shown as unavailable, not as zero or as a fake estimate — Meta relevance diagnostics in particular.

## Accessibility & Inclusion

**Target: WCAG 2.2 AAA where feasible**, AA as the non-negotiable floor.

- Contrast: AAA (7:1 body, 4.5:1 large text) wherever the palette allows. Where AAA would force a palette change that breaks the editorial register, document the exception inline and meet AA.
- Reduced motion: already wired in `globals.css` (`prefers-reduced-motion: reduce` disables `fade-up` and `hp-bar-fade-in`). Any new animation must add itself to that block.
- Serif legibility on dense surfaces: Cardo is the body face; verify it stays readable at small sizes on data tables and the signal strip. Use the `.lining-nums` helper where columns of money need to align; reserve `.oldstyle-nums` for prose.
- Keyboard: every action reachable without a pointer. Cmd+K command palette is the power-user surface and must not be the only path to anything.
- Color independence: never rely on color alone for state. Pair the signal palette (positive / warning / danger / info) with an icon or a leading word.
- Target sizes: 44×44 CSS px minimum for primary touch targets on mobile surfaces (inbox, conversation, signal strip on phone).
- Screen reader semantics: status sentences are real text, not images of text; charts include an accessible summary; the signal strip is a list, not a row of buttons-pretending-to-be-cards.
