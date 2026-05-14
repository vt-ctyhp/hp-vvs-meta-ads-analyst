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
- `ai_reports`
- `ai_chat_sessions`
- `ai_chat_messages`
- `sync_runs`

RLS is enabled on all tables. The application uses the server-side service role key for internal reads/writes. No public RLS policies are created by default.

Important indexes:

- insights by date and account/date
- campaign/ad lookup keys
- creative preview source
- latest sync runs
- latest reports
