# Systemic perf diagnosis — all dashboards

_Measured: 2026-05-24 01:00 PDT, from dev-server request log + targeted Node profiling._

## TL;DR

**Slowness is systemic across every dashboard, not just /convert.** The Phase 1 indexes helped `/analyst`'s raw RPC time but the *page* time still includes 5-10s of other work that wasn't touched. Five compounding patterns all need fixing for sustained relief; one of them (server-side caching) is the highest-leverage single intervention by a wide margin.

## Per-page timing matrix

From the dev server log (real user sessions, last ~2 hours):

| Page | Cold | Subsequent | Notes |
|---|---|---|---|
| /analyst | 14.2s → 11s | 6-15s | Even with Phase 1 indexes, page still slow because the page does MORE than just the central RPC |
| /analyst/creative-analysis | 10.9s | (not measured) | 1162-line aggregator in TS, no caching |
| **/convert** | **14.0s** | **2-85s per filter** | Worst variance; 85s outlier reproduced once |
| /api/analyst/performance-children | — | **1.2-6.1s per call** | Hierarchy expansion fires this for each row drilldown |
| /website-funnel | (not measured this session, shares 3054-line funnel loader with /convert) | likely similar | |
| /analysis (Ask AI) | depends on prompt | 30-60s for deep mode | LLM latency dominates |
| /operate/* | (not measured this session) | likely fast | smaller queries |

**Pattern:** every page in the "intelligence" group (analyst/convert/funnel/analysis) takes 5-15 seconds for cold loads and 2-10 seconds for warm. Only the `/operate/*` administrative pages are likely fast.

## Inside the slow loaders (warm-second-run timings)

### `fetchWebsiteFunnelData` — **8s cold / 2.9s warm** (used by /convert + /website-funnel)
- 3054-line loader; un-profiled by the spike
- Pulls website_events (15k cap), appointment_events, meta_daily_insights in parallel — but each is wide-column and large

### `fetchCustomerJourneyLedgerData` — **~5s cold / ~2s warm post-Phase-2** (used by /convert)
- See [perf-diagnosis.md](perf-diagnosis.md) for full breakdown
- windowVisitors (NEW Phase 2): 3.2s cold / 0.6s warm
- website_events.in(acuity_appointment_id, ...): 2.1s — **missing index**
- Visitor-keyed fan-out: 1.3s wall-clock (parallelized)

### `fetchDashboardData` → `aggregate_meta_daily_insights` RPC × N
- Each RPC call: 200ms-2s (post-Phase-1 indexes)
- /analyst makes ~8-10 RPC calls (one per section: KPIs, brand, umbrella, campaign, ad_set, creative, by-date trend, etc.)
- Sequential or partially parallelized depending on dependencies → cumulative 5-15s

### `fetchCreativeAnalysisData` — un-profiled
- 1162-line aggregator
- Reads meta_daily_insights with filters, then aggregates in TS
- Almost certainly suffers from the same "wide column + multi-query" pattern

## Common systemic patterns

These are NOT page-specific bugs — they're architectural:

### 1. **No server-side caching layer.** 
Every request — including filter clicks, date-range changes, drilldowns — triggers the full query cycle. Next.js server components rerun every loader on every render. There's no Redis, no in-memory cache, no `unstable_cache`. **The same data is fetched repeatedly within seconds for the same user.**

### 2. **Sequential queries when parallel would do.**
Loaders sometimes use `Promise.all` (good — funnel loader top-level is parallel), but often chain queries that don't depend on each other (worse). Even within `Promise.all`, large fan-outs (5 batches × 3 tables) wait for the slowest batch.

### 3. **Wide SELECT lists with JSONB.**
Several loaders select 20+ columns including JSONB fields (`properties`, `raw_json`, `first_touch`, `last_touch`, `last_paid_touch`, `actions`) when the consumer only uses 3-5 of them. JSONB is expensive to deserialize and transfer.

### 4. **Filter changes trigger full server-component re-renders.**
The `/convert?stage=X` pattern means changing a filter chip causes the entire page to re-render server-side, which re-runs every loader. The data hasn't actually changed in the 2 seconds since the user looked at it — they just want a subset of the rows. **This alone accounts for the filter-click latency.**

### 5. **Missing indexes outside meta_daily_insights.**
Phase 1 added composite indexes on `meta_daily_insights` and ad metadata tables. But `website_events`, `website_visitors`, `website_sessions`, `website_conversions`, `appointment_events` got nothing in Phase 1. Specific gap: `website_events (acuity_appointment_id)` — currently a sequential scan for every appointment-keyed event query.

### 6. **No materialized views for hot aggregations.**
Funnel KPIs (sessions, page views, bookings by source) are recomputed from scratch on every request. These are the same numbers a hundred users would see in the same hour. A materialized view refreshed every 5-10 minutes would serve those KPIs in <100ms instead of 8s.

## The most robust solution

A single architectural intervention solves >50% of the problem; everything else is supporting work.

### **Primary: server-side caching layer**

Wrap every page loader in [`unstable_cache`](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) with TTLs tuned to data freshness:

```ts
// src/lib/website-analytics.ts
import { unstable_cache } from "next/cache";

export const fetchWebsiteFunnelData = unstable_cache(
  fetchWebsiteFunnelDataUncached,
  ["website-funnel-data"],
  { revalidate: 30 }, // seconds
);
```

**Why this is the right primary lever:**
- **Cold load = same as today** (cache miss). Warm load = ~100ms (cache hit).
- **Every filter click is a cache hit.** Filter-click latency drops from 2-14s to <200ms.
- **Cross-user wins:** if user A loaded /convert 30s ago, user B's load is free.
- **Works for every page** — same pattern applied to fetchDashboardData, fetchCustomerJourneyLedgerData, fetchCreativeAnalysisData.
- **Bounded blast radius.** A wrapper, not a refactor. Easy to revert.
- **TTL is the dial.** Per-page tuning: 30s for analyst (live-feel), 5min for less-volatile pages.

**Estimated effort:** 1 day to wrap all major loaders + 1 day to validate freshness expectations with you.

**Estimated impact:**
- /convert warm load: 5s → ~200ms
- /convert filter clicks: 2-14s → ~50ms (in-memory cache hit)
- /analyst warm load: 6-15s → ~200ms
- /analyst/creative-analysis: 10.9s → ~200ms after first load
- /api/analyst/performance-children (per-row drilldown): 1-6s → cached when same params recur

### Secondary fixes (smaller, ship after caching)

In priority order:

**A. Skip fan-out for unanchored visitors** (Phase 2 follow-up, ~1 hour).
A visitor with no appointment and no conversion doesn't need sessions/events/conversions fetched. Today we fetch for all 451 window visitors; only ~10-20 need it. Saves ~2s on /convert.

**B. Add `website_events (acuity_appointment_id)` partial index** (~30 min).
Eliminates a 2.1s sequential scan in /convert and /website-funnel.

```sql
create index if not exists website_events_acuity_idx
  on public.website_events (acuity_appointment_id)
  where acuity_appointment_id is not null;
```

**C. Trim JSONB columns from list-view loaders** (~half day).
Add narrow column variants. The list view doesn't need `raw_json` or `properties`. Detail views still pull the full row.

**D. Move filtering to client state** (~half day, mid-term).
Lift `?stage=X` from server query params to client React state. Filter clicks become instant (no network round-trip). Caveat: changes share-link semantics — discuss before implementing.

**E. Materialized view for funnel KPIs** (~1-2 days, long-term).
Pre-aggregate sessions/bookings/conversions by date+brand into `website_funnel_daily_v1`. Refresh every 5 min via cron. Funnel KPI section drops from 8s to <100ms even on cold.

## Audit lessons (how all this happened)

Five compounding reasons the spike missed the systemic perf story:

1. **Track 2 focused on the single RPC `aggregate_meta_daily_insights`.** That was the one query the user-facing distrust pointed at. We didn't extrapolate to "every loader on every page might be slow." Confirmation bias toward the named target.

2. **Track 2 explicitly skipped browser-side page-load profiling** as "would take half a day." That half-day would have surfaced this systemic pattern in one sitting.

3. **The 3054-line and 1162-line aggregators were flagged as "size smells"** but never timed. Size ≠ perf, but in this case size correlated with un-profiled compound queries.

4. **Phase 1 indexes were RPC-targeted.** They helped /analyst's raw RPC time (TIMEOUT → 4-5s) but didn't move /convert/funnel/creative-analysis which use direct .from() queries against different tables.

5. **I shipped Phase 2 without before/after page-load timing** on /convert. The plan called for "smoke test in browser" but not "measure load time before and after." I added 1-4s of regression and noticed only when you reported it.

The honest framing: **the spike was a correctness audit that incidentally measured some perf, not a perf audit.** When you said "things are slow" originally, that was a real signal we treated as secondary to data correctness. The audit lesson going forward: any future spike that mentions "slow" gets a per-page Lighthouse-style timing pass as a hard requirement.

## Recommendation

**Ship the cache layer (~2 days) before any more feature work.** It's the single intervention that:
- Solves filter-click latency entirely (the worst-felt UX problem)
- Slashes warm-load times by 90%+ across every page
- Doesn't require schema changes, query rewrites, or refactoring of the 3054-line loader
- Is a wrapper, not a structural change — easy to revert if a freshness problem surfaces
- Buys time to do the secondary fixes (A-E above) at a measured pace

Then ship A + B as quick wins (~half day combined) and decide whether C/D/E are worth pursuing based on whether the cache solved enough of the felt experience.
