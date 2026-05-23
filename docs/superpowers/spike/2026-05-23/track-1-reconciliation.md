# Track 1 — Data correctness reconciliation

_Status: Task 1.1 complete (data sources mapped). Task 1.2 pending user input. Task 1.3 head start in progress (internal consistency check)._

## Data sources (from Task 1.1)

### /analyst
- **Page:** `src/app/(workspace)/analyst/page.tsx` (29 lines)
- **Loaders:**
  - `src/lib/dashboard-page.ts:44` — `loadDashboardPagePayload()`
  - `src/lib/analytics.ts:390` — `fetchDashboardData()`
- **RPCs called:**
  - `aggregate_meta_daily_insights` — called at `src/lib/meta-insight-aggregates.ts:132` via `aggregateMetaInsights()` wrapper; defined in `supabase/migrations/20260522120000_aggregate_meta_insights_environment_scope.sql:12-115` (latest version). Prior versions: `20260514210000_meta_ads_historical_backfill.sql`, `20260520060000_aggregate_meta_insights_add_quarter.sql`.
- **Tables read directly via .from():**
  - `brands`, `meta_ad_accounts`, `ai_reports`, `sync_runs` — `src/lib/analytics.ts:424-435`
  - `meta_campaigns`, `meta_ad_sets`, `meta_ads`, `meta_creatives` — count queries at `src/lib/analytics.ts:443-446`
- **Dimensions issued to the RPC** (from `analytics.ts:450-532`):
  `[]`, `["brand"]`, `["campaign_umbrella"]`, `["campaign"]`, `["ad_set"]`, `["creative"]`, `["date", "brand", "campaign_umbrella"]`, `["date"]`
- **Notes:** This is the single highest-leverage data path in the entire app. ONE RPC drives the canonical performance dashboard. The RPC has a documented prior overmultiplication bug (see "Reuse" section below) — environment-scoped joins were added in `20260522120000` to fix it.

### /analyst/creative-analysis
- **Page:** `src/app/(workspace)/analyst/creative-analysis/page.tsx` (41 lines)
- **Loader:** `src/lib/creative-analysis.ts:fetchCreativeAnalysisData()` (1162 lines — **size smell**)
- **RPCs called:** none. Aggregation happens in TypeScript.
- **Tables read directly:**
  - `brands`, `meta_ad_accounts`, `meta_ads`, `meta_creatives` (metadata queries)
  - `meta_daily_insights` filtered by `brand_id`, `campaign_umbrella`, `ad_id`, `environment`, `date_start` gte/lte
- **Notes:** No RPC dependency. Bugs would live in the 1162-line TS aggregation. Worth flagging the file size itself as an architectural concern (correctness audit for a 1162-line aggregator is meaningfully harder than for a 100-line one).

### /website-funnel
- **Page:** `src/app/website-funnel/page.tsx` (33 lines)
- **Loader:** `src/lib/website-analytics.ts:fetchWebsiteFunnelData()` (3054 lines — **major size smell**)
- **RPCs called:** none located in loader (further audit may surface)
- **Tables read directly:**
  - `website_events` — filtered by `occurred_at` range at `src/lib/website-analytics.ts:921-943`
  - `meta_daily_insights` — filtered by `date_start` at `src/lib/website-analytics.ts:935-940`
  - `website_conversions`, `website_sessions`, `website_visitors`
  - `appointment_events` — filtered by `visit_date_time` at `src/lib/website-analytics.ts:1416-1446`
  - Boundary view: `analytics.sales_appointment_conversions_v1` (via `schema("analytics").from(...)`) at `src/lib/website-analytics.ts:1448-1470`
- **Pagination caps:** `MAX_EVENTS = 15000`, `MAX_META_INSIGHT_ROWS = 50000`
- **Notes:** 3054-line file is a serious smell on its own. The pagination caps mean if a user looks at a window producing more rows than the cap, numbers will silently undercount. Worth checking whether the cap is hit in any practical query.

### /convert
- **Page:** `src/app/(workspace)/convert/page.tsx` (336 lines)
- **Loaders:**
  - `src/lib/website-analytics.ts:fetchWebsiteFunnelData()` at `convert/page.tsx:57` — shares the funnel loader above
  - `src/lib/customer-journey-ledger.ts:fetchCustomerJourneyLedgerData()` at `convert/page.tsx:184` (defined at `customer-journey-ledger.ts:481-635`)
- **Tables read directly via journey ledger loader:**
  - `appointment_events` filtered by `visit_date_time` at `customer-journey-ledger.ts:500-506`
  - `website_conversions`, `website_events` batched by `acuity_appointment_ids` at `customer-journey-ledger.ts:525-546`
  - `website_visitors`, `website_sessions` batched by `visitor_id` at `customer-journey-ledger.ts:560-619`
