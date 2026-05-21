import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { safeErrorMessage } from "./error-message.ts";

/**
 * Phase 1 thumbnail cache.
 *
 * Meta's `thumbnail_url` is a signed scontent-*.xx.fbcdn.net URL that
 * expires within ~24-48 hours. Every time the URL expires, the tree-table
 * + drawer render blank squares. To get a stable image surface, the cron
 * job in `/api/cron/cache-thumbnails` calls `cacheCreativeThumbnail` for
 * every creative whose `supabase_thumbnail_url` is still NULL, downloading
 * the bytes once and re-publishing them to a public Supabase Storage
 * bucket. The Storage URL never expires.
 *
 * Bucket: `creative-thumbnails` (public, created in migration
 * 20260521000000_creative_thumbnails_cache.sql).
 *
 * Object key shape: `${creative_id}-${image_hash}.{jpg|png|webp}` so a
 * new image_hash for the same creative produces a different file path
 * (we don't accidentally serve a stale image after Meta updates the
 * creative).
 */

export type ThumbnailCacheResult =
  | { status: "cached"; publicUrl: string }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

type StorageClient = {
  storage: {
    from: (bucket: string) => {
      upload: (
        path: string,
        data: ArrayBuffer | Uint8Array | Blob,
        options?: { contentType?: string; cacheControl?: string; upsert?: boolean },
      ) => Promise<{ error: { message: string } | null }>;
      getPublicUrl: (path: string) => { data: { publicUrl: string } };
    };
  };
};

const BUCKET = "creative-thumbnails";
// Bound the bytes we'll ever hold in memory at once. Meta thumbnails are
// ~5-50 KB; full creatives ~100-500 KB. 5 MB is a defensive ceiling.
const MAX_BYTES = 5 * 1024 * 1024;
// Wall-clock cap on the fetch from Meta. Vercel's per-request budget is
// tight; if Meta is slow, give up and try this creative again next cron.
const FETCH_TIMEOUT_MS = 10_000;

export async function cacheCreativeThumbnail(input: {
  creativeId: string;
  sourceUrl: string;
  imageHash?: string | null;
}): Promise<ThumbnailCacheResult> {
  if (!input.creativeId || !input.sourceUrl) {
    return { status: "skipped", reason: "missing creativeId or sourceUrl" };
  }

  // 1. Fetch the bytes from Meta's CDN. Time-bounded; size-bounded.
  let bytes: ArrayBuffer;
  let contentType: string;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(input.sourceUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        return {
          status: "failed",
          reason: `Meta CDN returned HTTP ${response.status} (URL likely expired).`,
        };
      }
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > MAX_BYTES) {
        return {
          status: "failed",
          reason: `Image too large (${contentLength} bytes > ${MAX_BYTES}).`,
        };
      }
      contentType = response.headers.get("content-type") || "image/jpeg";
      bytes = await response.arrayBuffer();
      if (bytes.byteLength > MAX_BYTES) {
        return {
          status: "failed",
          reason: `Image too large (${bytes.byteLength} bytes > ${MAX_BYTES}).`,
        };
      }
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    return { status: "failed", reason: `Meta fetch failed: ${safeErrorMessage(e)}` };
  }

  // 2. Upload to Supabase Storage. Object key includes image_hash so a
  //    Meta-side update writes to a new path instead of stomping the old
  //    file (avoids cache races on the CDN edge).
  const ext = extensionFromContentType(contentType);
  const objectKey = input.imageHash
    ? `${input.creativeId}-${input.imageHash}.${ext}`
    : `${input.creativeId}.${ext}`;

  try {
    const supabase = createAdsAnalystClient("worker") as unknown as StorageClient;
    const { error } = await supabase.storage.from(BUCKET).upload(objectKey, bytes, {
      contentType,
      upsert: true,
      // 1 year browser cache; we mint a new object key on image_hash change.
      cacheControl: "31536000",
    });
    if (error) {
      return { status: "failed", reason: `Storage upload failed: ${error.message}` };
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(objectKey);
    return { status: "cached", publicUrl: data.publicUrl };
  } catch (e) {
    return {
      status: "failed",
      reason: `Storage client threw: ${safeErrorMessage(e)}`,
    };
  }
}

function extensionFromContentType(contentType: string): string {
  const lower = contentType.toLowerCase();
  if (lower.includes("png")) return "png";
  if (lower.includes("webp")) return "webp";
  if (lower.includes("gif")) return "gif";
  // jpeg is the safe default; Meta's thumbnails are mostly jpeg.
  return "jpg";
}
