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
                          creative_id: "creative-1",
                          image_url: "https://meta.example/image.jpg",
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
              async eq(column: string, value: string) {
                assert.equal(column, "creative_id");
                assert.equal(value, "creative-1");
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
    assert.doesNotMatch(selectedColumns, /\bimage_hash\b/);
    assert.deepEqual(orderColumns, ["last_synced_at", "created_at"]);
    assert.deepEqual(cacheCalls, [
      { imageHash: "hash-1", kind: "thumbnail" },
      { imageHash: "hash-1", kind: "image" },
    ]);
    assert.deepEqual(updates, [
      {
        supabase_image_url: "https://cache.example/image",
        supabase_thumbnail_url: "https://cache.example/thumbnail",
      },
    ]);
    assert.equal(result.thumbnailCached, 1);
    assert.equal(result.imageCached, 1);
    assert.equal(result.failed, 0);
  });
});
