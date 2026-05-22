import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  cacheThumbnailBatch,
  type CreativeThumbnailBatchClient,
} from "../src/lib/creative-thumbnail-batch.ts";

describe("creative thumbnail cache batch", () => {
  it("reads image hash from asset metadata and writes both cache URLs", async () => {
    let selectedColumns = "";
    const orderColumns: string[] = [];
    const updates: Record<string, unknown>[] = [];
    const updateMatches: Record<string, string>[] = [];
    const cacheCalls: Array<{ imageHash?: string | null; kind?: string }> = [];

    const client: CreativeThumbnailBatchClient = {
      from(table) {
        assert.equal(table, "meta_creatives");
        return {
          select(columns: string) {
            selectedColumns = columns;
            return {
              or(filter: string) {
                assert.equal(filter, "supabase_thumbnail_url.is.null,supabase_image_url.is.null");
                const orderedQuery = {
                  order(column: string) {
                    orderColumns.push(column);
                    return orderedQuery;
                  },
                  async limit(limit: number) {
                    assert.equal(limit, 1);
                    return {
                      data: [
                        {
                          asset_metadata: { image_hash: "hash-1" },
                          creative_cache_attempted_at: null,
                          creative_cache_error: null,
                          creative_id: "creative-1",
                          environment: "staging",
                          image_url: "https://meta.example/image.jpg",
                          meta_account_id: "act_1",
                          supabase_image_url: null,
                          supabase_thumbnail_url: null,
                          thumbnail_url: "https://meta.example/thumb.jpg",
                          video_thumbnail_url: null,
                        },
                      ],
                      error: null,
                    };
                  },
                };
                return orderedQuery;
              },
            };
          },
          update(row: Record<string, unknown>) {
            updates.push(row);
            return {
              async match(query: Record<string, string>) {
                updateMatches.push(query);
                return { error: null };
              },
            };
          },
        };
      },
    };

    const result = await cacheThumbnailBatch({
      cacheCreative: async (input) => {
        cacheCalls.push({ imageHash: input.imageHash, kind: input.kind });
        return {
          publicUrl: `https://cache.example/${input.kind}`,
          status: "cached",
        };
      },
      client,
      limit: 1,
    });

    assert.match(selectedColumns, /asset_metadata/);
    assert.match(selectedColumns, /environment/);
    assert.match(selectedColumns, /meta_account_id/);
    assert.match(selectedColumns, /creative_cache_attempted_at/);
    assert.match(selectedColumns, /creative_cache_error/);
    assert.doesNotMatch(selectedColumns, /\bimage_hash\b/);
    assert.deepEqual(orderColumns, ["creative_cache_attempted_at", "last_synced_at", "created_at"]);
    assert.deepEqual(cacheCalls, [
      { imageHash: "hash-1", kind: "thumbnail" },
      { imageHash: "hash-1", kind: "image" },
    ]);
    assert.equal(updates.length, 1);
    assert.equal(updates[0].supabase_image_url, "https://cache.example/image");
    assert.equal(updates[0].supabase_thumbnail_url, "https://cache.example/thumbnail");
    assert.deepEqual(updateMatches[0], {
      creative_id: "creative-1",
      environment: "staging",
      meta_account_id: "act_1",
    });
    assert.equal(typeof updates[0].creative_cache_attempted_at, "string");
    assert.equal(updates[0].creative_cache_error, null);
    assert.equal(result.thumbnailCached, 1);
    assert.equal(result.imageCached, 1);
    assert.equal(result.failed, 0);
  });

  it("records failed attempts so later runs can rotate past expired URLs", async () => {
    const updates: Record<string, unknown>[] = [];

    const client: CreativeThumbnailBatchClient = {
      from(table) {
        assert.equal(table, "meta_creatives");
        return {
          select() {
            return {
              or() {
                const orderedQuery = {
                  order() {
                    return orderedQuery;
                  },
                  async limit() {
                    return {
                      data: [
                        {
                          asset_metadata: null,
                          creative_cache_attempted_at: null,
                          creative_cache_error: null,
                          creative_id: "creative-1",
                          image_url: null,
                          supabase_image_url: null,
                          supabase_thumbnail_url: null,
                          thumbnail_url: "https://meta.example/expired.jpg",
                          video_thumbnail_url: null,
                        },
                      ],
                      error: null,
                    };
                  },
                };
                return orderedQuery;
              },
            };
          },
          update(row: Record<string, unknown>) {
            updates.push(row);
            return {
              async match() {
                return { error: null };
              },
            };
          },
        };
      },
    };

    const result = await cacheThumbnailBatch({
      cacheCreative: async () => ({
        reason: "Meta CDN returned HTTP 403 (URL likely expired).",
        status: "failed",
      }),
      client,
      limit: 1,
    });

    assert.equal(result.failed, 2);
    assert.equal(result.failures.length, 2);
    assert.equal(updates.length, 1);
    assert.equal(typeof updates[0].creative_cache_attempted_at, "string");
    assert.match(String(updates[0].creative_cache_error), /thumbnail: Meta CDN returned HTTP 403/);
    assert.match(String(updates[0].creative_cache_error), /image: Meta CDN returned HTTP 403/);
  });

  it("refreshes stale Meta CDN URLs from the creative API and retries caching", async () => {
    const updates: Record<string, unknown>[] = [];
    const cacheCalls: Array<{ kind?: string; sourceUrl: string; imageHash?: string | null }> = [];

    const client: CreativeThumbnailBatchClient = {
      from(table) {
        assert.equal(table, "meta_creatives");
        return {
          select() {
            return {
              or() {
                const orderedQuery = {
                  order() {
                    return orderedQuery;
                  },
                  async limit() {
                    return {
                      data: [
                        {
                          asset_metadata: { image_hash: null, video_id: "old-video" },
                          creative_cache_attempted_at: null,
                          creative_cache_error: null,
                          creative_id: "creative-1",
                          environment: "production",
                          image_url: null,
                          meta_account_id: "act_1",
                          supabase_image_url: null,
                          supabase_thumbnail_url: null,
                          thumbnail_url: "https://meta.example/expired.jpg",
                          video_thumbnail_url: null,
                        },
                      ],
                      error: null,
                    };
                  },
                };
                return orderedQuery;
              },
            };
          },
          update(row: Record<string, unknown>) {
            updates.push(row);
            return {
              async match(query: Record<string, string>) {
                assert.deepEqual(query, {
                  creative_id: "creative-1",
                  environment: "production",
                  meta_account_id: "act_1",
                });
                return { error: null };
              },
            };
          },
        };
      },
    };

    const result = await cacheThumbnailBatch({
      cacheCreative: async (input) => {
        cacheCalls.push({
          imageHash: input.imageHash,
          kind: input.kind,
          sourceUrl: input.sourceUrl,
        });
        if (input.sourceUrl.includes("expired")) {
          return {
            reason: "Meta CDN returned HTTP 403 (URL likely expired).",
            status: "failed",
          };
        }

        return {
          publicUrl: `https://cache.example/${input.kind}`,
          status: "cached",
        };
      },
      client,
      limit: 1,
      refreshCreativeSource: async () => ({
        fields: {
          asset_metadata: { image_hash: "fresh-hash", video_id: "fresh-video" },
          image_url: null,
          thumbnail_url: "https://meta.example/fresh.jpg",
          video_thumbnail_url: null,
        },
        status: "refreshed",
      }),
    });

    assert.deepEqual(cacheCalls, [
      {
        imageHash: null,
        kind: "thumbnail",
        sourceUrl: "https://meta.example/expired.jpg",
      },
      {
        imageHash: "fresh-hash",
        kind: "thumbnail",
        sourceUrl: "https://meta.example/fresh.jpg",
      },
      {
        imageHash: "fresh-hash",
        kind: "image",
        sourceUrl: "https://meta.example/fresh.jpg",
      },
    ]);
    assert.equal(result.failed, 0);
    assert.equal(result.thumbnailCached, 1);
    assert.equal(result.imageCached, 1);
    assert.equal(updates[0].thumbnail_url, "https://meta.example/fresh.jpg");
    assert.equal(updates[0].supabase_thumbnail_url, "https://cache.example/thumbnail");
    assert.equal(updates[0].supabase_image_url, "https://cache.example/image");
    assert.deepEqual(updates[0].asset_metadata, {
      image_hash: "fresh-hash",
      video_id: "fresh-video",
    });
  });
});
