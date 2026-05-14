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

During sync, campaigns, ad sets, ads, and daily insight rows are classified into HP internal campaign umbrellas. Classification uses campaign names first and ad set names as fallback or refinement. Manual overrides in `campaign_umbrella_overrides` take precedence.

Current umbrella labels:

- `Facebook US Product`
- `Book Appts US`
- `US Promotions (WKDS / OOAK)`
- `Cash for Gold US`
- `Facebook VN Product`
- `VN Promotions (WKDS / OOAK)`
- `Excluded / Non-umbrella`
- `Needs review`

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

The inbox sync button calls `POST /api/social-inbox/sync`. It validates the social inbox Meta permissions, fetches managed Page metadata, stores the connected Instagram thread/comment data that Meta returns, and records source-specific warnings in `meta_social_sync_runs`. This manual sync is a proof-of-data path; Meta Webhooks should be added next for real-time message/comment delivery.

## AI Retrieval

Reports and chat call the Supabase-backed dashboard retrieval layer before invoking OpenAI. The retrieved context includes:

- overview metrics
- HP vs VVS comparison
- campaign, ad set, and creative performance
- fatigue risk
- opportunities and underperformers
- source transparency
