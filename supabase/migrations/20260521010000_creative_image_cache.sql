-- Phase 2 thumbnail cache: persist the FULL-RESOLUTION image as well.
--
-- Phase 1 (migration 20260521000000_creative_thumbnails_cache) cached the
-- ~150x150 thumbnail Meta returns in `creative.thumbnail_url`. That's
-- perfect for the 32x32 tree-table cell but the drawer renders an
-- aspect-square preview ~400px wide — at that size the thumbnail
-- pixelates noticeably. Phase 2 caches `creative.image_url` (full
-- 1080x1080-ish original) into the same bucket so the drawer also has
-- a permanent, sharp source.
--
-- Reuses the same `creative-thumbnails` bucket and the same RLS policies
-- — only one new column on meta_creatives is needed.

alter table public.meta_creatives
  add column if not exists supabase_image_url text;

comment on column public.meta_creatives.supabase_image_url is
  'Permanent Supabase Storage URL for the full-resolution creative image. '
  'Stamped by /api/cron/cache-thumbnails. The drawer prefers this over '
  'supabase_thumbnail_url so the larger preview stays sharp.';