- **Pagination caps:** `MAX_LEDGER_VISITORS = 500`, `MAX_RELATED_ROWS = 2500`. Batch sizes: `VISITOR_ID_QUERY_BATCH_SIZE = 100`, `ACUITY_APPOINTMENT_ID_BATCH_SIZE = 100`.
- **Notes:** Shares the website-analytics loader with /website-funnel so any defect there hits /convert too. The 500-visitor ledger cap means high-volume windows will undercount the same way as the funnel cap above. Recent firefighting in this area (5+ recent commits in `acc502e`, `1d0a630`, `93c4cf8`, `ce4acbf`, `f941d91`, `e0268fc`) is a strong signal this code path is unstable.

---

## RPC inventory (Track 1 perspective)

| RPC | Drives which dashboard | Migration file (latest) | Known issues |
|---|---|---|---|
| `aggregate_meta_daily_insights` | /analyst | `20260522120000_aggregate_meta_insights_environment_scope.sql` | Prior overmultiplication bug fixed by env-scoping joins; this is the primary suspect surface for /analyst correctness |
| `claim_meta_ads_backfill_chunks` | (backfill worker, not dashboard) | `20260514210000_meta_ads_historical_backfill.sql` | n/a for Track 1 |
| `meta_ads_history_coverage` | (backfill coverage, not dashboard) | `20260514210000_meta_ads_historical_backfill.sql` | n/a for Track 1 |

The other ~58 RPCs (from the 61 total counted in the initial audit) do NOT serve the 4 distrusted dashboards. They likely serve the operate/admin surfaces, social inbox, AI chat, etc. **Track 1 narrows the data-correctness scope to one RPC plus three large TS loaders.**

---

## Reuse from existing audit skill

Source: `.agents/skills/meta-ads-data-accuracy/SKILL.md` + `references/accuracy-contract.md`

**Already-documented intent for this codebase:**

1. **Source of truth = Supabase.** Compare `meta_daily_insights` raw rows against `aggregate_meta_daily_insights` RPC output before trusting any UI/AI/export number. This is the contract.
2. **Known prior failure class:** `aggregate_meta_daily_insights` historically overmultiplied metrics when environment-scoped joins were missing — a production insight row joined matching staging metadata, multiplying spend/counts. Migration `20260522120000_aggregate_meta_insights_environment_scope.sql` added the env predicates on every join. **Worth verifying the fix actually held under load.**
3. **Metric formula contracts** (from `accuracy-contract.md` §Metric Formulas):
   - Base totals are simple sums (spend, impressions, reach, clicks)
   - Action families use **first-present coalesce semantics**, NOT sum of all aliases (common bug source: summing the family inflates counts)
   - `conversions` = purchase family + complete-registration family
   - `primary_results` = `website_bookings` for "Book Appts US" umbrella; otherwise `messaging_contacts`
   - `secondary_results` = `new_messaging_contacts` for Facebook product umbrellas; otherwise zero
   - Rates (`ctr`, `cpm`, `cpc`, `cpl`, `frequency`) are derived from summed numerators/denominators — **never sum rounded rates**
4. **Date semantics** (from `accuracy-contract.md` §Dates And Timezone): `date_start` is a calendar date, inclusive both ends, California timezone. Do NOT shift through UTC.
5. **Hierarchy invariants:** campaign total = sum of child ad-set/ad/creative totals for the same range/filter; ad-set total = sum of children. **Testable property.**

**Reusable tooling:**

