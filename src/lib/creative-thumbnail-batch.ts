import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { cacheCreativeThumbnail } from "./creative-thumbnail-cache.ts";
import { getMetaApiVersion } from "./env.ts";
import { safeErrorMessage } from "./error-message.ts";

/**
 * Driver for the /api/cron/cache-thumbnails route.
 *
 * Each invocation:
 *   1. Pulls up to `limit` creatives missing EITHER cache column:
 *        - supabase_thumbnail_url (powers the 32x32 tree-table cell)
 *        - supabase_image_url (powers the ~400px drawer preview)
 *      Sorted by recency so newer creatives — the ones an operator is
 *      most likely to look at — get cached first.
 *   2. For each row, caches each missing slot independently:
 *        - thumbnail from `thumbnail_url`
 *        - image from `image_url` (falls back to video_thumbnail_url for
 *          video creatives that don't expose a still image_url)
 *   3. Stamps the corresponding column on success. Subsequent runs skip
 *      already-cached slots.
 *   4. If a stored Meta CDN URL has expired, refreshes the creative from
 *      Meta by creative_id, then retries the cache with the fresh URL.
 *
 * The cron runs hourly. With ~50 rows per run and 2 uploads per row, an
 * 87-creative library is fully cached after the first two runs.
 *
 * Failures on either slot are non-fatal: the row's column stays NULL,
 * and the attempted-at marker moves it behind never-attempted rows. Expired
 * Meta CDN URLs are refreshed directly from Meta before retrying, so the
 * cache no longer has to wait for a full catalog refresh to heal.
 */

const DEFAULT_LIMIT = 50;
const META_REFRESH_TIMEOUT_MS = 10_000;

export type ThumbnailBatchResult = {
  pickedUp: number;
  thumbnailCached: number;
  imageCached: number;
  skipped: number;
  failed: number;
  failures: Array<{ creativeId: string; kind: string; reason: string }>;
};

type Row = {
  asset_metadata: Record<string, unknown> | null;
  creative_cache_attempted_at: string | null;
  creative_cache_error: string | null;
  creative_id: string;
  environment?: string | null;
  thumbnail_url: string | null;
  image_url: string | null;
  meta_account_id?: string | null;
  video_thumbnail_url: string | null;
  supabase_thumbnail_url: string | null;
  supabase_image_url: string | null;
};

type RefreshedCreativeSource = {
  asset_metadata?: Record<string, unknown> | null;
  image_url?: string | null;
  thumbnail_url?: string | null;
  video_thumbnail_url?: string | null;
};

type CreativeSourceRefreshResult =
  | { status: "refreshed"; fields: RefreshedCreativeSource }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type OrderedCreativeQuery = {
  order: (
    col: string,
    opts: { ascending: boolean; nullsFirst?: boolean },
  ) => OrderedCreativeQuery;
  limit: (n: number) => Promise<{ data: unknown; error: Error | null }>;
};

export type CreativeThumbnailBatchClient = {
  from: (table: "meta_creatives") => {
    select: (cols: string) => {
      or: (filter: string) => {
        order: OrderedCreativeQuery["order"];
      };
    };
    update: (
      row: Record<string, unknown>,
    ) => {
      match: (query: Record<string, string>) => Promise<{ error: Error | null }>;
    };
  };
};

type CacheCreative = typeof cacheCreativeThumbnail;
type RefreshCreativeSource = (row: Row) => Promise<CreativeSourceRefreshResult>;

