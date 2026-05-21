# AI Dashboard Revamp — v1 Spec

**Branch:** `AI-Dashboard-Revamp`
**Scope:** Executive Snapshot + Role-Aware Routing + Reorg + scaffolding for v1.5
**Time budget:** ~10 working days
**Status:** Spec landed; Day 1 routing scaffold next.

This is the durable plan-of-record. Update it as scope or decisions change. If
this file disagrees with the code, fix one or the other — don't let them drift.

---

## Why we're doing this

Today the app makes a structural mistake: it shows every metric the same way,
when in fact some are leading signals (messages, CTR, spend) that move within
hours and some are trailing outcomes (sales, close rate, LTV) that take 4–6
weeks to mature. That means recommendations like *"Scale creative X — messages
are up 40%"* can confidently point at creatives that ultimately don't convert.

We want a dashboard that:

1. Lands a CEO on a one-screen this-week summary that's trustworthy and
   decision-ready.
2. Preserves the existing analyst surfaces under `/analyst` for power users.
3. Honestly labels every metric as Leading vs Trailing so the
   "messages without sales" misleading-insight trap can't fire silently.
4. Has routes and a data model in place for the v1.5 sales review system, even
   though we don't build the review UIs in v1.

## Goals we are explicitly NOT solving in v1

- No sales review UIs (those are v1.5).
- No `fbclid` capture work on the booking page (first day of v1.5).
- No outcome / cohort data displayed (none exists yet).
- No new umbrella support beyond what already exists.
- No mobile re-pass beyond making the executive landing read on a phone.
- No notifications / email digest (you picked Dashboard-only).

---

## Role model

| Role | Default landing | Purpose |
|---|---|---|
| `executive` *(new)* | `/` | CEO snapshot — "what changed this week, what should I act on" |
| `analyst` *(existing)* | `/analyst` | Today's dashboard, full filters, all depth |
| `sales_appointment_reviewer` *(new, no perms in v1)* | `/review` | Per-appointment outcome tagging (v1.5) |
| `sales_creative_reviewer` *(new, no perms in v1)* | `/review` | Weekly creative effectiveness rating (v1.5) |
| `sales_lead` *(new, no perms in v1)* | `/outcomes` | Outcome analysis once review data exists (v2) |
| `backfill_admin` *(existing)* | `/admin/backfill` | Sync ops |

Multi-role users land on whichever role the role-priority order picks first;
the nav exposes everything they have permission to.

## Page-by-page changes

| Route | Today | v1 | Effort |
|---|---|---|---|
| `/` | Analyst dashboard | **Executive Snapshot** (3 sections; see below) | Largest piece |
| `/analyst` *(new)* | — | Today's `/` moved verbatim | Move + light cleanup |
| `/review` *(new)* | — | Placeholder: *"Sales review queue — lands v1.5"* | Small |
| `/outcomes` *(new)* | — | Placeholder: *"Outcome analysis — lands v2"* | Small |
| `/creative-analysis`, `/analysis`, `/inbox`, `/website-funnel`, `/admin/backfill`, `/login` | As-is | As-is | None |
| `/users` | As-is | Adds new role options to the role picker; no permissions wired yet | Small |

---

## Executive Snapshot — the three sections

### Section 1: Top story

A one-line headline plus three hero numbers. The headline is **rule-derived**,
not LLM-generated, composed from pre-computed inputs: spend delta direction +
magnitude, primary KPI count delta, the top-moving umbrella by Δ primary KPI.

- Date picker toggles **Calendar week (Mon–Sun)** *(default; current
  in-progress week)* and **Rolling 7 days**.
- The "Primary KPI Count" hero number carries a small footnote:
  *"Mixed units — bookings, messages, leads combined. See per-umbrella below."*
- No blended cost-per-result: meaningless across umbrellas with different KPI
  units. Per-umbrella cost-per-result is in Section 2.
- Both hero tiles get sparklines.
- "Since you last looked" callout (top of page, dismissable) shown only if
  `user_last_visit_at` was > 6 hours ago.

