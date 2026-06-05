# Chunked Ad-Catalog Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single 132-page `act_X/ads` walk with a per-ad-set, staleness-ordered, budget-bounded chunk so the Meta ad catalog self-heals within Vercel's 300s cron and Meta's ad-account rate budget.

**Architecture:** Add `meta_ad_sets.ads_refreshed_at`. Each `cron_catalog` run refreshes the campaign/ad-set lists (cheap), selects the stalest N ad sets, fetches `/{adset_id}/ads` for each, upserts ads+creatives via shared row-builders, stamps `ads_refreshed_at`, and stops at a wall-clock budget. A pure engine (`runAdCatalogChunk`) holds the loop logic behind injected deps for testability.

**Tech Stack:** TypeScript, Next.js (node runtime), Supabase (PostgREST via service client), Meta Graph API, `node --test --experimental-strip-types`.

Spec: `docs/superpowers/specs/2026-06-04-chunked-catalog-sync-design.md`

---

## File Structure

- `supabase/migrations/<ts>_add_ad_sets_ads_refreshed_at.sql` — new column + index (Task 1).
- `src/lib/meta-ad-catalog-chunk.ts` — **new** pure engine `runAdCatalogChunk` + types (Task 2).
- `src/lib/meta.ts` — `fetchMetaAdsForAdSet`, extracted row-builders `buildCreativeCatalogRow`/`buildAdCatalogRow`, `selectStalestAdSets`, `stampAdSetsRefreshed`, `syncAdCatalogChunk`, and routing `cron_catalog`/`manual_catalog` through it (Tasks 3-6).
- `src/lib/meta-sync-options.ts` — drop diagnostics from catalog triggers (Task 7).
- `vercel.json` — `cron_catalog` cadence → every 30 min (Task 8).
- Tests: `tests/meta-ad-catalog-chunk.test.ts` (engine), `tests/meta-adset-fetch.test.ts` (fetch params), update `tests/meta-sync-options.test.ts`.

---

## Task 1: Migration — `meta_ad_sets.ads_refreshed_at`

**Files:**
- Create: `supabase/migrations/<ts>_add_ad_sets_ads_refreshed_at.sql` (via repo script)

- [ ] **Step 1: Scaffold the migration file**

Run: `npm run db:migration -- add_ad_sets_ads_refreshed_at`
Expected: prints a new file path under `supabase/migrations/` (timestamp seconds `30`).

- [ ] **Step 2: Write idempotent column + index**

Replace the file contents with:

```sql
alter table public.meta_ad_sets
  add column if not exists ads_refreshed_at timestamptz;

create index if not exists meta_ad_sets_staleness_idx
  on public.meta_ad_sets (environment, meta_account_id, ads_refreshed_at nulls first);
```

- [ ] **Step 3: Validate migration ledger**

Run: `npm run db:migrations:check`
Expected: PASS (no ordering/format errors).

- [ ] **Step 4: Apply to the live DB (for later live verification)**

Apply the same SQL to project `jwoprkjybsmpzuksnede` via the Supabase MCP `apply_migration` (name `add_ad_sets_ads_refreshed_at`). `IF NOT EXISTS` keeps it safe to re-run on deploy.
Verify: `select column_name from information_schema.columns where table_name='meta_ad_sets' and column_name='ads_refreshed_at';` returns one row.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations
git commit -m "feat(sync): add meta_ad_sets.ads_refreshed_at for chunked catalog refresh"
```

---

## Task 2: Pure chunk engine `runAdCatalogChunk`

**Files:**
- Create: `src/lib/meta-ad-catalog-chunk.ts`
- Test: `tests/meta-ad-catalog-chunk.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { runAdCatalogChunk, type AdSetChunkDeps } from "../src/lib/meta-ad-catalog-chunk.ts";

