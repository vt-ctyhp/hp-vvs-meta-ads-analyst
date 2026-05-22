import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { bestCreativeMediaRow } from "../src/lib/creative-metadata-selection.ts";

describe("creative metadata selection", () => {
  it("prefers current-environment rows when they have cached media", () => {
    const row = bestCreativeMediaRow(
      [
        {
          creative_id: "creative-1",
          environment: "staging",
          last_synced_at: "2026-05-22T02:00:00.000Z",
          supabase_thumbnail_url: "https://cache.example/staging.jpg",
        },
        {
          creative_id: "creative-1",
          environment: "production",
          last_synced_at: "2026-05-21T02:00:00.000Z",
          supabase_thumbnail_url: "https://cache.example/production.jpg",
        },
      ],
      { environment: "production" },
    );

    assert.equal(row?.supabase_thumbnail_url, "https://cache.example/production.jpg");
  });

  it("falls back to a cached duplicate when the current environment is uncached", () => {
    const row = bestCreativeMediaRow(
      [
        {
          creative_id: "creative-1",
          environment: "production",
          last_synced_at: "2026-05-22T02:00:00.000Z",
          supabase_thumbnail_url: null,
        },
        {
          creative_id: "creative-1",
          environment: "staging",
          last_synced_at: "2026-05-21T02:00:00.000Z",
          supabase_thumbnail_url: "https://cache.example/staging.jpg",
        },
      ],
      { environment: "production" },
    );

    assert.equal(row?.environment, "staging");
    assert.equal(row?.supabase_thumbnail_url, "https://cache.example/staging.jpg");
  });

  it("uses the current environment when no duplicate has cached media", () => {
    const row = bestCreativeMediaRow(
      [
        {
          creative_id: "creative-1",
          environment: "staging",
          last_synced_at: "2026-05-22T02:00:00.000Z",
          supabase_thumbnail_url: null,
        },
        {
          creative_id: "creative-1",
          environment: "production",
          last_synced_at: "2026-05-21T02:00:00.000Z",
          supabase_thumbnail_url: null,
        },
      ],
      { environment: "production" },
    );

    assert.equal(row?.environment, "production");
  });
});
