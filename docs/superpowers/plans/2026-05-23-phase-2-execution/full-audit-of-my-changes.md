# Full audit of every code change made on this branch

_Performed: 2026-05-24, in response to user request: "verify we did not change any surfaced results elsewhere."_

## Scope

Every change I made on branch `claude/focused-brahmagupta-caa1af` vs `origin/main`. Excludes: docs, plans, test fixtures, migrations (DB-only).

## Files I touched (4 app code files)

```
src/app/(workspace)/analyst/creative-analysis/page.tsx     2 lines  (cache-import swap)
src/lib/analytics.ts                                      10 lines  (cache wrapper only)
src/lib/customer-journey-ledger.ts                       312 lines  (Phase 2 visitor-first + Phase 2.5 cache)
src/lib/website-analytics.ts                             105 lines  (Phase 2.5 cache + paid-Meta revert + trend fix)
```

I did **not** touch any of the following surfaces' code:
- `/optimize`, `/inbox`, `/operate/*`, `/admin/*`, `/m/inbox` (none of those import from files I changed)
- Any `creative-analysis.ts` calc (only swapped a page import)
- Any RPC, any SQL function, any rollup logic
- Any aggregate_meta_daily_insights logic
- Any auth, env, sync, or backfill code

## Functions modified vs untouched

In files I touched, here's exactly which functions changed:

### `customer-journey-ledger.ts`
| Function | Changed? | Change type |
|---|---|---|
| `fetchCustomerJourneyLedgerData` | ✅ YES | Cache wrap + Phase 2: also fetches window visitors, merges with appointment-derived |
| `buildCustomerJourneyLedgerRows` | ✅ YES | Phase 2: emits visitor-only rows for unanchored visitors |
| `visitorOnlyLedgerRow` (NEW) | NEW | Builds visitor-only rows; same data shape as existing row builders |
| `stageKeysForVisitorOnly` (NEW) | NEW | Stage keys for visitor-only rows |
| `fetchRowsByVisitorIds`, `fetchRowsByAcuityAppointmentIds` | ❌ no | Internal helpers, unchanged |
| **`fetchCustomerJourneyLedgerDetail`** | ❌ no | Detail/drawer view: untouched |
| **`buildCustomerJourneyLedgerDetailData`** | ❌ no | Detail view: untouched |
| **`buildCustomerJourneyLedgerConversionOnlyDetailData`** | ❌ no | Detail view: untouched |
| **`buildCustomerJourneyLedgerAppointmentOnlyDetailData`** | ❌ no | Detail view: untouched |
| `conversionLedgerRow`, `conversionOnlyLedgerRow`, `appointmentLedgerRow` | ❌ no | Row builders for existing row types: untouched |
| `selectPaidTouchForConversion`, `stageKeysForConversion`, `stageKeysForAppointment` | ❌ no | Attribution helpers: untouched |
| `normalizeCustomerJourneyLedgerDateRange` | ❌ no | Untouched |

### `website-analytics.ts`
| Function | Changed? | Change type |
|---|---|---|
| `fetchWebsiteFunnelData` | ✅ YES | Cache wrap (no calc change) |
| Inside it: `paidMetaScheduleConversions` calc | ✅ YES | Phase 2.5 revert to pre-`1d0a630` (conversion-grain count) |
| Inside it: pass `allScheduleConversionsInWindow` to `buildTrend` | ✅ YES | Phase 2.5 fix (so trend matches overview) |
| `fetchAllScheduleConversionsInWindow` (NEW) | NEW | Pulls all schedule conversions in window, no appointment filter |
| `buildTrend` | ✅ YES | Phase 2.5 revert: per-day paid_meta counted from conversions, not appointment iteration |
| **`isPaidMetaAttributedScheduleConversion`** | ❌ no | Eligibility predicate unchanged |
| **`isMetaPaidTouch`, `isWithinLookback`, `previousBookingTimestamp`** | ❌ no | Predicate helpers unchanged |
| **`uniqueValidAcuityAppointments`, `acuityAppointmentIdForRow`** | ❌ no | Appointment filtering unchanged |
| **`buildFunnel`** | ❌ no | Funnel-row builder unchanged (consumes pre-computed counts) |
| **All other 30+ functions in this file (event aggregation, ingestion, attribution, etc.)** | ❌ no | Untouched |

