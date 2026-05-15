# Sync Architecture

## Flow

1. Vercel Cron calls `GET /api/cron/sync` daily at `13:00 UTC`.
2. The route validates `Authorization: Bearer $CRON_SECRET`.
3. `syncMetaAds()` validates Meta token permissions and refreshes the latest `META_INCREMENTAL_SYNC_DAYS` days, defaulting to 90.
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

## Historical Backfill

The `/admin/backfill` page creates and manages Supabase-backed historical Meta Ads backfill jobs and is surfaced in the main navigation for users with backfill permission. Admin users can enter `CRON_SECRET` for protected sync actions; marketing users have read-only visibility into coverage, jobs, and data health.

Backfill jobs split each configured Meta ad account into monthly chunks from `META_BACKFILL_START_DATE` through the requested end date. Each chunk calls Meta insights with `time_range[since]` and `time_range[until]`, then upserts daily ad-level rows by `meta_account_id`, `ad_id`, and `date_start`, so retries do not duplicate data. Empty Meta responses are treated as completed chunks.

Routes:

- `GET /api/meta/backfill` lists recent jobs, chunks, and monthly account coverage.
- `POST /api/meta/backfill` creates a new monthly chunk job.
- `PATCH /api/meta/backfill` pauses, resumes, cancels, or retries failed chunks.
- `POST /api/meta/backfill/run` processes the next queued chunk batch manually.
- `GET /api/cron/meta-backfill` processes queued chunks from Vercel Cron every 15 minutes.

Dashboard and ad-hoc analysis queries read stored history through `aggregate_meta_daily_insights`, a Postgres RPC that groups and filters server-side. This replaces raw insight row limits for large date ranges.

The inbox sync button calls `POST /api/social-inbox/sync`. It validates the social inbox Meta permissions, fetches managed Page metadata, stores the connected Instagram thread/comment data that Meta returns, and records source-specific warnings in `meta_social_sync_runs`. This manual sync is a proof-of-data path; Meta Webhooks should be added next for real-time message/comment delivery.

`/api/meta/webhook` is the signed Meta callback for future message/comment delivery. `GET` handles Meta verification using `META_WEBHOOK_VERIFY_TOKEN`; `POST` verifies `X-Hub-Signature-256`, normalizes message/comment events, and stores them in the social inbox tables. This is the preferred path for Facebook Messenger events when Meta's historical conversations edge does not return data.

Production is subscribed to the HP Page for Messenger message fields including `messages`, `message_echoes`, `messaging_postbacks`, and `standby`. Manual sync can prove Instagram historical data flow; Facebook Messenger should be tested by sending a new Page message after webhook subscription. `standby` events are normalized into the same message table so the app can capture messages routed through Messenger handover/secondary receiver paths.

## AI Retrieval

Reports and chat call the Supabase-backed dashboard retrieval layer before invoking OpenAI. The retrieved context includes:

- overview metrics
- HP vs VVS comparison
- campaign, ad set, and creative performance
- fatigue risk
- opportunities and underperformers
- source transparency
