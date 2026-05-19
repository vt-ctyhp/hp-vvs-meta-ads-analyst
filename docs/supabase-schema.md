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
- `website_sessions`
- `website_events`
- `brand_voice_guidelines`
- `reply_playbook_entries`
- `social_thread_summaries`
- `ai_reply_suggestions`

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
- social inbox platform/thread/comment lookups
- website funnel date, event name, page group, session, and Meta event lookups
- active brand voice prompt lookup by brand/language
- saved reply suggestion lookup by source thread/comment

## Data Boundary Views

- `analytics.sales_appointment_conversions_v1` exposes derived Acuity booking
  conversion fields for Ads Analyst without exposing customer PII, notes,
  payments, documents, tasks, or raw appointment payloads.
- `analytics.ads_analyst_identity_profiles_v1` exposes read-only identity
  profile fields for Ads Analyst login/access checks without granting user or
  role mutation paths.

## Environment Scope

Phase 3 adds `environment` to every Ads Analyst-owned table. Allowed values are
`production` and `staging`, with `production` as the default for existing ERP
connected analytics rows when the migration is applied.

Module-role RLS policies compare each row's `environment` to the runtime JWT
claim `ads_analyst_environment` or `app_environment`. This keeps staging and
production module credentials from reading or writing each other's analyst rows.

Legacy unique constraints are intentionally left in place until the application
write paths include `environment` in their payloads and `onConflict` keys.

Phase 4 updates environment-sensitive database functions:

- `public.claim_meta_ads_backfill_chunks` explicitly claims only chunks and jobs
  matching `analytics.current_ads_analyst_environment()`.
- `public.meta_ads_history_coverage` reports only accounts and insight rows for
  the caller environment.

This matters because the claim function is `security definer`; it must filter
environment in the function body instead of depending on caller RLS.

Phase 5 replaces unscoped analyst natural-key uniqueness with environment-aware
uniqueness for:

- Meta catalog and insight rows
- campaign umbrella overrides
- social pages, threads, messages, comments, and thread summaries
- brand voice guideline versions and active guideline selection
- website sessions and events

After Phase 5 is applied, `ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS=true`
can be enabled so application write payloads and upserts target the new unique
constraints.