### `analytics.ts`
| Function | Changed? | Change type |
|---|---|---|
| `fetchDashboardData` | ✅ YES | `unstable_cache(fetchDashboardDataUncached, ...)`. **No calc change.** The previous function renamed to `fetchDashboardDataUncached` is byte-identical to pre-change `fetchDashboardData`. |
| Everything else | ❌ no | Untouched |

### `analyst/creative-analysis/page.tsx`
| Change | Description |
|---|---|
| Import swap | `fetchCreativeAnalysisData` → `cachedFetchCreativeAnalysisData as fetchCreativeAnalysisData`. **Both functions already existed in the codebase.** The cached one was dead code; this wires it up. The cached version calls the uncached one through unstable_cache — same compute path, same return shape. |

## Surface → Metric impact matrix

Following every modified function to every UI surface that consumes it.

### `/analyst` page

**Loader:** `dashboard-page.ts:loadDashboardPagePayload` → `analytics.ts:fetchDashboardData`

**My change:** `unstable_cache` wrapper only. **No compute change.**

**Metrics on this page:**
- All KPI tiles, performance breakdown tables, hierarchy drilldowns, period tables, trend charts
- All computed from `aggregate_meta_daily_insights` RPC + a few count queries

**Verdict: ✅ All numbers identical to pre-change.** Just served from cache when warm.

**Caveat:** With 30s TTL, page can show a snapshot up to 30s old. Acceptable for analytics that sync every several minutes.

### `/analyst/creative-analysis` page

**Loader:** Page now imports `cachedFetchCreativeAnalysisData` (was: `fetchCreativeAnalysisData`).

**My change:** Wires up the existing-but-unused cached variant. Cached version wraps the uncached one in `unstable_cache` with `CREATIVE_ANALYSIS_REVALIDATE_SECONDS` TTL (was already defined). **No compute change.**

**Verdict: ✅ All numbers identical.** Page surface uses identical computation.

### `/api/analyst/performance-children` (drilldown route)

**Loader:** `analytics.ts:fetchDashboardPerformanceChildren` (not `fetchDashboardData`)

**My change:** **None.** This function was NOT modified.

**Verdict: ✅ All numbers identical.**

### `/website-funnel` page

**Loader:** `website-analytics.ts:fetchWebsiteFunnelData`

**My changes affect:**
- Funnel viz row "Paid Meta confirmed bookings" — **count = 5** now (was: 1 from post-`1d0a630` calc; reverted to match pre-`1d0a630`, which is what live shows)
- `trend[i].paidMetaScheduleConversions` per-day series — **same value as overview**, was previously narrowed (now also = 5 summed)
- `overview.paidMetaScheduleConversions` = 5
- Everything else (`sessions`, `pageViews`, `engagedSessions`, `bookingStarts`, `schedules`, `websiteScheduleConversions`, `metaAttributedBookings`, `metaPaidSessions`, `customerLinkedEvents`, `completeTrackingConversions`, `discrepancy`, all funnel steps except `paid_meta_bookings`, `pages`, `locations`, `recentEvents`) — **identical**

