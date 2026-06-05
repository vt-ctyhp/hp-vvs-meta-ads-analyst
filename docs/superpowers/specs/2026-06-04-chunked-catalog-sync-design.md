# Chunked, self-healing Meta ad-catalog refresh

Date: 2026-06-04
Status: Approved (design) — pending implementation plan

## Problem

The daily Meta ad-catalog refresh (`/api/cron/catalog-refresh` →
`syncMetaAds("cron_catalog")` in `src/lib/meta.ts`) populates `meta_ads` /
`meta_creatives`, which the Convert ledger drawer joins to render an attributed
creative and its cached thumbnail. It refreshes the whole account in **one**
`act_X/ads` walk.

The HP account has ~6,587 active+paused ads = ~132 pages at the hard 50/page
limit (raising per-page size makes Meta reject the heavy
`META_AD_CATALOG_FIELDS` payload with "please reduce the amount of data"). A
single ~132-page walk exceeds **both**:

- Meta's ad-account ("ads-management") rate budget — the walk trips
  "too many calls to this ad-account" partway through, and
- Vercel's 300s `maxDuration`.

Because the ad upsert happens only after the *entire* walk, any failure writes
**zero** rows. The refresh last succeeded **2026-05-16**; every ad created since
(e.g. a newly booked customer's attributed Instagram ad) shows a blank creative
until manually patched.

Commit `f520a16` landed a necessary-but-insufficient baseline: page ceiling
100→250 (`META_SYNC_MAX_AD_PAGES`) and cursor-resuming exponential backoff in
`graphPages` (`META_SYNC_PAGE_MAX_RETRIES`). This stops the hard pagination-cap
abort and survives short throttles, but does not make the full walk fit the rate
budget or the 300s window.

## Goals

- The catalog refresh **self-heals** with no manual intervention: a new ad
  appears in the ledger within a few hours of creation.
- Each cron invocation completes well within 300s and within Meta's ad-account
  rate budget.
- Partial progress always persists; a throttle never wipes a run's work.
- Minimal new infrastructure and minimal new state.

## Non-goals

- Single-shot "refresh the entire account right now" — that's the operation that
  fundamentally does not fit; it is replaced, not preserved.
- Insights redesign — `meta_daily_insights` already has a healthy daily
  insights-only `cron` and is out of scope.
- Auto-refresh of ranking/creative **diagnostics** — explicitly dropped from the
  automated catalog path (see Behavior changes); a follow-up.

## Design

### Core idea: round-robin by staleness

Chunk the walk by **ad set**. Ad sets are already enumerated cheaply each run
(`fetchMetaAdSetsForCatalogRefresh`, ≤12 pages) and are small enough that
`/{adset_id}/ads` is 1–2 pages each. Track per-ad-set freshness and always
process the stalest ad sets first. Staleness ordering *is* the work queue — no
explicit cycle bookkeeping and no new state table.

Add one column to `meta_ad_sets` (already environment-scoped):

```
ads_refreshed_at timestamptz null
```

Each cron run (`syncAdCatalogChunk`):

1. Refresh the account profile, campaign list, and ad-set list (cheap, existing
   fetchers + upserts) so the ad-set inventory is current. New ad sets land with
   `ads_refreshed_at = NULL`.
2. Select this run's chunk from `meta_ad_sets` for the active (environment,
   meta_account_id):
   `... WHERE <active inventory> ORDER BY ads_refreshed_at ASC NULLS FIRST
   LIMIT <maxAdSets>`.
   NULL (never-refreshed / brand-new) and longest-unrefreshed go first.
3. Loop the selected ad sets under a wall-clock budget. For each ad set:
   - `fetchMetaAdsForAdSet(adSetId)` → `graphPages('{adset_id}/ads', {fields:
     META_AD_CATALOG_FIELDS, limit: '50', filtering: activeInventoryFilter()},
     {maxPages})` — same fields/filter/backoff as today's walk, just scoped to
     one ad set.
   - Derive `meta_creatives` rows from the ad payload and upsert ads + creatives
     (env-scoped, reusing the existing row shaping / `upsertMany`).
   - Stamp `ads_refreshed_at = now` for that ad set.
4. Stop starting new ad sets once `elapsed > META_CATALOG_CHUNK_BUDGET_MS`
   (default 210000 — headroom under the 300s cap) or the chunk is exhausted.
5. End with a bounded `cacheThumbnailBatch` so newly-upserted creatives get
   their Supabase-cached thumbnail quickly (the hourly `cache-thumbnails` cron
   remains the backstop).

With ~300 ad sets at ~40/run every 30 min, the full catalog refreshes in ~3–4
hours and stays continuously fresh. A brand-new ad in an existing ad set is
picked up when that ad set rotates to stalest — within the full-cycle window.

### Execution model

- `cron_catalog` runs the chunked engine. `vercel.json` schedule changes from
  `0 11 * * *` to `*/30 * * * *` (every 30 min; requires Vercel Pro cron
  frequency — confirm plan during rollout). `maxDuration` stays 300.