### Section 2: Umbrella Scorecard

Table with one row per umbrella. Columns:

| Umbrella | Spend (Δ) | Primary KPI count (Δ) | Cost/Result (Δ) | % of total spend |

- Click umbrella row → inline expansion to top 5 campaigns (one level only).
- Each expanded campaign row ends with a link to
  `/analyst?umbrella=X&campaign=Y` that drops into the analyst surface
  pre-filtered.
- Sort by % of total spend descending by default.
- Cost/Result column carries a tooltip:
  *"Cost per primary KPI, not cost per sale. Sales validation lands v1.5."*

**Why one level of drilldown only:** deeper than campaign in the executive view
becomes a 50-row tree that no executive will navigate. The "See all in analyst"
link is the bridge.

### Section 3: What Needs Attention

Max 5 items. Rule-derived, deterministic given the dashboard payload. No LLM.

Rules (all configurable in `src/lib/attention-rules.ts`):

- **Scale**: cost/result Δ ≤ 0 AND primary KPI Δ ≥ 20% AND has spent ≥ 1% of
  total period spend.
- **Watch**: cost/result Δ ≥ 15% AND spend Δ ≥ 0% (spending more, getting
  worse).
- **Investigate**: cost/result Δ ≥ 30% regardless of spend direction.
- **Pending review** *(v1.5)*: count of un-tagged appointments from last week
  for Book Appts US.

Each row is a link. Scale + Watch open the creative drawer. Investigate opens
the umbrella detail. Pending review opens `/review`.

---

## Data layer

### v1 migrations (apply now)

```sql
-- New role values
alter type user_role add value if not exists 'executive';
alter type user_role add value if not exists 'sales_appointment_reviewer';
alter type user_role add value if not exists 'sales_creative_reviewer';
alter type user_role add value if not exists 'sales_lead';

-- Last-visit tracking for "since you last looked"
alter table app_users
  add column user_last_visit_at timestamptz;
```

### v1.5 migration (file written in v1, applied later)

```sql
create table appointment_reviews (
  id uuid primary key default gen_random_uuid(),
  appointment_event_id uuid not null references appointment_events(id) on delete cascade,
  outcome text not null check (outcome in ('showed_up','no_show','browsed','sold','lost')),
  deal_value_usd numeric(10,2),
  notes text,
  reviewed_by uuid not null references app_users(id),
  reviewed_at timestamptz not null default now(),
  unique (appointment_event_id)
);

create table creative_weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  ad_id text not null,
  creative_id text,
  brand_code text not null,
  campaign_umbrella text not null,
  week_start date not null, -- Monday of the reviewed week
  effectiveness_rating int not null check (effectiveness_rating between 1 and 10),
  serious_conversation_count int,
  notes text,
  reviewed_by uuid not null references app_users(id),
  reviewed_at timestamptz not null default now(),
  unique (ad_id, week_start)
);

alter table appointment_events
  add column fbclid_at_booking text,
  add column utm_source_at_booking text,
  add column utm_campaign_at_booking text,
  add column utm_content_at_booking text;
```

---

## New primitives + reused components

### New in v1

- `<MaturityBadge level="leading" | "trailing" | "pending" />` — small chip on every metric tile.
- `<HeroNumber />` — refined `MetricTile` variant: bigger value, WoW chip, sparkline, maturity badge.
- `<UmbrellaScorecardRow expandable />` — table row with expand chevron + inline expansion to campaign rows.
- `<AttentionItem type="scale" | "watch" | "investigate" | "pending" />`.
- `<WeekWindowToggle />` — calendar week vs rolling 7d. URL state via `?wow=cal|rolling`. Defaults to `cal` (current week).
- `<SinceYouLastLooked />` — small dismissable callout at the top.

### Reused (already shipped)