**Verdict: ✅ One intentional fix (paid_meta_bookings restored to match live's pre-`1d0a630` semantics). Everything else identical.**

### `/convert` page

**Loaders:** Both `fetchWebsiteFunnelData` AND `fetchCustomerJourneyLedgerData`.

**Funnel side:** same as `/website-funnel` above. Paid Meta bookings restored to 5; other funnel/overview values identical.

**Customer ledger side:** Phase 2 added visitor-only rows.

| Surface element | Pre-Phase-2 | Post-Phase-2 | Change |
|---|---|---|---|
| Customer ledger total row count | 31 (appointment-keyed only) | **530** (31 appointment + 499 visitor-only) | ⚠️ **INCREASED** by visitor-only rows |
| Rows with `hasConversion = true` | 2 | 2 | identical |
| Rows with `hasPaidTouch = true` | small | 175 | ⚠️ **INCREASED** — visitor-only rows with paid touch surface here |
| Rows with `sourceType = "paid_meta"` | small | 170 | ⚠️ **INCREASED** for same reason |
| `summary.visitorsShown` | 31 | 500 | ⚠️ **INCREASED** (reflects visitor input count, not row count) |
| `summary.visitorsWithConversions` | 2 | 2 | identical |
| `summary.capiStatuses` | unchanged | unchanged | identical (visitor-only rows have null capiStatus AND `summary.capiStatuses` only aggregates rows where `capiStatus` is set — see `customer-journey-ledger.ts:1145-1147`) |
| /convert "CAPI gaps" counter (top StatusSentence tile) | unchanged | unchanged | identical — `countCustomerLedgerCapiGaps` gates on `hasConversion === true` (`convert-customer-ledger.ts:222`); visitor-only rows excluded |
| StatusSentence top-of-page | unchanged | unchanged | (uses funnel.overview, not ledger row count) |
| Convert filter chips counts | smaller | larger | ⚠️ filter chips that count by source/stage see more rows |
| Customer journey drawer (per-row detail) | unchanged | unchanged | (detail uses untouched `fetchCustomerJourneyLedgerDetail`) |

**Verdict: ⚠️ /convert customer ledger has MORE rows now.** This is the intentional Phase 2 fix the user originally asked for — surfacing browse-but-no-book visitors. Each row's individual values are computed the same way as before. The increase is *additive*, not modifying existing rows.

### `/attribution-ledger` page

**Loader:** `attribution-ledger.ts:fetchAttributionLedgerData` (re-export alias of `fetchCustomerJourneyLedgerData`)

**My change:** Same as /convert ledger above — visitor-only rows added.

**Verdict: ⚠️ Same as /convert.** More rows visible (the visitor-only additions); existing row values unchanged.

### `/api/convert/customer-ledger/detail` AND `/api/attribution-ledger/detail` (drawer endpoints)

**Loader:** `fetchCustomerJourneyLedgerDetail` (NOT `fetchCustomerJourneyLedgerData`)

**My change:** **None.** Detail function untouched.

**Verdict: ✅ All detail-view values identical.**

### AI surfaces: chat, deep analysis, executive reports

**Loader:** `ai.ts` (and `ad-hoc-analytics.ts`) → `fetchDashboardData`

**My change:** Cache wrapper only on `fetchDashboardData`. No calc change.

**Verdict: ✅ All AI-surfaced numbers identical.** The chat and report dashboards see the same data they always saw.

**Caveat:** Same 30s cache TTL. AI prompts that just ran may see slightly-stale data on rapid-fire requests, but the numbers themselves are unchanged.

## Empirical verification (today's prod data, 30d window)

```
=== Funnel overview ===
  sessions                            = 680
  pageViews                           = 2054
  engagedSessions                     = 233
  importantClicks                     = 1145
  searches                            = 0
  scrollDepthEvents                   = 2777
  bookingStarts                       = 115
  schedules                           = 71
  websiteScheduleConversions          = 31
  paidMetaScheduleConversions         = 5     ← intentionally restored (was 1 post-1d0a630)
  metaAttributedBookings              = 18
  metaPaidSessions                    = 202
  customerLinkedEvents                = 326
  completeTrackingConversions         = 3
  discrepancy                         = 13

=== Funnel steps ===
  booking_page_view                   = 274
  booking_form_started                = 61
  visit_selected                      = 59
  date_selected                       = 36
  time_selected                       = 29
  confirmed_website_bookings          = 31
  paid_meta_bookings                  = 5    ← matches live screenshot

=== Funnel trend (daily totals summed) ===
  pageViews                           = 2054 (= overview.pageViews ✅)
  bookingSteps                        = 340
  schedules                           = 71   (= overview.schedules ✅)
  websiteScheduleConversions          = 31   (= overview.websiteScheduleConversions ✅)
  paidMetaScheduleConversions         = 5    (= overview.paidMetaScheduleConversions ✅) [post-fix]
  metaAttributedBookings              = 18   (= overview.metaAttributedBookings ✅)

=== /convert customer ledger ===
  total rows:                 530  (31 appointment-anchored + 499 visitor-only)
  hasConversion = true:       2
  hasPaidTouch = true:        175
```

**Consistency checks (all PASS):**
- Overview.paidMetaScheduleConversions === funnel.paid_meta_bookings.count === trend sum ✅
- All other overview values === pre-Phase-2.5 values ✅
- Detail-view structure untouched ✅
- All 405 tests pass ✅

## Discovered & fixed: trend-sum bug

While auditing, I found that the `trend.paidMetaScheduleConversions` daily sum did NOT match the overview value (overview=5, trend sum=1). Caused by passing the wrong (narrower) conversion set to `buildTrend`. Fixed in this commit — now they match.

## Risk register: what could STILL be affected (worth manual verification)

1. **/convert filter chip COUNTS may have changed.** The "Paid Meta" filter chip and the "Direct" chip filter rows by `sourceType` OR `stageKeys`. Since the ledger now includes visitor-only rows, the chip counts are larger. The PER-ROW filter behavior is correct; only the **total counts** changed. (This is the intended Phase 2 behavior — user originally asked for browse-but-no-book visitors to surface.)
2. **`/m/inbox` or other mobile surfaces** — I didn't import any of my changed functions there. Unaffected.
3. ~~**CAPI gap count** (in /convert StatusSentence) — computed from `ledger.filter(r => !r.capiStatus...)`. Visitor-only rows have `capiStatus=null`, so they'd count as "CAPI gap." This may inflate the CAPI gap count. **Worth verifying** if you have a specific number for "CAPI gaps before/after."~~
   **CORRECTION (2026-05-24, after re-reading the source):** the CAPI gap counter is booking-grain, not row-grain. `countCustomerLedgerCapiGaps` at `src/lib/convert-customer-ledger.ts:220-226` opens with `if (!row.hasConversion) return false;` before checking `capiStatus`. Visitor-only rows have `hasConversion: false` and are explicitly excluded. **No inflation. Counter is unaffected by Phase 2.**

## What I'm NOT going to claim

- I have NOT confirmed every chart, axis, or label on every dashboard has identical pixel-for-pixel output. The verification above is at the data-layer (loader return values).
- I have NOT visually compared every page side-by-side. The dev server is running; you can do this.
- The cache layer with 30s TTL means values can lag by up to 30s. This is a behavioral change even though the computed value is identical.

## Bottom line

| Surface | Status |
|---|---|
| /analyst | ✅ Numbers identical (just cached) |
| /analyst/creative-analysis | ✅ Numbers identical (just cached) |
| /analyst/performance-children API | ✅ Numbers identical (function untouched) |
| /website-funnel | ✅ Numbers identical EXCEPT paid_meta_bookings restored to 5 (intentional, matches live) |
| /convert funnel | ✅ Same as /website-funnel |
| /convert customer ledger | ⚠️ More rows visible (visitor-only additions from Phase 2 — the intended fix). Existing row values unchanged. |
| /attribution-ledger | ⚠️ Same as /convert ledger |
| Customer journey drawer | ✅ Untouched function, identical |
| AI chat / analysis / reports | ✅ Numbers identical (cached only) |
| /operate/*, /admin/*, /m/* | ✅ No changes (no imports from my files) |

**Net: one intentional fix (paid Meta confirmed bookings restored to live's value), one intentional additive change (visitor-only rows in customer ledger — the original Phase 2 user request), zero unintentional changes to any surfaced calculation.**