- `manual_catalog` runs **one** budgeted chunk on demand (operator can click
  repeatedly to accelerate a backfill).
- The single 132-page `act_X/ads` walk (`fetchMetaAdsForCatalogRefresh`) is
  removed from the automated path. It may remain as dead/utility code or be
  deleted during implementation.

### Tunables (env, with defaults)

- `META_CATALOG_CHUNK_BUDGET_MS` — per-run wall-clock budget. Default `210000`.
- `META_CATALOG_CHUNK_MAX_ADSETS` — safety cap on ad sets per run. Default `200`.
- Existing `META_SYNC_MAX_AD_PAGES` / `META_SYNC_PAGE_MAX_RETRIES` still apply to
  the per-ad-set fetch.

## Data model

Migration (created via `npm run db:migration -- add_ad_sets_ads_refreshed_at`,
per repo rules — never hand-authored):

- `ALTER TABLE meta_ad_sets ADD COLUMN ads_refreshed_at timestamptz`.
- Index to make the stalest-first selection cheap, e.g.
  `(environment, meta_account_id, ads_refreshed_at NULLS FIRST)`.

`ads_refreshed_at` is NULLable (no default) so existing rows sort first and get
backfilled on the first cycle. `sync_runs` is unchanged; each chunk run records
its own ledger row with per-run metrics (ad sets processed, ads, creatives).

## Behavior changes

- **Diagnostics dropped from the automated catalog path.** Today
  `cron_catalog`/`manual_catalog` set `refreshRankingDiagnostics: true` and
  `includeCreativeDiagnostics: true`. The chunked path refreshes **ads +
  creatives only**. Ranking/creative diagnostics remain available via
  `manual_diagnostics`; automatic diagnostics refresh is a follow-up.
  `syncOptionsForTrigger` and `tests/meta-sync-options.test.ts` are updated to
  reflect the lean catalog options.
- `cron_catalog` cadence changes from daily to every 30 min.

## Error handling

- A chunk (~40 ad sets × a few calls) is far less likely to deplete Meta's
  account budget than a 132-page burst. Transient throttles are absorbed by the
  `graphPages` backoff already merged.
- If an ad-set fetch still fails after backoff (hard account throttle):
  - record the error in `sync_runs.errors`,
  - leave that ad set's `ads_refreshed_at` **unchanged** so it's retried next
    run, and
  - end the run gracefully (status `partial`) rather than aborting hard.
- Upserts are idempotent (env-scoped `onConflict`), so a half-processed ad set
  simply re-fetches cleanly on the next run. Progress for already-stamped ad sets
  always persists.

## Edge cases

- **New ad in an existing ad set:** surfaces when the ad set rotates to stalest
  (within the full-cycle window). Acceptable per the "few hours" freshness goal.
- **Removed/paused ad set:** drops out of the enumerated list naturally; its ads
  stop being updated (same as the current full walk — orphan cleanup is a
  pre-existing concern, not introduced here).
- **Ad set with unusually many ads:** still bounded by `META_SYNC_MAX_AD_PAGES`
  per fetch; pathological ad sets are far smaller than the whole account.

## Testing

- `selectStalestAdSets` ordering: NULL first, then oldest `ads_refreshed_at`;
  respects `maxAdSets`.
- Budget stop: loop halts after `META_CATALOG_CHUNK_BUDGET_MS`, leaving
  unprocessed ad sets unstamped.
- Resumability: an unstamped ad set (failed/over-budget last run) is selected
  first next run.
- Idempotency: re-running a chunk produces no duplicate rows (env-scoped
  `onConflict`).
- Per-ad-set fetch uses `{adset_id}/ads` with the catalog fields, 50/page,
  active-inventory filter, and the shared backoff.
- Update `tests/meta-sync-options.test.ts` for the lean catalog options.
- `npm test` (runs `db:migrations:check` + `tests/meta-catalog-pagination.test.ts`)
  and `npm run typecheck` stay green.

## Rollout & verification

- Land migration + code behind the existing triggers (no flag needed; the
  chunked engine is strictly safer than the broken full walk).
- Verify locally with the env-scoped run recipe (see memory
  `meta-ad-catalog-sync.md`): run `manual_catalog` repeatedly against
  `ADS_ANALYST_ENVIRONMENT=production` and watch `meta_ads` production count
  climb toward ~6,587 and `min(ads_refreshed_at)` advance.
- After deploy, confirm the 30-min cron advances the catalog over a few hours and
  `sync_runs` shows `success`/`partial` (not `failed`) chunk runs.

## Follow-ups (out of scope)

- Automatic ranking/creative diagnostics refresh (per-chunk or a dedicated cron).
- Cleanup of orphaned `meta_ads`/`meta_creatives` under removed ad sets.
- Optional prioritization of ad sets with recent spend/activity ahead of pure
  staleness order.
