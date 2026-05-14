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
| `META_ACCESS_TOKEN` | Server only | Must have `ads_read` and `read_insights`; must not have `ads_management`. |
| `META_HP_AD_ACCOUNT_ID` | Server only | HP ad account id, with or without `act_`. |
| `META_VVS_AD_ACCOUNT_ID` | Server only | VVS ad account id, with or without `act_`. |
| `CRON_SECRET` | Server only | Used to authorize `/api/cron/sync`. |

Optional:

| Variable | Default | Notes |
| --- | --- | --- |
| `OPENAI_MODEL` | `gpt-4.1-mini` | Chat/report model. |
| `META_API_VERSION` | `v24.0` | Meta Graph API version. |

Do not commit `.env`, `.env.local`, or downloaded key material.
