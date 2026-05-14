# HP/VVS Meta Ads AI Analyst

Internal read-only Meta Ads intelligence app for HP and VVS.

## Architecture

Meta Marketing API -> Supabase -> AI analysis layer -> Next.js dashboard/chat -> Vercel.

The app only uses read endpoints. It does not request or use `ads_management`, and it contains no code paths for editing, pausing, creating, deleting, duplicating, or modifying campaigns, ad sets, ads, budgets, targeting, or creatives.

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
   vercel env add META_VVS_AD_ACCOUNT_ID
   vercel env add CRON_SECRET
   ```

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
- `/api/sync` manual read-only Meta sync
- `/api/cron/sync` Vercel Cron sync, protected by `CRON_SECRET`
- `/api/reports` AI executive report generation
- `/api/chat` AI executive chat
- `/api/health` environment and Meta permission validation

## Meta Permissions

Allowed:

- `ads_read`
- `read_insights`

Forbidden:

- `ads_management`

If the token is missing read permissions or includes `ads_management`, sync stops and returns the exact setup issue.