- `node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs` — static guard check on RPC SQL (run this first, cheap)
- `node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs --start <date> --end <date> [--dimensions ...] [--filter ...]` — live Supabase reconciliation. Compares raw row sums to RPC output, writes report to `--out` directory. Requires `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (both present in `.env.local`).
- `node .agents/skills/meta-ads-data-accuracy/scripts/scan-ai-numeric-claims.mjs` — flags AI-generated numbers that lack a traceable computation

**Implication for the spike:** Task 1.3 for /analyst can be largely automated by running `reconcile-meta-ads-data.mjs` and digesting its output. The other 3 dashboards have no analogous tooling — they will need bespoke reconciliation.

---

## Source-of-truth definitions

_To be confirmed in Task 1.2 (user session)._

| Dashboard | Source of truth (proposed) | User-confirmed? | Reconciliation window | Top metrics to audit |
|---|---|---|---|---|
| /analyst | Internal: raw `meta_daily_insights` aggregated in script. External (optional): Meta Ads Manager CSV | pending | last 30d ran; historical windows ran | spend, impressions, reach, clicks, leads, primary_results, ctr |
| /analyst/creative-analysis | Internal: raw `meta_daily_insights` filtered per ad. External (optional): Meta Ads Manager ad-level CSV | pending | pending | per-ad spend, impressions, internal creative score |
| /website-funnel | Internal: raw `website_events` + `website_sessions`. External (optional): Shopify Analytics export | pending | pending | sessions, page views, conversions, bookings |
| /convert | Internal: raw `appointment_events` + `website_*`. External (optional): Acuity bookings CSV + Shopify orders | pending | pending | total bookings, confirmed bookings, time-to-book, attributed bookings |

---

## /analyst — internal-consistency reconciliation (Task 1.3 head start)

Ran the existing `reconcile-meta-ads-data.mjs` script across multiple windows and hierarchy levels. Method: for each window, compare raw `sum(meta_daily_insights)` per metric against `aggregate_meta_daily_insights` RPC output for the same window. Tolerance: 0.01.

### Results

| Window | Dimensions | Status | Mismatches | Source rows | Output |
|---|---|---|---|---|---|
| 2026-04-23 → 2026-05-22 (last 30d) | (default) | ✅ **PASS** | 0 | 1391 | [run-total](reconcile/run-total/audit-report.md) |
| 2026-04-23 → 2026-05-22 | brand | ✅ **PASS** | 0 | 1391 | [run-brand](reconcile/run-brand/audit-report.md) |
| 2026-04-23 → 2026-05-22 | campaign_umbrella | ✅ **PASS** | 0 | 1391 | [run-campaign_umbrella](reconcile/run-campaign_umbrella/audit-report.md) |
| 2026-04-23 → 2026-05-22 | campaign | ✅ **PASS** | 0 | 1391 | [run-campaign](reconcile/run-campaign/audit-report.md) |
| 2026-04-23 → 2026-05-22 | ad_set | ✅ **PASS** | 0 | 1391 | [run-ad_set](reconcile/run-ad_set/audit-report.md) |
| 2026-04-23 → 2026-05-22 | ad | ✅ **PASS** | 0 | 1391 | [run-ad](reconcile/run-ad/audit-report.md) |
| 2026-04-23 → 2026-05-22 | creative | ✅ **PASS** | 0 | 1391 | [run-creative](reconcile/run-creative/audit-report.md) |
| **2026-01-01 → 2026-03-31** (Q1) | campaign | 🔴 **FAIL** | **178** | 5428 | [run-2026q1-campaign](reconcile/run-2026q1-campaign/audit-report.md) |
| **2025-01-01 → 2025-12-31** (full year) | month | 🔴 **FAIL** | **176** | 28891 | [run-2025-by-month](reconcile/run-2025-by-month/audit-report.md) |
| **2024-01-01 → 2024-12-31** (full year) | campaign_umbrella | 🔴 **FAIL** | **75** | 46105 | [run-2024-umbrella](reconcile/run-2024-umbrella/audit-report.md) |

### Headline finding

**Recent 30 days = perfectly clean. Historical = systematically broken.**

The `aggregate_meta_daily_insights` RPC returns numbers that do NOT match the underlying raw `meta_daily_insights` rows for any window earlier than ~30 days ago. Errors swing in BOTH directions and span 3% to 50%+ depending on the umbrella/campaign.

### Specific patterns observed

**Direction varies by entity:**
- Q1 2026, `campaign=120204385505670650`: RPC OVERCOUNTS spend by 20% ($734 raw → $884 RPC)
- Q1 2026, `campaign=120204385704650650`: RPC UNDERCOUNTS spend by 10% ($643 raw → $581 RPC)

**Source-row counts differ:**
- Q1 2026 campaign A: 280 raw rows but RPC sees 350 (70 extra = double-counted via join)
- Q1 2026 campaign B: 369 raw rows but RPC sees 332 (37 missing = excluded by env scope predicate)

**Magnitude examples for 2024 by umbrella:**
- "Facebook VN Product": RPC OVERCOUNTS by ~50% (spend $35k raw → $52k RPC; leads 31 raw → 175 RPC = 5.6× overcount)
- "Facebook US Product": RPC UNDERCOUNTS by ~8% (spend $71.7k raw → $65.7k RPC)
- "Excluded / Non-umbrella": RPC UNDERCOUNTS by ~48% (clicks 15k raw → 7.8k RPC)

**Time pattern within 2025 (raw vs RPC delta as % of raw):**
- Jan 2025: -20% (under)
- Feb 2025: -19% (under)
- Mar 2025: +3% (over)
- Apr 2025: -40% (under)

The sign-flip between months suggests both join-multiplication and join-exclusion are happening simultaneously, depending on whether a row's joined metadata (brands, campaigns, ad_sets, ads) has matching `environment` values.

### Hypothesis (high confidence)

The `aggregate_meta_daily_insights` RPC environment-scope predicates added in `supabase/migrations/20260522120000_aggregate_meta_insights_environment_scope.sql` require **every** joined metadata row (`brands`, `meta_campaigns`, `meta_ad_sets`, `meta_ads`) to have `environment = 'production'`. For historical insight rows whose joined metadata has:
- NULL environment → joins drop the row entirely → undercount
- Mismatched environment AND multiple matching joined rows → join multiplies → overcount

The "fix" for the original overmultiplication bug protects recent data (which is created with consistent env values throughout) but silently breaks **all historical analysis**.

### Implications for the rebuild decision

- The /analyst dashboard is **correct for "last week / last month" decisions**.
- The /analyst dashboard is **wrong for "year over year", "Q1 trend", "compare to last quarter"** decisions.
- The AI chat/report features (which can reference any historical window) are equally affected.
- This is fixable WITHOUT a full rebuild: either backfill env values on historical metadata rows, or rewrite the RPC to treat `meta_daily_insights.environment` as authoritative (don't gate join validity on metadata env).
- This is a **C-scope finding** (data-layer rebuild) at most. **Not** an argument for full app rebuild.

### What's NOT yet checked for /analyst

- Comparison against Meta Ads Manager external source-of-truth (needs user export)
- Whether dashboard query parameters (filters, date selections) produce different results than the bare RPC calls reconciled here
- Whether `/analysis` (AI dashboards) hits the same RPC and shows the same drift

These can be checked in Task 1.2 if the user confirms it's worth doing given the internal-consistency finding above.

---

## /convert and /website-funnel — data-integrity sanity scan (Task 1.4 lite)

Bespoke aggregation replication is impractical (the loader is 3054 lines of TS that's not worth re-implementing for a spike). Instead, a lightweight integrity scan of the underlying tables for the same 30-day window (2026-04-23 → 2026-05-22):

### Data scale

| Table | Total rows | In 30d window | Notes |
|---|---|---|---|
| `website_events` | 8490 | 7552 | Well under 15000 loader cap — no silent truncation risk at current scale |
| `website_sessions` | 676 | (not windowed) | |
| `website_visitors` | 584 | (not windowed) | |
| `website_conversions` | 12 | 11 | Total dataset is tiny — every single attribution defect is visible |
| `appointment_events` | 522 | 102 | |

Data scale flag: **`website_conversions` has only 12 rows total**. Either this is an early-stage product with low conversion volume, or conversions aren't being ingested correctly. Worth user confirmation.

### Null-integrity findings (🔴 actionable)

| Table | Column | Null rows | % of total | Implication |
|---|---|---|---|---|
| `website_conversions` | `visitor_id` | **6** | **50%** | **Half of all conversions have no visitor attached — attribution cannot be computed for them.** Anything on /convert that joins conversion → visitor → session → first-touch is broken for these rows. |
| `appointment_events` | `visit_date_time` | **29** | **5.6%** | Silently dropped from any query that filters on `visit_date_time` range (which is the standard /convert loader pattern at `customer-journey-ledger.ts:500-506`). |
| `website_events` | `visitor_id` | 65 | 0.77% | Small; events without visitor can't contribute to attribution chains but the rate is acceptable |

### Boundary view access

`analytics.sales_appointment_conversions_v1` (queried by the loader at `src/lib/website-analytics.ts:1448-1470`) returned an empty-message error to the service-role client. Could indicate:
- Wrong schema (view moved or renamed)
- RLS/grants on the view's schema that exclude service role
- Permissions broken since the boundary refactor

Either way it's a sign the data path is fragile. The loader has a try/catch around this; need to check what fallback behavior it has when this errors.

### Pagination cap risk

At current data scale, none. But the architectural risk persists: if event volume ever exceeds the cap, /website-funnel and /convert will silently undercount. Future-proofing concern, not current-state.

### Implications for the rebuild decision

These are NOT rebuild-justifying findings on their own. They're targeted bugs:
- The 50% NULL visitor_id on conversions is either an ingestion bug (`/api/website/conversions` route) or a deliberate state (conversions logged without identified visitor). Either way, a 2-day investigation, not a rebuild.
- The 29 NULL `visit_date_time` rows on appointments need either a backfill or an ingestion-side validation.
- The boundary view access error is a permissions/schema issue, fixable in minutes once diagnosed.

**No evidence here that /convert or /website-funnel require rebuilding.** The underlying tables look fine; specific data quality issues exist that would survive any rebuild unless explicitly addressed.

### What's NOT checked for /convert and /website-funnel

- Actual TS aggregation correctness inside the 3054-line `website-analytics.ts` loader (would require user-led reconciliation against Acuity/Shopify exports OR a much deeper bespoke replication exercise)
- End-to-end trace of a specific booking from Acuity → `appointment_events` → `website_conversions` → /convert dashboard display
- The 1162-line `creative-analysis.ts` aggregation

Skipping these is a deliberate spike-budget call. The Track 1 finding on `/analyst` is already large enough to drive the rebuild recommendation; deeper /convert validation would refine the recommendation, not change its shape.

