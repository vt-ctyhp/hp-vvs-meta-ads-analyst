# Sync Architecture

## Flow

1. Vercel Cron calls `GET /api/cron/sync` daily at `13:00 UTC`.
2. The route validates `Authorization: Bearer $CRON_SECRET`.
3. `syncMetaAds()` validates Meta token permissions and refreshes the latest `META_INCREMENTAL_SYNC_DAYS` days of insights, defaulting to 28.
4. Configured ad accounts are fetched from Meta Marketing API. HP is required; VVS is optional until access is ready.
5. Supabase receives upserts for:
   - brands
   - ad accounts
   - campaigns
   - ad sets
   - ads and creatives only for explicit catalog refresh runs
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

Creative preview metadata is refreshed during sync. Display images use only
durable Supabase-cached media:

1. `supabase_thumbnail_url`
2. `supabase_image_url`
3. fallback placeholder

Meta preview/image URLs can expire. Keep them as preview/detail links or cache
sources only; do not feed them directly into image `src` values.

## Manual Sync

The dashboard sync button calls `POST /api/sync`. The default button uses the same cheap incremental path as cron, records trigger `manual`, and refreshes only the recent insight window against the stored Supabase catalog. This preserves locked historical rows and avoids walking Meta's large `/ads` and creative edges during normal dashboard operation.

Operate also exposes an explicit catalog refresh action for admin repair work. That action calls the same route with `mode=catalog`, records trigger `manual_catalog`, and refreshes ads, creatives, previews, and ranking diagnostics in addition to recent insights. Use it when ads or creatives are missing, not as the normal data-refresh path.

Regular sync does not pull historical insight ranges. Stored historical rows remain in Supabase and dashboard reads use `aggregate_meta_daily_insights`. Rows before the finalized cutoff are not replaced by regular sync; explicit backfill or month re-sync jobs are the historical repair paths. The default cutoff is 28 days because Meta documents Insights as refreshed frequently but unchanged after 28 days. Sync date windows use California calendar dates to match the dashboard's expected ad-account reporting timezone.

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
