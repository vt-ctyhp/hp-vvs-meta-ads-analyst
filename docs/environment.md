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

Optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Chat/report model. |
| `OPENAI_FAST_MODEL` | `gpt-5.4-nano` | Fast model for ad-hoc analysis spec generation. |
| `OPENAI_DEEP_MODEL` | `gpt-5.5` | Deep model for optional ad-hoc analysis interpretation. |
| `META_API_VERSION` | `v24.0` | Meta Graph API version. |
| `META_VVS_AD_ACCOUNT_ID` | unset | Optional VVS ad account id, with or without `act_`. Add when VVS access is ready. |
| `META_INCREMENTAL_SYNC_DAYS` | `90` | Recent history refreshed by the daily Meta Ads sync. Produces a Meta `last_Nd` date preset unless `META_SYNC_DATE_PRESET` is set. |
| `META_SYNC_DATE_PRESET` | unset | Explicit Meta `date_preset` override for the regular daily sync. |
| `META_BACKFILL_START_DATE` | `2007-01-01` | Default start date for all-available historical backfill jobs. |
| `META_BACKFILL_CHUNKS_PER_RUN` | `1` | Number of monthly account chunks processed by each `/api/cron/meta-backfill` run. Keep small for Vercel's function timeout. |
| `META_SOCIAL_SYNC_CONVERSATION_LIMIT` | `25` | Max recent conversations pulled per Page/platform during manual inbox sync. |
| `META_SOCIAL_SYNC_MESSAGE_THREAD_LIMIT` | `10` | Max synced conversation threads where message bodies are fetched per run. |
| `META_SOCIAL_SYNC_MESSAGE_LIMIT` | `25` | Max messages pulled per synced thread. |
| `META_SOCIAL_SYNC_MEDIA_LIMIT` | `20` | Max recent Instagram media items scanned for comments. |
| `META_SOCIAL_SYNC_FEED_LIMIT` | `15` | Max recent Facebook Page feed items scanned for comments when Meta permits the feed read. |
| `META_WEBHOOK_VERIFY_TOKEN` | unset | Secret verify token used by Meta to validate `/api/meta/webhook`. Required before enabling Meta webhooks. |

Do not commit `.env`, `.env.local`, or downloaded key material.
