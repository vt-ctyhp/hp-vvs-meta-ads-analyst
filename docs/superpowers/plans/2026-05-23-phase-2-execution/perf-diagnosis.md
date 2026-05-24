# /convert page perf diagnosis

_Measured: 2026-05-24 00:30 PDT, after Phase 2 ship._

## Symptom

User report:
> Data on this convert page loads extremely slowly, and especially when clicking on any filter, it also takes a very long time to load.

Confirmed from the dev server's request log (post-Phase-2):

```
GET /convert                              200 in 14.0s   ← cold initial
GET /convert?stage=booking_page_view      200 in 5.1s    ← filter click
GET /convert?stage=booking_form_started   200 in 357ms   ← repeat (cache)
GET /convert?stage=booking_form_started   200 in 2.4s    ← second filter
GET /convert?stage=paid_meta_bookings     200 in 85s     ← outlier (cold + concurrent)
```

## Where time goes (per-query timing, warm)

`/convert/page.tsx` calls TWO loaders in parallel: `fetchWebsiteFunnelData` AND `fetchCustomerJourneyLedgerData`. Both are slow.

### `fetchWebsiteFunnelData` (the 3054-line loader, shared with /website-funnel)

| | Time |
|---|---|
| Cold | **8059ms** |
| Warm (2nd run) | **2861ms** |

This is the dominant cost. Not profiled per-query — would require its own dive. Likely culprits given its size: multi-table queries against `website_events` (1M+ rows), `meta_daily_insights`, `website_conversions`, `website_sessions`, `appointment_events`, and a boundary view `analytics.sales_appointment_conversions_v1`.

### `fetchCustomerJourneyLedgerData` (post-Phase-2)

| Step | Time | Notes |
|---|---|---|
| (1) `appointment_events` window scan | 849ms | 102 rows; reasonable |
| **(2) `website_visitors` in window [NEW Phase 2]** | **3195ms cold / 610ms warm** | 451 rows. Cold-cache dominant; warm is fine. JSONB columns add ~400ms over scalar-only. |
| (3) `website_conversions` by acuity_id (1 batch) | 183ms | Has `website_conversions_acuity_idx` — fast |
| **(4) `website_events` by acuity_id (1 batch)** | **2154ms** | 🔴 **No `(acuity_appointment_id)` index on `website_events`** — sequential scan |
| (5) Sessions by visitor_id × 5 batches | 1257ms sum | New scope from Phase 2 (was ~1 batch of 2 visitors pre-Phase-2) |
| (6) Events by visitor_id × 5 batches | 1239ms sum | New scope from Phase 2 |
| (7) Conversions by visitor_id × 5 batches | 611ms sum | New scope from Phase 2 |

The visitor-keyed fan-out (5+6+7) runs in `Promise.all`, so wall-clock is ~max(1257, 1239, 611) = 1257ms, not 3107ms sum.

### Putting it together

```
/convert cold:    ~14s  =  8s funnel  +  ~5s ledger  +  ~1s overhead
/convert warm:    ~5-8s =  3s funnel  +  ~2s ledger
filter click:     ~3-14s (no cache between renders by default)
85s outlier:      one-time cold+concurrent event, not reproducible
```

## What Phase 2 specifically added

Pre-Phase-2 `fetchCustomerJourneyLedgerData`:
- 1 appointments query (~0.8s)
- 1 conversion-by-acuity batch (~0.2s)
- 1 event-by-acuity batch (~2s — already slow due to missing index)
- ~2 discovered visitor IDs → tiny visitor fan-out (~150ms each)
- **Total: ~3-5s**

Post-Phase-2 `fetchCustomerJourneyLedgerData`:
- Everything above, PLUS
- **+3.2s cold / +0.6s warm** for the windowVisitors fetch (451 rows × 21 cols × 3 JSONB)
- Visitor fan-out scales from ~2 visitors to ~451 visitors → 5 batches per related table instead of 1 partial batch. Parallelized but each batch sequence is now ~1.3s wall-clock instead of ~0.1s.
- **Regression: +1-4s** depending on cache state

So Phase 2 made the customer-journey-ledger half meaningfully slower. The funnel half was already 8s and unchanged.

## How did the earlier audit miss this?

Three independent reasons:

### 1. Track 2 perf audit explicitly skipped /convert.

From [track-2-perf-audit.md](../../spike/2026-05-23/track-2-perf-audit.md) §"What was NOT measured":

> **Cold/warm page load times** for the 4 dashboards via browser DevTools. Would require: production URL, user opening DevTools in incognito and capturing waterfall. Skipped because (a) the query-side finding already explains the slow loads and (b) doing it properly is a half-day of user time.

