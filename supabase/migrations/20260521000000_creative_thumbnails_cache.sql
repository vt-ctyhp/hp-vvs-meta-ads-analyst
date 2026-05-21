-- Phase 1 thumbnail cache: own the image URL so it stops expiring.
--
-- Meta serves creative thumbnails from `scontent-*.xx.fbcdn.net` as signed
-- URLs that expire in 24-48 hours. We cache the bytes into a public
-- Supabase Storage bucket and persist a permanent URL on meta_creatives,
-- so the tree-table + drawer get stable images across sync intervals.
--
-- Public bucket — ad creatives are non-sensitive (visible in Meta's
-- public Ad Library) and a public URL avoids the overhead of minting
-- signed URLs on every page render.
--
-- This migration is additive and idempotent:
--   1. Creates the `creative-thumbnails` storage bucket (public).
--   2. Adds an RLS policy on storage.objects so ads_analyst_worker can
--      INSERT / UPDATE / DELETE objects inside that bucket. Reads are
--      anonymous because the bucket is public.
--   3. Adds meta_creatives.supabase_thumbnail_url (text, nullable) so the
--      cron job can stamp the permanent URL when it caches the image.

-- 1. Bucket
insert into storage.buckets (id, name, public)
values ('creative-thumbnails', 'creative-thumbnails', true)
on conflict (id) do update set public = excluded.public;

-- 2. Worker write policy. Reads are open because the bucket is public, so
--    we don't need a SELECT policy.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ads_analyst_worker_creative_thumb_write'
  ) then
    create policy ads_analyst_worker_creative_thumb_write
      on storage.objects
      for all
      to ads_analyst_worker
      using (bucket_id = 'creative-thumbnails')
      with check (bucket_id = 'creative-thumbnails');
  end if;

  -- Also grant the web role read access on storage metadata (so the
  -- supabase-js client can read object metadata when needed). The
  -- public-bucket policy already lets anonymous GET fetch the bytes.
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'ads_analyst_web_creative_thumb_read'
  ) then
    create policy ads_analyst_web_creative_thumb_read
      on storage.objects
      for select
      to ads_analyst_web, ads_analyst_worker
      using (bucket_id = 'creative-thumbnails');
  end if;
end$$;

-- 3. Cache column on meta_creatives. Nullable: stays NULL until the cron
--    job mints a permanent URL for that creative.
alter table public.meta_creatives
  add column if not exists supabase_thumbnail_url text;

comment on column public.meta_creatives.supabase_thumbnail_url is
  'Permanent Supabase Storage URL for the cached thumbnail. Stamped by '
  '/api/cron/cache-thumbnails so the dashboard renders stable images '
  'even after the Meta CDN thumbnail_url has expired.';