export async function cacheThumbnailBatch(
  options: {
    cacheCreative?: CacheCreative;
    client?: CreativeThumbnailBatchClient;
    limit?: number;
    refreshCreativeSource?: RefreshCreativeSource;
  } = {},
): Promise<ThumbnailBatchResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 200));
  const supabase =
    options.client ||
    (createAdsAnalystClient("worker") as unknown as CreativeThumbnailBatchClient);
  const cacheCreative = options.cacheCreative || cacheCreativeThumbnail;
  const refreshCreativeSource =
    options.refreshCreativeSource || refreshCreativeSourceFromMeta;

  // PostgREST `.or()` filter — selects rows missing EITHER cache column.
  // Order by last_synced_at desc so active, recently-refreshed creatives cache first.
  const { data, error } = await supabase
    .from("meta_creatives")
    .select(
      "environment,meta_account_id,creative_id,thumbnail_url,image_url,video_thumbnail_url,asset_metadata,creative_cache_attempted_at,creative_cache_error,supabase_thumbnail_url,supabase_image_url",
    )
    .or("supabase_thumbnail_url.is.null,supabase_image_url.is.null")
    .order("creative_cache_attempted_at", { ascending: true, nullsFirst: true })
    .order("last_synced_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
  const summary: ThumbnailBatchResult = {
    pickedUp: rows.length,
    thumbnailCached: 0,
    imageCached: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const originalRow of rows) {
    const row = { ...originalRow };
    const updates: Record<string, unknown> = {};
    const errors: string[] = [];
    let attempted = false;
    let refreshAttempted = false;
    let refreshError: string | null = null;

    async function refreshSources() {
      if (refreshAttempted) return refreshError === null;
      refreshAttempted = true;

      const result = await refreshCreativeSource(row);
      if (result.status !== "refreshed") {
        refreshError = result.reason;
        return false;
      }

      Object.assign(row, result.fields);
      for (const [key, value] of Object.entries(result.fields)) {
        updates[key] = value;
      }
      refreshError = null;
      return true;
    }

    // ── thumbnail slot ────────────────────────────────────────────────
    if (!row.supabase_thumbnail_url) {
      attempted = true;
      await cacheSlot({
        cacheCreative,
        getSourceUrl: () => row.thumbnail_url || row.image_url || row.video_thumbnail_url,
        kind: "thumbnail",
        onCached: (publicUrl) => {
          updates.supabase_thumbnail_url = publicUrl;
          summary.thumbnailCached += 1;
        },
        refreshSources,
        row,
        summary,
        errors,
      });
    }

    // ── full image slot ───────────────────────────────────────────────
    if (!row.supabase_image_url) {
      // Prefer image_url (full resolution). Some video creatives don't
      // expose image_url — fall back to video_thumbnail_url, then
      // thumbnail_url so the drawer always has SOMETHING permanent.
      attempted = true;
      await cacheSlot({
        cacheCreative,
        getSourceUrl: () => row.image_url || row.video_thumbnail_url || row.thumbnail_url,
        kind: "image",
        onCached: (publicUrl) => {
          updates.supabase_image_url = publicUrl;
          summary.imageCached += 1;
        },
        refreshSources,
        row,
        summary,
        errors,
      });
    }

    if (attempted) {
      updates.creative_cache_attempted_at = new Date().toISOString();
      updates.creative_cache_error = errors.length ? errors.join("; ") : null;
    }

    // ── one update per row carrying whatever slot(s) succeeded ───────
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("meta_creatives")
        .update(updates)
        .match(matchForRow(row));
      if (updateError) {
        summary.failed += 1;
        summary.failures.push({
          creativeId: row.creative_id,
          kind: "update",
          reason: updateError.message,
        });
      }
    }
  }

  return summary;
}

