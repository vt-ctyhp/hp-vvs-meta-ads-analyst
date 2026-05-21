import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { cacheCreativeThumbnail } from "./creative-thumbnail-cache.ts";

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
 *
 * The cron runs hourly. With ~50 rows per run and 2 uploads per row, an
 * 87-creative library is fully cached after the first two runs.
 *
 * Failures on either slot are non-fatal: the row's column stays NULL,
 * the next cron run retries. Meta refreshes thumbnail_url/image_url on
 * every catalog-refresh sync, so a transient 403 heals on its own.
 */

const DEFAULT_LIMIT = 50;

export type ThumbnailBatchResult = {
  pickedUp: number;
  thumbnailCached: number;
  imageCached: number;
  skipped: number;
  failed: number;
  failures: Array<{ creativeId: string; kind: string; reason: string }>;
};

type Row = {
  creative_id: string;
  thumbnail_url: string | null;
  image_url: string | null;
  video_thumbnail_url: string | null;
  image_hash: string | null;
  supabase_thumbnail_url: string | null;
  supabase_image_url: string | null;
};

type CreativesQuery = {
  from: (table: "meta_creatives") => {
    select: (cols: string) => {
      or: (filter: string) => {
        order: (
          col: string,
          opts: { ascending: boolean; nullsFirst?: boolean },
        ) => {
          limit: (n: number) => Promise<{ data: unknown; error: Error | null }>;
        };
      };
    };
    update: (
      row: Record<string, unknown>,
    ) => {
      eq: (col: string, value: string) => Promise<{ error: Error | null }>;
    };
  };
};

export async function cacheThumbnailBatch(
  options: { limit?: number } = {},
): Promise<ThumbnailBatchResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 200));
  const supabase = createAdsAnalystClient("worker") as unknown as CreativesQuery;

  // PostgREST `.or()` filter — selects rows missing EITHER cache column.
  // Order by created_at desc so a backlog of new creatives caches first.
  const { data, error } = await supabase
    .from("meta_creatives")
    .select(
      "creative_id,thumbnail_url,image_url,video_thumbnail_url,image_hash,supabase_thumbnail_url,supabase_image_url",
    )
    .or("supabase_thumbnail_url.is.null,supabase_image_url.is.null")
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

  for (const row of rows) {
    const updates: Record<string, string> = {};

    // ── thumbnail slot ────────────────────────────────────────────────
    if (!row.supabase_thumbnail_url) {
      const sourceUrl =
        row.thumbnail_url || row.image_url || row.video_thumbnail_url;
      if (sourceUrl) {
        const result = await cacheCreativeThumbnail({
          creativeId: row.creative_id,
          sourceUrl,
          imageHash: row.image_hash,
          kind: "thumbnail",
        });
        if (result.status === "cached") {
          updates.supabase_thumbnail_url = result.publicUrl;
          summary.thumbnailCached += 1;
        } else if (result.status === "failed") {
          summary.failed += 1;
          summary.failures.push({
            creativeId: row.creative_id,
            kind: "thumbnail",
            reason: result.reason,
          });
        } else {
          summary.skipped += 1;
        }
      } else {
        summary.skipped += 1;
      }
    }

    // ── full image slot ───────────────────────────────────────────────
    if (!row.supabase_image_url) {
      // Prefer image_url (full resolution). Some video creatives don't
      // expose image_url — fall back to video_thumbnail_url, then
      // thumbnail_url so the drawer always has SOMETHING permanent.
      const sourceUrl =
        row.image_url || row.video_thumbnail_url || row.thumbnail_url;
      if (sourceUrl) {
        const result = await cacheCreativeThumbnail({
          creativeId: row.creative_id,
          sourceUrl,
          imageHash: row.image_hash,
          kind: "image",
        });
        if (result.status === "cached") {
          updates.supabase_image_url = result.publicUrl;
          summary.imageCached += 1;
        } else if (result.status === "failed") {
          summary.failed += 1;
          summary.failures.push({
            creativeId: row.creative_id,
            kind: "image",
            reason: result.reason,
          });
        } else {
          summary.skipped += 1;
        }
      } else {
        summary.skipped += 1;
      }
    }

    // ── one update per row carrying whatever slot(s) succeeded ───────
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("meta_creatives")
        .update(updates)
        .eq("creative_id", row.creative_id);
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