We measured the `aggregate_meta_daily_insights` RPC end-to-end (used by /analyst) but didn't measure the loaders for the other 3 dashboards. /convert's `fetchWebsiteFunnelData` and `fetchCustomerJourneyLedgerData` were never timed.

### 2. Track 4a focused on the correctness bug, not perf.

From [track-4a-convert-visitor-bug.md](../../spike/2026-05-23/track-4a-convert-visitor-bug.md): the investigation measured row counts ("584 total visitors, 112 active in 30d, but only ~2 surface") and identified the appointment-keyed structural bug. Nobody timed the loader.

### 3. The 3054-line and 635-line loaders were flagged as size smells but never profiled.

From [track-1-reconciliation.md](../../spike/2026-05-23/track-1-reconciliation.md) §/convert:
> Loader: `src/lib/website-analytics.ts:fetchWebsiteFunnelData()` (3054 lines — **major size smell**)

We noted them. We didn't time them. The spike's recommendation rolled forward assuming "indexes will help" without verifying per-loader.

### And Phase 1 indexes helped /analyst only.

The Phase 1 migration added composite indexes to `meta_daily_insights` + the four ad-metadata tables. It did NOT touch the `website_*` tables. Different code path, different tables. So Phase 1's "RPC under 5s for full year" win is real for /analyst but didn't move the needle on /convert.

### And Phase 2 made it measurably worse.

Adding the windowVisitors fetch + scaling visitor-keyed fan-out from ~2 visitors to ~451 visitors is a real regression. The change was correct for the user's bug complaint ("show visitors who browsed but didn't book"), but I should have benchmarked /convert before and after the change. I didn't.

## Fix priorities (high to low impact)

### 1. Skip related-data fan-out for visitor-only rows (~2s save, easy)

A visitor with no appointment and no conversion gets a **visitor-only row** that uses only visitor-level fields (geo, last_paid_touch, customer fields). It does NOT need sessions/events/conversions fetched — those are only consumed by anchored rows.

Today the Phase 2 fan-out fetches sessions/events/conversions for ALL 451 window visitors. We only need to fetch for the ~10-20 that have appointments or conversions.

**Implementation:** in `fetchCustomerJourneyLedgerData`, split visitor IDs into:
- `anchoredVisitorIds` = visitor IDs that appear in either appointment-derived conversions or appointment-derived events
- `unanchoredVisitorIds` = the rest (visitor-only candidates)

Only fetch sessions/events/conversions for `anchoredVisitorIds`. For unanchored, the visitor row itself has enough data.

**Estimated save:** ~2-3s warm, more cold. Probably the highest-leverage single fix.

### 2. Add `website_events (acuity_appointment_id)` index (~2s save)

Query (4) `website_events.in("acuity_appointment_id", [100 ids])` takes 2.1s with no matching index. The table has `website_events_visitor_idx` and others, but nothing on acuity_appointment_id. Single index addition.

```sql
create index if not exists website_events_acuity_idx
  on public.website_events (acuity_appointment_id)
  where acuity_appointment_id is not null;
```

(Partial index because most events don't have an acuity_appointment_id.)

### 3. Profile and trim `fetchWebsiteFunnelData` (~3-5s save, larger investigation)

The 3054-line loader is unprofiled. Probably worth its own mini-audit. Common shapes that would yield wins:
- Replace 21-column SELECTs with just-what-we-need column lists
- Pre-aggregate event counts via a database view or materialized view
- Cache the loader's output for a short window (e.g. 30s) since /convert refetches on every filter click

### 4. Cache the loader output between filter clicks (~5-10s save on filter clicks)

Every filter click currently triggers a full server-component re-render → full re-fetch. The data hasn't changed in the 2 seconds since the user last loaded the page. Use Next.js `unstable_cache` or React Cache with a short TTL.

### 5. Push filters to the URL but apply client-side (~all-of-filter-click latency)

Stage filtering happens in `filterCustomerLedgerRows` AFTER the loader. The loader fetches the same data regardless of stage. Lifting filters into client-side React state (instead of URL-driven server re-render) eliminates filter-click latency entirely.

Caveat: changes the share-link semantics. Worth discussing before implementing.

## Recommendation

**Immediate:** ship fix #1 (skip fan-out for unanchored visitors) + fix #2 (acuity index). These together should bring /convert back under 8s cold and under 4s warm — same or slightly better than pre-Phase-2.

**Then:** decide whether to invest in fix #3 (funnel loader rewrite, days of work) vs fix #4 (caching, hours of work) vs fix #5 (client-side filtering, refactor).

**Audit lesson:** future perf claims should be timed end-to-end on the actual page, not extrapolated from per-query measurements of a single component (the RPC). For Phase 3 onward, baseline + post-fix timing should be captured for the page being changed, not just the lib function.
