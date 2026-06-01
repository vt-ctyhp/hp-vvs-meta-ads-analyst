# Environment Variables

Required:

| Variable | Scope | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Browser/server | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser/server | Publishable or anon key. Do not use the service role key here. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only | Used by route handlers and server components. Never expose to client code. |
| `OPENAI_API_KEY` | Server only | Used for reports and chat. |
| `META_APP_ID` | Server only | Meta app identifier for operator traceability. |
| `META_APP_SECRET` | Server only | Stored for token/app setup traceability. Not exposed to client code. |
| `META_ACCESS_TOKEN` | Server only | Meta token used by ads sync and planned social inbox. Must have `ads_read`; social inbox readiness also expects Page/Instagram messaging and comment permissions. Must not have `ads_management`. |
| `META_HP_AD_ACCOUNT_ID` | Server only | HP ad account id, with or without `act_`. |
| `CRON_SECRET` | Server only | Used to authorize `/api/cron/sync`. |
| `WEBSITE_EVENT_SHARED_SECRET` | Server only | Shared secret used by the booking API to send confirmed website conversions into `/api/website/conversions`. |

Optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Chat/report model. |
| `OPENAI_FAST_MODEL` | `gpt-5.4-nano` | Fast model for ad-hoc analysis spec generation. |
| `OPENAI_DEEP_MODEL` | `gpt-5.5` | Deep model for optional ad-hoc analysis interpretation. |
| `META_API_VERSION` | `v24.0` | Meta Graph API version. |
| `META_INSTAGRAM_ACCESS_TOKEN` | unset | Optional Instagram User access token for Instagram DM conversation sync and reply delivery through `graph.instagram.com`. Required for current Instagram Messaging API flows. |
| `META_INSTAGRAM_USER_ID` | unset | Optional Instagram professional account id that owns `META_INSTAGRAM_ACCESS_TOKEN`; prevents applying one IG token to the wrong connected Page. |
| `META_VVS_AD_ACCOUNT_ID` | unset | Optional VVS ad account id, with or without `act_`. Add when VVS access is ready. |
| `META_INCREMENTAL_SYNC_DAYS` | `28` | Recent insight window refreshed by regular Meta Ads sync. The default matches Meta's documented point after which Insights no longer change; older stored history remains in Supabase unless an explicit backfill or month re-sync runs. |
| `META_SYNC_DATE_PRESET` | unset | Legacy preset override for code paths that still opt into Meta `date_preset`; regular sync now uses an explicit recent `time_range`. |
| `META_BACKFILL_START_DATE` | `2007-01-01` | Default start date for all-available historical backfill jobs. |
| `META_BACKFILL_CHUNKS_PER_RUN` | `1` | Number of monthly account chunks processed by each `/api/cron/meta-backfill` run. Keep small for Vercel's function timeout. |
| `META_SOCIAL_SYNC_CONVERSATION_LIMIT` | `25` | Max recent conversations pulled per Page/platform during manual inbox sync. |
| `META_SOCIAL_SYNC_MESSAGE_THREAD_LIMIT` | `10` | Max synced conversation threads where message bodies are fetched per run. |
| `META_SOCIAL_SYNC_MESSAGE_LIMIT` | `25` | Max messages pulled per synced thread. |
| `META_SOCIAL_SYNC_MEDIA_LIMIT` | `20` | Max recent Instagram media items scanned for comments. |
| `META_SOCIAL_SYNC_FEED_LIMIT` | `15` | Max recent Facebook Page feed items scanned for comments when Meta permits the feed read. |
| `META_WEBHOOK_VERIFY_TOKEN` | unset | Secret verify token used by Meta to validate `/api/meta/webhook`. Required before enabling Meta webhooks. |
| `WEBSITE_EVENT_ALLOWED_ORIGINS` | HP production and Shopify domains | Comma-separated exact origins that can send browser website funnel events. |
| `WEBSITE_EVENT_ALLOWED_ORIGIN_WILDCARDS` | `*.shopifypreview.com` | Comma-separated wildcard host patterns for Shopify draft theme preview domains. |
| `WEBSITE_EVENT_IP_HASH_SALT` | internal fallback | Optional salt for hashing request IPs before storage. |
| `ADS_ANALYST_ENVIRONMENT` | `production` | Future deployment label used when issuing limited module JWTs and writing analyst-owned rows. Use `staging` for the revamp/staging deployment. |
| `SUPABASE_ADS_ANALYST_WEB_KEY` | unset | Preferred limited Ads Analyst web credential. Use a Supabase secret API key whose `secret_jwt_template` role is `ads_analyst_web` and whose environment claim is `staging` or `production`. |
| `SUPABASE_ADS_ANALYST_WORKER_KEY` | unset | Preferred limited Ads Analyst worker credential for gated sync/backfill jobs. Use role `ads_analyst_worker` with the matching environment claim. |
| `SUPABASE_ADS_ANALYST_INGEST_KEY` | unset | Preferred limited Ads Analyst ingestion credential for website/social event writes. Use role `ads_analyst_ingest` with the matching environment claim. |
| `SUPABASE_ADS_ANALYST_WEB_JWT` | unset | Alternate limited Ads Analyst web module credential when manually minted JWTs are used instead of role-scoped secret API keys. JWT should use role `ads_analyst_web` and include `ads_analyst_environment` or `app_environment`. |
| `SUPABASE_ADS_ANALYST_WORKER_JWT` | unset | Alternate limited Ads Analyst worker credential for gated sync/backfill jobs. JWT should use role `ads_analyst_worker` and include the matching environment claim. |
| `SUPABASE_ADS_ANALYST_INGEST_JWT` | unset | Alternate limited Ads Analyst ingestion credential for website/social event writes. JWT should use role `ads_analyst_ingest` and include the matching environment claim. |
| `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS` | unset | Set to `true` after module credentials replace service-role access. Health fails while service-role access remains configured. |
| `ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS` | unset | Keep unset until Phase 5 has replaced unique constraints with environment-scoped keys. When true, write payloads and upsert conflict targets include `environment`. |

Website event ingestion also reads Vercel's approximate IP geolocation headers
for browser-originated events. The app stores only country, region, city, and
timezone for aggregate analytics; it does not store raw IP, postal code,
latitude, or longitude.

Do not commit `.env`, `.env.local`, or downloaded key material.