async function cacheSlot({
  cacheCreative,
  errors,
  getSourceUrl,
  kind,
  onCached,
  refreshSources,
  row,
  summary,
}: {
  cacheCreative: CacheCreative;
  errors: string[];
  getSourceUrl: () => string | null;
  kind: "thumbnail" | "image";
  onCached: (publicUrl: string) => void;
  refreshSources: () => Promise<boolean>;
  row: Row;
  summary: ThumbnailBatchResult;
}) {
  let sourceUrl = getSourceUrl();
  if (!sourceUrl) {
    await refreshSources();
    sourceUrl = getSourceUrl();
    if (!sourceUrl) {
      errors.push(`${kind}: missing source URL`);
      summary.skipped += 1;
      return;
    }
  }

  let result = await cacheCreative({
    creativeId: row.creative_id,
    sourceUrl,
    imageHash: imageHashFromMetadata(row.asset_metadata),
    kind,
  });

  if (result.status === "failed" && shouldRefreshAfterCacheFailure(result.reason)) {
    const refreshed = await refreshSources();
    const refreshedSourceUrl = getSourceUrl();
    if (refreshed && refreshedSourceUrl) {
      result = await cacheCreative({
        creativeId: row.creative_id,
        sourceUrl: refreshedSourceUrl,
        imageHash: imageHashFromMetadata(row.asset_metadata),
        kind,
      });
    }
  }

  if (result.status === "cached") {
    onCached(result.publicUrl);
    return;
  }

  if (result.status === "failed") {
    summary.failed += 1;
    errors.push(`${kind}: ${result.reason}`);
    summary.failures.push({
      creativeId: row.creative_id,
      kind,
      reason: result.reason,
    });
    return;
  }

  summary.skipped += 1;
}

async function refreshCreativeSourceFromMeta(row: Row): Promise<CreativeSourceRefreshResult> {
  const token = process.env.META_ACCESS_TOKEN?.trim();
  if (!token) {
    return { status: "skipped", reason: "missing META_ACCESS_TOKEN" };
  }

  try {
    const url = new URL(
      `https://graph.facebook.com/${getMetaApiVersion()}/${row.creative_id}`,
    );
    url.searchParams.set("access_token", token);
    url.searchParams.set(
      "fields",
      "id,name,title,body,thumbnail_url,image_url,image_hash,object_type,video_id",
    );

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), META_REFRESH_TIMEOUT_MS);
    let response: Response;
    let payload: Record<string, unknown> | null;
    try {
      response = await fetch(url, { cache: "no-store", signal: controller.signal });
      payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      if (!response.ok) {
        return {
          status: "failed",
          reason: `Meta creative refresh returned HTTP ${response.status}: ${
            metaErrorMessage(payload) || "unknown error"
          }`,
        };
      }
    } finally {
      clearTimeout(timeout);
    }

    const fields: RefreshedCreativeSource = {
      asset_metadata: mergeAssetMetadata(row.asset_metadata, {
        image_hash: stringOrNull(payload?.image_hash),
        video_id: stringOrNull(payload?.video_id),
      }),
      image_url: stringOrNull(payload?.image_url),
      thumbnail_url: stringOrNull(payload?.thumbnail_url),
      video_thumbnail_url: stringOrNull(payload?.video_thumbnail_url),
    };

    if (!fields.thumbnail_url && !fields.image_url && !fields.video_thumbnail_url) {
      return { status: "skipped", reason: "Meta creative refresh returned no image URL" };
    }

    return { status: "refreshed", fields };
  } catch (error) {
    return {
      status: "failed",
      reason: `Meta creative refresh failed: ${safeErrorMessage(error)}`,
    };
  }
}

function matchForRow(row: Row): Record<string, string> {
  return {
    ...(row.environment ? { environment: row.environment } : {}),
    ...(row.meta_account_id ? { meta_account_id: row.meta_account_id } : {}),
    creative_id: row.creative_id,
  };
}

function mergeAssetMetadata(
  current: Record<string, unknown> | null,
  next: Record<string, string | null>,
) {
  return {
    ...(current || {}),
    ...next,
  };
}

function shouldRefreshAfterCacheFailure(reason: string) {
  return /Meta CDN returned HTTP|Meta fetch failed/i.test(reason);
}

function metaErrorMessage(payload: Record<string, unknown> | null) {
  const error = payload?.error;
  if (!error || typeof error !== "object") return null;
  const message = (error as Record<string, unknown>).message;
  return stringOrNull(message);
}

function imageHashFromMetadata(value: Record<string, unknown> | null) {
  const imageHash = value?.image_hash;
  if (typeof imageHash !== "string") return null;
  const trimmed = imageHash.trim();
  return trimmed || null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
