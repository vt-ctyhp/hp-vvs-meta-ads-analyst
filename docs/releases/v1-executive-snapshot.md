# v1 — Executive Snapshot

Branch: `AI-Dashboard-Revamp`
Status: ready for review
Spec: `docs/dashboard-revamp-v1.md`

## What changed for users

`/` is now a single-screen executive snapshot, replacing the old data
dashboard. Three sections, no chat panel, no creative leaderboard at the
landing — those still exist where they belong (the old dashboard is preserved
at `/analyst` for power users; creative depth lives in `/creative-analysis`).

### 1. Top Story
- Rule-derived headline sentence in 28px serif. Same inputs always produce
  the same sentence — no LLM.
- Three hero numbers with WoW chips and sparklines: Total Spend, Primary KPI,
  Needs Attention count.
- A `[ This Week | Rolling 7d ]` toggle on the right. Defaults to the current
  calendar week (Monday → today, capped at Sunday). URL persists at
  `?wow=cal` or `?wow=rolling`. Click to switch; the comparison auto-aligns to
  the same length.

### 2. Umbrella Scorecard
- One row per Campaign Umbrella. Columns: Spend (Δ) · Primary KPI (Δ) · Cost
  per Result (Δ) · Share of Spend.
- Click any umbrella to expand its top 5 campaigns inline. Each expanded
  campaign carries its own WoW Δ.
- "See all in analyst →" link on each expansion deep-links to the old analyst
  dashboard with the umbrella pre-filtered. Brand, umbrella, and search URL
  params now seed the analyst dashboard's filter state on first mount.

### 3. What Needs Attention
- Up to 5 rule-derived items, sorted by severity:
  *Investigate > Watch > Fix > Scale > Pending*.
- Investigate / Watch / Scale operate at the umbrella level using prior-period
  Δ data. Fix surfaces the highest-spend fatigue-risk creative from the
  existing fatigue detection.
- Pending shows the v1.5 outcome-review queue as a non-actionable placeholder
  so the workflow that's coming is visible now.
- Rules + thresholds live in `src/lib/attention-rules.ts` — pure deterministic
  function, table-driven tests.

### Maturity discipline
Every hero number wears a "Leading" badge with an explanatory tooltip. A
single page-level footer reads: *"All metrics on this page are leading
indicators…"* with a link to the v1.5 plan.

The trailing column lights up when the sales review system arrives in v1.5
— see `docs/migrations/v1.5-review-system.sql.draft` for the schema that
unlocks it.

## What didn't change

- `/analyst` — the old analyst dashboard, untouched. Power-user safety net.
  Still has chat, the creative leaderboard, every filter, every panel.
- `/creative-analysis`, `/analysis`, `/inbox`, `/website-funnel`,
  `/admin/backfill`, `/users`, `/login` — unchanged.
- `/api/health` and `/api/system-health` — unchanged.

## What's new in nav

- **Analyst View** (between Dashboard and Review) — points at `/analyst`.
  Visible to anyone with `view_dashboard`.
- **Review** — placeholder for the v1.5 sales review queue. Only visible to
  users with the new `view_review` permission (admin + the two new sales
  reviewer roles).
- **Outcomes** — placeholder for the v2 outcome analysis surface. Only
  visible with `view_outcomes` (admin + executive + sales_lead).

## New roles + permissions

| Role | Permissions | Default landing |
|---|---|---|
| `executive` | view_dashboard + analyst surfaces (read-only) | `/` |
| `sales_appointment_reviewer` | view_dashboard, view_review | `/review` (v1.5) |
| `sales_creative_reviewer` | view_dashboard, view_review | `/review` (v1.5) |
| `sales_lead` | view_outcomes + analyst surfaces (read-only) | `/outcomes` (v2) |

Existing roles (admin, marketing, sales, …) carry their existing
permissions unchanged. `admin` is granted the two new permissions for free.

## Migrations

| File | Status |
|---|---|
| `supabase/migrations/20260518120000_dashboard_revamp_roles.sql` | **Apply** — adds the 4 new role enum values + `users.user_last_visit_at` column |
| `supabase/migrations/20260518130000_grant_viv_admin.sql` | **Apply** — grants whoisviv@gmail.com the admin role (idempotent) |
| `docs/migrations/v1.5-review-system.sql.draft` | **Do not apply** — planning artifact for v1.5; move into `supabase/migrations/` when v1.5 starts |

The first two land on the next `supabase db push`. Until they run, the new
roles can't be assigned via `/users` and the Review/Outcomes nav entries
won't appear for non-admin accounts.

## Verification

- 100 / 100 tests pass.
- `tsc` + ESLint clean (one pre-existing readonly-array warning in
  `tests/app-routes.test.ts` carries over from main; not introduced by this
  branch and doesn't block the build).
- Preview URL: https://hp-vvs-meta-ads-analyst-git-ai-dashbo-99d3bf-vt-ctyhps-projects.vercel.app

## Roadmap from here

- **v1.5 (~3–4 weeks)** — Sales review system: per-appointment outcome
  tagging for Book Appts US + weekly creative rating for Facebook US
  Product + fbclid capture on the booking page. Trailing column lights up.
  Budget shift suggestions in Needs Attention.
- **v2** — Cohort attribution by umbrella; Inbox thread state pipeline.
- **v3** — Shopify customer matching; LTV per umbrella; Cash for Gold
  auto-attribution.

## How to give feedback

Walk through the preview URL above. Things specifically worth checking on
this round:

1. Does the headline sentence read true to your week-over-week observation?
2. Does the umbrella scorecard's one-level expansion give enough depth for
   executive-level decisions? (More depth goes through "See all in
   analyst →".)
3. Do the rule-derived attention items match the items you'd pick yourself?
   (Tuneable in `src/lib/attention-rules.ts` — thresholds named at the top.)
4. Does the maturity footer set the right expectation about leading vs
   trailing?
