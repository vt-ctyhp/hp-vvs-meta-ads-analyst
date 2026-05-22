-- Track creative cache attempts so expired Meta CDN URLs do not block the
-- cache worker on the same first page of rows forever.

alter table public.meta_creatives
  add column if not exists creative_cache_attempted_at timestamptz,
  add column if not exists creative_cache_error text;

create index if not exists meta_creatives_cache_attempted_at_idx
  on public.meta_creatives (creative_cache_attempted_at nulls first)
  where supabase_thumbnail_url is null or supabase_image_url is null;

comment on column public.meta_creatives.creative_cache_attempted_at is
  'Last time /api/cron/cache-thumbnails attempted to cache this creative. '
  'Catalog refresh clears this marker when it stores fresh Meta CDN URLs.';

comment on column public.meta_creatives.creative_cache_error is
  'Most recent thumbnail/image cache failure reason. Cleared after a fully '
  'successful cache or when catalog refresh stores fresh Meta CDN URLs.';
