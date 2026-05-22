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

Website event ingestion stores approximate IP-derived country, region, city, and
timezone for aggregate funnel analytics. Raw IP addresses are not stored; the
existing `ip_hash` remains a salted one-way hash. The app does not store
postal code, latitude, longitude, or browser-supplied location payloads.

AI reply suggestions are generated server-side only. The browser sends the selected source ID and optional staff guidance; the server retrieves compact Supabase context, applies the active brand voice prompt, calls OpenAI, stores the draft in `ai_reply_suggestions`, and returns it for human editing. The OpenAI API key, Supabase service role key, and Meta tokens are never exposed to the browser.

The Meta webhook endpoint verifies `X-Hub-Signature-256` with `META_APP_SECRET` before storing inbound event payloads. The webhook verification token is stored only as `META_WEBHOOK_VERIFY_TOKEN` in the runtime environment.

## Secret Handling

- Secrets are read from runtime environment variables.
- The Supabase service role key is only used in server-side modules and route handlers.
- The browser bundle does not receive Meta, OpenAI, cron, or service role secrets.
- `.env*` files are ignored by Git.

## ERP Data Boundary

Sales/ERP Core data is the system of record. Ads Analyst must not write
Sales/ERP Core tables such as customers, appointments, tasks, payments,
documents, users, or roles. The ownership registry lives in
`src/lib/data-boundaries.ts`, and the static boundary test fails if source code
mutates Sales/ERP-owned tables.

The current service-role runtime is a transitional risk because Supabase service
role access bypasses RLS. Later hardening phases replace it with limited Ads
Analyst module credentials. Set `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=true` to
make `/api/health` fail until service-role access is removed and module
credentials are configured.

The Phase 2 data-boundary migration creates dedicated Ads Analyst module roles,
grants them only analyst-owned table privileges, and exposes Sales/ERP data only
through narrow read-only views in the `analytics` schema. The migration is not
applied automatically by the application.

The Phase 3 environment-boundary migration adds a production/staging row fence
inside analyst-owned tables. Limited module JWTs should include
`ads_analyst_environment` or `app_environment`; RLS then allows those credentials
to see and write only rows for that environment. This does not protect any
runtime that still uses the Supabase service-role key, because service-role
access bypasses RLS.

The Phase 4 runtime path keeps legacy service-role behavior until
`ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=true`. In limited mode, the app uses
separate web, worker, and ingest module credentials and adds the current
`ADS_ANALYST_ENVIRONMENT` to analyst-owned writes. Prefer Supabase secret API
keys with a role-scoped `secret_jwt_template`; manually minted JWTs remain
supported when a project signing key is managed separately. The backfill
chunk-claim RPC is replaced by an environment-aware version because it is
`security definer` and must not rely on RLS alone.

The Phase 5 unique-key migration is the step that makes staging usable for full
sync testing in the shared Supabase project. It replaces analyst natural-key
uniqueness like Meta ad id, social message id, and website event id with
environment-scoped uniqueness, so staging can store its own copy without
overwriting or colliding with production analyst rows.

## Internal Access

This app is intended for internal use. Before production launch, keep Vercel Deployment Protection enabled or place the app behind the organization’s preferred SSO/access layer.

## AI Source Transparency

AI reports and chat responses are generated from retrieved Supabase data. Each stored report/message includes:

- time range analyzed
- ad accounts analyzed
- record counts by table
