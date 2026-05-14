# Supabase Schema

Migration: `supabase/migrations/20260514010000_meta_ads_ai_analyst.sql`

Tables:

- `brands`
- `meta_ad_accounts`
- `meta_campaigns`
- `meta_ad_sets`
- `meta_ads`
- `meta_creatives`
- `meta_daily_insights`
- `campaign_umbrella_overrides`
- `ai_reports`
- `ai_chat_sessions`
- `ai_chat_messages`
- `ai_analysis_dashboards`
- `ai_analysis_runs`
- `sync_runs`
- `meta_social_pages`
- `meta_social_threads`
- `meta_social_messages`
- `meta_social_comments`
- `meta_social_sync_runs`

Campaign umbrella metadata is stored on:

- `meta_campaigns`
- `meta_ad_sets`
- `meta_ads`
- `meta_daily_insights`

Each table includes:

- `campaign_umbrella`
- `campaign_umbrella_confidence`
- `campaign_umbrella_source`
- `campaign_umbrella_reason`

`campaign_umbrella_overrides` lets operators force a campaign, ad set, or ad into a specific internal umbrella without renaming Meta entities.

RLS is enabled on all tables. The application uses the server-side service role key for internal reads/writes. No public RLS policies are created by default.

Important indexes:

- insights by date and account/date
- campaign/ad lookup keys
- campaign umbrella filters
- creative preview source
- latest sync runs
- latest reports
- latest ad-hoc analysis dashboards and run history
