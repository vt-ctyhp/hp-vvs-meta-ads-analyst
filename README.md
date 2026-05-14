# HP/VVS Meta Ads AI Analyst

Internal Meta Ads intelligence app for HP and VVS.

## Architecture

Meta Marketing API -> Supabase -> AI analysis layer -> Next.js dashboard/chat -> Vercel.

The ads integration only uses read endpoints. It does not request or use `ads_management`, and it contains no code paths for editing, pausing, creating, deleting, duplicating, or modifying campaigns, ad sets, ads, budgets, targeting, or creatives.

## Cloud Setup

1. Link Supabase:

   ```bash
   npx supabase@latest link --project-ref <project-ref>
   npx supabase@latest db push
   npx supabase@latest gen types typescript --linked > src/lib/database.types.ts
   ```

2. Configure Vercel environment variables for Preview and Production:

   ```bash
   vercel env add NEXT_PUBLIC_SUPABASE_URL
   vercel env add NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   vercel env add SUPABASE_SERVICE_ROLE_KEY
   vercel env add OPENAI_API_KEY
   vercel env add META_APP_ID
   vercel env add META_APP_SECRET
   vercel env add META_ACCESS_TOKEN
   vercel env add META_HP_AD_ACCOUNT_ID
   vercel env add CRON_SECRET
   ```

`META_VVS_AD_ACCOUNT_ID` is optional until VVS access is ready.

3. Deploy a preview:

   ```bash
   vercel
   ```

Production deploys should only be run after explicit approval:

```bash
vercel --prod
```

## Runtime Routes

- `/` executive dashboard, creative leaderboard, gallery, report controls, chat
- `/inbox` Facebook/Instagram inbox readiness page and human-approved reply UI shell
- `/api/sync` manual read-only Meta sync
- `/api/social-inbox` latest stored social inbox threads, messages, comments, and sync runs
- `/api/social-inbox/sync` manual Facebook/Instagram inbox/comment sync
- `/api/meta/webhook` Meta webhook callback for future Facebook/Instagram message/comment events
- `/api/cron/sync` Vercel Cron sync, protected by `CRON_SECRET`
- `/api/reports` AI executive report generation
- `/api/chat` AI executive chat
- `/api/health` environment and Meta permission validation

## Campaign Umbrellas

HP campaigns are classified into internal campaign umbrellas during sync. The classifier uses campaign names first, then ad set names for fallback/refinement, and stores the result on campaigns, ad sets, ads, and daily insights. The dashboard can filter campaigns, ad sets, creatives, and trends by umbrella.

Manual corrections can be stored in `campaign_umbrella_overrides` without changing Meta campaign/ad set/ad names.

## Meta Permissions

Ads sync:

- `ads_read`
- `read_insights` if required by the Meta app/account for insights reads.

Social inbox readiness:

- `pages_show_list`
- `pages_manage_metadata`
- `pages_read_engagement`
- `pages_messaging`
- `instagram_basic`
- `instagram_manage_messages`
- `instagram_manage_comments`

Social reply readiness:

- `pages_manage_engagement` for Facebook Page comment reply/moderation workflows.

Forbidden:

- `ads_management`

If the token is missing required ads sync permissions, includes `ads_management`, or cannot read the configured HP account, sync stops and returns the exact setup issue. Social reply features must still require a human click before sending.
