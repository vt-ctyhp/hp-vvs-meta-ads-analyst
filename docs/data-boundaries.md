# Ads Analyst Data Boundaries

This app is being hardened so Sales/ERP Core remains the system of record and
Ads Analyst behaves as a constrained analytics module.

## Ownership

Sales/ERP Core owns customer, appointment, task, payment, document, order,
storage, and identity tables. Ads Analyst must not insert, update, upsert, or
delete those rows.

Ads Analyst owns Meta ads history, AI analysis, website funnel analytics, social
analytics, and sync/backfill job state. Those writes must move to dedicated
non-service module credentials in later phases.

The source registry is `src/lib/data-boundaries.ts`. The test
`tests/data-boundaries.test.ts` fails when source code mutates a Sales/ERP Core
table.

## Phase 1 Guardrails

- User-management writes in `/api/users` are disabled from the Ads Analyst app.
- `/api/health` reports the Ads Analyst data-boundary runtime status.
- `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=true` makes health fail while a
  Supabase service-role key is configured or module credentials are missing.
- The current service-role runtime is transitional only. Later phases replace it
  with limited module roles.

## Phase 2 Database Boundary

Migration `20260519090000_ads_analyst_data_boundary.sql` defines the database
boundary but has not been applied by this branch.

- Creates `analytics` and `audit` schemas.
- Creates `ads_analyst_web`, `ads_analyst_worker`, and `ads_analyst_ingest`
  as no-login, no-inherit, no-bypass-RLS roles.
- Explicitly revokes Ads Analyst privileges from Sales/ERP Core tables.
- Grants Ads Analyst roles only analyst-owned table privileges.
- Adds RLS policies for analyst-owned tables so future module credentials can
  work without the Supabase service role key.
- Adds `analytics.sales_appointment_conversions_v1` as a derived read-only
  Acuity conversion view.
- Adds `analytics.ads_analyst_identity_profiles_v1` as a read-only identity
  profile view for login/access checks.

## Phase 3 Environment Boundary

Migration `20260519093000_ads_analyst_environment_scope.sql` defines the
production/staging fence for analyst-owned tables. It has not been applied by
this branch.

- Adds an `environment` label to every Ads Analyst-owned table.
- The only valid environments are `production` and `staging`; the default is
  `production`.
- Adds RLS helpers that read `ads_analyst_environment` or `app_environment`
  from the module JWT claims.
- Replaces Phase 2's broad module RLS checks with policies that only allow a
  module role to select/write rows from its own environment.
- Does not touch Sales/ERP Core tables.
- Does not replace natural-key unique constraints yet. Until application
  upserts include `environment`, a staging write that collides with production
  should be denied by RLS rather than allowed to overwrite production.

## Phase 4 Limited Runtime Path

Phase 4 adds the application runtime path for limited module credentials. It is
still staged behind environment flags and has not been deployed or applied to
Supabase by this branch.

- `createAdsAnalystClient(role)` uses the legacy service-role client by default.
- When `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=true`, it uses the role-specific
  module JWT for `ads_analyst_web`, `ads_analyst_worker`, or
  `ads_analyst_ingest`.
- Analyst-owned write payloads add `environment` only in limited mode, so the
  current production deployment does not break before Phase 3 is applied.
- Reads and writes are split by role:
  - `web` reads dashboard data and writes human-created AI/dashboard state.
  - `worker` runs Meta sync, social sync, backfill, reconciliation, and job
    state.
  - `ingest` writes website events and Meta webhook ingestion rows.
- User/profile reads use the read-only analytics identity view only in limited
  mode; legacy mode keeps the existing table reads until migrations are applied.
- Migration `20260519100000_ads_analyst_environment_aware_runtime.sql` makes
  security-definer backfill claims explicitly filter by environment.

## Phase 5 Environment-Scoped Unique Keys

Migration `20260519103000_ads_analyst_environment_scoped_unique_keys.sql`
allows staging and production to keep separate analyst-owned rows for the same
Meta, social, website, and brand-voice natural keys. It has not been applied by
this branch.

- Adds replacement unique constraints that include `environment`.
- Creates the environment-scoped active brand-voice partial unique index.
- Drops the older unscoped natural-key constraints only after the replacement
  constraints are defined.
- Leaves primary keys and per-job backfill chunk uniqueness alone; those do not
  block staging from having its own Meta history.
- Does not touch Sales/ERP Core tables.

## Not Done Yet

- No Supabase migrations are applied.
- No live database data is read or written.
- Limited module JWTs are not generated or installed yet.
- `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS` must stay unset/false until the Phase
  2, Phase 3, Phase 4, and Phase 5 migrations are applied and the JWTs exist.
- `ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS` must stay unset/false until Phase
  5 is applied. Before that, staging writes that collide with production natural
  keys should fail closed rather than overwrite production rows.