function deps(over: Partial<AdSetChunkDeps> = {}): AdSetChunkDeps {
  return {
    listAdSets: async () => ["a", "b", "c"],
    fetchAds: async () => [{ id: "ad1" }],
    persist: async () => ({ ads: 1, creatives: 1 }),
    stampRefreshed: async () => {},
    now: () => 0,
    budgetMs: 1_000,
    ...over,
  };
}

describe("runAdCatalogChunk", () => {
  it("processes ad sets in the order listAdSets returns and stamps each", async () => {
    const stamped: string[] = [];
    const r = await runAdCatalogChunk(deps({ stampRefreshed: async (id) => { stamped.push(id); } }));
    assert.deepEqual(stamped, ["a", "b", "c"]);
    assert.equal(r.adSetsProcessed, 3);
    assert.equal(r.ads, 3);
    assert.equal(r.status, "ok");
  });

  it("stops starting ad sets once the wall-clock budget is exceeded", async () => {
    let t = 0;
    const stamped: string[] = [];
    const r = await runAdCatalogChunk(deps({
      now: () => (t += 600),          // 600, 1200(> budget) ...
      budgetMs: 1_000,
      stampRefreshed: async (id) => { stamped.push(id); },
    }));
    assert.deepEqual(stamped, ["a"]);  // second check (1200) is over budget
    assert.equal(r.status, "budget_exhausted");
  });

  it("leaves a failed ad set unstamped, records the error, and keeps going", async () => {
    const stamped: string[] = [];
    const r = await runAdCatalogChunk(deps({
      fetchAds: async (id) => { if (id === "b") throw new Error("too many calls to this ad-account"); return [{ id: "x" }]; },
      stampRefreshed: async (id) => { stamped.push(id); },
    }));
    assert.deepEqual(stamped, ["a", "c"]);
    assert.equal(r.errors.length, 1);
    assert.match(r.errors[0], /too many calls/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types tests/meta-ad-catalog-chunk.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the engine**

```ts
export type AdSetChunkDeps = {
  // Returns ad-set ids already ordered stalest-first (NULL/oldest first).
  listAdSets: () => Promise<string[]>;
  fetchAds: (adSetId: string) => Promise<Record<string, unknown>[]>;
  persist: (adSetId: string, ads: Record<string, unknown>[]) => Promise<{ ads: number; creatives: number }>;
  stampRefreshed: (adSetId: string) => Promise<void>;
  now: () => number;
  budgetMs: number;
};

export type AdCatalogChunkResult = {
  status: "ok" | "budget_exhausted";
  adSetsProcessed: number;
  ads: number;
  creatives: number;
  errors: string[];
};

export async function runAdCatalogChunk(deps: AdSetChunkDeps): Promise<AdCatalogChunkResult> {
  const start = deps.now();
  const adSetIds = await deps.listAdSets();
  const result: AdCatalogChunkResult = {
    status: "ok",
    adSetsProcessed: 0,
    ads: 0,
    creatives: 0,
    errors: [],
  };

  for (const adSetId of adSetIds) {
    if (deps.now() - start > deps.budgetMs) {
      result.status = "budget_exhausted";
      break;
    }
    try {
      const ads = await deps.fetchAds(adSetId);
      const counts = await deps.persist(adSetId, ads);
      await deps.stampRefreshed(adSetId);
      result.adSetsProcessed += 1;
      result.ads += counts.ads;
      result.creatives += counts.creatives;
    } catch (error) {
      // Leave ads_refreshed_at unchanged so this ad set is retried next run.
      result.errors.push(error instanceof Error ? error.message : String(error));
    }
  }

  return result;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types tests/meta-ad-catalog-chunk.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta-ad-catalog-chunk.ts tests/meta-ad-catalog-chunk.test.ts
git commit -m "feat(sync): add pure runAdCatalogChunk engine"
```

---

## Task 3: `fetchMetaAdsForAdSet`

**Files:**
- Modify: `src/lib/meta.ts` (next to `fetchMetaAdsForCatalogRefresh`)
- Test: `tests/meta-adset-fetch.test.ts`

- [ ] **Step 1: Write failing test (params via injected graphPages)**

Export a thin seam so the request params are assertable. In `src/lib/meta.ts`, the new function calls module-local `graphPages`; test the request builder instead by exporting `adSetAdsRequest(adSetId)`:

```ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { adSetAdsRequest, META_AD_CATALOG_PAGE_LIMIT } from "../src/lib/meta.ts";

describe("adSetAdsRequest", () => {
  it("targets the ad set's /ads edge with catalog fields, safe page size, active filter", () => {
    const req = adSetAdsRequest("120242517363420650");
    assert.equal(req.path, "120242517363420650/ads");
    assert.equal(req.params.limit, String(META_AD_CATALOG_PAGE_LIMIT));
    assert.ok(req.params.fields.includes("creative{"));
    assert.ok(req.params.filtering.includes("effective_status"));
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types tests/meta-adset-fetch.test.ts`
Expected: FAIL (`adSetAdsRequest` not exported).

- [ ] **Step 3: Implement request builder + fetch**

In `src/lib/meta.ts`:

```ts
export function adSetAdsRequest(adSetId: string) {
  return {
    path: `${adSetId}/ads`,
    params: {
      fields: META_AD_CATALOG_FIELDS.join(","),
      limit: String(META_AD_CATALOG_PAGE_LIMIT),
      filtering: activeInventoryFilter(),
    },
  };
}

async function fetchMetaAdsForAdSet(
  adSetId: string,
  fallback?: { enrichment: SyncEnrichmentMetrics; account: string },
) {
  const maxPages = getSyncMaxPages("META_SYNC_MAX_AD_PAGES", DEFAULT_META_SYNC_MAX_AD_PAGES);
  const req = adSetAdsRequest(adSetId);
  try {
    return await graphPages<JsonRecord>(req.path, req.params, { maxPages });
  } catch (error) {
    if (!(error instanceof MetaGraphError)) throw error;
    if (fallback) {
      recordSkippedEnrichment(fallback.enrichment, fallback.account, "ad_catalog_fields", errorToMessage(error));
    }
    return graphPages<JsonRecord>(req.path, {
      ...req.params,
      fields: META_AD_CORE_CATALOG_FIELDS.join(","),
    }, { maxPages });
  }
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `node --test --experimental-strip-types tests/meta-adset-fetch.test.ts && npx tsc --noEmit`
Expected: PASS, tsc clean (note: `fetchMetaAdsForAdSet` is unused until Task 5 — keep a `// used by syncAdCatalogChunk` comment; if tsc/noUnused flags it, wire Task 5 in the same commit).

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta.ts tests/meta-adset-fetch.test.ts
git commit -m "feat(sync): fetch ads per ad set for chunked catalog refresh"
```

---

## Task 4: Extract shared row-builders

**Files:**
- Modify: `src/lib/meta.ts` (refactor inline `.map()` bodies in `syncAccount`, ~lines 1209-1394)

Goal: make per-ad creative/ad row shaping reusable by both the legacy full path and the chunked path. Pure functions of one ad + a context object.

- [ ] **Step 1: Add the context type + builders**

```ts
type AdCatalogRowContext = {
  brandId: string | null;
  accountRowId: string;
  metaAccountId: string;
  now: string;
  refreshPreviews: boolean;
  previewByAdId: Map<string, { previewHtml: string | null; previewUrl: string | null }>;
  classifications: Map<string, CampaignUmbrellaClassification>;
  campaignByMetaId: Map<string, JsonRecord>;
  adSetByMetaId: Map<string, JsonRecord>;
  creativeByMetaId: Map<string, JsonRecord>;
};

export function buildCreativeCatalogRow(ad: JsonRecord, ctx: AdCatalogRowContext): JsonRecord | null {
  const creative = recordField(ad.creative);
  const creativeId = stringField(creative.id);
  if (!creativeId) return null;
  const adPreview = ctx.previewByAdId.get(String(ad.id)) || null;
  const preview = ctx.refreshPreviews ? chooseStoredPreview(creative, adPreview) : null;
  return {
    brand_id: ctx.brandId,
    account_id: ctx.accountRowId,
    meta_account_id: ctx.metaAccountId,
    creative_id: creativeId,
    name: stringField(creative.name),
    title: stringField(creative.title),
    body: stringField(creative.body),
    call_to_action_type: stringField(creative.call_to_action_type),
    ...(hasMetaField(creative, "call_to_action") ? { call_to_action: recordField(creative.call_to_action) } : {}),
    ...(hasMetaField(creative, "url_tags") ? { url_tags: stringField(creative.url_tags) } : {}),
    ...(hasMetaField(creative, "instagram_permalink_url") ? { instagram_permalink_url: stringField(creative.instagram_permalink_url) } : {}),
    ...(hasMetaField(creative, "effective_instagram_media_id") ? { effective_instagram_media_id: stringField(creative.effective_instagram_media_id) } : {}),
    ...(hasMetaField(creative, "degrees_of_freedom_spec") ? { degrees_of_freedom_spec: recordField(creative.degrees_of_freedom_spec) } : {}),
    object_type: stringField(creative.object_type),
    object_story_id: stringField(creative.object_story_id),
    effective_object_story_id: stringField(creative.effective_object_story_id),
    ...(ctx.refreshPreviews ? {
      thumbnail_url: stringField(creative.thumbnail_url),
      image_url: stringField(creative.image_url),
      video_thumbnail_url: stringField(creative.video_thumbnail_url),
      preview_url: preview?.previewUrl || null,
      preview_html: preview?.previewHtml || null,
      preview_source: preview?.previewSource || "fallback",
      creative_cache_attempted_at: null,
      creative_cache_error: null,
      last_preview_refresh_at: ctx.now,
    } : {}),
    asset_metadata: { image_hash: creative.image_hash || null, video_id: creative.video_id || null },
    object_story_spec: recordField(creative.object_story_spec),
    asset_feed_spec: recordField(creative.asset_feed_spec),
    raw_json: creative,
    last_synced_at: ctx.now,
  };
}

export function buildAdCatalogRow(ad: JsonRecord, ctx: AdCatalogRowContext): JsonRecord {
  const creative = recordField(ad.creative);
  const adPreview = ctx.previewByAdId.get(String(ad.id)) || null;
  const preview = ctx.refreshPreviews ? chooseStoredPreview(creative, adPreview) : null;
  const creativeId = stringField(creative.id);
  const adId = stringField(ad.id);
  const classification = ctx.classifications.get(adId || "") ||
    classifyCampaignUmbrella({ campaignName: stringField(ad.name) });
  return {
    brand_id: ctx.brandId,
    account_id: ctx.accountRowId,
    campaign_ref_id: ctx.campaignByMetaId.get(String(ad.campaign_id))?.id || null,
    ad_set_ref_id: ctx.adSetByMetaId.get(String(ad.adset_id))?.id || null,
    creative_ref_id: ctx.creativeByMetaId.get(creativeId || "")?.id || null,
    meta_account_id: ctx.metaAccountId,
    campaign_id: stringField(ad.campaign_id),
    ad_set_id: stringField(ad.adset_id),
    ad_id: adId,
    creative_id: creativeId,
    name: stringField(ad.name),
    status: stringField(ad.status),
    configured_status: stringField(ad.configured_status),
    effective_status: stringField(ad.effective_status),
    ...(hasMetaField(ad, "tracking_specs") ? { tracking_specs: arrayField(ad.tracking_specs) } : {}),
    ...(hasMetaField(ad, "tracking_and_conversion_with_defaults") ? { tracking_and_conversion_with_defaults: recordField(ad.tracking_and_conversion_with_defaults) } : {}),
    ...(hasMetaField(ad, "preview_shareable_link") ? { preview_shareable_link: stringField(ad.preview_shareable_link) } : {}),
    ...(hasMetaField(ad, "ad_active_time") ? { ad_active_time: stringField(ad.ad_active_time) } : {}),
    ...(ctx.refreshPreviews ? {
      preview_source: preview?.previewSource || "fallback",
      preview_url: preview?.previewUrl || null,
      preview_html: preview?.previewHtml || null,
    } : {}),
    created_time: stringField(ad.created_time),
    updated_time: stringField(ad.updated_time),
    ...umbrellaColumns(classification),
    raw_json: ad,
    last_synced_at: ctx.now,
  };
}
```

- [ ] **Step 2: Replace the inline `.map()` bodies in `syncAccount`**

In `syncAccount`, build a single `ctx: AdCatalogRowContext` from the existing locals and replace:
- `creativeRowsInput = refreshAdCatalog ? ads.map((ad)=>{...}).filter(Boolean) : []`
  → `refreshAdCatalog ? ads.map((ad) => buildCreativeCatalogRow(ad, ctx)).filter(Boolean) as JsonRecord[] : []`
- the `meta_ads` upsert mapper `ads.map((ad)=>{...})`
  → `ads.map((ad) => buildAdCatalogRow(ad, ctx))`

Build `ctx` after `creativeByMetaId` is known (creatives upsert first), as today.

- [ ] **Step 3: Verify no behavior change**

Run: `npx tsc --noEmit && node --test --experimental-strip-types tests/meta-enrichment-fields.test.ts tests/meta-campaign-upsert-defaults.test.ts`
Expected: tsc clean; existing meta tests PASS (row shape unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/lib/meta.ts
git commit -m "refactor(sync): extract reusable ad/creative catalog row builders"
```

---

## Task 5: Wire `syncAdCatalogChunk` (selection, persist, stamp)

**Files:**
- Modify: `src/lib/meta.ts`

- [ ] **Step 1: Add selection + stamp helpers**

```ts
function adCatalogChunkBudgetMs() {
  const v = Number(process.env.META_CATALOG_CHUNK_BUDGET_MS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 210_000;
}
function adCatalogChunkMaxAdSets() {
  const v = Number(process.env.META_CATALOG_CHUNK_MAX_ADSETS);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : 200;
}

async function selectStalestAdSetIds(metaAccountId: string, limit: number): Promise<string[]> {
  const supabase = createAdsAnalystClient("worker");
  let q = supabase
    .from("meta_ad_sets")
    .select("ad_set_id,ads_refreshed_at")
    .eq("meta_account_id", metaAccountId);
  if (usesEnvironmentScopedAdsAnalystUpserts() || usesLimitedAdsAnalystDbAccess()) {
    q = q.eq("environment", getAdsAnalystEnvironment());
  }
  const { data, error } = await q
    .order("ads_refreshed_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((r) => stringField((r as JsonRecord).ad_set_id))
    .filter((v): v is string => Boolean(v));
}

async function stampAdSetRefreshed(metaAccountId: string, adSetId: string, now: string) {
  const supabase = createAdsAnalystClient("worker");
  let q = supabase.from("meta_ad_sets").update({ ads_refreshed_at: now })
    .eq("meta_account_id", metaAccountId).eq("ad_set_id", adSetId);
  if (usesEnvironmentScopedAdsAnalystUpserts() || usesLimitedAdsAnalystDbAccess()) {
    q = q.eq("environment", getAdsAnalystEnvironment());
  }
  const { error } = await q;
  if (error) throw error;
}
```

- [ ] **Step 2: Add `syncAdCatalogChunk`**

It refreshes account/campaign/ad-set lists (reuse existing fetchers + upserts already in `syncAccount` — factor the shared prelude into `loadCatalogDimensions(account, brandId, options)` returning `{ accountRow, campaignByMetaId, adSetByMetaId, campaignRawByMetaId, adSetRawByMetaId, classifications, overrides, enrichment }`), then runs the engine:

```ts
async function syncAdCatalogChunk(account: SyncAccountConfig, brandId: string | null) {
  const accountId = normalizeAccountId(account.accountId);
  const metaAccountId = `act_${accountId}`;
  const now = new Date().toISOString();
  const dims = await loadCatalogDimensions(account, brandId, { refreshPreviews: true });

  const deps: AdSetChunkDeps = {
    listAdSets: () => selectStalestAdSetIds(metaAccountId, adCatalogChunkMaxAdSets()),
    fetchAds: (adSetId) => fetchMetaAdsForAdSet(adSetId, { enrichment: dims.enrichment, account: account.brandCode }),
    persist: async (adSetId, ads) => {
      // refresh previews for ads whose stored preview is a fallback (same rule as syncAccount)
      const previewByAdId = await buildPreviewMap(ads, true);
      const creativeCtxBase = { brandId, accountRowId: dims.accountRow.id as string, metaAccountId, now, refreshPreviews: true, previewByAdId, classifications: dims.classifications, campaignByMetaId: dims.campaignByMetaId, adSetByMetaId: dims.adSetByMetaId, creativeByMetaId: new Map<string, JsonRecord>() };
      const creativeRows = uniqueBy(ads.map((ad) => buildCreativeCatalogRow(ad, creativeCtxBase)).filter(Boolean) as JsonRecord[], (r) => String(r.creative_id));
      const upsertedCreatives = await upsertMany("meta_creatives", creativeRows, "meta_account_id,creative_id");
      const creativeByMetaId = new Map(upsertedCreatives.map((r) => [String(r.creative_id), r]));
      const adRows = ads.map((ad) => buildAdCatalogRow(ad, { ...creativeCtxBase, creativeByMetaId }));
      await upsertMany("meta_ads", adRows, "meta_account_id,ad_id");
      return { ads: adRows.length, creatives: creativeRows.length };
    },
    stampRefreshed: (adSetId) => stampAdSetRefreshed(metaAccountId, adSetId, now),
    now: () => Date.now(),
    budgetMs: adCatalogChunkBudgetMs(),
  };

  const result = await runAdCatalogChunk(deps);
  return { ...result, enrichment: dims.enrichment };
}
```

Helper `buildPreviewMap(ads, refreshPreviews)` extracts the existing `previewByAdId` loop (lines ~1195-1207). `loadCatalogDimensions` is the extracted prelude (account profile + campaigns + ad sets + classifications + upserts of campaigns/ad sets) reused by both `syncAccount` and `syncAdCatalogChunk`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/meta.ts
git commit -m "feat(sync): syncAdCatalogChunk wires engine to Supabase + Meta"
```

---

## Task 6: Route `cron_catalog`/`manual_catalog` through the chunk

**Files:**
- Modify: `src/lib/meta.ts` (`syncMetaAds` account loop)

- [ ] **Step 1: Branch on the catalog triggers**

In `syncMetaAds`, when `trigger` is `cron_catalog` or `manual_catalog`, call `syncAdCatalogChunk(account, brandId)` instead of `syncAccount(..., syncOptionsForTrigger(trigger))`; map its result into `metrics` (ads, creatives, adSetsProcessed → a new `metrics.adSetsProcessed`, errors). Keep the post-loop `cacheThumbnailBatch` (gated by `shouldCacheCreativeThumbnailsAfterSync`) so freshly upserted creatives cache. Other triggers (`cron`, `manual`, `manual_diagnostics`, `preview`) keep calling `syncAccount`.

```ts
const isChunkedCatalog = trigger === "cron_catalog" || trigger === "manual_catalog";
const result = isChunkedCatalog
  ? await syncAdCatalogChunk(account, brandByCode.get(account.brandCode) || null)
  : await syncAccount(account, brandByCode.get(account.brandCode) || null, syncOptionsForTrigger(trigger));
metrics.ads += result.ads;
metrics.creatives += result.creatives;
if ("adSetsProcessed" in result) metrics.adSetsProcessed = (metrics.adSetsProcessed ?? 0) + result.adSetsProcessed;
// existing campaigns/adSets/insights accumulation only applies to syncAccount results — guard accordingly.
```

Add `adSetsProcessed?: number` to the `SyncMetrics` type.

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; suite green (engine tests included; migration check passes).

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta.ts
git commit -m "feat(sync): run cron_catalog/manual_catalog as chunked ad-set passes"
```

---

## Task 7: Drop diagnostics from the catalog triggers

**Files:**
- Modify: `src/lib/meta-sync-options.ts`
- Test: `tests/meta-sync-options.test.ts`

- [ ] **Step 1: Update the expected options in the test**

Change the `manual_catalog`/`cron_catalog` expectations to:

```ts
assert.deepEqual(syncOptionsForTrigger("manual_catalog"), {
  refreshPreviews: true,
  refreshAdCatalog: true,
  refreshAdStatusesOnly: false,
  refreshRankingDiagnostics: false,
  includeCreativeDiagnostics: false,
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --test --experimental-strip-types tests/meta-sync-options.test.ts`
Expected: FAIL (still returns diagnostics:true).

- [ ] **Step 3: Update `syncOptionsForTrigger`**

In the `manual_catalog`/`cron_catalog` branch set `refreshRankingDiagnostics: false` and `includeCreativeDiagnostics: false`. Update the doc comment to note diagnostics now run only via `manual_diagnostics`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test --experimental-strip-types tests/meta-sync-options.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/meta-sync-options.ts tests/meta-sync-options.test.ts
git commit -m "feat(sync): catalog triggers refresh ads+creatives only (diagnostics -> manual)"
```

---

## Task 8: Cron cadence

**Files:**
- Modify: `vercel.json`

- [ ] **Step 1: Change the schedule**

Change the `/api/cron/catalog-refresh` entry from `"0 11 * * *"` to `"*/30 * * * *"`.

- [ ] **Step 2: Sanity check JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('vercel.json','utf8')); console.log('ok')"`
Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add vercel.json
git commit -m "chore(sync): run catalog refresh every 30m for chunked self-heal"
```

---

## Task 9: Full verification + live backfill

- [ ] **Step 1: Static gates**

Run: `npx tsc --noEmit && npm test`
Expected: tsc clean; full suite green.

- [ ] **Step 2: Live chunk against production**

With the migration applied (Task 1 Step 4), run `manual_catalog` against prod via the env-scoped recipe (memory `meta-ad-catalog-sync.md`), calling `syncMetaAds("manual_catalog")`. Confirm: status `ok`/`partial`, `meta_ads` production count rises, `min(ads_refreshed_at)` advances. Repeat a few times to confirm the stalest-first queue drains and the count climbs toward ~6,587.

- [ ] **Step 3: Confirm Elijah-class freshness**

Query a recently-created ad's ad set; confirm it gets `ads_refreshed_at` stamped and its ads/creatives land within a couple of chunk runs.

- [ ] **Step 4: Final commit / summary**

No code change; report counts + per-run timing.

---

## Self-Review

- **Spec coverage:** state model (Task 1), round-robin selection (Task 5), per-ad-set fetch (Task 3), shared shaping (Task 4), engine + budget/error handling (Task 2), routing + thumbnails (Task 6), diagnostics drop (Task 7), cadence (Task 8), verification (Task 9). All spec sections mapped.
- **Placeholders:** none — code shown for every logic step. `loadCatalogDimensions`/`buildPreviewMap` are named extractions of existing `syncAccount` blocks (lines ~1028-1185); their bodies are the current code moved verbatim.
- **Type consistency:** `AdSetChunkDeps`, `AdCatalogChunkResult`, `AdCatalogRowContext`, `buildCreativeCatalogRow`/`buildAdCatalogRow`, `selectStalestAdSetIds`, `stampAdSetRefreshed`, `syncAdCatalogChunk` names are used consistently across tasks.
