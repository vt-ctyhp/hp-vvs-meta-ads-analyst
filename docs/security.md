# Security Notes

## Meta Access Boundaries

The ads sync integration validates token permissions before sync:

- Sync requires `ads_read`.
- `read_insights` is optional and reported as missing if absent.
- Sync fails if `ads_management` is granted.
- The code only calls read endpoints for accounts, campaigns, ad sets, ads, creatives, previews, and insights.

There are no UI controls or API routes for mutating Meta campaigns, ad sets, ads, budgets, targeting, creatives, or statuses.

Social inbox permissions are validated separately from ads sync. Message/comment reply features must require explicit human approval before any Meta send/reply endpoint is called. AI may draft suggested replies, but it must not send them automatically.

The social inbox sync stores message/comment content and metadata in Supabase. Page access tokens are used server-side only to call Meta and are redacted before Page metadata is stored.

## Secret Handling

- Secrets are read from runtime environment variables.
- The Supabase service role key is only used in server-side modules and route handlers.
- The browser bundle does not receive Meta, OpenAI, cron, or service role secrets.
- `.env*` files are ignored by Git.

## Internal Access

This app is intended for internal use. Before production launch, keep Vercel Deployment Protection enabled or place the app behind the organization’s preferred SSO/access layer.

## AI Source Transparency

AI reports and chat responses are generated from retrieved Supabase data. Each stored report/message includes:

- time range analyzed
- ad accounts analyzed
- record counts by table
