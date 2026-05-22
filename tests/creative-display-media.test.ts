import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveCreativeDisplayMedia } from "../src/lib/creative-display-media.ts";

describe("resolveCreativeDisplayMedia", () => {
  it("uses Supabase cached thumbnail and image URLs when both exist", () => {
    assert.deepEqual(
      resolveCreativeDisplayMedia({
        supabase_image_url: "https://cache.example/image.jpg",
        supabase_thumbnail_url: "https://cache.example/thumb.jpg",
      }),
      {
        imageUrl: "https://cache.example/image.jpg",
        thumbnailUrl: "https://cache.example/thumb.jpg",
      },
    );
  });

  it("uses the cached image for thumbnail display when no cached thumbnail exists", () => {
    assert.deepEqual(
      resolveCreativeDisplayMedia({
        supabase_image_url: "https://cache.example/image.jpg",
      }),
      {
        imageUrl: "https://cache.example/image.jpg",
        thumbnailUrl: "https://cache.example/image.jpg",
      },
    );
  });

  it("does not expose volatile Meta CDN fields as display media", () => {
    assert.deepEqual(
      resolveCreativeDisplayMedia({
        image_url: "https://scontent.example/image.jpg",
        thumbnail_url: "https://scontent.example/thumb.jpg",
        video_thumbnail_url: "https://scontent.example/video.jpg",
      }),
      {
        imageUrl: null,
        thumbnailUrl: null,
      },
    );
  });
});
