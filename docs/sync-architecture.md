# Sync Architecture

## Flow

1. Vercel Cron calls `GET /api/cron/sync` daily at `13:00 UTC`.
2. The route validates `Authorization: Bearer $CRON_SECRET`.
3. `syncMetaAds()` validates Meta token permissions.
4. Configured ad accounts are fetched from Meta Marketing API. HP is required; VVS is optional until access is ready.
5. Supabase receives upserts for:
   - brands
   - ad accounts
   - campaigns
   - ad sets
   - ads
   - creatives
   - daily ad-level insights
   - sync run status and metrics

## Preview Refresh

Creative preview metadata is refreshed during sync. Storage priority:

1. Meta `thumbnail_url`
2. creative `image_url`
3. ad preview iframe/html
4. video thumbnail
5. fallback placeholder

Meta preview/image URLs can expire, so previews are treated as refreshable metadata, not permanent assets.

## Manual Sync

The dashboard sync button calls `POST /api/sync`. It uses the same read-only sync path as cron and records a `sync_runs` entry with trigger `manual`.

## AI Retrieval

Reports and chat call the Supabase-backed dashboard retrieval layer before invoking OpenAI. The retrieved context includes:

- overview metrics
- HP vs VVS comparison
- campaign, ad set, and creative performance
- fatigue risk
- opportunities and underperformers
- source transparency