- `<StatusSentence />` — Section 1 headline.
- `<DeltaChip />` — every Δ in the scorecard.
- `<FilterBar />`, `<FilterChipGroup />` — top strip.
- `<CreativeDrawer />` — opens when attention items are clicked.
- All glossary translators.

---

## "What Needs Attention" data path

Rules live in `src/lib/attention-rules.ts`. Pure function over the dashboard
payload (already fetched server-side) → `AttentionItem[]`. Deterministic. No
LLM call. Tested with table-driven fixtures.

v1.5 extends the rules to include outcome-validated Scale recommendations
(creative also has `effectiveness_rating ≥ 7`) and the `pending` type. In v1
those rules are stubbed behind feature flags.

---

## Permissions

- `executive` — read access to everything visible in the executive snapshot.
  No write access; cannot trigger sync, cannot edit anything.
- `analyst` — keeps current permissions (sync, report generation, etc.).
- Sales reviewer roles in v1 carry zero meaningful permissions (placeholders).
  Land on `/review` and see "Coming v1.5".
- `backfill_admin` and `sales_lead` unchanged in v1.

---

## Risk register

| Risk | Mitigation |
|---|---|
| The "blended primary KPI" hero number is technically wrong (mixed units) | Footnote calls it out. If uncomfortable, drop the hero and lean on per-umbrella in Section 2. |
| Current-week default shows partial data on Monday morning | Acceptable per product call. Toggle to Rolling 7d if a user wants the freshest full window. |
| Acuity ingest is daily-batch from sheet, not real-time | Not solving in v1. System-health surfaces "Appointment ingest — last successful import: …" so it's visible. |
| Rules in Attention Queue generate too many / wrong items | Cap at 5. Hide empty categories. Tunable thresholds. |
| Multi-role users surprised by routing | Land on first role's primary page; banner: "You also have access to X — switch in the user menu." |
| Empty `/review` and `/outcomes` look broken | Placeholder is a real page that explains the v1.5/v2 plan and links to this doc. Not a 404. |

---

## v1 build order

| Day | Work |
|-----|------|
| 0 | Land this spec doc + start Day 1 in the same PR |
| 1 | Routing scaffold: roles, role-aware login redirect, `APP_NAV_ROUTES`, `/review` + `/outcomes` placeholders |
| 2 | Move current `/` to `/analyst` (verbatim); update nav |
| 3 | `<WeekWindowToggle />` + analytics payload accepts WoW mode |
| 4–5 | Section 1 (Top story): `<HeroNumber />`, headline rule, `<SinceYouLastLooked />`, sparklines |
| 6–7 | Section 2 (Umbrella Scorecard) + inline expansion + "See all in analyst" deep link |
| 8 | Section 3: `attention-rules.ts` + `<AttentionItem />` |
| 9 | `<MaturityBadge />` across surfaces; v1 migrations applied; v1.5 migration file written |
| 10 | Polish, mobile pass on `/`, preview deploy, release note |

Tests as we go for `attention-rules.ts`, WoW window resolver, role-routing
decision logic.

---

## Roadmap beyond v1

### v1.5 (~3.5 weeks after v1)
- Add `fbclid` capture on the booking page (Path B from Acuity audit) so
  appointment outcomes can be rolled up to specific creatives.
- Sales Appointment Reviewer flow at `/review/appointments`.
- Sales Creative Reviewer flow at `/review/creatives` (top 5 active FB US
  Product creatives per week).
- Dashboard "Trailing" column comes alive for Book Appts US and Facebook US
  Product.
- Budget shift suggestions in Section 3:
  *"Move $200/day from creative X (cost per sale $185, rating 4/10) to creative
  Y (cost per sale $62, rating 9/10) — [Open in Meta Ads Manager]"*

### v2+
- Cohort attribution: "of week-N messages, what fraction converted by week
  N+4" per umbrella.
- Inbox thread state pipeline for opted-in umbrellas.
- Shopify customer matching → real LTV per umbrella + Cash for Gold
  auto-attribution.
- VN umbrellas + Promotions support.
- Smart alerts (if appetite returns).
