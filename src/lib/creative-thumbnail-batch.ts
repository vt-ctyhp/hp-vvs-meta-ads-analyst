import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { cacheCreativeThumbnail } from "./creative-thumbnail-cache.ts";

/**
 * Driver for the /api/cron/cache-thumbnails route.
 *
 * Each invocation:
 *   1. Pulls up to `limit` creatives that have a `thumbnail_url` from Meta
 *      but no `supabase_thumbnail_url` yet. Sorted by recency so newer
 *      creatives get cached first (they're the ones an operator is most
 *      likely to look at).
 *   2. For each, downloads the Meta CDN image and uploads it to the
 *      `creative-thumbnails` Supabase Storage bucket.
 *   3. On success, stamps `supabase_thumbnail_url` so subsequent runs
 *      skip this creative.
 *
 * The cron runs every hour. With ~50 creatives per run and the current
 * ~87-creative footprint, the entire library is cached after the first
 * two hours of cron activity. New creatives are picked up by the next
 * run after they sync.
 *
 * Failures are non-fatal: the row's supabase_thumbnail_url stays NULL,
 * the next cron run retries. Hot Meta CDN URLs are refreshed by every
 * sync that includes catalog refresh, so a transient failure should
 * heal on its own.
 */

const DEFAULT_LIMIT = 50;

export type ThumbnailBatchResult = {
  pickedUp: number;
  cached: number;
  skipped: number;
  failed: number;
  failures: Array<{ creativeId: string; reason: string }>;
};

type Row = {
  creative_id: string;
  thumbnail_url: string | null;
  image_url: string | null;
  video_thumbnail_url: string | null;
  image_hash: string | null;
};

type CreativesQuery = {
  from: (table: "meta_creatives") => {
    select: (cols: string) => {
      is: (col: string, value: null) => {
        not: (col: string, op: string, value: null) => {
          order: (
            col: string,
            opts: { ascending: boolean; nullsFirst?: boolean },
          ) => {
            limit: (n: number) => Promise<{ data: unknown; error: Error | null }>;
          };
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

  // Order by created_at desc — newer creatives first. Operators are far
  // more likely to scan recent creatives in the tree-table than dredge
  // through year-old rotations.
  const { data, error } = await supabase
    .from("meta_creatives")
    .select(
      "creative_id,thumbnail_url,image_url,video_thumbnail_url,image_hash",
    )
    .is("supabase_thumbnail_url", null)
    .not("thumbnail_url", "is", null)
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  const rows: Row[] = Array.isArray(data) ? (data as Row[]) : [];
  const summary: ThumbnailBatchResult = {
    pickedUp: rows.length,
    cached: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  for (const row of rows) {
    const sourceUrl =
      row.thumbnail_url || row.image_url || row.video_thumbnail_url;
    if (!sourceUrl) {
      summary.skipped += 1;
      continue;
    }

    const result = await cacheCreativeThumbnail({
      creativeId: row.creative_id,
      sourceUrl,
      imageHash: row.image_hash,
    });

    if (result.status === "cached") {
      const { error: updateError } = await supabase
        .from("meta_creatives")
        .update({ supabase_thumbnail_url: result.publicUrl })
        .eq("creative_id", row.creative_id);
      if (updateError) {
        summary.failed += 1;
        summary.failures.push({
          creativeId: row.creative_id,
          reason: `update failed: ${updateError.message}`,
        });
      } else {
        summary.cached += 1;
      }
    } else if (result.status === "skipped") {
      summary.skipped += 1;
    } else {
      summary.failed += 1;
      summary.failures.push({
        creativeId: row.creative_id,
        reason: result.reason,
      });
    }
  }

  return summary;
}
