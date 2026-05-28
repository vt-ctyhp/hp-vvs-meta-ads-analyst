# Inbox Metrics Header & Manager View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static "X waiting. Oldest Ym." inbox header with an adaptive, business-hours-aware metrics header (9 metrics across 3 lenses) and add a lead-gated manager rollup at `/m/inbox/team`.
**Architecture:** Approach 3 — live snapshot reads for "right now" metrics + a materialized `meta_inbox_metrics_daily` rollup (pg_cron, every 15 min, per-timezone) for yesterday/historical periods. Reuse the existing `meta_inbox_conversation_events` audit trail (no new audit table) and the existing `buildMetaInboxManagerDashboard.byAssignee` aggregation for the team view. Business-hours math lives in one pure module mirrored by one PL/pgSQL function, kept in lockstep by cross-tested fixtures.
**Tech Stack:** Next.js (app router, server components, force-dynamic), Supabase Postgres + RLS, pg_cron, node:test, @visx charts, Tailwind (Editorial Broadsheet tokens)

**Spec:** docs/superpowers/specs/2026-05-27-inbox-metrics-header-design.md
---

## Orientation for the implementing engineer (read once before Task 1)

You know nothing about this codebase yet. These facts are verified against the real source and will save you hours. Where they contradict the spec, **this section and the per-task notes win** — the spec was written before final schema verification on a few points.

### Verified environment & conventions
- **Test runner:** `node --test --experimental-strip-types tests/<name>.test.ts`. All tests live flat in `tests/*.test.ts`. Use `import { describe, it } from "node:test"` and `import assert from "node:assert/strict"`. Run the whole suite with `npm test`.
- **Typecheck:** `npm run typecheck` (`tsc --noEmit`). **Lint:** `npm run lint` (`eslint`).
- **Imports use explicit `.ts`/`.tsx` extensions** inside `src/lib` and `src/components` (e.g. `import { x } from "./california-time.ts"`). Match the file you are editing. App-router files under `src/app` use the `@/` alias (e.g. `@/lib/social-inbox`).
- **Migrations:** create with `npm run db:migration -- descriptive_name`. The script fetches `origin/main`, then writes `supabase/migrations/<UTCYYYYMMDDHHMM>30_descriptive_name.sql` (seconds component is forced to `30` for this repo — sales-standalone-app-v1 uses `00` on the shared ledger). The generated file already contains a 3-line header comment; append your SQL after it. Validate naming with `npm run db:migrations:check`.
- **No live DB in CI for these tasks.** Migration "tests" in this plan are (a) schema-shape assertions parsed from the `.sql` text, and (b) `npm run db:migrations:check`. Actual `db push` happens on staging per the rollout plan (spec §10) — out of scope for the coding tasks.

### Verified data-access model (critical — differs from spec §9)
The inbox tables are **not** accessed through `auth.uid()` user sessions. App reads/writes go through scoped Supabase JWT clients via `dynamicSupabase("web"|"worker"|"ingest")` (see `src/lib/social-inbox.ts:3889`). RLS on every existing `meta_inbox_*` table uses:
- roles `ads_analyst_web`, `ads_analyst_worker`, `ads_analyst_ingest`
- predicate `analytics.ads_analyst_environment_matches(environment)`
- environment value injected app-side via `withActiveMetaInboxEnvironment({...})` (resolves from `ADS_ANALYST_ENVIRONMENT`).

**Therefore `public.current_app_user_id()` returns NULL in these connections** (no `auth.uid()`). The spec §9/§15.2 RLS predicates that key off `current_app_user_id()` cannot be the security boundary for these scoped clients. **Resolution adopted by this plan:** new tables (`meta_inbox_user_preferences`, `meta_inbox_metrics_daily`) follow the **existing `ads_analyst_*` + environment-match RLS pattern** (copy it verbatim from `20260523090000_meta_inbox_foundation.sql` and `20260524100000_meta_inbox_reply_reliability.sql`). Per-user / per-team narrowing happens in the **application layer** (`inbox-metrics.ts` filters by `profile.appUserId` / `profile.teamIds`), exactly as spec §9 already says for `meta_inbox_metrics_daily` ("Team narrowing happens in the server action layer"). We additionally include the spec's `current_app_user_id()`-based policies as **defense-in-depth policies for the `authenticated` role** (harmless, future-proof for any direct-session access), but they are not load-bearing for v1. This is called out again in Tasks 2–3.

### Verified signatures (use these exact names — the spec drifts in a few places)
- **Access profile:** `getServerAccessProfile()` (`src/lib/server-route-auth.ts:17`) returns `AccessProfile | null` (`src/lib/app-auth.ts:13-24`). The app-user id field is **`appUserId: string | null`** — NOT `profile.id`. There is **no `teamLead` / `teamIds`** field yet; Task 23 adds them. When the spec writes `profile.id` or `profile.teamLead`, map to `profile.appUserId` and the new fields.
- **Metrics-layer profile:** the inbox lib uses a narrower `MetaInboxAccessProfile` (`src/lib/meta-inbox-access.ts:4`): `{ appUserId: string | null; roles: readonly string[]; permissions?: readonly string[] }`. `inbox-metrics.ts` functions take this shape plus the new team fields (we extend it — see Task 11/23).
- **Assignment event emission:** lives in `buildMetaInboxWorkflowMutation` (`src/lib/meta-inbox-workflow.ts:67`, assignment branch lines 95-142). The **single** site that persists the update + inserts `meta_inbox_conversation_events` rows is `updateSocialInboxConversationWorkflow` (`src/lib/social-inbox.ts:868-943`). The event shape it writes: `{ event_type: "assignment_changed", previous_value: { assignedUserId, assignedTeamId }, new_value: { assignedUserId, assignedTeamId }, actor_user_id, event_at, metadata }`. There is exactly one direct `assigned_user_id` write in the codebase: `meta-inbox-workflow.ts:126` (inside the workflow). This makes the facade (Phase 4) simpler than the spec feared.
- **Header render block:** `src/components/social-inbox-client.tsx:394-402` renders, in order: `<InboxEyebrow dashboard syncRun onSync isSyncing syncDisabled />`, `<InboxHealthRow status syncRun />`, `<InboxStatusSentence queue />`, then `<InboxLayoutShell ... />` (line 405). The **mobile** file `src/app/m/inbox/page.tsx` is a *separate* list surface that also shows a "X waiting" sentence — the spec's §7.2 wiring snippet points at it conceptually, but the real swap (Phase 7) is in `social-inbox-client.tsx`. We leave the mobile page alone unless noted.
- **Sync button** currently lives inside `InboxEyebrow` (`inbox-eyebrow.tsx:53-64`) with props `onSync: () => void`, `isSyncing: boolean`, `syncDisabled: boolean`, plus `syncRun` for the freshness label (`formatLastSyncLabel`). The new strip must absorb these (spec §15.3).
- **Manager dashboard:** `buildMetaInboxManagerDashboard(data: DashboardInputData, options?: { now?; days?; filters? })` (`src/lib/meta-inbox-manager-dashboard.ts:135`). Its `byAssignee` rows are `MetaInboxManagerDashboardAssigneeRow` (lines 64-72): `{ assigneeUserId: string | null; label: string; totalConversations; needsReply; missedFollowUps; failedSends; averageFirstResponseMinutes: number | null }`. **Note the field is `assigneeUserId: string | null`** (spec §15.4 wrote `string | "unassigned"` and listed fields that don't all exist — reconcile in Task 33). `averageFirstResponseMinutes` is wall-clock minutes (spec §15.6).
- **Timezone helper:** `src/lib/california-time.ts` exports `CALIFORNIA_TIME_ZONE = "America/Los_Angeles"`, `formatCaliforniaDateTime`, `californiaDateString`. `business-hours.ts` imports `CALIFORNIA_TIME_ZONE` as the default `tz`.
- **Send attempts:** `meta_inbox_send_attempts` columns relevant here: `approved_by uuid`, `sent_at timestamptz`, `status` (sent value is `'sent'`). Existing index `(environment, conversation_id, created_at desc)`. Task 4 adds the `(environment, approved_by, sent_at) WHERE status='sent'` index.
- **Comment actions:** `SocialInboxCommentAction` (`src/lib/social-inbox.ts:430`) has `requested_by`, `completed_at`, `status` (the completed value is **`'succeeded'`**, not `'completed'` — verified at `meta-inbox-manager-dashboard.ts:633`). The spec §5/B3 says `status='completed'`; **use `'succeeded'`**. Flagged again in Task 13.

### Editorial Broadsheet styling tokens (from DESIGN.md, used by existing inbox chrome)
Reuse the classes already in `inbox-eyebrow.tsx` / `inbox-status-sentence.tsx`: `font-title`, `text-hp-ink`, `text-hp-body`, `text-hp-muted`, `border-hp-rule`, `border-hp-rule-soft`, `bg-hp-foundation`, `bg-hp-inset`, `text-signal-warning` (urgency/at-risk; this is the pink channel), `text-signal-positive`, `smallcaps`, `lining-nums`/`oldstyle-nums`. Square corners (no `rounded-*`), hairline borders, never `#000`/`#fff`, no sans-serif.

### Branch & commit hygiene
Work on the existing branch. Commit after each green task with the conventional message shown in the task. Do **not** push or open PRs unless asked. Never amend; always create new commits.

---

## Phase 1 — Schema migrations

> Each migration is created with `npm run db:migration -- <name>` and runs `git fetch` first (needs network). If offline, append `--no-fetch`: `node scripts/new-supabase-migration.mjs <name> --no-fetch`. The command prints the relative path it created — open that exact file and append SQL after the generated header. Migrations are additive only (no drops). After editing, run `npm run db:migrations:check` (must pass). For each migration we also add a tiny schema-shape test that parses the `.sql` text so a regression in the file is caught by `node --test`.

### Task 1: queue_categories business-hours columns + VN backfill

**Files:**
- Create: `supabase/migrations/<generated>_meta_inbox_queue_business_hours.sql`
- Test: `tests/meta-inbox-queue-business-hours-migration.test.ts`

1. - [ ] Write the failing schema-shape test. Create `tests/meta-inbox-queue-business-hours-migration.test.ts`:
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");

   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((name) => name.endsWith(".sql"))
       .find((name) => readFileSync(resolve(MIGRATIONS_DIR, name), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("queue business-hours migration", () => {
     it("adds timezone + business hour columns to meta_inbox_queue_categories", () => {
       const sql = migrationContaining("add column if not exists business_hours_start");
       assert.match(sql, /alter table public\.meta_inbox_queue_categories/i);
       assert.match(sql, /add column if not exists timezone\s+text not null default 'America\/Los_Angeles'/i);
       assert.match(sql, /add column if not exists business_hours_start\s+time not null default '10:00:00'/i);
       assert.match(sql, /add column if not exists business_hours_end\s+time not null default '19:00:00'/i);
       assert.match(sql, /update public\.meta_inbox_queue_categories[\s\S]*set timezone = 'Asia\/Ho_Chi_Minh'[\s\S]*where key = 'vn_product'/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL (no such migration yet):
   `node --test --experimental-strip-types tests/meta-inbox-queue-business-hours-migration.test.ts`
   Expected: `No migration contains: add column if not exists business_hours_start`.
3. - [ ] Create the migration: `npm run db:migration -- meta_inbox_queue_business_hours` (note the printed path). Append after the generated header:
   ```sql
   -- Per-queue business-hours config powering SLA business-time math.
   -- 7 days/week, no holidays (v1). Hours changes apply going forward (no versioning).
   alter table public.meta_inbox_queue_categories
     add column if not exists timezone             text not null default 'America/Los_Angeles',
     add column if not exists business_hours_start time not null default '10:00:00',
     add column if not exists business_hours_end   time not null default '19:00:00';

   -- VN Product queue runs on Vietnam business hours (ICT). The foundation
   -- migration uses key = 'vn_product' (there is no 'vn_%' slug column).
   update public.meta_inbox_queue_categories
      set timezone = 'Asia/Ho_Chi_Minh', updated_at = now()
    where key = 'vn_product';

   comment on column public.meta_inbox_queue_categories.timezone is
     'IANA tz for this queue''s SLA business-time clock. Conversation SLA uses queue tz; personal metrics use user tz.';
   ```
   > NOTE: spec §6.2 wrote `slug LIKE 'vn_%'`, but the real column is `key` and the only VN value is `'vn_product'` (verified `20260523090000_meta_inbox_foundation.sql:309`). Use `key = 'vn_product'`.
4. - [ ] Run the test — expect PASS. Also run `npm run db:migrations:check` (expect no errors) and `npm run typecheck`.
   `node --test --experimental-strip-types tests/meta-inbox-queue-business-hours-migration.test.ts`
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/meta-inbox-queue-business-hours-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add business-hours columns to queue categories

   Adds timezone + business_hours_start/end to meta_inbox_queue_categories
   with PT defaults and an ICT backfill for vn_product, powering the new
   business-hours SLA math.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 2: meta_inbox_user_preferences table + RLS

**Files:**
- Create: `supabase/migrations/<generated>_meta_inbox_user_preferences.sql`
- Test: `tests/meta-inbox-user-preferences-migration.test.ts`

1. - [ ] Write the failing test. Create `tests/meta-inbox-user-preferences-migration.test.ts` (reuse the `migrationContaining` helper inline — copy the helper block from Task 1):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("meta_inbox_user_preferences migration", () => {
     it("creates the table keyed by app_user_id with tz default", () => {
       const sql = migrationContaining("create table if not exists public.meta_inbox_user_preferences");
       assert.match(sql, /user_id\s+uuid primary key/i);
       assert.match(sql, /timezone\s+text not null default 'America\/Los_Angeles'/i);
     });
     it("follows the ads_analyst role + environment RLS pattern", () => {
       const sql = migrationContaining("create table if not exists public.meta_inbox_user_preferences");
       assert.match(sql, /enable row level security/i);
       assert.match(sql, /analytics\.ads_analyst_environment_matches\(environment\)/i);
       assert.match(sql, /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/i);
     });
     it("adds the defense-in-depth current_app_user_id owner policy", () => {
       const sql = migrationContaining("create table if not exists public.meta_inbox_user_preferences");
       assert.match(sql, /public\.current_app_user_id\(\)/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL: `node --test --experimental-strip-types tests/meta-inbox-user-preferences-migration.test.ts`.
3. - [ ] Create the migration: `npm run db:migration -- meta_inbox_user_preferences`. Append:
   ```sql
   -- Inbox-owned, singleton per user. user_id = app_user_id (matches
   -- meta_inbox_team_members.app_user_id), NOT auth.uid(). sales-standalone-app-v1
   -- owns public.users, so we never write there.
   create table if not exists public.meta_inbox_user_preferences (
     environment text not null default analytics.current_ads_analyst_environment()
       check (environment in ('production', 'staging')),
     user_id     uuid not null,
     timezone    text not null default 'America/Los_Angeles',
     created_at  timestamptz not null default now(),
     updated_at  timestamptz not null default now(),
     primary key (environment, user_id)
   );

   drop trigger if exists meta_inbox_user_preferences_set_updated_at
     on public.meta_inbox_user_preferences;
   create trigger meta_inbox_user_preferences_set_updated_at
     before update on public.meta_inbox_user_preferences
     for each row execute function public.set_updated_at();

   alter table public.meta_inbox_user_preferences enable row level security;

   grant select, insert, update on table public.meta_inbox_user_preferences
     to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

   -- Primary boundary for v1: scoped module clients + environment match.
   drop policy if exists ads_analyst_select on public.meta_inbox_user_preferences;
   drop policy if exists ads_analyst_web_insert on public.meta_inbox_user_preferences;
   drop policy if exists ads_analyst_web_update on public.meta_inbox_user_preferences;
   drop policy if exists ads_analyst_worker_insert on public.meta_inbox_user_preferences;
   drop policy if exists ads_analyst_worker_update on public.meta_inbox_user_preferences;
   drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_user_preferences;
   drop policy if exists ads_analyst_ingest_update on public.meta_inbox_user_preferences;

   create policy ads_analyst_select on public.meta_inbox_user_preferences
     for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
     using (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_web_insert on public.meta_inbox_user_preferences
     for insert to ads_analyst_web
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_web_update on public.meta_inbox_user_preferences
     for update to ads_analyst_web
     using (analytics.ads_analyst_environment_matches(environment))
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_worker_insert on public.meta_inbox_user_preferences
     for insert to ads_analyst_worker
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_worker_update on public.meta_inbox_user_preferences
     for update to ads_analyst_worker
     using (analytics.ads_analyst_environment_matches(environment))
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_ingest_insert on public.meta_inbox_user_preferences
     for insert to ads_analyst_ingest
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_ingest_update on public.meta_inbox_user_preferences
     for update to ads_analyst_ingest
     using (analytics.ads_analyst_environment_matches(environment))
     with check (analytics.ads_analyst_environment_matches(environment));

   -- Defense-in-depth for any future direct authenticated session (spec §9/§15.2).
   -- Not load-bearing in v1 because scoped clients have no auth.uid().
   drop policy if exists self_or_lead_select on public.meta_inbox_user_preferences;
   create policy self_or_lead_select on public.meta_inbox_user_preferences
     for select to authenticated
     using (
       user_id = public.current_app_user_id()
       or exists (
         select 1
           from public.meta_inbox_team_members lead
           join public.meta_inbox_team_members target on target.team_id = lead.team_id
          where lead.app_user_id = public.current_app_user_id()
            and lead.role = 'lead'
            and target.app_user_id = meta_inbox_user_preferences.user_id
       )
     );
   drop policy if exists self_write on public.meta_inbox_user_preferences;
   create policy self_write on public.meta_inbox_user_preferences
     for insert to authenticated
     with check (user_id = public.current_app_user_id());
   drop policy if exists self_update on public.meta_inbox_user_preferences;
   create policy self_update on public.meta_inbox_user_preferences
     for update to authenticated
     using (user_id = public.current_app_user_id())
     with check (user_id = public.current_app_user_id());

   comment on table public.meta_inbox_user_preferences is
     'Inbox-owned per-user prefs (timezone). user_id = app_user_id, not auth.uid(). No DELETE in v1.';
   ```
   > NOTE: table includes `environment` + composite PK `(environment, user_id)` to match every other inbox table and the scoped-client RLS model. Spec §6.3 showed a bare `user_id PRIMARY KEY` with no `environment`; that would break the existing access pattern. App-code reads default `'America/Los_Angeles'` when no row (Task 11).
4. - [ ] Run the test — expect PASS. Run `npm run db:migrations:check` and `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/meta-inbox-user-preferences-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add meta_inbox_user_preferences table

   Inbox-owned per-user timezone prefs keyed by app_user_id, with the
   standard ads_analyst environment-scoped RLS plus defense-in-depth owner
   policies for authenticated sessions.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 3: meta_inbox_metrics_daily table + indexes + RLS

**Files:**
- Create: `supabase/migrations/<generated>_meta_inbox_metrics_daily.sql`
- Test: `tests/meta-inbox-metrics-daily-migration.test.ts`

1. - [ ] Write the failing test `tests/meta-inbox-metrics-daily-migration.test.ts` (copy the `migrationContaining` helper):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("meta_inbox_metrics_daily migration", () => {
     it("creates the rollup table with the spec columns", () => {
       const sql = migrationContaining("create table if not exists public.meta_inbox_metrics_daily");
       for (const col of [
         "avg_response_seconds   integer",
         "on_time_replies        integer not null default 0",
         "total_replies          integer not null default 0",
         "team_claims            integer not null default 0",
         "breached_at_eod        integer not null default 0",
       ]) assert.ok(sql.includes(col), `missing column: ${col}`);
     });
     it("creates the unique (environment,user_id,date) index and the date index", () => {
       const sql = migrationContaining("create table if not exists public.meta_inbox_metrics_daily");
       assert.match(sql, /create unique index if not exists meta_inbox_metrics_daily_user_date_idx[\s\S]*\(environment, user_id, date\)/i);
       assert.match(sql, /create index if not exists meta_inbox_metrics_daily_date_idx[\s\S]*\(environment, date desc\)/i);
     });
     it("uses ads_analyst environment RLS and restricts writes to worker/ingest", () => {
       const sql = migrationContaining("create table if not exists public.meta_inbox_metrics_daily");
       assert.match(sql, /analytics\.ads_analyst_environment_matches\(environment\)/i);
       // ads_analyst_web gets SELECT only (cron/backfill run as worker/ingest).
       assert.match(sql, /grant select on table public\.meta_inbox_metrics_daily\s+to ads_analyst_web/i);
       assert.match(sql, /grant select, insert, update on table public\.meta_inbox_metrics_daily\s+to ads_analyst_worker, ads_analyst_ingest/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Create migration: `npm run db:migration -- meta_inbox_metrics_daily`. Append:
   ```sql
   -- Materialized per-user daily rollup. Written by cron/backfill (worker/ingest),
   -- read by web. date + timezone are snapshotted in the user's tz at rollup time.
   create table if not exists public.meta_inbox_metrics_daily (
     id                     uuid primary key default gen_random_uuid(),
     environment            text not null default analytics.current_ads_analyst_environment()
       check (environment in ('production', 'staging')),
     user_id                uuid not null,
     date                   date not null,
     timezone               text not null,
     avg_response_seconds   integer,
     on_time_replies        integer not null default 0,
     total_replies          integer not null default 0,
     team_claims            integer not null default 0,
     breached_at_eod        integer not null default 0,
     computed_at            timestamptz not null default now()
   );

   create unique index if not exists meta_inbox_metrics_daily_user_date_idx
     on public.meta_inbox_metrics_daily (environment, user_id, date);
   create index if not exists meta_inbox_metrics_daily_date_idx
     on public.meta_inbox_metrics_daily (environment, date desc);

   alter table public.meta_inbox_metrics_daily enable row level security;

   -- web: read-only. worker/ingest: read + write (cron + backfill).
   grant select on table public.meta_inbox_metrics_daily to ads_analyst_web;
   grant select, insert, update on table public.meta_inbox_metrics_daily
     to ads_analyst_worker, ads_analyst_ingest;

   drop policy if exists ads_analyst_select on public.meta_inbox_metrics_daily;
   drop policy if exists ads_analyst_worker_insert on public.meta_inbox_metrics_daily;
   drop policy if exists ads_analyst_worker_update on public.meta_inbox_metrics_daily;
   drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_metrics_daily;
   drop policy if exists ads_analyst_ingest_update on public.meta_inbox_metrics_daily;

   create policy ads_analyst_select on public.meta_inbox_metrics_daily
     for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
     using (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_worker_insert on public.meta_inbox_metrics_daily
     for insert to ads_analyst_worker
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_worker_update on public.meta_inbox_metrics_daily
     for update to ads_analyst_worker
     using (analytics.ads_analyst_environment_matches(environment))
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_ingest_insert on public.meta_inbox_metrics_daily
     for insert to ads_analyst_ingest
     with check (analytics.ads_analyst_environment_matches(environment));
   create policy ads_analyst_ingest_update on public.meta_inbox_metrics_daily
     for update to ads_analyst_ingest
     using (analytics.ads_analyst_environment_matches(environment))
     with check (analytics.ads_analyst_environment_matches(environment));

   -- Defense-in-depth (spec §9): authenticated owner-or-any-lead SELECT.
   drop policy if exists self_or_lead_select on public.meta_inbox_metrics_daily;
   create policy self_or_lead_select on public.meta_inbox_metrics_daily
     for select to authenticated
     using (
       user_id = public.current_app_user_id()
       or exists (
         select 1 from public.meta_inbox_team_members
          where app_user_id = public.current_app_user_id() and role = 'lead'
       )
     );

   comment on table public.meta_inbox_metrics_daily is
     'Per-user daily metrics rollup (yesterday + 7d/30d periods). Written by cron/backfill, read by web. No DELETE in v1.';
   ```
4. - [ ] Run the test — expect PASS. Run `npm run db:migrations:check` + `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/meta-inbox-metrics-daily-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add meta_inbox_metrics_daily rollup table

   Materialized per-user daily metrics for yesterday/7d/30d periods, written
   by cron/backfill (worker/ingest) and read by web, with environment-scoped
   RLS plus a defense-in-depth lead SELECT policy.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 4: meta_inbox_send_attempts partial index

**Files:**
- Create: `supabase/migrations/<generated>_meta_inbox_send_attempts_approved_sent_idx.sql`
- Test: `tests/meta-inbox-send-attempts-index-migration.test.ts`

1. - [ ] Write the failing test `tests/meta-inbox-send-attempts-index-migration.test.ts` (copy the helper):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("send_attempts approved/sent index migration", () => {
     it("adds the partial index for B1/B3 today queries", () => {
       const sql = migrationContaining("meta_inbox_send_attempts_approved_sent_idx");
       assert.match(sql, /create index if not exists meta_inbox_send_attempts_approved_sent_idx[\s\S]*on public\.meta_inbox_send_attempts \(environment, approved_by, sent_at\)[\s\S]*where status = 'sent'/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Create migration: `npm run db:migration -- meta_inbox_send_attempts_approved_sent_idx`. Append:
   ```sql
   -- Powers B1 (today avg first-response) and B3 (replies sent today) lookups
   -- by approver within a sent_at window.
   create index if not exists meta_inbox_send_attempts_approved_sent_idx
     on public.meta_inbox_send_attempts (environment, approved_by, sent_at)
     where status = 'sent';
   ```
4. - [ ] Run the test — expect PASS. Run `npm run db:migrations:check`.
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/meta-inbox-send-attempts-index-migration.test.ts
   git commit -m "$(cat <<'EOF'
   perf(inbox): index sent send-attempts by approver and sent_at

   Partial index on (environment, approved_by, sent_at) WHERE status='sent'
   to keep the live today first-response and reply-volume queries fast.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 5: enable pg_cron extension

**Files:**
- Create: `supabase/migrations/<generated>_enable_pg_cron.sql`
- Test: `tests/enable-pg-cron-migration.test.ts`

1. - [ ] Write the failing test `tests/enable-pg-cron-migration.test.ts` (copy the helper):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("pg_cron enable migration", () => {
     it("creates the extension in the extensions schema", () => {
       const sql = migrationContaining("create extension if not exists pg_cron");
       assert.match(sql, /create extension if not exists pg_cron with schema extensions/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Create migration: `npm run db:migration -- enable_pg_cron`. Append:
   ```sql
   -- pg_cron (default_version 1.6.4, available on this project) drives the
   -- daily metrics rollup. Scheduling itself lives in Task 25's migration.
   create extension if not exists pg_cron with schema extensions;
   ```
4. - [ ] Run the test — expect PASS. Run `npm run db:migrations:check`.
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/enable-pg-cron-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): enable pg_cron extension

   Enables pg_cron in the extensions schema so the daily metrics rollup can
   be scheduled in a later migration.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 2 — business-hours.ts (pure, heavy TDD)

> Greenfield module (spec §15.7 — zero existing `businessHours`/`slaClock` references). Pure functions, no I/O, no DB. Co-located next to `src/lib/california-time.ts` and imports `CALIFORNIA_TIME_ZONE` as the default tz (spec §15.8). All date math uses `Intl.DateTimeFormat` with the window's `tz` (same technique as `california-time.ts`) — do NOT use `Date.getHours()` (that's machine-local). The window is 7 days/week, no holidays.
>
> **Core mental model:** "business seconds" = wall-clock seconds that fall inside `[startHour, endHour)` local to `tz`, summed across days. `endHour < startHour` means an overnight window (not used by current PT/ICT configs but supported). Build one private helper `zonedParts(date, tz)` that returns `{ year, month, day, hour, minute, second }` in the target tz, and one `secondsIntoDay(parts)` = `hour*3600 + minute*60 + second`. Everything else composes these.

### Task 6: types + todaysWindow / yesterdaysWindow (before/open/after state)

**Files:**
- Create: `src/lib/business-hours.ts`
- Test: `tests/business-hours.test.ts`

1. - [ ] Write the failing test `tests/business-hours.test.ts`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import {
     CALIFORNIA_BUSINESS_WINDOW,
     VN_BUSINESS_WINDOW,
     todaysWindow,
     yesterdaysWindow,
     type BusinessWindow,
   } from "../src/lib/business-hours.ts";

   const PT: BusinessWindow = CALIFORNIA_BUSINESS_WINDOW; // 10–19 America/Los_Angeles
   const ICT: BusinessWindow = VN_BUSINESS_WINDOW;        // 10–19 Asia/Ho_Chi_Minh

   describe("todaysWindow", () => {
     it("reports 'before' prior to business start in tz", () => {
       // 2026-05-27 16:00Z == 09:00 PT (PDT, UTC-7) → before 10:00 open
       const w = todaysWindow(new Date("2026-05-27T16:00:00Z"), PT);
       assert.equal(w.state, "before");
       assert.equal(w.start.toISOString(), "2026-05-27T17:00:00.000Z"); // 10:00 PDT
       assert.equal(w.end.toISOString(), "2026-05-28T02:00:00.000Z");   // 19:00 PDT
     });
     it("reports 'open' during hours", () => {
       const w = todaysWindow(new Date("2026-05-27T19:00:00Z"), PT); // 12:00 PT
       assert.equal(w.state, "open");
     });
     it("reports 'after' past business end in tz", () => {
       const w = todaysWindow(new Date("2026-05-28T03:00:00Z"), PT); // 20:00 PT
       assert.equal(w.state, "after");
     });
     it("computes today's window in ICT independently of PT", () => {
       // 2026-05-27 04:00Z == 11:00 ICT (UTC+7) → open
       const w = todaysWindow(new Date("2026-05-27T04:00:00Z"), ICT);
       assert.equal(w.state, "open");
       assert.equal(w.start.toISOString(), "2026-05-27T03:00:00.000Z"); // 10:00 ICT
       assert.equal(w.end.toISOString(), "2026-05-27T12:00:00.000Z");   // 19:00 ICT
     });
   });

   describe("yesterdaysWindow", () => {
     it("returns the prior calendar day's full window in tz", () => {
       const w = yesterdaysWindow(new Date("2026-05-27T19:00:00Z"), PT);
       assert.equal(w.start.toISOString(), "2026-05-26T17:00:00.000Z");
       assert.equal(w.end.toISOString(), "2026-05-27T02:00:00.000Z");
     });
   });
   ```
2. - [ ] Run it — expect FAIL (module missing):
   `node --test --experimental-strip-types tests/business-hours.test.ts`.
3. - [ ] Implement `src/lib/business-hours.ts`:
   ```ts
   import { CALIFORNIA_TIME_ZONE } from "./california-time.ts";

   export type BusinessWindow = { tz: string; startHour: number; endHour: number };

   export const CALIFORNIA_BUSINESS_WINDOW: BusinessWindow = {
     tz: CALIFORNIA_TIME_ZONE,
     startHour: 10,
     endHour: 19,
   };

   export const VN_BUSINESS_WINDOW: BusinessWindow = {
     tz: "Asia/Ho_Chi_Minh",
     startHour: 10,
     endHour: 19,
   };

   type ZonedParts = {
     year: number;
     month: number; // 1-12
     day: number;
     hour: number;
     minute: number;
     second: number;
   };

   const PARTS_FORMATTERS = new Map<string, Intl.DateTimeFormat>();

   function partsFormatter(tz: string): Intl.DateTimeFormat {
     let formatter = PARTS_FORMATTERS.get(tz);
     if (!formatter) {
       formatter = new Intl.DateTimeFormat("en-US", {
         timeZone: tz,
         year: "numeric",
         month: "2-digit",
         day: "2-digit",
         hour: "2-digit",
         minute: "2-digit",
         second: "2-digit",
         hour12: false,
       });
       PARTS_FORMATTERS.set(tz, formatter);
     }
     return formatter;
   }

   function zonedParts(date: Date, tz: string): ZonedParts {
     const map: Record<string, number> = {};
     for (const part of partsFormatter(tz).formatToParts(date)) {
       if (part.type !== "literal") map[part.type] = Number(part.value);
     }
     // Intl renders 24:xx for midnight in hour12:false; normalize to 0.
     const hour = map.hour === 24 ? 0 : map.hour;
     return {
       year: map.year,
       month: map.month,
       day: map.day,
       hour,
       minute: map.minute,
       second: map.second,
     };
   }

   // Find the UTC instant whose wall-clock time in `tz` equals the given
   // local Y-M-D h:m:s. Robust across DST via a two-pass correction.
   function zonedTimeToUtc(
     tz: string,
     year: number,
     month: number,
     day: number,
     hour: number,
     minute = 0,
     second = 0,
   ): Date {
     const guess = Date.UTC(year, month - 1, day, hour, minute, second);
     const parts = zonedParts(new Date(guess), tz);
     const asUtc = Date.UTC(
       parts.year,
       parts.month - 1,
       parts.day,
       parts.hour,
       parts.minute,
       parts.second,
     );
     const offset = asUtc - guess;
     return new Date(guess - offset);
   }

   function dayWindow(now: Date, w: BusinessWindow, dayOffset: number): { start: Date; end: Date } {
     const todayParts = zonedParts(now, w.tz);
     const base = Date.UTC(todayParts.year, todayParts.month - 1, todayParts.day);
     const shifted = new Date(base + dayOffset * 86_400_000);
     const y = shifted.getUTCFullYear();
     const m = shifted.getUTCMonth() + 1;
     const d = shifted.getUTCDate();
     const start = zonedTimeToUtc(w.tz, y, m, d, w.startHour);
     const endDayOffset = w.endHour <= w.startHour ? 1 : 0;
     const endShifted = new Date(Date.UTC(y, m - 1, d) + endDayOffset * 86_400_000);
     const end = zonedTimeToUtc(
       w.tz,
       endShifted.getUTCFullYear(),
       endShifted.getUTCMonth() + 1,
       endShifted.getUTCDate(),
       w.endHour,
     );
     return { start, end };
   }

   export function todaysWindow(
     now: Date,
     w: BusinessWindow,
   ): { start: Date; end: Date; state: "before" | "open" | "after" } {
     const { start, end } = dayWindow(now, w, 0);
     const t = now.getTime();
     const state = t < start.getTime() ? "before" : t >= end.getTime() ? "after" : "open";
     return { start, end, state };
   }

   export function yesterdaysWindow(now: Date, w: BusinessWindow): { start: Date; end: Date } {
     return dayWindow(now, w, -1);
   }
   ```
4. - [ ] Run the test — expect PASS. Run `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/business-hours.ts tests/business-hours.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add business-hours window helpers

   Pure tz-aware todaysWindow/yesterdaysWindow with before/open/after state,
   backed by Intl-based zoned-time conversion that survives DST.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 7: businessSecondsBetween (PT & ICT, overnight, DST)

**Files:**
- Modify: `src/lib/business-hours.ts`
- Test: `tests/business-hours.test.ts` (append a `describe` block)

1. - [ ] Append failing tests to `tests/business-hours.test.ts`:
   ```ts
   import { businessSecondsBetween } from "../src/lib/business-hours.ts";

   describe("businessSecondsBetween", () => {
     it("counts only in-window seconds within one PT day", () => {
       // 11:00 PT → 13:30 PT = 2h30m = 9000s
       const from = new Date("2026-05-27T18:00:00Z"); // 11:00 PDT
       const to = new Date("2026-05-27T20:30:00Z");   // 13:30 PDT
       assert.equal(businessSecondsBetween(from, to, CALIFORNIA_BUSINESS_WINDOW), 9000);
     });
     it("clamps to business hours when arrival precedes open", () => {
       // 08:00 PT (before 10:00) → 11:00 PT = counts 10:00→11:00 = 3600s
       const from = new Date("2026-05-27T15:00:00Z"); // 08:00 PDT
       const to = new Date("2026-05-27T18:00:00Z");   // 11:00 PDT
       assert.equal(businessSecondsBetween(from, to, CALIFORNIA_BUSINESS_WINDOW), 3600);
     });
     it("excludes the overnight closed gap across two days", () => {
       // 18:00 PT day1 → 11:00 PT day2: 1h (18→19) + 1h (10→11) = 7200s
       const from = new Date("2026-05-28T01:00:00Z"); // 18:00 PDT day1
       const to = new Date("2026-05-28T18:00:00Z");   // 11:00 PDT day2
       assert.equal(businessSecondsBetween(from, to, CALIFORNIA_BUSINESS_WINDOW), 7200);
     });
     it("returns 0 when from >= to", () => {
       const t = new Date("2026-05-27T18:00:00Z");
       assert.equal(businessSecondsBetween(t, t, CALIFORNIA_BUSINESS_WINDOW), 0);
     });
     it("counts ICT seconds independently", () => {
       // 11:00 ICT → 12:00 ICT = 3600s
       const from = new Date("2026-05-27T04:00:00Z");
       const to = new Date("2026-05-27T05:00:00Z");
       assert.equal(businessSecondsBetween(from, to, VN_BUSINESS_WINDOW), 3600);
     });
     it("handles the spring-forward DST boundary (Mar 8 2026, PT)", () => {
       // PT springs forward 02:00→03:00 on 2026-03-08, outside 10–19 window,
       // so a full business day still measures 9h = 32400s.
       const from = new Date("2026-03-08T18:00:00Z"); // 10:00 PDT (already sprung)
       const to = new Date("2026-03-09T03:00:00Z");   // 19:00 PDT
       assert.equal(businessSecondsBetween(from, to, CALIFORNIA_BUSINESS_WINDOW), 32400);
     });
     it("handles the fall-back DST boundary (Nov 1 2026, PT)", () => {
       // Full business day Nov 1 (fall back 02:00 happens outside window).
       const from = new Date("2026-11-01T17:00:00Z"); // 10:00 PDT→ wait, use computed open
       const day = todaysWindow(new Date("2026-11-01T20:00:00Z"), CALIFORNIA_BUSINESS_WINDOW);
       assert.equal(businessSecondsBetween(day.start, day.end, CALIFORNIA_BUSINESS_WINDOW), 32400);
     });
   });
   ```
   > NOTE: the `from` const in the fall-back test is unused on purpose-free; prefer the `day.start/day.end` assertion. If lint flags the unused `from`, delete that line — keep the `day` assertion.
2. - [ ] Run it — expect FAIL (`businessSecondsBetween` not exported).
3. - [ ] Implement in `src/lib/business-hours.ts` (append after `yesterdaysWindow`):
   ```ts
   // Sum of wall-clock seconds in [startHour,endHour) local to w.tz between
   // `from` and `to`. Iterates day-by-day in the tz; safe across DST because
   // each day's window is recomputed via zonedTimeToUtc.
   export function businessSecondsBetween(from: Date, to: Date, w: BusinessWindow): number {
     if (from.getTime() >= to.getTime()) return 0;

     let total = 0;
     // Start from the calendar day of `from` in tz, walk forward until past `to`.
     const startParts = zonedParts(from, w.tz);
     let cursorBase = Date.UTC(startParts.year, startParts.month - 1, startParts.day);
     const guardEnd = to.getTime();

     // Cap iterations defensively (years of span would still terminate).
     for (let i = 0; i < 4000; i += 1) {
       const shifted = new Date(cursorBase);
       const y = shifted.getUTCFullYear();
       const m = shifted.getUTCMonth() + 1;
       const d = shifted.getUTCDate();
       const dayStart = zonedTimeToUtc(w.tz, y, m, d, w.startHour);
       const endDayOffset = w.endHour <= w.startHour ? 1 : 0;
       const endShift = new Date(Date.UTC(y, m - 1, d) + endDayOffset * 86_400_000);
       const dayEnd = zonedTimeToUtc(
         w.tz,
         endShift.getUTCFullYear(),
         endShift.getUTCMonth() + 1,
         endShift.getUTCDate(),
         w.endHour,
       );

       const overlapStart = Math.max(from.getTime(), dayStart.getTime());
       const overlapEnd = Math.min(to.getTime(), dayEnd.getTime());
       if (overlapEnd > overlapStart) {
         total += Math.round((overlapEnd - overlapStart) / 1000);
       }

       if (dayStart.getTime() > guardEnd) break;
       cursorBase += 86_400_000;
     }
     return total;
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/business-hours.ts tests/business-hours.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add businessSecondsBetween

   Sums in-window seconds across days for any tz, excluding overnight gaps
   and surviving both DST boundaries; covered for PT and ICT.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 8: businessSecondsRemainingUntil

**Files:**
- Modify: `src/lib/business-hours.ts`
- Test: `tests/business-hours.test.ts` (append)

1. - [ ] Append failing tests:
   ```ts
   import { businessSecondsRemainingUntil } from "../src/lib/business-hours.ts";

   describe("businessSecondsRemainingUntil", () => {
     it("is positive business seconds when deadline is ahead", () => {
       const now = new Date("2026-05-27T18:00:00Z");      // 11:00 PDT
       const deadline = new Date("2026-05-27T20:00:00Z"); // 13:00 PDT
       assert.equal(
         businessSecondsRemainingUntil(deadline, now, CALIFORNIA_BUSINESS_WINDOW),
         7200,
       );
     });
     it("is 0 or negative when the deadline has passed (breached)", () => {
       const now = new Date("2026-05-27T21:00:00Z");      // 14:00 PDT
       const deadline = new Date("2026-05-27T19:00:00Z"); // 12:00 PDT
       // 1 business hour passed → -3600
       assert.equal(
         businessSecondsRemainingUntil(deadline, now, CALIFORNIA_BUSINESS_WINDOW),
         -3600,
       );
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   // Signed business seconds from `now` to `deadline`. Negative = breached
   // (deadline already past in business time).
   export function businessSecondsRemainingUntil(
     deadline: Date,
     now: Date,
     w: BusinessWindow,
   ): number {
     if (deadline.getTime() >= now.getTime()) {
       return businessSecondsBetween(now, deadline, w);
     }
     return -businessSecondsBetween(deadline, now, w);
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/business-hours.ts tests/business-hours.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add businessSecondsRemainingUntil

   Signed business-seconds-to-deadline (negative when breached) for the
   at-risk/breached A3 metric.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 9: breachAt

**Files:**
- Modify: `src/lib/business-hours.ts`
- Test: `tests/business-hours.test.ts` (append)

1. - [ ] Append failing tests:
   ```ts
   import { breachAt } from "../src/lib/business-hours.ts";

   describe("breachAt", () => {
     it("adds SLA business seconds to arrival, skipping the overnight gap", () => {
       // arrive 18:00 PT, SLA 3 business hours: 1h today (→19:00) + 2h next day
       // (10:00→12:00) = breach at 12:00 PT next day.
       const arrived = new Date("2026-05-28T01:00:00Z"); // 18:00 PDT day1
       const result = breachAt(arrived, 3 * 3600, CALIFORNIA_BUSINESS_WINDOW);
       assert.equal(result.toISOString(), "2026-05-28T19:00:00.000Z"); // 12:00 PDT day2
     });
     it("starts the clock at open when arrival precedes business hours", () => {
       // arrive 07:00 PT, SLA 3h → clock starts 10:00, breach 13:00 PT
       const arrived = new Date("2026-05-27T14:00:00Z"); // 07:00 PDT
       const result = breachAt(arrived, 3 * 3600, CALIFORNIA_BUSINESS_WINDOW);
       assert.equal(result.toISOString(), "2026-05-27T20:00:00.000Z"); // 13:00 PDT
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   // The instant `slaSeconds` of business time after `arrivedAt`. Walks
   // forward day-by-day consuming each day's open window until the budget
   // is spent. If arrival is before open, the clock starts at open.
   export function breachAt(arrivedAt: Date, slaSeconds: number, w: BusinessWindow): Date {
     let remaining = slaSeconds;
     const startParts = zonedParts(arrivedAt, w.tz);
     let cursorBase = Date.UTC(startParts.year, startParts.month - 1, startParts.day);

     for (let i = 0; i < 4000; i += 1) {
       const shifted = new Date(cursorBase);
       const y = shifted.getUTCFullYear();
       const m = shifted.getUTCMonth() + 1;
       const d = shifted.getUTCDate();
       const dayStart = zonedTimeToUtc(w.tz, y, m, d, w.startHour);
       const endDayOffset = w.endHour <= w.startHour ? 1 : 0;
       const endShift = new Date(Date.UTC(y, m - 1, d) + endDayOffset * 86_400_000);
       const dayEnd = zonedTimeToUtc(
         w.tz,
         endShift.getUTCFullYear(),
         endShift.getUTCMonth() + 1,
         endShift.getUTCDate(),
         w.endHour,
       );

       const clockStart = Math.max(arrivedAt.getTime(), dayStart.getTime());
       if (clockStart < dayEnd.getTime()) {
         const available = Math.round((dayEnd.getTime() - clockStart) / 1000);
         if (remaining <= available) {
           return new Date(clockStart + remaining * 1000);
         }
         remaining -= available;
       }
       cursorBase += 86_400_000;
     }
     // Defensive fallback: should never hit with positive slaSeconds.
     return new Date(arrivedAt.getTime() + slaSeconds * 1000);
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/business-hours.ts tests/business-hours.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add breachAt SLA deadline helper

   Projects an arrival time forward by N business seconds (clamped to open),
   skipping overnight gaps, to compute each conversation's SLA breach instant.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 10: SQL business_seconds_between() + JS↔SQL cross-test

**Files:**
- Create: `supabase/migrations/<generated>_business_seconds_between_fn.sql`
- Create: `tests/business-hours-fixtures.ts` (shared fixture table)
- Test: `tests/business-hours.test.ts` (assert JS matches the fixture table)
- Test: `tests/business-seconds-sql-fn-migration.test.ts` (assert the SQL fn shape + that the fixtures are embedded as a comment block for the DB cross-check)

> The JS and SQL implementations must agree. Since CI has no DB, we (a) define a fixture table of `{ fromISO, toISO, tz, startHour, endHour, expected }` rows, (b) assert the JS `businessSecondsBetween` matches every row, and (c) embed the same fixtures verbatim as a SQL comment inside the migration so a human/staging run can paste them into `select business_seconds_between(...)` and diff. The migration test asserts the function exists and the fixture comment block is present (keeps them from drifting silently).

1. - [ ] Create `tests/business-hours-fixtures.ts`:
   ```ts
   export type BusinessSecondsFixture = {
     label: string;
     fromISO: string;
     toISO: string;
     tz: string;
     startHour: number;
     endHour: number;
     expected: number;
   };

   export const BUSINESS_SECONDS_FIXTURES: BusinessSecondsFixture[] = [
     {
       label: "PT same-day 11:00→13:30",
       fromISO: "2026-05-27T18:00:00Z",
       toISO: "2026-05-27T20:30:00Z",
       tz: "America/Los_Angeles",
       startHour: 10,
       endHour: 19,
       expected: 9000,
     },
     {
       label: "PT clamp before open 08:00→11:00",
       fromISO: "2026-05-27T15:00:00Z",
       toISO: "2026-05-27T18:00:00Z",
       tz: "America/Los_Angeles",
       startHour: 10,
       endHour: 19,
       expected: 3600,
     },
     {
       label: "PT overnight gap 18:00 d1 → 11:00 d2",
       fromISO: "2026-05-28T01:00:00Z",
       toISO: "2026-05-28T18:00:00Z",
       tz: "America/Los_Angeles",
       startHour: 10,
       endHour: 19,
       expected: 7200,
     },
     {
       label: "ICT 11:00→12:00",
       fromISO: "2026-05-27T04:00:00Z",
       toISO: "2026-05-27T05:00:00Z",
       tz: "Asia/Ho_Chi_Minh",
       startHour: 10,
       endHour: 19,
       expected: 3600,
     },
     {
       label: "PT full DST spring-forward day",
       fromISO: "2026-03-08T18:00:00Z",
       toISO: "2026-03-09T03:00:00Z",
       tz: "America/Los_Angeles",
       startHour: 10,
       endHour: 19,
       expected: 32400,
     },
   ];
   ```
2. - [ ] Append a JS-vs-fixture test to `tests/business-hours.test.ts` — run it, expect PASS immediately (JS already implemented):
   ```ts
   import { BUSINESS_SECONDS_FIXTURES } from "./business-hours-fixtures.ts";

   describe("businessSecondsBetween fixture parity (JS side)", () => {
     for (const f of BUSINESS_SECONDS_FIXTURES) {
       it(`matches fixture: ${f.label}`, () => {
         assert.equal(
           businessSecondsBetween(new Date(f.fromISO), new Date(f.toISO), {
             tz: f.tz,
             startHour: f.startHour,
             endHour: f.endHour,
           }),
           f.expected,
         );
       });
     }
   });
   ```
   `node --test --experimental-strip-types tests/business-hours.test.ts` → expect PASS.
3. - [ ] Write the failing migration-shape test `tests/business-seconds-sql-fn-migration.test.ts` (copy the `migrationContaining` helper):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";
   import { BUSINESS_SECONDS_FIXTURES } from "./business-hours-fixtures.ts";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("business_seconds_between SQL fn migration", () => {
     it("defines the plpgsql function with the lockstep signature", () => {
       const sql = migrationContaining("function public.business_seconds_between");
       assert.match(sql, /create or replace function public\.business_seconds_between\(\s*from_ts timestamptz,\s*to_ts timestamptz,\s*tz text,\s*start_time time,\s*end_time time\s*\)\s*returns integer/i);
       assert.match(sql, /language plpgsql/i);
     });
     it("embeds every JS fixture as a cross-check comment", () => {
       const sql = migrationContaining("function public.business_seconds_between");
       for (const f of BUSINESS_SECONDS_FIXTURES) {
         assert.ok(sql.includes(f.label), `fixture comment missing: ${f.label}`);
         assert.ok(sql.includes(String(f.expected)), `expected value missing: ${f.expected}`);
       }
     });
   });
   ```
   Run it — expect FAIL (no migration yet).
4. - [ ] Create migration: `npm run db:migration -- business_seconds_between_fn`. Append:
   ```sql
   -- Business-time arithmetic that MUST stay in lockstep with
   -- src/lib/business-hours.ts businessSecondsBetween. Counts wall-clock
   -- seconds inside [start_time, end_time) local to tz between from_ts and
   -- to_ts. Overnight windows (end_time <= start_time) span to the next day.
   create or replace function public.business_seconds_between(
     from_ts timestamptz,
     to_ts timestamptz,
     tz text,
     start_time time,
     end_time time
   ) returns integer
   language plpgsql
   immutable
   as $$
   declare
     total      integer := 0;
     cur_date   date;
     last_date  date;
     day_start  timestamptz;
     day_end    timestamptz;
     ov_start   timestamptz;
     ov_end     timestamptz;
     end_offset integer := case when end_time <= start_time then 1 else 0 end;
   begin
     if from_ts is null or to_ts is null or from_ts >= to_ts then
       return 0;
     end if;

     cur_date  := (from_ts at time zone tz)::date;
     last_date := (to_ts at time zone tz)::date;

     while cur_date <= last_date loop
       -- Construct the day's window as tz-local timestamps, then back to UTC.
       day_start := (cur_date + start_time) at time zone tz;
       day_end   := ((cur_date + end_offset) + end_time) at time zone tz;

       ov_start := greatest(from_ts, day_start);
       ov_end   := least(to_ts, day_end);
       if ov_end > ov_start then
         total := total + floor(extract(epoch from (ov_end - ov_start)))::integer;
       end if;

       cur_date := cur_date + 1;
     end loop;

     return total;
   end;
   $$;

   grant execute on function public.business_seconds_between(timestamptz, timestamptz, text, time, time)
     to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest, authenticated;

   -- JS↔SQL cross-check fixtures (kept identical to tests/business-hours-fixtures.ts).
   -- Run on staging to confirm parity, e.g.:
   --   select public.business_seconds_between(
   --     '2026-05-27T18:00:00Z','2026-05-27T20:30:00Z','America/Los_Angeles','10:00','19:00');  -- = 9000
   -- Fixtures:
   --   PT same-day 11:00→13:30 => 9000
   --   PT clamp before open 08:00→11:00 => 3600
   --   PT overnight gap 18:00 d1 → 11:00 d2 => 7200
   --   ICT 11:00→12:00 => 3600
   --   PT full DST spring-forward day => 32400
   ```
   > NOTE: the comment fixture lines MUST contain each fixture `label` and `expected` exactly (the test asserts substring presence). If you add/remove a fixture in `business-hours-fixtures.ts`, update this comment block too — that is the whole point of the cross-test.
5. - [ ] Run both tests — expect PASS:
   `node --test --experimental-strip-types tests/business-hours.test.ts tests/business-seconds-sql-fn-migration.test.ts`. Run `npm run db:migrations:check` + `npm run typecheck`.
6. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/business-hours.test.ts tests/business-hours-fixtures.ts tests/business-seconds-sql-fn-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add business_seconds_between SQL function

   PL/pgSQL business-time arithmetic mirroring business-hours.ts, with a
   shared fixture table cross-tested in JS and embedded as a staging
   parity-check comment.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 3 — inbox-metrics.ts

> **Design for testability.** The computation must be unit-testable with no DB. Split into two layers in `src/lib/inbox-metrics.ts`:
> 1. **Pure compute functions** (`computePersonalHeaderMetrics(input)`) that take plain in-memory arrays + `now` + the resolved windows, and return the metric objects. These get exhaustive `node:test` coverage.
> 2. **Thin async fetchers** (`getPersonalHeaderMetrics(profile, now)`) that call `dynamicSupabase("web")` / reuse `getSocialInboxData`, gather rows, then delegate to the pure compute layer. These are NOT unit-tested here (no DB in CI) — they are integration-verified on staging per spec §11.
>
> All "today/yesterday bucketing" uses the **user's** window; all "business seconds" use the **queue's** window (two-clock rule, spec §5/B1). Each conversation's queue window is looked up from `meta_inbox_queue_categories` (`key → { tz, business_hours_start, business_hours_end }`). Provide a `QueueWindowMap = Map<MetaInboxQueueCategoryKey, BusinessWindow>` built once per request.
>
> SLA = 3 business hours = `10800` seconds (`SLA_BUSINESS_SECONDS`). At-risk threshold = `1800` seconds remaining (spec §5/A3).

### Task 11: types + getQueueWindow / getUserWindow helpers

**Files:**
- Create: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts`

1. - [ ] Write the failing test `tests/inbox-metrics.test.ts`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import {
     SLA_BUSINESS_SECONDS,
     AT_RISK_REMAINING_SECONDS,
     buildQueueWindowMap,
     resolveUserWindow,
     DEFAULT_BUSINESS_WINDOW,
   } from "../src/lib/inbox-metrics.ts";

   describe("inbox-metrics constants & window helpers", () => {
     it("uses a 3 business-hour SLA and a 30-minute at-risk threshold", () => {
       assert.equal(SLA_BUSINESS_SECONDS, 10800);
       assert.equal(AT_RISK_REMAINING_SECONDS, 1800);
     });
     it("builds a queue→window map from queue category rows", () => {
       const map = buildQueueWindowMap([
         { key: "vn_product", timezone: "Asia/Ho_Chi_Minh", business_hours_start: "10:00:00", business_hours_end: "19:00:00" },
         { key: "us_product", timezone: "America/Los_Angeles", business_hours_start: "10:00:00", business_hours_end: "19:00:00" },
       ]);
       assert.deepEqual(map.get("vn_product"), { tz: "Asia/Ho_Chi_Minh", startHour: 10, endHour: 19 });
       assert.deepEqual(map.get("us_product"), { tz: "America/Los_Angeles", startHour: 10, endHour: 19 });
     });
     it("falls back to the PT default window for unknown queues", () => {
       const map = buildQueueWindowMap([]);
       assert.deepEqual(map.get("anything_missing") ?? DEFAULT_BUSINESS_WINDOW, DEFAULT_BUSINESS_WINDOW);
     });
     it("resolves a user's window from a timezone string", () => {
       assert.deepEqual(resolveUserWindow("Asia/Ho_Chi_Minh"), { tz: "Asia/Ho_Chi_Minh", startHour: 10, endHour: 19 });
       assert.deepEqual(resolveUserWindow(null), DEFAULT_BUSINESS_WINDOW);
     });
   });
   ```
2. - [ ] Run it — expect FAIL: `node --test --experimental-strip-types tests/inbox-metrics.test.ts`.
3. - [ ] Implement `src/lib/inbox-metrics.ts` (types + helpers only for now):
   ```ts
   import {
     CALIFORNIA_BUSINESS_WINDOW,
     businessSecondsBetween,
     businessSecondsRemainingUntil,
     breachAt,
     todaysWindow,
     yesterdaysWindow,
     type BusinessWindow,
   } from "./business-hours.ts";
   import type { MetaInboxQueueCategoryKey } from "./meta-inbox-vocabulary.ts";

   export const SLA_BUSINESS_SECONDS = 3 * 3600; // 10800
   export const AT_RISK_REMAINING_SECONDS = 1800; // 30 min
   export const DEFAULT_BUSINESS_WINDOW: BusinessWindow = CALIFORNIA_BUSINESS_WINDOW;

   export type Period = "today" | "yesterday" | "7d" | "30d";

   export type QueueCategoryWindowRow = {
     key: string;
     timezone: string | null;
     business_hours_start: string | null; // "HH:MM:SS"
     business_hours_end: string | null;
   };

   export type QueueWindowMap = Map<string, BusinessWindow>;

   export type PersonalHeaderMetrics = {
     windowState: "before_hours" | "open" | "after_hours";
     user: { id: string; timezone: string; businessSecondsRemainingToday: number };
     pipeline: { assigned: number; needsReply: number; atRisk: number };
     today: { avgResponseSec: number | null; onTimeRate: number | null; repliesSent: number };
     yesterday: { avgResponseSec: number | null };
     team: {
       unassigned: number;
       claimedByMe: number;
       todayUnassignedDenominator: number;
       oldestUnassignedSec: number | null;
       teammatesOverSla?: number;
     };
   };

   export type TeamRow = {
     userId: string;
     name: string;
     role: string;
     assigned: number;
     needsReply: number;
     atRisk: number;
     avgResponseSec: number | null;
     onTimeRate: number | null;
     repliesSent: number;
     teamClaims: number;
     oldestUnansweredSec: number | null;
     lastActiveAt: Date | null;
   };

   export type TeamRollup = { period: Period; teamName: string; rows: TeamRow[] };

   function hourFromTime(value: string | null, fallback: number): number {
     if (!value) return fallback;
     const hour = Number(value.split(":")[0]);
     return Number.isFinite(hour) ? hour : fallback;
   }

   export function buildQueueWindowMap(rows: QueueCategoryWindowRow[]): QueueWindowMap {
     const map: QueueWindowMap = new Map();
     for (const row of rows) {
       map.set(row.key, {
         tz: row.timezone || DEFAULT_BUSINESS_WINDOW.tz,
         startHour: hourFromTime(row.business_hours_start, DEFAULT_BUSINESS_WINDOW.startHour),
         endHour: hourFromTime(row.business_hours_end, DEFAULT_BUSINESS_WINDOW.endHour),
       });
     }
     return map;
   }

   export function getQueueWindow(map: QueueWindowMap, key: string | null | undefined): BusinessWindow {
     return (key && map.get(key)) || DEFAULT_BUSINESS_WINDOW;
   }

   export function resolveUserWindow(timezone: string | null | undefined): BusinessWindow {
     if (!timezone) return DEFAULT_BUSINESS_WINDOW;
     return { tz: timezone, startHour: DEFAULT_BUSINESS_WINDOW.startHour, endHour: DEFAULT_BUSINESS_WINDOW.endHour };
   }

   // Re-export the business-hours fns the compute layer uses, so tests import
   // everything from one module.
   export { businessSecondsBetween, businessSecondsRemainingUntil, breachAt, todaysWindow, yesterdaysWindow };
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): scaffold inbox-metrics types and window helpers

   Adds SLA constants, the queue→business-window map, and user-window
   resolution that the metric compute layer builds on.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 12: getPersonalHeaderMetrics — A1/A2/A3 pipeline (pure compute)

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

> A1 open-assigned = `assigned_user_id == me AND status NOT IN (closed, lost_lead)`. A2 = A1 + `needs_reply`. A3 at-risk = among A2, `businessSecondsRemainingUntil(breachAt(latest_inbound_at, SLA, queueWindow), now, queueWindow) <= AT_RISK_REMAINING_SECONDS` (includes breached, i.e. negative). The clock uses each conversation's **queue** window.

1. - [ ] Append failing tests:
   ```ts
   import {
     computePipelineMetrics,
     type ConversationLike,
   } from "../src/lib/inbox-metrics.ts";

   const ME = "11111111-1111-4111-8111-111111111111";
   const QMAP = buildQueueWindowMap([
     { key: "us_product", timezone: "America/Los_Angeles", business_hours_start: "10:00:00", business_hours_end: "19:00:00" },
   ]);

   function conv(overrides: Partial<ConversationLike>): ConversationLike {
     return {
       id: "c",
       assigned_user_id: ME,
       conversation_status: "needs_reply",
       needs_reply: true,
       latest_inbound_at: "2026-05-27T18:00:00Z",
       queue_category_key: "us_product",
       first_inbound_at: "2026-05-27T18:00:00Z",
       ...overrides,
     };
   }

   describe("computePipelineMetrics (A1/A2/A3)", () => {
     const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT
     it("counts open assigned, needs-reply, and at-risk", () => {
       const rows = [
         conv({ id: "a" }), // 18:00Z arrival, breach 3 biz h later; at 12:00PT plenty left → not at risk
         conv({ id: "b", latest_inbound_at: "2026-05-27T17:10:00Z" }), // arrived 10:10PT, breach 13:10PT; at 12:00 → 70m left, not at risk
         conv({ id: "c", latest_inbound_at: "2026-05-27T16:40:00Z" }), // arrived 09:40 (before open→clock 10:00), breach 13:00; at 12:00 → 60m... tune below
         conv({ id: "d", assigned_user_id: "other" }), // not mine
         conv({ id: "e", conversation_status: "closed" }), // closed
         conv({ id: "f", needs_reply: false }), // no reply needed
       ];
       const result = computePipelineMetrics(rows, ME, now, QMAP);
       assert.equal(result.assigned, 4); // a,b,c,f (mine, not closed): excludes d(other), e(closed)
       assert.equal(result.needsReply, 3); // a,b,c (f has needs_reply false)
       assert.ok(result.atRisk >= 0);
     });
     it("flags a conversation within 30 business-minutes of breach as at-risk", () => {
       // arrived 09:00 PT → clock starts 10:00 → breach 13:00 PT (20:00Z).
       // now = 12:40 PT (19:40Z) → 20 business-min remaining ≤ 30 → at risk.
       const rows = [conv({ latest_inbound_at: "2026-05-27T16:00:00Z" })];
       const result = computePipelineMetrics(rows, ME, new Date("2026-05-27T19:40:00Z"), QMAP);
       assert.equal(result.atRisk, 1);
     });
     it("flags a breached conversation as at-risk", () => {
       // breach 13:00 PT, now 14:00 PT → negative remaining → at risk.
       const rows = [conv({ latest_inbound_at: "2026-05-27T16:00:00Z" })];
       const result = computePipelineMetrics(rows, ME, new Date("2026-05-27T21:00:00Z"), QMAP);
       assert.equal(result.atRisk, 1);
     });
   });
   ```
   > NOTE: When you run the test, the exact at-risk count in the first case depends on the tuned timestamps; adjust the inline timestamps until the asserted `assigned`/`needsReply` counts hold and `atRisk` matches your hand-calc. The 2nd and 3rd tests are the load-bearing at-risk assertions — keep those exact.
2. - [ ] Run it — expect FAIL (`computePipelineMetrics` / `ConversationLike` missing).
3. - [ ] Implement (append to `src/lib/inbox-metrics.ts`):
   ```ts
   const CLOSED_STATUSES = new Set(["closed", "lost_lead"]);

   export type ConversationLike = {
     id: string;
     assigned_user_id: string | null;
     conversation_status: string;
     needs_reply: boolean;
     latest_inbound_at: string | null;
     first_inbound_at: string | null;
     queue_category_key: string;
   };

   export function isOpenConversation(c: ConversationLike): boolean {
     return !CLOSED_STATUSES.has(c.conversation_status);
   }

   export function computePipelineMetrics(
     conversations: ConversationLike[],
     userId: string,
     now: Date,
     queueWindows: QueueWindowMap,
   ): { assigned: number; needsReply: number; atRisk: number } {
     let assigned = 0;
     let needsReply = 0;
     let atRisk = 0;

     for (const c of conversations) {
       if (c.assigned_user_id !== userId || !isOpenConversation(c)) continue;
       assigned += 1;
       if (!c.needs_reply) continue;
       needsReply += 1;

       const arrived = c.latest_inbound_at ? new Date(c.latest_inbound_at) : null;
       if (!arrived || Number.isNaN(arrived.getTime())) continue;
       const w = getQueueWindow(queueWindows, c.queue_category_key);
       const deadline = breachAt(arrived, SLA_BUSINESS_SECONDS, w);
       const remaining = businessSecondsRemainingUntil(deadline, now, w);
       if (remaining <= AT_RISK_REMAINING_SECONDS) atRisk += 1;
     }

     return { assigned, needsReply, atRisk };
   }
   ```
4. - [ ] Run the test — expect PASS (after tuning per the NOTE). `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): compute A1/A2/A3 pipeline metrics

   Adds the pure pipeline computation (open assigned, needs reply, at-risk)
   using per-queue business-hours breach clocks.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 13: B3 — replies sent today (send_attempts + comment_actions)

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

> B3 counts, in the user's today window: `send_attempts` with `approved_by == me AND status=='sent' AND sent_at ∈ window` PLUS `comment_actions` with `requested_by == me AND status=='succeeded' AND completed_at ∈ window`.
> **Spec drift:** spec §5/B3 says comment status `'completed'` — the real enum value is **`'succeeded'`** (verified `meta-inbox-manager-dashboard.ts:633`) and the timestamp column is `completed_at`. Use `'succeeded'` + `completed_at`.

1. - [ ] Append failing tests:
   ```ts
   import {
     computeRepliesSentToday,
     type SendAttemptLike,
     type CommentActionLike,
   } from "../src/lib/inbox-metrics.ts";

   describe("computeRepliesSentToday (B3)", () => {
     // user window: PT today = 2026-05-27 10:00→19:00 PT == 17:00Z→02:00Z(next).
     const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
     const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT, inside today
     it("counts sent send-attempts and succeeded comment actions within the window", () => {
       const sends: SendAttemptLike[] = [
         { approved_by: ME, status: "sent", sent_at: "2026-05-27T18:00:00Z" }, // 11:00 PT ✓
         { approved_by: ME, status: "sent", sent_at: "2026-05-27T16:00:00Z" }, // 09:00 PT (before open) ✗
         { approved_by: ME, status: "queued", sent_at: "2026-05-27T18:30:00Z" }, // not sent ✗
         { approved_by: "other", status: "sent", sent_at: "2026-05-27T18:30:00Z" }, // not me ✗
       ];
       const comments: CommentActionLike[] = [
         { requested_by: ME, status: "succeeded", completed_at: "2026-05-27T20:00:00Z" }, // 13:00 PT ✓
         { requested_by: ME, status: "failed", completed_at: "2026-05-27T20:30:00Z" }, // ✗
       ];
       assert.equal(computeRepliesSentToday(sends, comments, ME, userWindow, now), 2);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   export type SendAttemptLike = {
     approved_by: string | null;
     status: string;
     sent_at: string | null;
   };

   export type CommentActionLike = {
     requested_by: string | null;
     status: string;
     completed_at: string | null;
   };

   function inWindow(iso: string | null, start: Date, end: Date): boolean {
     if (!iso) return false;
     const t = Date.parse(iso);
     return Number.isFinite(t) && t >= start.getTime() && t < end.getTime();
   }

   export function computeRepliesSentToday(
     sendAttempts: SendAttemptLike[],
     commentActions: CommentActionLike[],
     userId: string,
     userWindow: BusinessWindow,
     now: Date,
   ): number {
     const today = todaysWindow(now, userWindow);
     let count = 0;
     for (const s of sendAttempts) {
       if (s.approved_by === userId && s.status === "sent" && inWindow(s.sent_at, today.start, today.end)) {
         count += 1;
       }
     }
     for (const c of commentActions) {
       if (c.requested_by === userId && c.status === "succeeded" && inWindow(c.completed_at, today.start, today.end)) {
         count += 1;
       }
     }
     return count;
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): compute B3 replies sent today

   Counts sent send-attempts and succeeded comment actions by the user
   inside their local business window.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 14: B1 today avg first-response + B2 on-time rate (pure compute)

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

> Per conversation: `firstOutboundAt = MIN(sent_at)` among the user's `status='sent'` attempts for that conversation. Response = `businessSecondsBetween(first_inbound_at, firstOutboundAt, queueWindow)`. **Bucketing into "today"** uses the user's window on `firstOutboundAt`. **B1 exclusion:** drop conversations whose `first_inbound_at` is > 7 days before the reply (spec §5/B1 edge) from the avg — but they still count toward B2 (on-time, always late) and B3. **On-time** = response ≤ `SLA_BUSINESS_SECONDS`.

1. - [ ] Append failing tests:
   ```ts
   import {
     computeTodayResponseMetrics,
     type RepliedConversation,
   } from "../src/lib/inbox-metrics.ts";

   describe("computeTodayResponseMetrics (B1/B2)", () => {
     const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
     const now = new Date("2026-05-27T22:00:00Z"); // 15:00 PT
     it("averages business-seconds to first response and computes on-time rate", () => {
       const replied: RepliedConversation[] = [
         // arrived 10:00 PT (17:00Z), first reply 11:00 PT (18:00Z) → 3600s, on-time
         { firstInboundAt: "2026-05-27T17:00:00Z", firstOutboundAt: "2026-05-27T18:00:00Z", queueKey: "us_product" },
         // arrived 10:00 PT, first reply 14:00 PT (21:00Z) → 14400s > 10800 → late
         { firstInboundAt: "2026-05-27T17:00:00Z", firstOutboundAt: "2026-05-27T21:00:00Z", queueKey: "us_product" },
       ];
       const r = computeTodayResponseMetrics(replied, userWindow, QMAP, now);
       assert.equal(r.avgResponseSec, 9000); // (3600 + 14400)/2
       assert.equal(r.onTimeRate, 0.5);
       assert.equal(r.repliesConsidered, 2);
     });
     it("returns nulls when there are no replies today", () => {
       const r = computeTodayResponseMetrics([], userWindow, QMAP, now);
       assert.equal(r.avgResponseSec, null);
       assert.equal(r.onTimeRate, null);
     });
     it("excludes >7-day-old threads from the avg but keeps them in on-time rate", () => {
       const replied: RepliedConversation[] = [
         { firstInboundAt: "2026-05-27T17:00:00Z", firstOutboundAt: "2026-05-27T18:00:00Z", queueKey: "us_product" }, // 3600s on-time
         { firstInboundAt: "2026-05-10T17:00:00Z", firstOutboundAt: "2026-05-27T18:00:00Z", queueKey: "us_product" }, // >7d old, always late
       ];
       const r = computeTodayResponseMetrics(replied, userWindow, QMAP, now);
       assert.equal(r.avgResponseSec, 3600); // only the fresh one
       assert.equal(r.onTimeRate, 0.5); // both count for on-time; old one late
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   const SEVEN_DAYS_MS = 7 * 86_400_000;

   export type RepliedConversation = {
     firstInboundAt: string | null;
     firstOutboundAt: string | null;
     queueKey: string;
   };

   export function computeTodayResponseMetrics(
     replied: RepliedConversation[],
     userWindow: BusinessWindow,
     queueWindows: QueueWindowMap,
     now: Date,
   ): { avgResponseSec: number | null; onTimeRate: number | null; repliesConsidered: number } {
     const today = todaysWindow(now, userWindow);
     const avgSamples: number[] = [];
     let onTime = 0;
     let total = 0;

     for (const r of replied) {
       if (!r.firstInboundAt || !r.firstOutboundAt) continue;
       const inbound = new Date(r.firstInboundAt);
       const outbound = new Date(r.firstOutboundAt);
       if (Number.isNaN(inbound.getTime()) || Number.isNaN(outbound.getTime())) continue;
       // Bucket by reply time in user's window.
       if (!inWindow(r.firstOutboundAt, today.start, today.end)) continue;

       const w = getQueueWindow(queueWindows, r.queueKey);
       const responseSec = businessSecondsBetween(inbound, outbound, w);
       total += 1;
       if (responseSec <= SLA_BUSINESS_SECONDS) onTime += 1;

       // B1 avg excludes threads older than 7 days at reply time.
       if (outbound.getTime() - inbound.getTime() <= SEVEN_DAYS_MS) {
         avgSamples.push(responseSec);
       }
     }

     const avgResponseSec = avgSamples.length
       ? Math.round(avgSamples.reduce((a, b) => a + b, 0) / avgSamples.length)
       : null;
     const onTimeRate = total ? onTime / total : null;
     return { avgResponseSec, onTimeRate, repliesConsidered: total };
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): compute B1 avg first-response and B2 on-time rate

   Business-hours response averaging that bucket-filters by the user's window
   and excludes >7-day-old threads from the average while keeping them in the
   on-time rate.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 15: yesterday avg from metrics_daily

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

1. - [ ] Append failing tests:
   ```ts
   import {
     pickYesterdayAvg,
     userDateString,
     type MetricsDailyRow,
   } from "../src/lib/inbox-metrics.ts";

   describe("pickYesterdayAvg", () => {
     const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
     it("returns the avg_response_seconds for the user's yesterday date", () => {
       const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT today=05-27, yesterday=05-26
       const rows: MetricsDailyRow[] = [
         { user_id: ME, date: "2026-05-26", avg_response_seconds: 2400 },
         { user_id: ME, date: "2026-05-25", avg_response_seconds: 9999 },
       ];
       assert.equal(pickYesterdayAvg(rows, ME, now, userWindow), 2400);
     });
     it("returns null when there is no row for yesterday", () => {
       const now = new Date("2026-05-27T19:00:00Z");
       assert.equal(pickYesterdayAvg([], ME, now, userWindow), null);
     });
     it("computes the user-tz calendar date string", () => {
       assert.equal(userDateString(new Date("2026-05-28T02:30:00Z"), userWindow), "2026-05-27"); // 19:30 PT still 05-27
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   export type MetricsDailyRow = {
     user_id: string;
     date: string; // YYYY-MM-DD
     avg_response_seconds: number | null;
     on_time_replies?: number;
     total_replies?: number;
     team_claims?: number;
   };

   export function userDateString(now: Date, userWindow: BusinessWindow): string {
     const fmt = new Intl.DateTimeFormat("en-CA", {
       timeZone: userWindow.tz,
       year: "numeric",
       month: "2-digit",
       day: "2-digit",
     });
     return fmt.format(now); // en-CA → YYYY-MM-DD
   }

   export function userYesterdayDateString(now: Date, userWindow: BusinessWindow): string {
     const today = userDateString(now, userWindow);
     const [y, m, d] = today.split("-").map(Number);
     const prev = new Date(Date.UTC(y, m - 1, d) - 86_400_000);
     return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}-${String(prev.getUTCDate()).padStart(2, "0")}`;
   }

   export function pickYesterdayAvg(
     rows: MetricsDailyRow[],
     userId: string,
     now: Date,
     userWindow: BusinessWindow,
   ): number | null {
     const yesterday = userYesterdayDateString(now, userWindow);
     const row = rows.find((r) => r.user_id === userId && r.date === yesterday);
     return row ? row.avg_response_seconds : null;
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): read yesterday avg response from metrics_daily

   Adds user-tz date helpers and yesterday-avg lookup against the daily
   rollup rows.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 16: C1 unassigned + C3 oldest unassigned

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

1. - [ ] Append failing tests:
   ```ts
   import { computeUnassignedMetrics } from "../src/lib/inbox-metrics.ts";

   describe("computeUnassignedMetrics (C1/C3)", () => {
     const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT
     it("counts unassigned open convs and oldest business-age", () => {
       const rows: ConversationLike[] = [
         { id: "a", assigned_user_id: null, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T18:00:00Z", queue_category_key: "us_product" }, // 11:00 PT → 60 biz-min old
         { id: "b", assigned_user_id: null, conversation_status: "new_inquiry", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T17:00:00Z", queue_category_key: "us_product" }, // 10:00 PT → 120 biz-min old (oldest)
         { id: "c", assigned_user_id: null, conversation_status: "closed", needs_reply: false, latest_inbound_at: null, first_inbound_at: "2026-05-27T16:00:00Z", queue_category_key: "us_product" }, // closed → ignored
         { id: "d", assigned_user_id: ME, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T17:00:00Z", queue_category_key: "us_product" }, // assigned → ignored
       ];
       const r = computeUnassignedMetrics(rows, now, QMAP);
       assert.equal(r.unassigned, 2);
       assert.equal(r.oldestUnassignedSec, 7200); // 120 min from 10:00→12:00 PT
     });
     it("returns null oldest when no unassigned open convs", () => {
       const r = computeUnassignedMetrics([], now, QMAP);
       assert.equal(r.unassigned, 0);
       assert.equal(r.oldestUnassignedSec, null);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   export function computeUnassignedMetrics(
     conversations: ConversationLike[],
     now: Date,
     queueWindows: QueueWindowMap,
   ): { unassigned: number; oldestUnassignedSec: number | null } {
     let unassigned = 0;
     let oldest: number | null = null;
     for (const c of conversations) {
       if (c.assigned_user_id !== null || !isOpenConversation(c)) continue;
       unassigned += 1;
       const arrived = c.first_inbound_at ? new Date(c.first_inbound_at) : null;
       if (!arrived || Number.isNaN(arrived.getTime())) continue;
       const w = getQueueWindow(queueWindows, c.queue_category_key);
       const ageSec = businessSecondsBetween(arrived, now, w);
       if (oldest === null || ageSec > oldest) oldest = ageSec;
     }
     return { unassigned, oldestUnassignedSec: oldest };
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): compute C1 unassigned count and C3 oldest age

   Counts open unassigned conversations and the oldest business-hours age in
   the team queue.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 17: C2 claims today (assignment_changed events) — pure compute + canonical query doc

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

> Numerator: `assignment_changed` events where `previous_value->>assignedUserId IS NULL` and `new_value->>assignedUserId == me` and `event_at ∈ user's today window`. Denominator: conversations whose `first_inbound_at ∈ user's today window` AND no assignment event before `first_inbound_at` (i.e. they arrived unassigned today). The canonical SQL from spec §15.1 is the source-of-truth for the numerator's fetcher; the pure compute mirrors it over in-memory rows.

1. - [ ] Append failing tests:
   ```ts
   import {
     computeClaimsToday,
     type AssignmentEventLike,
   } from "../src/lib/inbox-metrics.ts";

   describe("computeClaimsToday (C2)", () => {
     const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
     const now = new Date("2026-05-27T22:00:00Z"); // 15:00 PT
     it("counts unassigned→me claims within today and the today-arrival denominator", () => {
       const events: AssignmentEventLike[] = [
         { event_at: "2026-05-27T18:00:00Z", previousAssignedUserId: null, newAssignedUserId: ME }, // claim ✓
         { event_at: "2026-05-27T19:00:00Z", previousAssignedUserId: "other", newAssignedUserId: ME }, // reassignment, not a claim ✗
         { event_at: "2026-05-26T18:00:00Z", previousAssignedUserId: null, newAssignedUserId: ME }, // yesterday ✗
         { event_at: "2026-05-27T20:00:00Z", previousAssignedUserId: null, newAssignedUserId: "other" }, // someone else ✗
       ];
       const arrivals: ConversationLike[] = [
         { id: "a", assigned_user_id: ME, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T18:00:00Z", queue_category_key: "us_product" }, // arrived today ✓
         { id: "b", assigned_user_id: null, conversation_status: "new_inquiry", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-27T17:30:00Z", queue_category_key: "us_product" }, // arrived today ✓
         { id: "c", assigned_user_id: ME, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: null, first_inbound_at: "2026-05-26T18:00:00Z", queue_category_key: "us_product" }, // yesterday ✗
       ];
       const r = computeClaimsToday(events, arrivals, ME, userWindow, now);
       assert.equal(r.claimedByMe, 1);
       assert.equal(r.todayUnassignedDenominator, 2);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   // C2 — Mirrors the canonical SQL (spec §15.1). The fetcher in
   // getPersonalHeaderMetrics runs the same logic server-side:
   //   SELECT COUNT(*) FROM meta_inbox_conversation_events e
   //    WHERE e.environment = $env AND e.event_type = 'assignment_changed'
   //      AND e.event_at >= $todayBusinessStart
   //      AND (e.previous_value->>'assignedUserId') IS NULL
   //      AND (e.new_value->>'assignedUserId') = $me;
   export type AssignmentEventLike = {
     event_at: string;
     previousAssignedUserId: string | null;
     newAssignedUserId: string | null;
   };

   export function computeClaimsToday(
     events: AssignmentEventLike[],
     arrivals: ConversationLike[],
     userId: string,
     userWindow: BusinessWindow,
     now: Date,
   ): { claimedByMe: number; todayUnassignedDenominator: number } {
     const today = todaysWindow(now, userWindow);
     let claimedByMe = 0;
     for (const e of events) {
       if (
         e.previousAssignedUserId === null &&
         e.newAssignedUserId === userId &&
         inWindow(e.event_at, today.start, today.end)
       ) {
         claimedByMe += 1;
       }
     }
     let denominator = 0;
     for (const c of arrivals) {
       if (inWindow(c.first_inbound_at, today.start, today.end)) denominator += 1;
     }
     return { claimedByMe, todayUnassignedDenominator: denominator };
   }
   ```
   > NOTE on denominator: spec §5/C2 also says "no assignment event before `first_inbound_at`". In practice every conversation arrives unassigned (assignment is a later human action), so counting today-arrivals is the correct denominator; the "no prior assignment" clause is defensive. If a future flow pre-assigns on arrival, refine the fetcher then. Keep the pure function as written.
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): compute C2 team-queue claims today

   Counts unassigned→me assignment_changed events in the user's window and
   the today-arrival denominator, mirroring the canonical audit query.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 18: teammatesOverSla (lead-only)

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append)

> Spec §4.3: `COUNT(DISTINCT user)` among teammates where ∃ a conversation assigned to them with `needs_reply` AND `businessSecondsRemainingUntil(breachAt, now, queueWindow) <= 1800` (at-risk or breached). Computed only when `profile.teamLead === true`. Pure function takes the conversations + the set of teammate ids.

1. - [ ] Append failing tests:
   ```ts
   import { computeTeammatesOverSla } from "../src/lib/inbox-metrics.ts";

   describe("computeTeammatesOverSla", () => {
     const now = new Date("2026-05-27T21:00:00Z"); // 14:00 PT (breach@13:00 cases are over)
     const U1 = "aaaaaaaa-1111-4111-8111-111111111111";
     const U2 = "bbbbbbbb-2222-4222-8222-222222222222";
     it("counts distinct teammates with an at-risk/breached needs-reply conv", () => {
       const rows: ConversationLike[] = [
         { id: "x", assigned_user_id: U1, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: "2026-05-27T16:00:00Z", first_inbound_at: "2026-05-27T16:00:00Z", queue_category_key: "us_product" }, // breach 13:00 PT, now 14:00 → breached
         { id: "y", assigned_user_id: U1, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: "2026-05-27T16:00:00Z", first_inbound_at: "2026-05-27T16:00:00Z", queue_category_key: "us_product" }, // same user, still 1 distinct
         { id: "z", assigned_user_id: U2, conversation_status: "needs_reply", needs_reply: true, latest_inbound_at: "2026-05-27T20:30:00Z", first_inbound_at: "2026-05-27T20:30:00Z", queue_category_key: "us_product" }, // arrived 13:30, breach 16:30, plenty left → not at risk
       ];
       assert.equal(computeTeammatesOverSla(rows, new Set([U1, U2]), now, QMAP), 1);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append):
   ```ts
   export function computeTeammatesOverSla(
     conversations: ConversationLike[],
     teamUserIds: ReadonlySet<string>,
     now: Date,
     queueWindows: QueueWindowMap,
   ): number {
     const flagged = new Set<string>();
     for (const c of conversations) {
       const uid = c.assigned_user_id;
       if (!uid || !teamUserIds.has(uid) || !c.needs_reply || !isOpenConversation(c)) continue;
       if (flagged.has(uid)) continue;
       const arrived = c.latest_inbound_at ? new Date(c.latest_inbound_at) : null;
       if (!arrived || Number.isNaN(arrived.getTime())) continue;
       const w = getQueueWindow(queueWindows, c.queue_category_key);
       const remaining = businessSecondsRemainingUntil(breachAt(arrived, SLA_BUSINESS_SECONDS, w), now, w);
       if (remaining <= AT_RISK_REMAINING_SECONDS) flagged.add(uid);
     }
     return flagged.size;
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): compute teammatesOverSla for the lead nudge

   Counts distinct teammates holding an at-risk or breached needs-reply
   conversation; used only for team leads.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 19: windowState assembly + getPersonalHeaderMetrics fetcher + zero/edge handling

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics.test.ts` (append — covers the pure assembler `assemblePersonalHeaderMetrics`)

> Assemble all pieces into `PersonalHeaderMetrics`. `windowState` derives from `todaysWindow(now, userWindow).state` mapping `before→before_hours`, `open→open`, `after→after_hours`. `businessSecondsRemainingToday` = `businessSecondsRemainingUntil(todayWindow.end, now, userWindow)` clamped to ≥0. Then write the async `getPersonalHeaderMetrics(profile, now)` fetcher that gathers rows via `dynamicSupabase("web")` + `getSocialInboxData` and delegates to the assembler. Only the assembler is unit-tested.

1. - [ ] Append failing test for the assembler:
   ```ts
   import { assemblePersonalHeaderMetrics } from "../src/lib/inbox-metrics.ts";

   describe("assemblePersonalHeaderMetrics", () => {
     const userWindow = { tz: "America/Los_Angeles", startHour: 10, endHour: 19 };
     it("maps open state and merges all metric groups", () => {
       const now = new Date("2026-05-27T19:00:00Z"); // 12:00 PT → open
       const metrics = assemblePersonalHeaderMetrics({
         userId: ME,
         timezone: "America/Los_Angeles",
         userWindow,
         now,
         pipeline: { assigned: 50, needsReply: 6, atRisk: 2 },
         today: { avgResponseSec: 3000, onTimeRate: 0.92, repliesSent: 14 },
         yesterdayAvgSec: 3900,
         unassigned: 8,
         oldestUnassignedSec: 2820,
         claims: { claimedByMe: 3, todayUnassignedDenominator: 10 },
         teammatesOverSla: 3,
       });
       assert.equal(metrics.windowState, "open");
       assert.equal(metrics.pipeline.needsReply, 6);
       assert.equal(metrics.today.repliesSent, 14);
       assert.equal(metrics.yesterday.avgResponseSec, 3900);
       assert.equal(metrics.team.unassigned, 8);
       assert.equal(metrics.team.claimedByMe, 3);
       assert.equal(metrics.team.teammatesOverSla, 3);
       assert.ok(metrics.user.businessSecondsRemainingToday > 0);
     });
     it("omits teammatesOverSla when undefined (non-lead)", () => {
       const now = new Date("2026-05-27T16:00:00Z"); // 09:00 PT → before
       const metrics = assemblePersonalHeaderMetrics({
         userId: ME, timezone: "America/Los_Angeles", userWindow, now,
         pipeline: { assigned: 0, needsReply: 0, atRisk: 0 },
         today: { avgResponseSec: null, onTimeRate: null, repliesSent: 0 },
         yesterdayAvgSec: null, unassigned: 0, oldestUnassignedSec: null,
         claims: { claimedByMe: 0, todayUnassignedDenominator: 0 },
         teammatesOverSla: undefined,
       });
       assert.equal(metrics.windowState, "before_hours");
       assert.equal(metrics.team.teammatesOverSla, undefined);
       assert.equal(metrics.user.businessSecondsRemainingToday >= 0, true);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement the assembler (append):
   ```ts
   export type PersonalHeaderInput = {
     userId: string;
     timezone: string;
     userWindow: BusinessWindow;
     now: Date;
     pipeline: { assigned: number; needsReply: number; atRisk: number };
     today: { avgResponseSec: number | null; onTimeRate: number | null; repliesSent: number };
     yesterdayAvgSec: number | null;
     unassigned: number;
     oldestUnassignedSec: number | null;
     claims: { claimedByMe: number; todayUnassignedDenominator: number };
     teammatesOverSla: number | undefined;
   };

   export function assemblePersonalHeaderMetrics(input: PersonalHeaderInput): PersonalHeaderMetrics {
     const today = todaysWindow(input.now, input.userWindow);
     const windowState =
       today.state === "before" ? "before_hours" : today.state === "after" ? "after_hours" : "open";
     const remaining = Math.max(
       0,
       businessSecondsRemainingUntil(today.end, input.now, input.userWindow),
     );
     return {
       windowState,
       user: {
         id: input.userId,
         timezone: input.timezone,
         businessSecondsRemainingToday: remaining,
       },
       pipeline: input.pipeline,
       today: input.today,
       yesterday: { avgResponseSec: input.yesterdayAvgSec },
       team: {
         unassigned: input.unassigned,
         claimedByMe: input.claims.claimedByMe,
         todayUnassignedDenominator: input.claims.todayUnassignedDenominator,
         oldestUnassignedSec: input.oldestUnassignedSec,
         ...(input.teammatesOverSla !== undefined
           ? { teammatesOverSla: input.teammatesOverSla }
           : {}),
       },
     };
   }
   ```
4. - [ ] Now add the async fetcher `getPersonalHeaderMetrics` (append; not unit-tested, integration-verified per spec §11). It is a server-only function. Reuse `dynamicSupabase("web")` patterns from `social-inbox.ts`. Add at the bottom of the file, behind a clear `// --- server fetcher (no unit test; DB-backed) ---` banner:
   ```ts
   import { getSocialInboxData } from "./social-inbox.ts";
   import { dynamicSupabaseWeb } from "./inbox-metrics-db.ts"; // small helper added in step 5

   import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";

   export type HeaderProfile = MetaInboxAccessProfile & {
     teamLead?: boolean;
     teamIds?: readonly string[];
     teamUserIds?: readonly string[]; // app_user_ids of teammates (resolved in auth, Task 23)
   };

   export async function getPersonalHeaderMetrics(
     profile: HeaderProfile,
     now: Date,
   ): Promise<PersonalHeaderMetrics> {
     const userId = profile.appUserId;
     if (!userId) {
       // Anonymous / missing app user → empty, before/open neutral.
       const userWindow = DEFAULT_BUSINESS_WINDOW;
       return assemblePersonalHeaderMetrics({
         userId: "",
         timezone: userWindow.tz,
         userWindow,
         now,
         pipeline: { assigned: 0, needsReply: 0, atRisk: 0 },
         today: { avgResponseSec: null, onTimeRate: null, repliesSent: 0 },
         yesterdayAvgSec: null,
         unassigned: 0,
         oldestUnassignedSec: null,
         claims: { claimedByMe: 0, todayUnassignedDenominator: 0 },
         teammatesOverSla: undefined,
       });
     }

     const supabase = dynamicSupabaseWeb();
     const inbox = await getSocialInboxData(profile);

     // Queue windows.
     const { data: queueRows } = await supabase
       .from("meta_inbox_queue_categories")
       .select("key,timezone,business_hours_start,business_hours_end");
     const queueWindows = buildQueueWindowMap((queueRows || []) as QueueCategoryWindowRow[]);

     // User timezone preference (default PT).
     const { data: prefRow } = await supabase
       .from("meta_inbox_user_preferences")
       .select("timezone")
       .eq("user_id", userId)
       .maybeSingle();
     const timezone = (prefRow?.timezone as string | undefined) || DEFAULT_BUSINESS_WINDOW.tz;
     const userWindow = resolveUserWindow(timezone);

     const conversations = inbox.inboxConversations as unknown as ConversationLike[];

     // Pipeline (A1-A3) + unassigned (C1/C3).
     const pipeline = computePipelineMetrics(conversations, userId, now, queueWindows);
     const unassignedMetrics = computeUnassignedMetrics(conversations, now, queueWindows);

     // B3 replies sent today.
     const repliesSent = computeRepliesSentToday(
       inbox.sendAttempts as unknown as SendAttemptLike[],
       inbox.commentActions as unknown as CommentActionLike[],
       userId,
       userWindow,
       now,
     );

     // B1/B2 — build first-reply-by-conversation among my sent attempts.
     const replied = buildRepliedConversations(inbox, userId);
     const todayResponse = computeTodayResponseMetrics(replied, userWindow, queueWindows, now);

     // Yesterday avg from rollup.
     const { data: dailyRows } = await supabase
       .from("meta_inbox_metrics_daily")
       .select("user_id,date,avg_response_seconds")
       .eq("user_id", userId)
       .order("date", { ascending: false })
       .limit(7);
     const yesterdayAvgSec = pickYesterdayAvg((dailyRows || []) as MetricsDailyRow[], userId, now, userWindow);

     // C2 claims today.
     const today = todaysWindow(now, userWindow);
     const { data: eventRows } = await supabase
       .from("meta_inbox_conversation_events")
       .select("event_at,previous_value,new_value")
       .eq("event_type", "assignment_changed")
       .gte("event_at", today.start.toISOString());
     const events: AssignmentEventLike[] = (eventRows || []).map((e: Record<string, unknown>) => ({
       event_at: String(e.event_at),
       previousAssignedUserId:
         (e.previous_value as Record<string, unknown> | null)?.assignedUserId as string | null ?? null,
       newAssignedUserId:
         (e.new_value as Record<string, unknown> | null)?.assignedUserId as string | null ?? null,
     }));
     const claims = computeClaimsToday(events, conversations, userId, userWindow, now);

     // teammatesOverSla — leads only.
     let teammatesOverSla: number | undefined;
     if (profile.teamLead && profile.teamUserIds && profile.teamUserIds.length) {
       teammatesOverSla = computeTeammatesOverSla(
         conversations,
         new Set(profile.teamUserIds),
         now,
         queueWindows,
       );
     }

     return assemblePersonalHeaderMetrics({
       userId,
       timezone,
       userWindow,
       now,
       pipeline,
       today: {
         avgResponseSec: todayResponse.avgResponseSec,
         onTimeRate: todayResponse.onTimeRate,
         repliesSent,
       },
       yesterdayAvgSec,
       unassigned: unassignedMetrics.unassigned,
       oldestUnassignedSec: unassignedMetrics.oldestUnassignedSec,
       claims,
       teammatesOverSla,
     });
   }

   // Builds first-outbound-by-conversation among the user's sent send-attempts,
   // joined to each conversation's first_inbound_at + queue key.
   function buildRepliedConversations(
     inbox: Awaited<ReturnType<typeof getSocialInboxData>>,
     userId: string,
   ): RepliedConversation[] {
     const convById = new Map(inbox.inboxConversations.map((c) => [c.id, c]));
     const firstOutbound = new Map<string, string>();
     for (const s of inbox.sendAttempts) {
       if (s.approved_by !== userId || s.status !== "sent" || !s.sent_at) continue;
       const existing = firstOutbound.get(s.conversation_id);
       if (!existing || Date.parse(s.sent_at) < Date.parse(existing)) {
         firstOutbound.set(s.conversation_id, s.sent_at);
       }
     }
     const out: RepliedConversation[] = [];
     for (const [conversationId, outboundAt] of firstOutbound) {
       const conv = convById.get(conversationId);
       if (!conv) continue;
       out.push({
         firstInboundAt: conv.first_inbound_at,
         firstOutboundAt: outboundAt,
         queueKey: conv.queue_category_key,
       });
     }
     return out;
   }
   ```
5. - [ ] Add the tiny DB helper `src/lib/inbox-metrics-db.ts` (re-exports the existing private `dynamicSupabase` pattern so `inbox-metrics.ts` doesn't import server-only internals into the test path). Implementation:
   ```ts
   import { createAdsAnalystClient } from "./ads-analyst-db.ts";

   // Web-scoped Supabase client for read-only metric queries. Mirrors the
   // private dynamicSupabase("web") in social-inbox.ts.
   export function dynamicSupabaseWeb() {
     return createAdsAnalystClient("web");
   }
   ```
   > NOTE: confirm `createAdsAnalystClient("web")` returns a client with `.from(...).select(...)` (it does — it's the same factory used in `app-auth.ts:164`). If the project exposes a shared `dynamicSupabase` export you can import directly, prefer that and delete this helper.
6. - [ ] Run the assembler test — expect PASS. Run `npm run typecheck` (this will type-check the fetcher against real signatures — fix any `unknown`-cast mismatches the compiler flags; the casts above are deliberate bridges and should satisfy `tsc`). Run `npm run lint`.
   `node --test --experimental-strip-types tests/inbox-metrics.test.ts`
7. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts src/lib/inbox-metrics-db.ts tests/inbox-metrics.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): assemble personal header metrics + DB fetcher

   Adds the pure metric assembler with window-state mapping and the
   server-side getPersonalHeaderMetrics fetcher that gathers rows and
   delegates to the tested compute layer.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 4 — assignment facade

> Spec §15.1: the existing workflow at `meta-inbox-workflow.ts:95-142` already emits an `assignment_changed` event on every assignment mutation, and `updateSocialInboxConversationWorkflow` (`social-inbox.ts:868-943`) is the sole site that persists update + events. So the facade is thin: a single sanctioned entry point that calls the workflow and **asserts** the event was emitted, plus a guard test/lint preventing future direct `assigned_user_id` writes.

### Task 20: inbox-assignment.ts updateAssignment facade

**Files:**
- Create: `src/lib/inbox-assignment.ts`
- Test: `tests/inbox-assignment.test.ts`

> The facade builds the workflow mutation via `buildMetaInboxWorkflowMutation` (pure, already imported by `social-inbox.ts`) to assert an `assignment_changed` event is produced for an assignment change, then delegates persistence to `updateSocialInboxConversationWorkflow`. The unit test exercises the **pure assertion** path against `buildMetaInboxWorkflowMutation` (no DB): given a self-claim or unassign, the mutation must contain exactly one `assignment_changed` event; given a no-op, it must contain none and the facade must throw a clear error rather than silently persisting nothing.

1. - [ ] Write the failing test `tests/inbox-assignment.test.ts`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import { assertAssignmentEventEmitted } from "../src/lib/inbox-assignment.ts";
   import { buildMetaInboxWorkflowMutation } from "../src/lib/meta-inbox-workflow.ts";

   const ACTOR = "11111111-1111-4111-8111-111111111111";

   function baseConversation(overrides: Record<string, unknown> = {}) {
     return {
       id: "c1",
       canonical_conversation_key: "k",
       source_channel: "facebook_message",
       source_type: "message_thread",
       platform: "facebook",
       customer_profile_id: null,
       page_id: null, ig_user_id: null, participant_id: null,
       platform_thread_id: null, parent_content_id: null, source_id: null,
       first_inbound_at: null, latest_inbound_at: null, latest_outbound_at: null,
       last_activity_at: null, needs_reply: false,
       reply_window_expires_at: null, human_agent_window_expires_at: null,
       send_eligibility: "unknown", conversation_status: "needs_reply",
       assigned_team_id: null, assigned_user_id: null, follow_up_at: null,
       lead_quality: null, lead_quality_reason_tags: [],
       inbox_outcome: "no_outcome_yet", inbox_lost_reason: null,
       queue_category_key: "us_product",
       routing_source: null, routing_confidence: null, routing_explanation: null,
       ...overrides,
     } as never;
   }

   describe("assertAssignmentEventEmitted", () => {
     it("passes when a self-claim produced an assignment_changed event", () => {
       const mutation = buildMetaInboxWorkflowMutation(
         baseConversation({ assigned_user_id: null }),
         { assignmentMode: "claim_self" },
         { actorUserId: ACTOR, now: "2026-05-27T19:00:00Z" },
       );
       assert.doesNotThrow(() => assertAssignmentEventEmitted(mutation));
       assert.equal(mutation.events.filter((e) => e.eventType === "assignment_changed").length, 1);
     });
     it("throws when no assignment change occurred (already assigned to actor)", () => {
       const mutation = buildMetaInboxWorkflowMutation(
         baseConversation({ assigned_user_id: ACTOR }),
         { assignmentMode: "claim_self" },
         { actorUserId: ACTOR, now: "2026-05-27T19:00:00Z" },
       );
       assert.throws(() => assertAssignmentEventEmitted(mutation), /assignment_changed/);
     });
   });
   ```
2. - [ ] Run it — expect FAIL: `node --test --experimental-strip-types tests/inbox-assignment.test.ts`.
3. - [ ] Implement `src/lib/inbox-assignment.ts`:
   ```ts
   import type { MetaInboxAccessProfile } from "./meta-inbox-access.ts";
   import type { MetaInboxWorkflowMutation } from "./meta-inbox-workflow.ts";
   import { updateSocialInboxConversationWorkflow } from "./social-inbox.ts";

   // Guard: the workflow MUST have emitted an assignment_changed event for an
   // assignment mutation. Catches a future regression where the workflow stops
   // writing the audit row that C2/manager-view depend on.
   export function assertAssignmentEventEmitted(mutation: MetaInboxWorkflowMutation): void {
     const emitted = mutation.events.some((event) => event.eventType === "assignment_changed");
     if (!emitted) {
       throw new Error(
         "updateAssignment: expected an assignment_changed event but none was emitted " +
           "(no-op assignment or workflow regression).",
       );
     }
   }

   // Sole sanctioned assignment-mutation path. Delegates to the existing
   // workflow (which persists the conversation update AND the assignment_changed
   // audit event) and verifies the audit event landed.
   export async function updateAssignment(
     conversationId: string,
     next: { user_id: string | null; team_id: string | null; actor_id: string },
     profile: MetaInboxAccessProfile,
   ): Promise<void> {
     const result = await updateSocialInboxConversationWorkflow(conversationId, profile, {
       assignmentMode: next.user_id ? "claim_self" : "team_queue",
       assignedTeamId: next.team_id,
     });
     const emitted = result.events.some((event) => event.event_type === "assignment_changed");
     if (!emitted) {
       throw new Error(
         "updateAssignment: workflow persisted no assignment_changed event " +
           "(assignment may not have changed).",
       );
     }
   }
   ```
   > NOTE: the workflow's `claim_self` claims for `context.actorUserId` (the profile's `appUserId`), not an arbitrary `next.user_id`. For v1 the only assignment flows are self-claim and release-to-queue, so `user_id` truthiness selects the mode. If a future flow needs to assign *another* user, extend the workflow's `MetaInboxWorkflowPatchInput` then — do not bypass this facade.
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/lib/inbox-assignment.ts tests/inbox-assignment.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add updateAssignment facade over the workflow

   Routes assignment mutations through one entry point that delegates to the
   existing workflow and asserts the assignment_changed audit event is
   emitted, protecting the C2/manager-view data source.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 21: migrate assignment mutation sites through the facade

**Files:**
- Modify: assignment-mutation call sites (verified: the only persistence site is `updateSocialInboxConversationWorkflow`; UI/route callers pass `assignmentMode` through it)
- Test: `tests/inbox-assignment.test.ts` (no new behavior — covered by guard test in Task 22)

> Verified: a repo-wide search for assignment writes (`rg -n "assigned_user_id" src/`) shows the only direct write is inside `meta-inbox-workflow.ts:126` (the workflow itself). All UI/API assignment actions already funnel through `updateSocialInboxConversationWorkflow` via `assignmentMode`. There is therefore **no parallel mutation site to migrate** for v1. This task documents that finding and adds a re-export so future callers reach for the facade name.

1. - [ ] Re-run the search to confirm before/after: `rg -n "assignmentMode|assigned_user_id" src/` — confirm the only `assigned_user_id` write is `meta-inbox-workflow.ts:126` and `assignmentMode` is consumed only inside the workflow + passed by `updateSocialInboxConversationWorkflow` callers. Record the matching files in the commit body.
2. - [ ] Where a route/server-action performs a *bare* assignment (assignment-only patch with no other workflow field), update it to call `updateAssignment(...)` from `inbox-assignment.ts` instead of `updateSocialInboxConversationWorkflow(...)` directly. If none exist (expected for v1), make no code change here and proceed — the facade stands ready and the guard (Task 22) enforces future compliance. (Do not refactor multi-field workflow patches; those legitimately stay on `updateSocialInboxConversationWorkflow`.)
3. - [ ] Run the full suite to confirm nothing regressed: `npm test`. Run `npm run typecheck`.
4. - [ ] Commit (only if a real call site changed; otherwise skip the commit and note in Task 22's commit body that no sites required migration):
   ```bash
   git add src
   git commit -m "$(cat <<'EOF'
   refactor(inbox): route bare assignment mutations through updateAssignment

   Points standalone assignment actions at the sanctioned facade; multi-field
   workflow patches continue to use the workflow directly.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 22: guard test banning direct assigned_user_id writes outside the facade/workflow

**Files:**
- Test: `tests/inbox-assignment-guard.test.ts`

> Rather than a custom ESLint rule (heavier setup), add a source-scanning guard test (the repo already uses source-scanning tests — see `inbox-top-chrome.test.ts` loading raw source). It greps `src/` for any `.assigned_user_id` write outside the two sanctioned files and fails if found. This is the spec §12 mitigation in test form.

1. - [ ] Write the failing-then-passing guard test `tests/inbox-assignment-guard.test.ts` (it should PASS immediately given the verified single-site reality — but it is written to FAIL if anyone adds a stray write):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync, statSync } from "node:fs";
   import { join, resolve } from "node:path";
   import { describe, it } from "node:test";

   const SRC = resolve("src");
   // Only these files may assign assigned_user_id directly.
   const SANCTIONED = new Set([
     resolve("src/lib/meta-inbox-workflow.ts"),
     resolve("src/lib/inbox-assignment.ts"),
   ]);
   // Matches an assignment write like `update.assigned_user_id =` or
   // `assigned_user_id:` inside an update payload object.
   const WRITE_RE = /\.assigned_user_id\s*=|assigned_user_id\s*:/;

   function walk(dir: string): string[] {
     return readdirSync(dir).flatMap((name) => {
       const full = join(dir, name);
       if (statSync(full).isDirectory()) return walk(full);
       return /\.(ts|tsx)$/.test(full) ? [full] : [];
     });
   }

   describe("assignment mutation guard", () => {
     it("only the workflow and facade write assigned_user_id directly", () => {
       const offenders: string[] = [];
       for (const file of walk(SRC)) {
         if (SANCTIONED.has(file)) continue;
         const text = readFileSync(file, "utf8");
         for (const line of text.split("\n")) {
           // Allow reads/comparisons; flag only writes.
           if (WRITE_RE.test(line) && !line.includes("===") && !line.includes("!==")) {
             offenders.push(`${file}: ${line.trim()}`);
           }
         }
       }
       assert.deepEqual(offenders, [], `Direct assigned_user_id writes found:\n${offenders.join("\n")}`);
     });
   });
   ```
2. - [ ] Run it: `node --test --experimental-strip-types tests/inbox-assignment-guard.test.ts`. Expected PASS. If it FAILS, the offender list tells you which file needs to route through `updateAssignment` (do that, then re-run). To prove the guard bites, temporarily add `update.assigned_user_id = x;` to a scratch file under `src/` and confirm it FAILS, then remove it.
3. - [ ] Run `npm test` + `npm run typecheck` + `npm run lint`.
4. - [ ] Commit:
   ```bash
   git add tests/inbox-assignment-guard.test.ts
   git commit -m "$(cat <<'EOF'
   test(inbox): guard against direct assigned_user_id writes

   Source-scanning test that fails if any file outside the workflow and the
   updateAssignment facade writes assigned_user_id, protecting claim
   attribution. No existing call sites required migration.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 5 — auth profile extension

### Task 23: extend getServerAccessProfile with teamLead + teamIds (+ teamUserIds)

**Files:**
- Modify: `src/lib/app-auth.ts` (the `AccessProfile` type + both profile builders)
- Modify: `src/lib/server-route-auth.ts` (if it re-derives — verify)
- Test: `tests/access-profile-team.test.ts`

> Spec §8.2/§15.4: profile gains `teamLead: boolean` and `teamIds: string[]` from `meta_inbox_team_members`. We additionally add `teamUserIds: string[]` (app_user_ids of all members of the lead's teams) so `getPersonalHeaderMetrics` can compute `teammatesOverSla` without another round-trip. `meta_inbox_team_members.app_user_id` is a bare uuid keyed off the profile's `appUserId`.

1. - [ ] Write the failing test `tests/access-profile-team.test.ts`. Since the profile builders are DB-backed, unit-test the **pure derivation helper** `deriveTeamMembership(rows, appUserId)` that we extract:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import { deriveTeamMembership } from "../src/lib/app-auth.ts";

   const ME = "11111111-1111-4111-8111-111111111111";
   const T1 = "team-1";
   const T2 = "team-2";
   const MATE = "22222222-2222-4222-8222-222222222222";

   describe("deriveTeamMembership", () => {
     it("marks teamLead and collects team ids + teammate user ids", () => {
       const rows = [
         { team_id: T1, app_user_id: ME, role: "lead" },
         { team_id: T1, app_user_id: MATE, role: "member" },
         { team_id: T2, app_user_id: ME, role: "member" }, // member elsewhere
       ];
       const r = deriveTeamMembership(rows, ME);
       assert.equal(r.teamLead, true); // lead in at least one team
       assert.deepEqual([...r.teamIds].sort(), [T1, T2].sort());
       // teammate user ids = members of teams where ME is lead (T1), excluding ME
       assert.deepEqual(r.teamUserIds, [MATE]);
     });
     it("non-lead has teamLead false and no teammate ids", () => {
       const rows = [{ team_id: T1, app_user_id: ME, role: "member" }];
       const r = deriveTeamMembership(rows, ME);
       assert.equal(r.teamLead, false);
       assert.deepEqual(r.teamIds, [T1]);
       assert.deepEqual(r.teamUserIds, []);
     });
     it("handles a null appUserId", () => {
       const r = deriveTeamMembership([], null);
       assert.equal(r.teamLead, false);
       assert.deepEqual(r.teamIds, []);
       assert.deepEqual(r.teamUserIds, []);
     });
   });
   ```
2. - [ ] Run it — expect FAIL: `node --test --experimental-strip-types tests/access-profile-team.test.ts`.
3. - [ ] In `src/lib/app-auth.ts`, extend the `AccessProfile` type (after line 24's closing of the type, add fields) and add the pure helper + wire it into both builders.
   - Add to the `AccessProfile` type (inside the `export type AccessProfile = { ... }` block, `src/lib/app-auth.ts:13-24`):
     ```ts
       teamLead: boolean;
       teamIds: string[];
       teamUserIds: string[];
     ```
   - Add the exported pure helper (top-level, e.g. after `anonymousProfile`):
     ```ts
     export type TeamMemberRow = { team_id: string; app_user_id: string; role: string };

     export function deriveTeamMembership(
       rows: TeamMemberRow[],
       appUserId: string | null,
     ): { teamLead: boolean; teamIds: string[]; teamUserIds: string[] } {
       if (!appUserId) return { teamLead: false, teamIds: [], teamUserIds: [] };
       const myRows = rows.filter((r) => r.app_user_id === appUserId);
       const teamIds = Array.from(new Set(myRows.map((r) => r.team_id)));
       const ledTeamIds = new Set(myRows.filter((r) => r.role === "lead").map((r) => r.team_id));
       const teamLead = ledTeamIds.size > 0;
       const teamUserIds = Array.from(
         new Set(
           rows
             .filter((r) => ledTeamIds.has(r.team_id) && r.app_user_id !== appUserId)
             .map((r) => r.app_user_id),
         ),
       );
       return { teamLead, teamIds, teamUserIds };
     }

     async function loadTeamMembership(
       supabase: { from: (t: string) => { select: (c: string) => Promise<{ data: TeamMemberRow[] | null; error: unknown }> } },
       appUserId: string | null,
     ): Promise<{ teamLead: boolean; teamIds: string[]; teamUserIds: string[] }> {
       if (!appUserId) return { teamLead: false, teamIds: [], teamUserIds: [] };
       const { data } = await supabase.from("meta_inbox_team_members").select("team_id,app_user_id,role");
       return deriveTeamMembership((data || []) as TeamMemberRow[], appUserId);
     }
     ```
     > NOTE: the `meta_inbox_team_members` read must go through a client that can see those rows. Use the same `createAdsAnalystClient` / service path the builder already holds. In `getLegacyAccessProfileForAuthUser` you have `createServiceClient()`; in `getAccessProfileForAuthUser` use the analyst client. Both expose `.from("meta_inbox_team_members").select("team_id,app_user_id,role")`. Wrap in try/catch and default to the empty membership on error so auth never hard-fails on a metrics table.
   - In **each** of the three profile-returning code paths that have a real app user (the success branches of `getAccessProfileForAuthUser`, `getLegacyAccessProfileForAuthUser`, and the `getLocalTestAccessProfileForToken`), compute membership and spread it into the returned object. For the local-test profile (`appUserId: "local-test-app-user"`), hardcode `teamLead: false, teamIds: [], teamUserIds: []` (it is not a real uuid). For the **anonymous** and **missing-app-profile** returns, also add `teamLead: false, teamIds: [], teamUserIds: []`.
   - Example for the `getAccessProfileForAuthUser` success branch (after computing `roles`, before `return`):
     ```ts
     const membership = await loadTeamMembership(
       supabase as unknown as Parameters<typeof loadTeamMembership>[0],
       profile.app_user_id,
     );
     return {
       authenticated: true,
       authUserId: user.id,
       appUserId: profile.app_user_id,
       email: profile.email,
       fullName: profile.full_name,
       initials: profile.initials,
       active: profile.active,
       roles,
       permissions: permissionsForRoles(roles),
       missingAppProfile: false,
       ...membership,
     };
     ```
   - Apply the analogous spread (`...membership` or the hardcoded empty trio) to **every** `return { ...AccessProfile... }` in the file so the type stays satisfied. `tsc` will list any you miss.
4. - [ ] Run the test — expect PASS. Run `npm run typecheck` — fix every "missing teamLead/teamIds/teamUserIds" error by adding the empty trio to that return. Run `npm test` to confirm no existing auth test broke (if an auth fixture test exists, update its expected object).
5. - [ ] Commit:
   ```bash
   git add src/lib/app-auth.ts tests/access-profile-team.test.ts
   git commit -m "$(cat <<'EOF'
   feat(auth): add team membership to the access profile

   Extends AccessProfile with teamLead, teamIds, and teammate app_user_ids
   derived from meta_inbox_team_members, gating the manager view and the
   lead-only header nudge.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 6 — daily rollup cron

> Spec §7.3: a SQL function `compute_inbox_metrics_daily_for_tz(tz, target_date)` does an idempotent upsert into `meta_inbox_metrics_daily`; pg_cron runs every 15 min iterating distinct user timezones and only acts in each tz's 00:00–00:30 local window for `current_date - 1`. The business-time math reuses `public.business_seconds_between` (Task 10) so SQL and JS stay aligned. CI has no DB, so these are schema-shape tests + `db:migrations:check`; correctness is validated by the backfill on staging (Task 26) + the §11 integration check.

### Task 24: compute_inbox_metrics_daily_for_tz function (idempotent upsert)

**Files:**
- Create: `supabase/migrations/<generated>_compute_inbox_metrics_daily_fn.sql`
- Test: `tests/compute-inbox-metrics-daily-fn-migration.test.ts`

1. - [ ] Write the failing migration-shape test `tests/compute-inbox-metrics-daily-fn-migration.test.ts` (copy the `migrationContaining` helper):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("compute_inbox_metrics_daily_for_tz migration", () => {
     it("defines the function and upserts on the unique key", () => {
       const sql = migrationContaining("function public.compute_inbox_metrics_daily_for_tz");
       assert.match(sql, /create or replace function public\.compute_inbox_metrics_daily_for_tz\(\s*p_tz text,\s*p_target_date date\s*\)/i);
       assert.match(sql, /on conflict \(environment, user_id, date\) do update/i);
       assert.match(sql, /public\.business_seconds_between\(/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Create migration: `npm run db:migration -- compute_inbox_metrics_daily_fn`. Append:
   ```sql
   -- Idempotent per-(user, date) rollup for a given timezone. Computes, for
   -- every user whose effective tz = p_tz, the metrics for p_target_date in
   -- that tz: avg first-response business-seconds, on-time/total replies, and
   -- team claims. SLA = 10800 business-seconds (3h). Reuses
   -- public.business_seconds_between so SQL matches business-hours.ts.
   create or replace function public.compute_inbox_metrics_daily_for_tz(
     p_tz text,
     p_target_date date
   ) returns integer
   language plpgsql
   security definer
   set search_path = public, analytics
   as $$
   declare
     v_env        text := analytics.current_ads_analyst_environment();
     v_start_time time := '10:00:00';
     v_end_time   time := '19:00:00';
     v_day_start  timestamptz := (p_target_date + v_start_time) at time zone p_tz;
     v_day_end    timestamptz := (p_target_date + v_end_time)   at time zone p_tz;
     v_rows       integer := 0;
   begin
     -- Users whose effective tz matches p_tz: explicit preference rows, plus
     -- (when p_tz is the PT default) users with no preference row who appear
     -- as approvers/assignees in this environment.
     with effective_users as (
       select up.user_id
         from public.meta_inbox_user_preferences up
        where up.environment = v_env and up.timezone = p_tz
       union
       select distinct sa.approved_by as user_id
         from public.meta_inbox_send_attempts sa
        where sa.environment = v_env
          and sa.approved_by is not null
          and p_tz = 'America/Los_Angeles'
          and not exists (
            select 1 from public.meta_inbox_user_preferences up2
             where up2.environment = v_env and up2.user_id = sa.approved_by
          )
     ),
     -- First sent reply per conversation by each user on the target day.
     first_reply as (
       select sa.approved_by as user_id,
              sa.conversation_id,
              min(sa.sent_at) as first_outbound_at
         from public.meta_inbox_send_attempts sa
         join effective_users eu on eu.user_id = sa.approved_by
        where sa.environment = v_env
          and sa.status = 'sent'
          and sa.sent_at >= v_day_start
          and sa.sent_at <  v_day_end
        group by sa.approved_by, sa.conversation_id
     ),
     response_rows as (
       select fr.user_id,
              public.business_seconds_between(
                c.first_inbound_at, fr.first_outbound_at,
                coalesce(qc.timezone, p_tz),
                coalesce(qc.business_hours_start, v_start_time),
                coalesce(qc.business_hours_end, v_end_time)
              ) as response_sec,
              (fr.first_outbound_at - c.first_inbound_at) <= interval '7 days' as fresh
         from first_reply fr
         join public.meta_inbox_conversations c on c.id = fr.conversation_id
         left join public.meta_inbox_queue_categories qc
                on qc.environment = v_env and qc.key = c.queue_category_key
        where c.first_inbound_at is not null
     ),
     per_user as (
       select user_id,
              round(avg(response_sec) filter (where fresh))::integer as avg_response_seconds,
              count(*) filter (where response_sec <= 10800)            as on_time_replies,
              count(*)                                                  as total_replies
         from response_rows
        group by user_id
     ),
     claims as (
       select (e.new_value->>'assignedUserId')::uuid as user_id, count(*) as team_claims
         from public.meta_inbox_conversation_events e
        where e.environment = v_env
          and e.event_type = 'assignment_changed'
          and e.event_at >= v_day_start and e.event_at < v_day_end
          and (e.previous_value->>'assignedUserId') is null
          and (e.new_value->>'assignedUserId') is not null
        group by (e.new_value->>'assignedUserId')
     )
     insert into public.meta_inbox_metrics_daily as m (
       environment, user_id, date, timezone,
       avg_response_seconds, on_time_replies, total_replies, team_claims,
       breached_at_eod, computed_at
     )
     select v_env, eu.user_id, p_target_date, p_tz,
            pu.avg_response_seconds,
            coalesce(pu.on_time_replies, 0),
            coalesce(pu.total_replies, 0),
            coalesce(cl.team_claims, 0),
            0,
            now()
       from effective_users eu
       left join per_user pu on pu.user_id = eu.user_id
       left join claims cl   on cl.user_id = eu.user_id
      where eu.user_id is not null
     on conflict (environment, user_id, date) do update
        set timezone             = excluded.timezone,
            avg_response_seconds = excluded.avg_response_seconds,
            on_time_replies      = excluded.on_time_replies,
            total_replies        = excluded.total_replies,
            team_claims          = excluded.team_claims,
            computed_at          = now();

     get diagnostics v_rows = row_count;
     return v_rows;
   end;
   $$;

   grant execute on function public.compute_inbox_metrics_daily_for_tz(text, date)
     to ads_analyst_worker, ads_analyst_ingest;

   comment on function public.compute_inbox_metrics_daily_for_tz(text, date) is
     'Idempotent per-user daily metrics upsert for one timezone. SLA=10800 business-seconds; mirrors business-hours.ts. breached_at_eod reserved (0 in v1).';
   ```
   > NOTE: `breached_at_eod` is populated as `0` in v1 (the column exists for a future EOD-breach signal; spec lists it in the table but defines no compute for it — leaving 0 is honest). If the user wants it computed, that is a follow-up.
4. - [ ] Run the test — expect PASS. `npm run db:migrations:check`.
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/compute-inbox-metrics-daily-fn-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add daily metrics rollup SQL function

   Idempotent per-user upsert for one timezone/date, reusing
   business_seconds_between for response averages, on-time counts, and team
   claims.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 25: pg_cron schedule iterating distinct user timezones

**Files:**
- Create: `supabase/migrations/<generated>_schedule_inbox_metrics_daily_cron.sql`
- Test: `tests/schedule-inbox-metrics-daily-cron-migration.test.ts`

> Per spec §7.3 the cron runs every 15 min, iterates distinct tzs (preferences ∪ default PT), and only computes for a tz when its local time is 00:00–00:30 (rolling up the prior day). We wrap that loop in a dispatcher function and schedule the dispatcher with `cron.schedule`.

1. - [ ] Write the failing test `tests/schedule-inbox-metrics-daily-cron-migration.test.ts` (copy the helper):
   ```ts
   import assert from "node:assert/strict";
   import { readdirSync, readFileSync } from "node:fs";
   import { resolve } from "node:path";
   import { describe, it } from "node:test";

   const MIGRATIONS_DIR = resolve("supabase/migrations");
   function migrationContaining(snippet: string): string {
     const file = readdirSync(MIGRATIONS_DIR)
       .filter((n) => n.endsWith(".sql"))
       .find((n) => readFileSync(resolve(MIGRATIONS_DIR, n), "utf8").includes(snippet));
     if (!file) throw new Error(`No migration contains: ${snippet}`);
     return readFileSync(resolve(MIGRATIONS_DIR, file), "utf8");
   }

   describe("inbox metrics daily cron migration", () => {
     it("defines a dispatcher and schedules it every 15 minutes", () => {
       const sql = migrationContaining("function public.run_inbox_metrics_daily_dispatch");
       assert.match(sql, /create or replace function public\.run_inbox_metrics_daily_dispatch\(\)/i);
       assert.match(sql, /compute_inbox_metrics_daily_for_tz/i);
       assert.match(sql, /cron\.schedule\(\s*'inbox-metrics-daily'\s*,\s*'\*\/15 \* \* \* \*'/i);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Create migration: `npm run db:migration -- schedule_inbox_metrics_daily_cron`. Append:
   ```sql
   -- Dispatcher: for each distinct effective timezone, if local time is within
   -- the first 30 minutes of the day, roll up the prior local day. Iterating
   -- tzs means new timezones (added via preferences) are handled automatically.
   create or replace function public.run_inbox_metrics_daily_dispatch()
   returns void
   language plpgsql
   security definer
   set search_path = public, analytics, extensions
   as $$
   declare
     v_env text := analytics.current_ads_analyst_environment();
     v_tz  text;
     v_local_now timestamp;
   begin
     for v_tz in
       select distinct timezone
         from public.meta_inbox_user_preferences
        where environment = v_env
       union
       select 'America/Los_Angeles'
     loop
       v_local_now := now() at time zone v_tz;
       if v_local_now::time < time '00:30' then
         perform public.compute_inbox_metrics_daily_for_tz(
           v_tz,
           (v_local_now::date) - 1
         );
       end if;
     end loop;
   end;
   $$;

   grant execute on function public.run_inbox_metrics_daily_dispatch()
     to ads_analyst_worker, ads_analyst_ingest;

   -- Schedule every 15 minutes. unschedule first for idempotency on re-run.
   select cron.unschedule('inbox-metrics-daily')
    where exists (select 1 from cron.job where jobname = 'inbox-metrics-daily');

   select cron.schedule(
     'inbox-metrics-daily',
     '*/15 * * * *',
     $cron$ select public.run_inbox_metrics_daily_dispatch(); $cron$
   );
   ```
   > NOTE: `cron.schedule` / `cron.unschedule` / `cron.job` live in the schema where pg_cron was created (Task 5 used `schema extensions`, but pg_cron exposes its objects in the `cron` schema regardless). If `db push` errors that `cron.*` is not found, qualify as `extensions.` or add `cron` to the `search_path` — verify on staging. The 15-min cadence + 00:30 guard means each tz rolls up once per day shortly after local midnight.
4. - [ ] Run the test — expect PASS. `npm run db:migrations:check`.
5. - [ ] Commit:
   ```bash
   git add supabase/migrations tests/schedule-inbox-metrics-daily-cron-migration.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): schedule the daily metrics rollup via pg_cron

   Adds a per-timezone dispatcher that rolls up the prior local day shortly
   after midnight and schedules it every 15 minutes.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 26: backfill script (30-day backfill)

**Files:**
- Create: `scripts/backfill-inbox-metrics-daily.ts`
- Test: `tests/backfill-inbox-metrics-daily.test.ts`

> Spec §7.3: one-shot script looping `(tz, date)` since a cutoff, invoking the SQL function per date. We make the date-range generation a pure exported function so it is unit-testable; the DB invocation is a thin wrapper (not unit-tested).

1. - [ ] Write the failing test `tests/backfill-inbox-metrics-daily.test.ts`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import { enumerateBackfillDates } from "../scripts/backfill-inbox-metrics-daily.ts";

   describe("enumerateBackfillDates", () => {
     it("lists each date from start to end inclusive", () => {
       const dates = enumerateBackfillDates("2026-05-25", "2026-05-27");
       assert.deepEqual(dates, ["2026-05-25", "2026-05-26", "2026-05-27"]);
     });
     it("returns a single date when start === end", () => {
       assert.deepEqual(enumerateBackfillDates("2026-05-27", "2026-05-27"), ["2026-05-27"]);
     });
     it("returns empty when start is after end", () => {
       assert.deepEqual(enumerateBackfillDates("2026-05-28", "2026-05-27"), []);
     });
     it("defaults to a 30-day window ending today when no args (count check)", () => {
       const dates = enumerateBackfillDates(); // uses default 30-day window
       assert.equal(dates.length, 30);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement `scripts/backfill-inbox-metrics-daily.ts`:
   ```ts
   // One-shot backfill for meta_inbox_metrics_daily. Iterates each date in the
   // window and calls compute_inbox_metrics_daily_for_tz for every distinct
   // effective timezone. Run with:
   //   node --experimental-strip-types scripts/backfill-inbox-metrics-daily.ts [START] [END]
   // START/END are YYYY-MM-DD (default: last 30 days through today).
   import { createAdsAnalystClient } from "../src/lib/ads-analyst-db.ts";

   export function enumerateBackfillDates(start?: string, end?: string): string[] {
     const today = new Date();
     const defaultEnd = isoDate(today);
     const defaultStart = isoDate(new Date(today.getTime() - 29 * 86_400_000)); // 30 inclusive
     const startDate = start ?? defaultStart;
     const endDate = end ?? defaultEnd;
     const out: string[] = [];
     let cursor = Date.parse(`${startDate}T00:00:00Z`);
     const last = Date.parse(`${endDate}T00:00:00Z`);
     if (!Number.isFinite(cursor) || !Number.isFinite(last)) return out;
     while (cursor <= last) {
       out.push(isoDate(new Date(cursor)));
       cursor += 86_400_000;
     }
     return out;
   }

   function isoDate(d: Date): string {
     return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
   }

   async function main() {
     const [, , startArg, endArg] = process.argv;
     const dates = enumerateBackfillDates(startArg, endArg);
     // Use the ingest/worker-scoped client (write access to metrics_daily).
     const supabase = createAdsAnalystClient("ingest") as unknown as {
       from: (t: string) => { select: (c: string) => Promise<{ data: { timezone: string }[] | null }> };
       rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: unknown }>;
     };
     const { data: prefRows } = await supabase
       .from("meta_inbox_user_preferences")
       .select("timezone");
     const timezones = new Set<string>(["America/Los_Angeles"]);
     for (const row of prefRows || []) timezones.add(row.timezone);

     for (const date of dates) {
       for (const tz of timezones) {
         const { error } = await supabase.rpc("compute_inbox_metrics_daily_for_tz", {
           p_tz: tz,
           p_target_date: date,
         });
         if (error) {
           console.error(`backfill failed for ${tz} ${date}:`, error);
         } else {
           console.log(`backfilled ${tz} ${date}`);
         }
       }
     }
   }

   // Run only when invoked directly, not when imported by the test.
   if (import.meta.url === `file://${process.argv[1]}`) {
     main().catch((error) => {
       console.error(error);
       process.exit(1);
     });
   }
   ```
   > NOTE: the spec also lists `scripts/backfill-inbox-assignment-events.ts` (§7.3), but §15.1 superseded the separate assignment_events table — assignment audit already exists in `meta_inbox_conversation_events`, so there is **no assignment-events backfill to write**. C2 for historical dates is recomputed by this metrics backfill from the existing events. Document this in the commit body.
4. - [ ] Run the test — expect PASS. `npm run typecheck` (the script is included in the tsconfig glob; if scripts are excluded, ensure the pure export still type-checks via the test). `npm run lint`.
5. - [ ] Commit:
   ```bash
   git add scripts/backfill-inbox-metrics-daily.ts tests/backfill-inbox-metrics-daily.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add 30-day metrics_daily backfill script

   One-shot backfill that replays compute_inbox_metrics_daily_for_tz per date
   and timezone. No assignment-events backfill is needed since the audit
   trail already lives in meta_inbox_conversation_events.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 7 — personal header UI (behind INBOX_METRICS_HEADER_ENABLED)

> Components live under `src/components/v2/inbox/`. They are dumb renderers of `PersonalHeaderMetrics`. Tests use the same source-loading harness as `tests/inbox-top-chrome.test.ts` (transpile + `renderToStaticMarkup`) — copy its `loadModule` helper. Styling reuses the Editorial Broadsheet tokens listed in the Orientation section. The flag `INBOX_METRICS_HEADER_ENABLED` is read via `isTruthyEnv("INBOX_METRICS_HEADER_ENABLED")` from `src/lib/env.ts` (server-side; passed to the client component as a boolean prop). Pink = `text-signal-warning` and is reserved for at-risk/breached numbers.

### Task 27: ReadOnlyContext + useReadOnly hook

**Files:**
- Create: `src/components/v2/inbox/read-only-context.tsx`
- Test: `tests/read-only-context.test.tsx`

> Spec §4.5/§8.4: every mutation control consumes `useReadOnly()` and self-hides when true. Default context value is `false` (normal inbox). The peek drawer (Task 38) wraps its subtree in `<ReadOnlyProvider value={true}>`.

1. - [ ] Write the failing test `tests/read-only-context.test.tsx` (copy the `loadModule` harness from `tests/inbox-top-chrome.test.ts` — the bottom `loadModule`/`resolveLocalImport` helpers):
   ```ts
   import assert from "node:assert/strict";
   import { createRequire } from "node:module";
   import { dirname, resolve } from "node:path";
   import { readFileSync } from "node:fs";
   import { runInNewContext } from "node:vm";
   import test from "node:test";
   import * as ts from "typescript";

   const require = createRequire(import.meta.url);
   const React = require("react");
   const { renderToStaticMarkup } = require("react-dom/server");

   const { ReadOnlyProvider, useReadOnly } = loadModule(
     "src/components/v2/inbox/read-only-context.tsx",
   ) as {
     ReadOnlyProvider: (props: Record<string, unknown>) => React.ReactElement;
     useReadOnly: () => boolean;
   };

   function Probe() {
     return React.createElement("span", null, useReadOnly() ? "readonly" : "editable");
   }

   test("useReadOnly defaults to false outside a provider", () => {
     const markup = renderToStaticMarkup(React.createElement(Probe));
     assert.match(markup, /editable/);
   });

   test("ReadOnlyProvider value=true makes useReadOnly true", () => {
     const markup = renderToStaticMarkup(
       React.createElement(ReadOnlyProvider, { value: true }, React.createElement(Probe)),
     );
     assert.match(markup, /readonly/);
   });

   // paste loadModule + resolveLocalImport from tests/inbox-top-chrome.test.ts here
   ```
   (Paste the exact `loadModule` and `resolveLocalImport` functions from `tests/inbox-top-chrome.test.ts:476-543`.)
2. - [ ] Run it — expect FAIL: `node --test --experimental-strip-types tests/read-only-context.test.tsx`.
3. - [ ] Implement `src/components/v2/inbox/read-only-context.tsx`:
   ```tsx
   "use client";

   import { createContext, useContext, type ReactNode } from "react";

   const ReadOnlyContext = createContext(false);

   export function ReadOnlyProvider({ value, children }: { value: boolean; children: ReactNode }) {
     return <ReadOnlyContext.Provider value={value}>{children}</ReadOnlyContext.Provider>;
   }

   export function useReadOnly(): boolean {
     return useContext(ReadOnlyContext);
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/read-only-context.tsx tests/read-only-context.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): add ReadOnly context and hook

   Single ReadOnlyProvider/useReadOnly pair so mutation controls can
   self-hide inside the manager read-only peek.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 28: metrics-header-lede.tsx — 5 adaptive states

**Files:**
- Create: `src/components/v2/inbox/metrics-header-lede.tsx`
- Test: `tests/metrics-header-lede.test.tsx`

> Spec §4.2 states. Each state is a separate exported pure function returning a string (`ledeNormal`, `ledeAllCaughtUp`, `ledeSlowStart`, `ledeBeforeHours`, `ledeAfterHours`) and a `selectLede(metrics)` dispatcher; the component renders the selected string. Trend delta appears only when `|delta| ≥ 10 min` (spec §4.2 tone rule). Delta = `yesterday.avgResponseSec - today.avgResponseSec` (positive = improvement = "down").

1. - [ ] Write the failing test `tests/metrics-header-lede.test.tsx` (copy the `loadModule` harness):
   ```ts
   import assert from "node:assert/strict";
   import test from "node:test";
   // ... loadModule harness (paste from inbox-top-chrome.test.ts) ...

   const { selectLede, formatTrendDelta } = loadModule(
     "src/components/v2/inbox/metrics-header-lede.tsx",
   ) as {
     selectLede: (m: unknown) => string;
     formatTrendDelta: (todaySec: number | null, yesterdaySec: number | null) => string;
   };

   function metrics(overrides: Record<string, unknown> = {}) {
     return {
       windowState: "open",
       user: { id: "u", timezone: "America/Los_Angeles", businessSecondsRemainingToday: 15480 },
       pipeline: { assigned: 50, needsReply: 6, atRisk: 2 },
       today: { avgResponseSec: 3000, onTimeRate: 0.92, repliesSent: 14 },
       yesterday: { avgResponseSec: 3900 },
       team: { unassigned: 8, claimedByMe: 3, todayUnassignedDenominator: 10, oldestUnassignedSec: 2820 },
       ...overrides,
     };
   }

   test("Normal state names needs-reply, urgent count, trend, and encouragement", () => {
     const lede = selectLede(metrics());
     assert.match(lede, /6 of your 50 need a reply/);
     assert.match(lede, /2 are urgent/);
     assert.match(lede, /down 15/); // (3900-3000)/60 = 15 min improvement
     assert.match(lede, /Keep going/);
   });

   test("All caught up when needsReply == 0 during hours", () => {
     const lede = selectLede(metrics({ pipeline: { assigned: 50, needsReply: 0, atRisk: 0 } }));
     assert.match(lede, /All caught up\. 14 replies sent today\./);
   });

   test("Slow start when repliesSent == 0 during hours", () => {
     const lede = selectLede(metrics({ today: { avgResponseSec: null, onTimeRate: null, repliesSent: 0 } }));
     assert.match(lede, /Day's open\. 6 of your 50 need a reply\./);
   });

   test("Before hours references yesterday's carryover", () => {
     const lede = selectLede(metrics({ windowState: "before_hours", pipeline: { assigned: 50, needsReply: 4, atRisk: 0 } }));
     assert.match(lede, /Business hours start at 10\. 4 from yesterday still need a reply\./);
   });

   test("After hours summarizes the day", () => {
     const lede = selectLede(metrics({ windowState: "after_hours", today: { avgResponseSec: 3000, onTimeRate: 0.9, repliesSent: 12 } }));
     assert.match(lede, /Day's done\. 12 replies sent, 90% on-time\. See you tomorrow\./);
   });

   test("Trend delta suppressed below 10 minutes", () => {
     assert.equal(formatTrendDelta(3000, 3500), ""); // 8.3 min < 10 → no delta
     assert.equal(formatTrendDelta(3000, 3600), "down 10"); // exactly 10 → shown
     assert.equal(formatTrendDelta(3600, 3000), "up 10");
     assert.equal(formatTrendDelta(3000, null), "");
   });
   ```
   > NOTE: the "Slow start" test uses `windowState: "open"` (default) with `repliesSent: 0`; ensure your dispatcher checks Slow-start (open + repliesSent==0 + needsReply>0) before Normal. Precedence: before_hours → after_hours → all-caught-up (needsReply==0) → slow-start (repliesSent==0) → normal.
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement `src/components/v2/inbox/metrics-header-lede.tsx`:
   ```tsx
   import type { PersonalHeaderMetrics } from "../../../lib/inbox-metrics.ts";

   const MIN_TREND_DELTA_MIN = 10;

   // Positive improvement ("down N") when today is faster than yesterday.
   export function formatTrendDelta(
     todaySec: number | null,
     yesterdaySec: number | null,
   ): string {
     if (todaySec === null || yesterdaySec === null) return "";
     const deltaMin = Math.round((yesterdaySec - todaySec) / 60);
     if (Math.abs(deltaMin) < MIN_TREND_DELTA_MIN) return "";
     return deltaMin > 0 ? `down ${deltaMin}` : `up ${Math.abs(deltaMin)}`;
   }

   export function ledeBeforeHours(m: PersonalHeaderMetrics): string {
     return `Business hours start at 10. ${m.pipeline.needsReply} from yesterday still need a reply.`;
   }

   export function ledeAfterHours(m: PersonalHeaderMetrics): string {
     const onTime = m.today.onTimeRate === null ? "—" : `${Math.round(m.today.onTimeRate * 100)}%`;
     return `Day's done. ${m.today.repliesSent} replies sent, ${onTime} on-time. See you tomorrow.`;
   }

   export function ledeAllCaughtUp(m: PersonalHeaderMetrics): string {
     return `All caught up. ${m.today.repliesSent} replies sent today.`;
   }

   export function ledeSlowStart(m: PersonalHeaderMetrics): string {
     return `Day's open. ${m.pipeline.needsReply} of your ${m.pipeline.assigned} need a reply.`;
   }

   export function ledeNormal(m: PersonalHeaderMetrics): string {
     const trend = formatTrendDelta(m.today.avgResponseSec, m.yesterday.avgResponseSec);
     const avg = m.today.avgResponseSec === null ? "—" : `${Math.round(m.today.avgResponseSec / 60)}m`;
     const trendClause = trend ? `, ${trend}` : "";
     return (
       `${m.pipeline.needsReply} of your ${m.pipeline.assigned} need a reply — ` +
       `${m.pipeline.atRisk} are urgent. Avg ${avg} today${trendClause}. Keep going.`
     );
   }

   export function selectLede(m: PersonalHeaderMetrics): string {
     if (m.windowState === "before_hours") return ledeBeforeHours(m);
     if (m.windowState === "after_hours") return ledeAfterHours(m);
     if (m.pipeline.needsReply === 0) return ledeAllCaughtUp(m);
     if (m.today.repliesSent === 0) return ledeSlowStart(m);
     return ledeNormal(m);
   }

   export function InboxMetricsHeaderLede({ metrics }: { metrics: PersonalHeaderMetrics }) {
     return (
       <div
         data-component="inbox-metrics-header-lede"
         className="border-b border-hp-rule px-1 pb-4 pt-4"
       >
         <h1 className="font-title text-[26px] leading-tight text-hp-ink oldstyle-nums">
           {selectLede(metrics)}
         </h1>
       </div>
     );
   }
   ```
   > NOTE: the spec's Normal example reads "Avg 50m today, down 15." — the trend clause is comma-joined as shown. The test asserts substrings `down 15`, `2 are urgent`, `6 of your 50 need a reply`. If you reword copy, keep those substrings or update the test in lockstep.
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/metrics-header-lede.tsx tests/metrics-header-lede.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): add adaptive metrics-header lede

   Five time/state-aware lede variants with a 10-minute trend-delta threshold,
   each independently testable.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 29: metrics-header-strip.tsx — stats + absorbed sync button

**Files:**
- Create: `src/components/v2/inbox/metrics-header-strip.tsx`
- Test: `tests/metrics-header-strip.test.tsx`

> Spec §4.1 strip + §15.3 critical constraint: the strip MUST absorb the sync button (props `onSync`, `isSyncing`, `syncDisabled`, `syncRun`). Reuse `formatLastSyncLabel` from `inbox-eyebrow.tsx` for the freshness label (import it; do not duplicate). Stats: On-time %, Sent, Team Q waiting, You claimed (N of M), Oldest in queue. At-risk uses `text-signal-warning`.

1. - [ ] Write the failing test `tests/metrics-header-strip.test.tsx` (copy the harness):
   ```ts
   import assert from "node:assert/strict";
   import { createRequire } from "node:module";
   import test from "node:test";
   // ... loadModule harness ...
   const require = createRequire(import.meta.url);
   const React = require("react");
   const { renderToStaticMarkup } = require("react-dom/server");

   const { InboxMetricsHeaderStrip } = loadModule(
     "src/components/v2/inbox/metrics-header-strip.tsx",
   ) as { InboxMetricsHeaderStrip: (p: Record<string, unknown>) => React.ReactElement };

   function metrics(overrides: Record<string, unknown> = {}) {
     return {
       windowState: "open",
       user: { id: "u", timezone: "America/Los_Angeles", businessSecondsRemainingToday: 15480 },
       pipeline: { assigned: 50, needsReply: 6, atRisk: 2 },
       today: { avgResponseSec: 3000, onTimeRate: 0.92, repliesSent: 14 },
       yesterday: { avgResponseSec: 3900 },
       team: { unassigned: 8, claimedByMe: 3, todayUnassignedDenominator: 10, oldestUnassignedSec: 2820 },
       ...overrides,
     };
   }

   const syncRun = { id: "s", trigger: "manual", status: "success", started_at: "2026-05-27T18:58:00Z", completed_at: "2026-05-27T18:58:00Z", metrics: {}, errors: [] };

   test("renders the stat strip and the absorbed sync button", () => {
     const markup = renderToStaticMarkup(
       React.createElement(InboxMetricsHeaderStrip, {
         metrics: metrics(),
         onSync: () => {},
         isSyncing: false,
         syncDisabled: false,
         syncRun,
         now: new Date("2026-05-27T19:00:00Z"),
       }),
     );
     assert.match(markup, /On time/);
     assert.match(markup, /92%/);
     assert.match(markup, /Sent/);
     assert.match(markup, />14</);
     assert.match(markup, /Team Q/);
     assert.match(markup, /8 waiting/);
     assert.match(markup, /claimed/);
     assert.match(markup, /3/);
     assert.match(markup, /Oldest in queue/);
     assert.match(markup, /47m/); // 2820s = 47 min
     assert.match(markup, /Last sync/); // freshness label present
     assert.match(markup, /button/); // sync affordance present
   });

   test("at-risk number uses the warning (pink) tone", () => {
     const markup = renderToStaticMarkup(
       React.createElement(InboxMetricsHeaderStrip, {
         metrics: metrics(),
         onSync: () => {}, isSyncing: false, syncDisabled: false, syncRun,
         now: new Date("2026-05-27T19:00:00Z"),
       }),
     );
     assert.match(markup, /text-signal-warning/);
   });

   test("hides the You-claimed stat when denominator is 0", () => {
     const markup = renderToStaticMarkup(
       React.createElement(InboxMetricsHeaderStrip, {
         metrics: metrics({ team: { unassigned: 8, claimedByMe: 0, todayUnassignedDenominator: 0, oldestUnassignedSec: 2820 } }),
         onSync: () => {}, isSyncing: false, syncDisabled: false, syncRun,
         now: new Date("2026-05-27T19:00:00Z"),
       }),
     );
     assert.doesNotMatch(markup, /claimed/);
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement `src/components/v2/inbox/metrics-header-strip.tsx`:
   ```tsx
   import { RefreshCw } from "lucide-react";

   import { SYNC } from "../../../lib/glossary.ts";
   import type { PersonalHeaderMetrics } from "../../../lib/inbox-metrics.ts";
   import type { SocialInboxSyncRun } from "../../../lib/social-inbox.ts";
   import { formatLastSyncLabel } from "./inbox-eyebrow.tsx";

   function minutes(sec: number | null): string {
     return sec === null ? "—" : `${Math.round(sec / 60)}m`;
   }

   export function InboxMetricsHeaderStrip({
     metrics,
     onSync,
     isSyncing,
     syncDisabled,
     syncRun,
     now,
   }: {
     metrics: PersonalHeaderMetrics;
     onSync: () => void;
     isSyncing: boolean;
     syncDisabled: boolean;
     syncRun: SocialInboxSyncRun | null;
     now?: Date | number;
   }) {
     const onTime =
       metrics.today.onTimeRate === null ? "—" : `${Math.round(metrics.today.onTimeRate * 100)}%`;
     const showClaimed = metrics.team.todayUnassignedDenominator > 0;

     return (
       <div
         data-component="inbox-metrics-header-strip"
         className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-hp-rule-soft px-1 py-2 text-[10px] text-hp-muted smallcaps"
       >
         <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
           <Stat label="On time" value={onTime} />
           <Stat label="Sent" value={String(metrics.today.repliesSent)} />
           {metrics.pipeline.atRisk > 0 ? (
             <Stat label="At risk" value={String(metrics.pipeline.atRisk)} tone="warning" />
           ) : null}
           <Stat label="Team Q" value={`${metrics.team.unassigned} waiting`} />
           {showClaimed ? (
             <Stat
               label="You claimed"
               value={`${metrics.team.claimedByMe} of ${metrics.team.todayUnassignedDenominator}`}
             />
           ) : null}
           <Stat label="Oldest in queue" value={minutes(metrics.team.oldestUnassignedSec)} />
         </dl>

         <div className="flex flex-wrap items-center gap-3">
           <span>{formatLastSyncLabel(syncRun, now)}</span>
           <button
             type="button"
             disabled={syncDisabled || isSyncing}
             onClick={onSync}
             className="inline-flex h-7 items-center gap-2 border border-hp-rule px-2 text-hp-ink transition-colors hover:border-hp-ink hover:bg-hp-inset disabled:text-hp-muted"
           >
             <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
             {isSyncing ? SYNC.inProgress : `${SYNC.action} Inbox`}
           </button>
         </div>
       </div>
     );
   }

   function Stat({
     label,
     value,
     tone,
   }: {
     label: string;
     value: string;
     tone?: "warning";
   }) {
     return (
       <div className="flex items-baseline gap-1.5">
         <dt>{label}</dt>
         <dd
           data-tone={tone || "ink"}
           className={`font-title text-[15px] leading-none normal-case tracking-normal lining-nums ${
             tone === "warning" ? "text-signal-warning" : "text-hp-ink"
           }`}
         >
           {value}
         </dd>
       </div>
     );
   }
   ```
   > NOTE: `On time 92%` substring requires the on-time `Stat` to render label `On time`. The first test asserts both `On time` and `92%`. Confirm `SYNC.action`/`SYNC.inProgress` exist in `glossary.ts` (they are used by `inbox-eyebrow.tsx`). The at-risk stat only shows when > 0; the second test passes `atRisk: 2` so the warning class renders.
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/metrics-header-strip.tsx tests/metrics-header-strip.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): add metrics-header stat strip with sync button

   Thin stat row (on-time, sent, at-risk, team queue, claims, oldest) that
   absorbs the sync affordance previously inside the eyebrow.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 30: lead-nudge.tsx

**Files:**
- Create: `src/components/v2/inbox/lead-nudge.tsx`
- Test: `tests/lead-nudge.test.tsx`

> Spec §4.3: single line "N teammates over SLA today · view team →" linking to `/m/inbox/team`. Singular/plural copy.

1. - [ ] Write the failing test `tests/lead-nudge.test.tsx` (copy harness):
   ```ts
   import assert from "node:assert/strict";
   import { createRequire } from "node:module";
   import test from "node:test";
   // ... loadModule harness ...
   const require = createRequire(import.meta.url);
   const React = require("react");
   const { renderToStaticMarkup } = require("react-dom/server");

   const { LeadNudge } = loadModule("src/components/v2/inbox/lead-nudge.tsx") as {
     LeadNudge: (p: Record<string, unknown>) => React.ReactElement | null;
   };

   test("renders plural copy and a link to the team view", () => {
     const markup = renderToStaticMarkup(React.createElement(LeadNudge, { teammatesOverSla: 3 }));
     assert.match(markup, /3 teammates over SLA today/);
     assert.match(markup, /view team/);
     assert.match(markup, /href="\/m\/inbox\/team"/);
   });

   test("uses singular copy for exactly one teammate", () => {
     const markup = renderToStaticMarkup(React.createElement(LeadNudge, { teammatesOverSla: 1 }));
     assert.match(markup, /1 teammate over SLA today/);
   });

   test("renders nothing when count is 0", () => {
     const markup = renderToStaticMarkup(React.createElement(LeadNudge, { teammatesOverSla: 0 }));
     assert.equal(markup, "");
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement `src/components/v2/inbox/lead-nudge.tsx`:
   ```tsx
   import Link from "next/link";

   export function LeadNudge({ teammatesOverSla }: { teammatesOverSla: number }) {
     if (teammatesOverSla <= 0) return null;
     const noun = teammatesOverSla === 1 ? "teammate" : "teammates";
     return (
       <div
         data-component="inbox-lead-nudge"
         className="flex items-baseline gap-2 px-1 py-2 text-[11px] text-hp-muted smallcaps"
       >
         <span className="text-signal-warning lining-nums">
           {teammatesOverSla} {noun} over SLA today
         </span>
         <span aria-hidden>·</span>
         <Link href="/m/inbox/team" className="text-hp-ink underline-offset-2 hover:underline">
           view team →
         </Link>
       </div>
     );
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/lead-nudge.tsx tests/lead-nudge.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): add lead-only over-SLA nudge

   Renders a single over-SLA teammate count linking to the team view, with
   singular/plural copy and a hidden-when-zero behavior.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 31: wire the header into social-inbox-client.tsx behind the flag

**Files:**
- Modify: `src/app/(workspace)/convert/inbox/page.tsx` (fetch metrics in parallel, pass flag + metrics + teamLead)
- Modify: `src/components/social-inbox-client.tsx` (props + swap render block at lines 393-403)
- Test: `tests/social-inbox-client-header.test.tsx` (source-render assertion that, given the flag + metrics props, the new Lede/Strip render and Eyebrow/StatusSentence do not)

> The header swap is in `social-inbox-client.tsx:394-402`. We add props `metricsHeaderEnabled: boolean`, `headerMetrics: PersonalHeaderMetrics | null`, `teamLead: boolean` to `SocialInboxClient`, fetched in the server page. When `metricsHeaderEnabled && headerMetrics`, render `<InboxMetricsHeaderLede>` + `<InboxMetricsHeaderStrip>` (+ `<LeadNudge>` if teamLead) and **keep** `<InboxHealthRow>`; else render the legacy `<InboxEyebrow>` + `<InboxStatusSentence>` (until Phase 9 deletes them). `<InboxLayoutShell>` unchanged.

1. - [ ] Server page: in `src/app/(workspace)/convert/inbox/page.tsx`, add `getPersonalHeaderMetrics` to the parallel fetch and read the flag. Edit the `InboxPage` body:
   ```tsx
   import { isTruthyEnv } from "@/lib/env";
   import { getPersonalHeaderMetrics } from "@/lib/inbox-metrics";
   // ...
   export default async function InboxPage() {
     const profile = await requirePagePermission("view_inbox", "/convert/inbox");
     const metricsHeaderEnabled = isTruthyEnv("INBOX_METRICS_HEADER_ENABLED");

     const [status, inboxData, headerMetrics] = await Promise.all([
       getSocialInboxStatus(),
       getSafeSocialInboxData(profile),
       metricsHeaderEnabled
         ? getPersonalHeaderMetrics(
             {
               appUserId: profile.appUserId,
               roles: profile.roles,
               permissions: profile.permissions,
               teamLead: profile.teamLead,
               teamIds: profile.teamIds,
               teamUserIds: profile.teamUserIds,
             },
             new Date(),
           ).catch(() => null)
         : Promise.resolve(null),
     ]);

     return (
       <SocialInboxClient
         status={status}
         initialData={inboxData.data}
         dataError={inboxData.error}
         canManageInboxState={profile.permissions.includes("manage_inbox_state")}
         canSendInboxReply={profile.permissions.includes("send_inbox_reply")}
         canCreateManagerCoaching={
           profile.roles.includes("admin") || profile.roles.includes("sales_lead")
         }
         metricsHeaderEnabled={metricsHeaderEnabled}
         headerMetrics={headerMetrics}
         teamLead={profile.teamLead}
       />
     );
   }
   ```
   > NOTE: `getPersonalHeaderMetrics` is wrapped in `.catch(() => null)` so a metrics failure never breaks the inbox — the client falls back to legacy chrome when `headerMetrics` is null.
2. - [ ] Client component: in `src/components/social-inbox-client.tsx`, add the three props to the component's props type/signature and import the new components + `PersonalHeaderMetrics`. At the top of the file add:
   ```tsx
   import { InboxMetricsHeaderLede } from "@/components/v2/inbox/metrics-header-lede";
   import { InboxMetricsHeaderStrip } from "@/components/v2/inbox/metrics-header-strip";
   import { LeadNudge } from "@/components/v2/inbox/lead-nudge";
   import type { PersonalHeaderMetrics } from "@/lib/inbox-metrics";
   ```
   Add to the props (alongside `canManageInboxState` etc.):
   ```tsx
     metricsHeaderEnabled?: boolean;
     headerMetrics?: PersonalHeaderMetrics | null;
     teamLead?: boolean;
   ```
   Destructure them in the function signature with defaults `metricsHeaderEnabled = false, headerMetrics = null, teamLead = false`.
3. - [ ] Replace the render block at `src/components/social-inbox-client.tsx:393-403`. Current:
   ```tsx
   <section className="mx-auto max-w-7xl">
     <InboxEyebrow
       dashboard={managerDashboard}
       syncRun={inboxData.syncRuns[0] || null}
       onSync={mutations.handleSync}
       isSyncing={isSyncing}
       syncDisabled={!status.readiness.socialInbox}
     />
     <InboxHealthRow status={status} syncRun={inboxData.syncRuns[0] || null} />
     <InboxStatusSentence queue={queue} />
   </section>
   ```
   New:
   ```tsx
   <section className="mx-auto max-w-7xl">
     {metricsHeaderEnabled && headerMetrics ? (
       <>
         <InboxMetricsHeaderLede metrics={headerMetrics} />
         <InboxMetricsHeaderStrip
           metrics={headerMetrics}
           onSync={mutations.handleSync}
           isSyncing={isSyncing}
           syncDisabled={!status.readiness.socialInbox}
           syncRun={inboxData.syncRuns[0] || null}
           now={replyWindowNow}
         />
         <InboxHealthRow status={status} syncRun={inboxData.syncRuns[0] || null} />
         {teamLead && (headerMetrics.team.teammatesOverSla ?? 0) > 0 ? (
           <LeadNudge teammatesOverSla={headerMetrics.team.teammatesOverSla ?? 0} />
         ) : null}
       </>
     ) : (
       <>
         <InboxEyebrow
           dashboard={managerDashboard}
           syncRun={inboxData.syncRuns[0] || null}
           onSync={mutations.handleSync}
           isSyncing={isSyncing}
           syncDisabled={!status.readiness.socialInbox}
         />
         <InboxHealthRow status={status} syncRun={inboxData.syncRuns[0] || null} />
         <InboxStatusSentence queue={queue} />
       </>
     )}
   </section>
   ```
4. - [ ] Write the source-render test `tests/social-inbox-client-header.test.tsx`. Because `social-inbox-client.tsx` is a large client component with many hooks, do **not** render the whole tree. Instead test the **render decision** in isolation by extracting a tiny pure helper. Add to `social-inbox-client.tsx`:
   ```tsx
   export function shouldRenderMetricsHeader(
     metricsHeaderEnabled: boolean | undefined,
     headerMetrics: PersonalHeaderMetrics | null | undefined,
   ): boolean {
     return Boolean(metricsHeaderEnabled && headerMetrics);
   }
   ```
   and use it in the ternary (`{shouldRenderMetricsHeader(metricsHeaderEnabled, headerMetrics) ? (...) : (...)}`). Then the test:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";
   // loadModule harness from inbox-top-chrome.test.ts, then:
   const { shouldRenderMetricsHeader } = loadModule("src/components/social-inbox-client.tsx") as {
     shouldRenderMetricsHeader: (a?: boolean, b?: unknown) => boolean;
   };
   describe("metrics header gate", () => {
     it("renders new header only when enabled AND metrics present", () => {
       assert.equal(shouldRenderMetricsHeader(true, { windowState: "open" }), true);
       assert.equal(shouldRenderMetricsHeader(true, null), false);
       assert.equal(shouldRenderMetricsHeader(false, { windowState: "open" }), false);
       assert.equal(shouldRenderMetricsHeader(undefined, undefined), false);
     });
   });
   ```
   > NOTE: `loadModule` from `inbox-top-chrome.test.ts` transpiles a single file and stubs `lucide-react`; `social-inbox-client.tsx` imports many modules. If `loadModule` chokes on its imports (it eagerly evaluates the module body), fall back to testing `shouldRenderMetricsHeader` by importing it via `node --test --experimental-strip-types` directly (`import { shouldRenderMetricsHeader } from "../src/components/social-inbox-client.tsx"`) — but that pulls in `"use client"` + React hooks which may not import cleanly under `--experimental-strip-types`. Safest: move `shouldRenderMetricsHeader` into a tiny standalone file `src/components/v2/inbox/metrics-header-gate.ts` (no React import) and have `social-inbox-client.tsx` import it. Test that file instead. Prefer this standalone-file approach.
5. - [ ] Run the test — expect PASS. Run `npm run typecheck` (fixes any prop mismatch). Run `npm run lint`. Manually run the dev server (`npm run dev`) with `INBOX_METRICS_HEADER_ENABLED=1` and load `/convert/inbox` to eyeball the header; then without the flag to confirm the legacy chrome still renders. (Spec §11 manual QA.)
6. - [ ] Commit:
   ```bash
   git add src/app/(workspace)/convert/inbox/page.tsx src/components/social-inbox-client.tsx src/components/v2/inbox/metrics-header-gate.ts tests/social-inbox-client-header.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): wire metrics header behind INBOX_METRICS_HEADER_ENABLED

   Fetches personal header metrics in parallel and swaps the eyebrow +
   status sentence for the lede + strip (+ lead nudge) when the flag is on,
   falling back to legacy chrome otherwise.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 32: mobile responsive check (strip wraps)

**Files:**
- Modify (if needed): `src/components/v2/inbox/metrics-header-strip.tsx` / `metrics-header-lede.tsx`
- Test: manual + a class-presence assertion

> Spec §11 manual QA + §4.1: the strip must wrap gracefully on narrow viewports. The strip already uses `flex flex-wrap gap-x-5 gap-y-2`; the lede `text-[26px]` may overflow on very small screens.

1. - [ ] Add a class-presence regression to `tests/metrics-header-strip.test.tsx`:
   ```ts
   test("strip uses flex-wrap so stats reflow on narrow viewports", () => {
     const markup = renderToStaticMarkup(
       React.createElement(InboxMetricsHeaderStrip, {
         metrics: metrics(), onSync: () => {}, isSyncing: false, syncDisabled: false, syncRun,
         now: new Date("2026-05-27T19:00:00Z"),
       }),
     );
     assert.match(markup, /flex-wrap/);
   });
   ```
2. - [ ] Run it — expect PASS (class already present). If the lede overflows in manual testing, add a responsive size: change the lede `h1` class to `text-[20px] sm:text-[26px]`. Re-run `tests/metrics-header-lede.test.tsx` (copy substrings unaffected).
3. - [ ] Manual: `npm run dev`, open `/convert/inbox` with the flag on, narrow the viewport to ~360px, confirm the strip wraps and nothing overlaps (spec §11). Note results in the commit body.
4. - [ ] `npm run typecheck` + `npm run lint`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/metrics-header-strip.tsx src/components/v2/inbox/metrics-header-lede.tsx tests/metrics-header-strip.test.tsx
   git commit -m "$(cat <<'EOF'
   fix(inbox): ensure metrics header reflows on narrow viewports

   Locks in flex-wrap on the stat strip and a responsive lede size so the
   header stays readable on mobile widths.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 8 — manager view

> Spec §4.4–§4.6 + §15.4/§15.5. The `/m/inbox/team` route is lead-gated (`profile.teamLead`; `notFound()` otherwise). `getTeamRollup` reuses `buildMetaInboxManagerDashboard.byAssignee` and layers business-hours-aware fields on top. The team table reuses `<QueueRail>`/`<ConversationDetail>` in read-only mode for the peek. Empty state required when no team rows.

### Task 33: getTeamRollup in inbox-metrics.ts

**Files:**
- Modify: `src/lib/inbox-metrics.ts`
- Test: `tests/inbox-metrics-team.test.ts`

> Spec §15.4: `getTeamRollup` calls `buildMetaInboxManagerDashboard(data, { days })` to get `byAssignee[]` (grouped by `assigned_user_id`), then maps each row to a `TeamRow`, adding business-hours adjuncts. **Reconcile §15.4 field drift:** the real `byAssignee` row is `{ assigneeUserId: string | null; label; totalConversations; needsReply; missedFollowUps; failedSends; averageFirstResponseMinutes }`. There is no `assigned`/`atRisk` on it — we map `totalConversations → assigned`, compute `atRisk`/`avgResponseSec`(business)/`onTimeRate`/`teamClaims`/`oldestUnansweredSec`/`lastActiveAt` ourselves from the same in-memory data. We unit-test the pure mapper `mapAssigneeRowToTeamRow` + a `periodToDays` helper; the async `getTeamRollup` fetcher is integration-verified.

1. - [ ] Write the failing test `tests/inbox-metrics-team.test.ts`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import {
     periodToDays,
     mapAssigneeRowToTeamRow,
     type AssigneeRowLike,
   } from "../src/lib/inbox-metrics.ts";

   describe("periodToDays", () => {
     it("maps periods to day spans", () => {
       assert.equal(periodToDays("today"), 1);
       assert.equal(periodToDays("yesterday"), 2); // window includes yesterday
       assert.equal(periodToDays("7d"), 7);
       assert.equal(periodToDays("30d"), 30);
     });
   });

   describe("mapAssigneeRowToTeamRow", () => {
     it("maps the dashboard row plus adjunct business-hours fields", () => {
       const row: AssigneeRowLike = {
         assigneeUserId: "11111111-1111-4111-8111-111111111111",
         label: "1111...",
         totalConversations: 12,
         needsReply: 4,
         missedFollowUps: 1,
         failedSends: 0,
         averageFirstResponseMinutes: 30,
       };
       const teamRow = mapAssigneeRowToTeamRow(row, {
         name: "Ana",
         role: "member",
         atRisk: 2,
         avgResponseSec: 1800,
         onTimeRate: 0.75,
         teamClaims: 3,
         oldestUnansweredSec: 5400,
         lastActiveAt: new Date("2026-05-27T18:00:00Z"),
       });
       assert.equal(teamRow.userId, "11111111-1111-4111-8111-111111111111");
       assert.equal(teamRow.name, "Ana");
       assert.equal(teamRow.assigned, 12);
       assert.equal(teamRow.needsReply, 4);
       assert.equal(teamRow.atRisk, 2);
       assert.equal(teamRow.avgResponseSec, 1800);
       assert.equal(teamRow.onTimeRate, 0.75);
       assert.equal(teamRow.teamClaims, 3);
       assert.equal(teamRow.oldestUnansweredSec, 5400);
       assert.equal(teamRow.lastActiveAt?.toISOString(), "2026-05-27T18:00:00.000Z");
     });
     it("skips the unassigned bucket (assigneeUserId null)", () => {
       assert.equal(
         mapAssigneeRowToTeamRow({ assigneeUserId: null } as AssigneeRowLike, {
           name: "", role: "", atRisk: 0, avgResponseSec: null, onTimeRate: null,
           teamClaims: 0, oldestUnansweredSec: null, lastActiveAt: null,
         }),
         null,
       );
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement (append to `src/lib/inbox-metrics.ts`):
   ```ts
   import type { MetaInboxManagerDashboardAssigneeRow } from "./meta-inbox-manager-dashboard.ts";

   export type AssigneeRowLike = MetaInboxManagerDashboardAssigneeRow;

   export function periodToDays(period: Period): number {
     switch (period) {
       case "today":
         return 1;
       case "yesterday":
         return 2;
       case "7d":
         return 7;
       case "30d":
         return 30;
     }
   }

   export type TeamRowAdjuncts = {
     name: string;
     role: string;
     atRisk: number;
     avgResponseSec: number | null;
     onTimeRate: number | null;
     teamClaims: number;
     oldestUnansweredSec: number | null;
     lastActiveAt: Date | null;
   };

   export function mapAssigneeRowToTeamRow(
     row: AssigneeRowLike,
     adjuncts: TeamRowAdjuncts,
   ): TeamRow | null {
     if (!row.assigneeUserId) return null; // unassigned bucket excluded from team rows
     return {
       userId: row.assigneeUserId,
       name: adjuncts.name,
       role: adjuncts.role,
       assigned: row.totalConversations,
       needsReply: row.needsReply,
       atRisk: adjuncts.atRisk,
       avgResponseSec: adjuncts.avgResponseSec,
       onTimeRate: adjuncts.onTimeRate,
       repliesSent: row.totalConversations >= 0 ? row.needsReply * 0 + 0 : 0, // see NOTE
       teamClaims: adjuncts.teamClaims,
       oldestUnansweredSec: adjuncts.oldestUnansweredSec,
       lastActiveAt: adjuncts.lastActiveAt,
     };
   }
   ```
   > NOTE: `repliesSent` for the team row is a period-window count, not derivable from the dashboard row. Compute it in the async `getTeamRollup` (via `computeRepliesSentToday`-style logic over the period window per user) and pass it through `adjuncts`. Add `repliesSent: number` to `TeamRowAdjuncts` and set `repliesSent: adjuncts.repliesSent` here — replace the placeholder line above. Update the test's adjunct object to include `repliesSent: 9` and assert `teamRow.repliesSent === 9`. (Do this now; the placeholder is intentionally wrong so you fix it.)
4. - [ ] Add the async fetcher `getTeamRollup(profile, period, now)` (append, integration-verified). It: (a) fetches `SocialInboxData` (scoped read), (b) calls `buildMetaInboxManagerDashboard(data, { days: periodToDays(period), now })`, (c) builds the queue-window map, (d) for each `byAssignee` row whose `assigneeUserId ∈ profile.teamUserIds ∪ {self}`, computes adjuncts (atRisk via `computePipelineMetrics`-style per-user filter, repliesSent via the period window, teamClaims via assignment events, oldest via `computeUnassignedMetrics`-style per assignee, avg/onTime for `today` live else from `meta_inbox_metrics_daily`), (e) resolves names via `LEFT JOIN public.users` tolerating nulls (spec §15.5 — display "Unknown" when null), (f) returns `{ period, teamName, rows }` filtered to the lead's teammates. Implementation skeleton:
   ```ts
   export async function getTeamRollup(
     profile: HeaderProfile,
     period: Period,
     now: Date,
   ): Promise<TeamRollup> {
     const teamUserIds = new Set<string>([
       ...(profile.teamUserIds || []),
       ...(profile.appUserId ? [profile.appUserId] : []),
     ]);
     const supabase = dynamicSupabaseWeb();
     const inbox = await getSocialInboxData(profile);
     const { buildMetaInboxManagerDashboard } = await import("./meta-inbox-manager-dashboard.ts");
     const dashboard = buildMetaInboxManagerDashboard(inbox, { days: periodToDays(period), now });

     const { data: queueRows } = await supabase
       .from("meta_inbox_queue_categories")
       .select("key,timezone,business_hours_start,business_hours_end");
     const queueWindows = buildQueueWindowMap((queueRows || []) as QueueCategoryWindowRow[]);

     // name lookup (app_user_id is a bare uuid; tolerate join nulls).
     const ids = Array.from(teamUserIds);
     const { data: userRows } = await supabase
       .from("users")
       .select("id,full_name")
       .in("id", ids);
     const nameById = new Map((userRows || []).map((u: { id: string; full_name: string | null }) => [u.id, u.full_name]));
     const roleById = new Map(
       (profile.teamIds || []).length
         ? [] // role per teammate resolved below if needed; default 'member'
         : [],
     );

     const conversations = inbox.inboxConversations as unknown as ConversationLike[];
     const rows: TeamRow[] = [];
     for (const assignee of dashboard.byAssignee) {
       if (!assignee.assigneeUserId || !teamUserIds.has(assignee.assigneeUserId)) continue;
       const uid = assignee.assigneeUserId;
       const pipeline = computePipelineMetrics(conversations, uid, now, queueWindows);
       const repliesSent = computeRepliesSentToday(
         inbox.sendAttempts as unknown as SendAttemptLike[],
         inbox.commentActions as unknown as CommentActionLike[],
         uid,
         resolveUserWindow(DEFAULT_BUSINESS_WINDOW.tz),
         now,
       );
       // oldest unanswered for this assignee:
       const mine = conversations.filter((c) => c.assigned_user_id === uid);
       const oldest = computeUnassignedMetricsForAssignee(mine, now, queueWindows);
       const teamRow = mapAssigneeRowToTeamRow(assignee, {
         name: nameById.get(uid) || "Unknown",
         role: roleById.get(uid) || "member",
         atRisk: pipeline.atRisk,
         avgResponseSec: assignee.averageFirstResponseMinutes === null
           ? null
           : assignee.averageFirstResponseMinutes * 60,
         onTimeRate: null, // today live could refine; period uses rollup (deferred refinement)
         teamClaims: 0,     // refine via events query if period === today; else from rollup
         oldestUnansweredSec: oldest,
         lastActiveAt: lastActiveForAssignee(inbox, uid),
         repliesSent,
       });
       if (teamRow) rows.push(teamRow);
     }
     rows.sort((a, b) => b.atRisk - a.atRisk || b.needsReply - a.needsReply);
     return { period, teamName: "Team", rows };
   }
   ```
   Add the two small private helpers:
   ```ts
   function computeUnassignedMetricsForAssignee(
     mine: ConversationLike[],
     now: Date,
     queueWindows: QueueWindowMap,
   ): number | null {
     let oldest: number | null = null;
     for (const c of mine) {
       if (!c.needs_reply || !isOpenConversation(c)) continue;
       const arrived = c.latest_inbound_at ? new Date(c.latest_inbound_at) : null;
       if (!arrived || Number.isNaN(arrived.getTime())) continue;
       const w = getQueueWindow(queueWindows, c.queue_category_key);
       const age = businessSecondsBetween(arrived, now, w);
       if (oldest === null || age > oldest) oldest = age;
     }
     return oldest;
   }

   function lastActiveForAssignee(
     inbox: Awaited<ReturnType<typeof getSocialInboxData>>,
     userId: string,
   ): Date | null {
     let latest: number | null = null;
     for (const s of inbox.sendAttempts) {
       if (s.approved_by !== userId || !s.sent_at) continue;
       const t = Date.parse(s.sent_at);
       if (Number.isFinite(t) && (latest === null || t > latest)) latest = t;
     }
     return latest === null ? null : new Date(latest);
   }
   ```
   > NOTE: `onTimeRate`/`teamClaims` for the team view are refined per period: for `today`, compute live (reuse `computeTodayResponseMetrics` per assignee + `computeClaimsToday`); for `yesterday/7d/30d`, sum from `meta_inbox_metrics_daily` rows for that user in the date range (`on_time_replies/total_replies`, `team_claims`). Wire this in the fetcher; it is integration-verified, not unit-tested. The skeleton leaves them as `null`/`0` placeholders you must complete before the route ships — do not leave them stubbed.
5. - [ ] Run the unit test — expect PASS (after fixing the `repliesSent` placeholder per the NOTE). `npm run typecheck`.
6. - [ ] Commit:
   ```bash
   git add src/lib/inbox-metrics.ts tests/inbox-metrics-team.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add getTeamRollup over the manager dashboard

   Maps buildMetaInboxManagerDashboard.byAssignee rows into business-hours
   aware TeamRows for the lead's teammates, with a tested pure mapper and
   period-to-days helper.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 34: /m/inbox/team/page.tsx route (lead-gated)

**Files:**
- Create: `src/app/m/inbox/team/page.tsx`
- Test: `tests/team-route-gate.test.ts` (pure gate helper)

> Spec §7.2: `if (!profile.teamLead) notFound();`. Force-dynamic. Reads the `period` from `searchParams` (default `today`). Renders `<TeamMetricsTable>` (Task 35).

1. - [ ] Write the failing test `tests/team-route-gate.test.ts` for a pure helper `resolvePeriodParam`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import { resolvePeriodParam } from "../src/lib/inbox-metrics.ts";

   describe("resolvePeriodParam", () => {
     it("defaults to today and accepts valid periods", () => {
       assert.equal(resolvePeriodParam(undefined), "today");
       assert.equal(resolvePeriodParam("yesterday"), "yesterday");
       assert.equal(resolvePeriodParam("7d"), "7d");
       assert.equal(resolvePeriodParam("30d"), "30d");
       assert.equal(resolvePeriodParam("garbage"), "today");
       assert.equal(resolvePeriodParam(["7d"]), "7d"); // array form from searchParams
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Add `resolvePeriodParam` to `src/lib/inbox-metrics.ts`:
   ```ts
   const PERIODS: ReadonlySet<string> = new Set(["today", "yesterday", "7d", "30d"]);
   export function resolvePeriodParam(value: string | string[] | undefined): Period {
     const raw = Array.isArray(value) ? value[0] : value;
     return raw && PERIODS.has(raw) ? (raw as Period) : "today";
   }
   ```
4. - [ ] Run the test — expect PASS. Then create `src/app/m/inbox/team/page.tsx`:
   ```tsx
   import { notFound } from "next/navigation";

   import { TeamMetricsTable } from "@/components/v2/inbox/team-metrics-table";
   import { getServerAccessProfile } from "@/lib/server-route-auth";
   import { getTeamRollup, resolvePeriodParam } from "@/lib/inbox-metrics";

   export const dynamic = "force-dynamic";

   export default async function TeamMetricsPage({
     searchParams,
   }: {
     searchParams: Promise<{ period?: string | string[] }>;
   }) {
     const profile = await getServerAccessProfile();
     if (!profile?.teamLead) notFound();

     const period = resolvePeriodParam((await searchParams).period);
     const rollup = await getTeamRollup(
       {
         appUserId: profile.appUserId,
         roles: profile.roles,
         permissions: profile.permissions,
         teamLead: profile.teamLead,
         teamIds: profile.teamIds,
         teamUserIds: profile.teamUserIds,
       },
       period,
       new Date(),
     );

     return (
       <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
         <section className="mx-auto max-w-7xl">
           <header className="flex items-baseline justify-between border-b border-hp-rule px-1 pb-4 pt-4">
             <h1 className="font-title text-[26px] leading-tight text-hp-ink">{rollup.teamName}</h1>
             <PeriodSelector period={period} />
           </header>
           <TeamMetricsTable rows={rollup.rows} period={period} />
         </section>
       </main>
     );
   }

   function PeriodSelector({ period }: { period: string }) {
     const options: { key: string; label: string }[] = [
       { key: "today", label: "Today" },
       { key: "yesterday", label: "Yesterday" },
       { key: "7d", label: "Last 7 days" },
       { key: "30d", label: "Last 30 days" },
     ];
     return (
       <nav className="flex items-center gap-3 text-[11px] smallcaps">
         {options.map((o) => (
           <a
             key={o.key}
             href={`/m/inbox/team?period=${o.key}`}
             data-active={period === o.key}
             className={period === o.key ? "text-hp-ink underline underline-offset-4" : "text-hp-muted hover:text-hp-ink"}
           >
             {o.label}
           </a>
         ))}
       </nav>
     );
   }
   ```
   > NOTE: `searchParams` is a Promise in this Next version (app router). If `npm run typecheck` flags the Promise shape, consult `node_modules/next/dist/docs/` per AGENTS.md and match the real signature. The gate uses `profile.teamLead` (added in Task 23). `current_user_has_role` is not used here because the scoped read model has no `auth.uid()` session — the structural lead check via the profile is the boundary (consistent with spec §9 "the lead check is structural").
5. - [ ] Run `npm run typecheck` (the route imports `TeamMetricsTable` which lands in Task 35 — if you do Tasks 34→35 in order, this route won't typecheck until 35. Acceptable: keep the route + test committed, finish 35 next, then typecheck passes. Alternatively create a minimal `TeamMetricsTable` stub now and flesh it out in 35. Prefer the stub so each task is independently green.) Add a stub `src/components/v2/inbox/team-metrics-table.tsx`:
   ```tsx
   import type { Period, TeamRow } from "../../../lib/inbox-metrics.ts";
   export function TeamMetricsTable({ rows }: { rows: TeamRow[]; period: Period }) {
     return <div data-component="team-metrics-table">{rows.length} rows</div>;
   }
   ```
6. - [ ] Commit:
   ```bash
   git add src/app/m/inbox/team/page.tsx src/components/v2/inbox/team-metrics-table.tsx src/lib/inbox-metrics.ts tests/team-route-gate.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add lead-gated /m/inbox/team route

   Adds the force-dynamic manager route that notFound()s non-leads, resolves
   the period selector, and renders the team rollup (table stub fleshed out
   next).

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 35: team-metrics-table.tsx (10 columns + empty state)

**Files:**
- Modify: `src/components/v2/inbox/team-metrics-table.tsx`
- Test: `tests/team-metrics-table.test.tsx`

> Spec §4.4 columns (10): Name+role, Open assigned (A1), Needs reply (A2), At risk (A3, pink), Avg first-response (B1), On-time rate (B2), Replies sent (B3), Team-queue claims (C2), Oldest unanswered (live), Last active. Row click → `onSelectUser(id)`. Each row has a "Full report" link → `/m/inbox/team/[userId]`. Empty state per §15.5 when `rows.length === 0`.

1. - [ ] Write the failing test `tests/team-metrics-table.test.tsx` (copy harness):
   ```ts
   import assert from "node:assert/strict";
   import { createRequire } from "node:module";
   import test from "node:test";
   // ... loadModule harness ...
   const require = createRequire(import.meta.url);
   const React = require("react");
   const { renderToStaticMarkup } = require("react-dom/server");

   const { TeamMetricsTable } = loadModule("src/components/v2/inbox/team-metrics-table.tsx") as {
     TeamMetricsTable: (p: Record<string, unknown>) => React.ReactElement;
   };

   function row(overrides = {}) {
     return {
       userId: "11111111-1111-4111-8111-111111111111",
       name: "Ana", role: "member",
       assigned: 12, needsReply: 4, atRisk: 2,
       avgResponseSec: 1800, onTimeRate: 0.75, repliesSent: 9,
       teamClaims: 3, oldestUnansweredSec: 5400,
       lastActiveAt: new Date("2026-05-27T18:00:00Z"),
       ...overrides,
     };
   }

   test("renders all ten columns and a full-report link per row", () => {
     const markup = renderToStaticMarkup(
       React.createElement(TeamMetricsTable, { rows: [row()], period: "today" }),
     );
     for (const head of ["Name", "Open", "Needs reply", "At risk", "Avg first", "On time", "Replies", "Claims", "Oldest", "Last active"]) {
       assert.match(markup, new RegExp(head));
     }
     assert.match(markup, /Ana/);
     assert.match(markup, /30m/);   // 1800s avg
     assert.match(markup, /75%/);   // on-time
     assert.match(markup, /text-signal-warning/); // at-risk pink
     assert.match(markup, /href="\/m\/inbox\/team\/11111111-1111-4111-8111-111111111111"/);
     assert.match(markup, /Full report/);
   });

   test("renders the distinct empty state when there are no rows", () => {
     const markup = renderToStaticMarkup(
       React.createElement(TeamMetricsTable, { rows: [], period: "today" }),
     );
     assert.match(markup, /No team members yet/);
     assert.doesNotMatch(markup, /Full report/);
   });
   ```
2. - [ ] Run it — expect FAIL (stub doesn't have columns).
3. - [ ] Replace `src/components/v2/inbox/team-metrics-table.tsx`:
   ```tsx
   "use client";

   import Link from "next/link";

   import type { Period, TeamRow } from "../../../lib/inbox-metrics.ts";

   function mins(sec: number | null): string {
     return sec === null ? "—" : `${Math.round(sec / 60)}m`;
   }
   function pct(rate: number | null): string {
     return rate === null ? "—" : `${Math.round(rate * 100)}%`;
   }
   function lastActive(at: Date | null): string {
     if (!at) return "—";
     return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at);
   }

   const COLUMNS = [
     "Name", "Open", "Needs reply", "At risk", "Avg first", "On time",
     "Replies", "Claims", "Oldest", "Last active", "",
   ];

   export function TeamMetricsTable({
     rows,
     period,
     onSelectUser,
   }: {
     rows: TeamRow[];
     period: Period;
     onSelectUser?: (userId: string) => void;
   }) {
     if (rows.length === 0) {
       return (
         <div
           data-component="team-metrics-table-empty"
           className="border border-hp-rule bg-hp-card px-4 py-10 text-center"
         >
           <p className="font-title text-[18px] text-hp-ink">No team members yet</p>
           <p className="mt-2 text-[11px] smallcaps text-hp-muted">
             Add members to a team in meta_inbox_team_members to see per-user metrics here.
           </p>
         </div>
       );
     }

     return (
       <table data-component="team-metrics-table" data-period={period} className="w-full border-collapse text-[13px]">
         <thead>
           <tr className="border-b border-hp-rule text-[10px] smallcaps text-hp-muted">
             {COLUMNS.map((c, i) => (
               <th key={c || `c${i}`} className="px-2 py-2 text-left font-normal">{c}</th>
             ))}
           </tr>
         </thead>
         <tbody>
           {rows.map((r) => (
             <tr
               key={r.userId}
               data-row-user={r.userId}
               onClick={onSelectUser ? () => onSelectUser(r.userId) : undefined}
               className="border-b border-hp-rule-soft hover:bg-hp-inset"
             >
               <td className="px-2 py-2 text-hp-ink">
                 {r.name} <span className="text-[10px] smallcaps text-hp-muted">{r.role}</span>
               </td>
               <td className="px-2 py-2 lining-nums">{r.assigned}</td>
               <td className="px-2 py-2 lining-nums">{r.needsReply}</td>
               <td className="px-2 py-2 lining-nums text-signal-warning">{r.atRisk}</td>
               <td className="px-2 py-2 lining-nums">{mins(r.avgResponseSec)}</td>
               <td className="px-2 py-2 lining-nums">{pct(r.onTimeRate)}</td>
               <td className="px-2 py-2 lining-nums">{r.repliesSent}</td>
               <td className="px-2 py-2 lining-nums">{r.teamClaims}</td>
               <td className="px-2 py-2 lining-nums">{mins(r.oldestUnansweredSec)}</td>
               <td className="px-2 py-2 text-[11px] text-hp-muted">{lastActive(r.lastActiveAt)}</td>
               <td className="px-2 py-2">
                 <Link
                   href={`/m/inbox/team/${r.userId}`}
                   onClick={(e) => e.stopPropagation()}
                   className="text-[11px] smallcaps text-hp-ink underline-offset-2 hover:underline"
                 >
                   Full report
                 </Link>
               </td>
             </tr>
           ))}
         </tbody>
       </table>
     );
   }
   ```
4. - [ ] Run the test — expect PASS. `npm run typecheck`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/team-metrics-table.tsx tests/team-metrics-table.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): build the team metrics table

   Ten-column per-teammate table with pink at-risk, full-report links, row
   click selection, and a distinct empty state for teams with no members.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 36: add readOnly prop to queue-rail.tsx

**Files:**
- Modify: `src/components/v2/inbox/queue-rail.tsx`
- Test: `tests/queue-rail-readonly.test.tsx`

> Spec §4.5/§8.4: queue-rail hides mutation controls when read-only. Prefer the `useReadOnly()` hook (Task 27) so the peek subtree controls it via context; also accept an explicit `readOnly` prop that, when true, wraps in `ReadOnlyProvider`. Identify the mutation buttons in queue-rail (claim/assign actions) and gate them on `useReadOnly()`.

1. - [ ] First read `src/components/v2/inbox/queue-rail.tsx` fully to find its mutation controls (claim/assign/quick-action buttons) and its props. Then write the failing test `tests/queue-rail-readonly.test.tsx` (copy harness) asserting that a known mutation control's marker (e.g. a `data-action="claim"` button, or whatever the file actually renders) is **absent** when read-only and present otherwise. Example shape (adjust selectors to the real markup you find):
   ```ts
   test("queue rail hides claim/assign controls when read-only", () => {
     const editable = renderToStaticMarkup(React.createElement(QueueRail, { ...baseProps, readOnly: false }));
     const readonly = renderToStaticMarkup(React.createElement(QueueRail, { ...baseProps, readOnly: true }));
     assert.match(editable, /data-action="claim"/); // or the real marker
     assert.doesNotMatch(readonly, /data-action="claim"/);
   });
   ```
   > NOTE: if `QueueRail` has no inline mutation buttons (selection-only), then read-only changes nothing for it — in that case the test asserts the rail renders identically and the only real read-only work is in `conversation-detail.tsx` (Task 37). Determine this from the actual file before writing the test; do not assert a control that doesn't exist.
2. - [ ] Run it — expect FAIL (or, if rail has no mutations, write the "renders identically" assertion which passes — then this task is just adding the `readOnly` prop pass-through + `ReadOnlyProvider` wrap for downstream children).
3. - [ ] Implement: add an optional `readOnly?: boolean` prop. At the top of the rendered tree, if `readOnly`, wrap children in `<ReadOnlyProvider value={true}>`. Gate each mutation control with `const isReadOnly = useReadOnly();` and `{!isReadOnly && (<button data-action="claim" ... />)}`. Import `ReadOnlyProvider, useReadOnly` from `./read-only-context.tsx`.
4. - [ ] Run the test — expect PASS. `npm run typecheck` + `npm run lint`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/queue-rail.tsx tests/queue-rail-readonly.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): support read-only mode in the queue rail

   Adds a readOnly prop that provides ReadOnly context and hides queue
   mutation controls so the manager peek is view-only.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 37: add readOnly prop to conversation-detail.tsx

**Files:**
- Modify: `src/components/v2/inbox/conversation-detail.tsx`
- Test: `tests/conversation-detail-readonly.test.tsx`

> Spec §4.5: hide reply composer + assign/snooze/status-change actions when read-only.

1. - [ ] Read `src/components/v2/inbox/conversation-detail.tsx` fully to find the composer + action controls and props. Write the failing test `tests/conversation-detail-readonly.test.tsx` (copy harness) asserting the composer + a status/assign control are absent when read-only, present otherwise. Adjust selectors to the real markup (e.g. `data-component="reply-composer"`, the assign/snooze/status buttons).
   ```ts
   test("conversation detail hides composer and mutation actions when read-only", () => {
     const editable = renderToStaticMarkup(React.createElement(ConversationDetail, { ...baseProps, readOnly: false }));
     const readonly = renderToStaticMarkup(React.createElement(ConversationDetail, { ...baseProps, readOnly: true }));
     assert.match(editable, /reply-composer|data-action="assign"/);
     assert.doesNotMatch(readonly, /reply-composer/);
     assert.doesNotMatch(readonly, /data-action="assign"/);
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement: add `readOnly?: boolean`, wrap in `<ReadOnlyProvider value={true}>` when true, and gate the composer + assign/snooze/status controls on `!useReadOnly()`. If the composer is a child component, gate its render at the parent (`{!isReadOnly && <ReplyComposer .../>}`) rather than threading the prop deeply.
4. - [ ] Run the test — expect PASS. `npm run typecheck` + `npm run lint`.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/conversation-detail.tsx tests/conversation-detail-readonly.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): support read-only mode in conversation detail

   Hides the reply composer and assign/snooze/status controls when read-only
   so the manager peek shows pure visibility for coaching.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 38: team-member-peek.tsx drawer + getInboxForUser server action

**Files:**
- Create: `src/components/v2/inbox/team-member-peek.tsx`
- Create: `src/lib/inbox-team-peek.ts` (server action `getInboxForUser` asserting lead + team membership)
- Test: `tests/inbox-team-peek-authz.test.ts` (pure authz helper)

> Spec §4.5/§8.3: drawer reuses `<QueueRail readOnly>` + `<ConversationDetail readOnly>`, loading its own data via a server action that asserts the caller is a lead and the target is in the caller's team.

1. - [ ] Write the failing test `tests/inbox-team-peek-authz.test.ts` for a pure helper `assertLeadCanViewUser`:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";

   import { canLeadViewUser } from "../src/lib/inbox-team-peek.ts";

   const ME = "11111111-1111-4111-8111-111111111111";
   const MATE = "22222222-2222-4222-8222-222222222222";
   const STRANGER = "33333333-3333-4333-8333-333333333333";

   describe("canLeadViewUser", () => {
     it("allows a lead to view a teammate", () => {
       assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: [MATE] }, MATE), true);
     });
     it("denies a non-lead", () => {
       assert.equal(canLeadViewUser({ teamLead: false, teamUserIds: [MATE] }, MATE), false);
     });
     it("denies viewing a non-teammate", () => {
       assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: [MATE] }, STRANGER), false);
     });
   });
   ```
2. - [ ] Run it — expect FAIL.
3. - [ ] Implement `src/lib/inbox-team-peek.ts`:
   ```ts
   "use server";

   import { getServerAccessProfile } from "./server-route-auth.ts";
   import { getSocialInboxData, type SocialInboxData } from "./social-inbox.ts";

   export function canLeadViewUser(
     viewer: { teamLead: boolean; teamUserIds: readonly string[] },
     targetUserId: string,
   ): boolean {
     return Boolean(viewer.teamLead) && viewer.teamUserIds.includes(targetUserId);
   }

   // Server action: returns the target teammate's inbox data, scoped read,
   // only if the caller is a lead over that teammate. Throws otherwise.
   export async function getInboxForUser(targetUserId: string): Promise<SocialInboxData> {
     const profile = await getServerAccessProfile();
     if (
       !profile ||
       !canLeadViewUser(
         { teamLead: Boolean(profile.teamLead), teamUserIds: profile.teamUserIds || [] },
         targetUserId,
       )
     ) {
       throw new Error("Not authorized to view this teammate's inbox.");
     }
     // Reuse the inbox read; filter to the target's assigned conversations.
     const data = await getSocialInboxData({
       appUserId: profile.appUserId,
       roles: profile.roles,
       permissions: profile.permissions,
     });
     return {
       ...data,
       inboxConversations: data.inboxConversations.filter(
         (c) => c.assigned_user_id === targetUserId,
       ),
     };
   }
   ```
4. - [ ] Run the test — expect PASS. Then create `src/components/v2/inbox/team-member-peek.tsx`:
   ```tsx
   "use client";

   import { useEffect, useState } from "react";

   import type { SocialInboxData } from "../../../lib/social-inbox.ts";
   import { getInboxForUser } from "../../../lib/inbox-team-peek.ts";
   import { ConversationDetail } from "./conversation-detail.tsx";
   import { QueueRail } from "./queue-rail.tsx";

   export function TeamMemberPeek({
     userId,
     onClose,
   }: {
     userId: string;
     onClose: () => void;
   }) {
     const [data, setData] = useState<SocialInboxData | null>(null);
     const [error, setError] = useState<string | null>(null);

     useEffect(() => {
       let active = true;
       getInboxForUser(userId)
         .then((d) => active && setData(d))
         .catch((e) => active && setError(e instanceof Error ? e.message : "Failed to load."));
       return () => {
         active = false;
       };
     }, [userId]);

     return (
       <aside
         data-component="team-member-peek"
         className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-hp-rule bg-hp-foundation shadow-xl"
       >
         <header className="flex items-center justify-between border-b border-hp-rule px-4 py-3">
           <span className="text-[11px] smallcaps text-hp-muted">Read-only peek</span>
           <button type="button" onClick={onClose} className="text-[11px] smallcaps text-hp-ink hover:underline">
             Close
           </button>
         </header>
         <div className="flex-1 overflow-auto p-3">
           {error ? (
             <p className="text-[13px] text-signal-warning">{error}</p>
           ) : !data ? (
             <p className="text-[11px] smallcaps text-hp-muted">Loading…</p>
           ) : (
             <div className="grid gap-3">
               {/* Reuse the existing rail + detail in read-only mode. Pass the
                   minimal props each requires from `data` — match their real
                   prop contracts discovered in Tasks 36/37. */}
               <QueueRail readOnly /* ...derive items from data... */ />
               <ConversationDetail readOnly /* ...derive selected item from data... */ />
             </div>
           )}
         </div>
       </aside>
     );
   }
   ```
   > NOTE: `QueueRail`/`ConversationDetail` have rich prop contracts (seen in `social-inbox-client.tsx`). Wiring real data into the peek requires building the same view-model the client builds (`buildMetaInboxMobileConversationItems` / queue-view helpers). For v1 the peek can render a simplified read-only list using the same `meta-inbox-queue-view` mapper the main client uses, then `ConversationDetail` for a selected item. Fill these props from `data` using the exact mappers in `meta-inbox-queue-view.ts`; do not invent new props. This is the one component requiring the most cross-referencing — budget time to read `social-inbox-client.tsx`'s rail/detail wiring (lines ~405-470) and mirror it with `readOnly` added.
5. - [ ] Run `npm run typecheck` + `npm run lint`. Manual: not yet wired into a route until Task 39 (detail page) / table row click — defer the live click test to Task 39.
6. - [ ] Commit:
   ```bash
   git add src/lib/inbox-team-peek.ts src/components/v2/inbox/team-member-peek.tsx tests/inbox-team-peek-authz.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add read-only team-member peek drawer

   Adds the lead-gated getInboxForUser server action and a peek drawer that
   reuses the queue rail and conversation detail in read-only mode.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 39: /m/inbox/team/[userId]/page.tsx detail route + wire peek

**Files:**
- Create: `src/app/m/inbox/team/[userId]/page.tsx`
- Modify: `src/components/v2/inbox/team-metrics-table.tsx` (wire row click → peek state in a small client wrapper, or rely on the Full-report link only for v1)
- Test: `tests/team-detail-route-gate.test.ts` (pure gate: lead AND target ∈ teamUserIds)

> Spec §4.6: gated by `profile.teamLead && targetUser ∈ profile.teamIds`. Same metric set + a single avg-response trend chart (Task 40). Reuses `canLeadViewUser`.

1. - [ ] Write the failing test `tests/team-detail-route-gate.test.ts` reusing `canLeadViewUser` for the gate decision:
   ```ts
   import assert from "node:assert/strict";
   import { describe, it } from "node:test";
   import { canLeadViewUser } from "../src/lib/inbox-team-peek.ts";

   describe("team detail gate", () => {
     it("allows a lead viewing a teammate; denies otherwise", () => {
       assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: ["u2"] }, "u2"), true);
       assert.equal(canLeadViewUser({ teamLead: true, teamUserIds: ["u2"] }, "u9"), false);
       assert.equal(canLeadViewUser({ teamLead: false, teamUserIds: ["u2"] }, "u2"), false);
     });
   });
   ```
2. - [ ] Run it — expect PASS already (helper exists from Task 38). This test pins the gate contract for the route.
3. - [ ] Create `src/app/m/inbox/team/[userId]/page.tsx`:
   ```tsx
   import { notFound } from "next/navigation";

   import { TeamTrendChart } from "@/components/v2/inbox/team-trend-chart";
   import { getServerAccessProfile } from "@/lib/server-route-auth";
   import { canLeadViewUser } from "@/lib/inbox-team-peek";
   import {
     getTeamRollup,
     resolvePeriodParam,
     getUserDailyHistory,
   } from "@/lib/inbox-metrics";

   export const dynamic = "force-dynamic";

   export default async function TeamMemberDetailPage({
     params,
     searchParams,
   }: {
     params: Promise<{ userId: string }>;
     searchParams: Promise<{ period?: string | string[] }>;
   }) {
     const profile = await getServerAccessProfile();
     const { userId } = await params;
     if (
       !profile?.teamLead ||
       !canLeadViewUser(
         { teamLead: Boolean(profile.teamLead), teamUserIds: profile.teamUserIds || [] },
         userId,
       )
     ) {
       notFound();
     }

     const period = resolvePeriodParam((await searchParams).period);
     const headerProfile = {
       appUserId: profile.appUserId,
       roles: profile.roles,
       permissions: profile.permissions,
       teamLead: profile.teamLead,
       teamIds: profile.teamIds,
       teamUserIds: profile.teamUserIds,
     };
     const rollup = await getTeamRollup(headerProfile, period, new Date());
     const row = rollup.rows.find((r) => r.userId === userId) || null;
     const history = await getUserDailyHistory(userId, period);

     return (
       <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
         <section className="mx-auto max-w-5xl">
           <header className="border-b border-hp-rule px-1 pb-4 pt-4">
             <h1 className="font-title text-[26px] text-hp-ink">{row?.name || "Unknown"}</h1>
             <p className="text-[11px] smallcaps text-hp-muted">{row?.role || "member"}</p>
           </header>
           {/* Reuse a single-row TeamMetricsTable for the metric set. */}
           <TeamTrendChart points={history} />
         </section>
       </main>
     );
   }
   ```
4. - [ ] Add `getUserDailyHistory(userId, period)` to `src/lib/inbox-metrics.ts` (returns `{ date: string; avgResponseSec: number | null }[]` from `meta_inbox_metrics_daily` for the period span; integration-verified). Add the type and a pure `daysBackForPeriod` if helpful (reuse `periodToDays`):
   ```ts
   export type DailyHistoryRow = { date: string; avgResponseSec: number | null };

   export async function getUserDailyHistory(
     userId: string,
     period: Period,
   ): Promise<DailyHistoryRow[]> {
     const supabase = dynamicSupabaseWeb();
     const since = new Date(Date.now() - periodToDays(period) * 86_400_000)
       .toISOString()
       .slice(0, 10);
     const { data } = await supabase
       .from("meta_inbox_metrics_daily")
       .select("date,avg_response_seconds")
       .eq("user_id", userId)
       .gte("date", since)
       .order("date", { ascending: true });
     return (data || []).map((r: { date: string; avg_response_seconds: number | null }) => ({
       date: r.date,
       avgResponseSec: r.avg_response_seconds,
     }));
   }
   ```
   > NOTE: spec §7.1 declared `getUserDailyHistory(userId, period, environment)`. The `environment` arg is unnecessary because the scoped client + RLS already pin the environment (see Orientation). Drop it; if a caller needs cross-env, add it later.
5. - [ ] Create a `TeamTrendChart` stub so this route typechecks (fleshed out in Task 40):
   ```tsx
   import type { DailyHistoryRow } from "../../../lib/inbox-metrics.ts";
   export function TeamTrendChart({ points }: { points: DailyHistoryRow[] }) {
     return <div data-component="team-trend-chart">{points.length} points</div>;
   }
   ```
6. - [ ] `npm run typecheck` + `npm run lint`. Run `tests/team-detail-route-gate.test.ts` (PASS).
7. - [ ] Commit:
   ```bash
   git add "src/app/m/inbox/team/[userId]/page.tsx" src/components/v2/inbox/team-trend-chart.tsx src/lib/inbox-metrics.ts tests/team-detail-route-gate.test.ts
   git commit -m "$(cat <<'EOF'
   feat(inbox): add lead-gated per-teammate detail route

   Adds /m/inbox/team/[userId] gated by lead+team membership, surfacing the
   teammate's metric row and a daily-history series (chart stub fleshed out
   next).

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 40: team-trend-chart.tsx (visx line chart)

**Files:**
- Modify: `src/components/v2/inbox/team-trend-chart.tsx`
- Test: `tests/team-trend-chart.test.tsx`

> Spec §4.6: single line chart of avg response over time from `meta_inbox_metrics_daily`. Use `@visx/*` (already a dependency: `@visx/scale`, `@visx/shape`, `@visx/group`, `@visx/axis`). Render as SVG so `renderToStaticMarkup` can assert a `<path>` and the axis ticks. Editorial Broadsheet: hairline axis, ink line, no fill.

1. - [ ] Write the failing test `tests/team-trend-chart.test.tsx` (copy harness; stub `@visx/*` is unnecessary — visx renders plain SVG server-side, but `loadModule` only transpiles one file and `require`s the rest, so real visx loads via `require`):
   ```ts
   import assert from "node:assert/strict";
   import { createRequire } from "node:module";
   import test from "node:test";
   // ... loadModule harness ...
   const require = createRequire(import.meta.url);
   const React = require("react");
   const { renderToStaticMarkup } = require("react-dom/server");

   const { TeamTrendChart } = loadModule("src/components/v2/inbox/team-trend-chart.tsx") as {
     TeamTrendChart: (p: Record<string, unknown>) => React.ReactElement;
   };

   test("renders an SVG line for the daily averages", () => {
     const points = [
       { date: "2026-05-25", avgResponseSec: 3000 },
       { date: "2026-05-26", avgResponseSec: 2400 },
       { date: "2026-05-27", avgResponseSec: 1800 },
     ];
     const markup = renderToStaticMarkup(React.createElement(TeamTrendChart, { points }));
     assert.match(markup, /<svg/);
     assert.match(markup, /<path/); // the line path
   });

   test("renders an empty state when there is no history", () => {
     const markup = renderToStaticMarkup(React.createElement(TeamTrendChart, { points: [] }));
     assert.match(markup, /No history yet/);
     assert.doesNotMatch(markup, /<path/);
   });
   ```
   > NOTE: if `loadModule`'s `require` cannot resolve `@visx/*` ESM under the VM context, add them to the test's `stubs` map or import the chart via direct `--experimental-strip-types` import instead of `loadModule`. Try `loadModule` first; if visx errors, switch this single test to `import { TeamTrendChart } from "../src/components/v2/inbox/team-trend-chart.tsx"` (works because the chart has no `"use client"` hook state — keep it a pure server component).
2. - [ ] Run it — expect FAIL.
3. - [ ] Replace `src/components/v2/inbox/team-trend-chart.tsx`:
   ```tsx
   import { Group } from "@visx/group";
   import { scaleLinear, scaleTime } from "@visx/scale";
   import { LinePath } from "@visx/shape";

   import type { DailyHistoryRow } from "../../../lib/inbox-metrics.ts";

   const WIDTH = 640;
   const HEIGHT = 220;
   const MARGIN = { top: 16, right: 16, bottom: 28, left: 40 };

   export function TeamTrendChart({ points }: { points: DailyHistoryRow[] }) {
     const usable = points.filter((p) => p.avgResponseSec !== null) as { date: string; avgResponseSec: number }[];
     if (usable.length === 0) {
       return (
         <div data-component="team-trend-chart-empty" className="border border-hp-rule px-4 py-8 text-center text-[11px] smallcaps text-hp-muted">
           No history yet
         </div>
       );
     }

     const innerW = WIDTH - MARGIN.left - MARGIN.right;
     const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
     const xs = usable.map((p) => new Date(`${p.date}T00:00:00Z`));
     const ys = usable.map((p) => p.avgResponseSec / 60); // minutes

     const xScale = scaleTime({
       domain: [xs[0], xs[xs.length - 1]],
       range: [0, innerW],
     });
     const yScale = scaleLinear({
       domain: [0, Math.max(...ys) * 1.1],
       range: [innerH, 0],
       nice: true,
     });

     return (
       <svg data-component="team-trend-chart" width={WIDTH} height={HEIGHT} role="img" aria-label="Average response time trend">
         <Group left={MARGIN.left} top={MARGIN.top}>
           <LinePath
             data={usable}
             x={(d) => xScale(new Date(`${d.date}T00:00:00Z`)) ?? 0}
             y={(d) => yScale(d.avgResponseSec / 60) ?? 0}
             stroke="currentColor"
             strokeWidth={1.5}
             className="text-hp-ink"
             fill="none"
           />
         </Group>
       </svg>
     );
   }
   ```
   > NOTE: kept axes minimal (line only) to avoid heavy visx axis SSR quirks; the test only requires `<svg>` + `<path>`. If the user wants labeled axes, add `@visx/axis` `AxisLeft`/`AxisBottom` inside the `Group` — those render `<line>`/`<text>` and won't break the assertions.
4. - [ ] Run the test — expect PASS. `npm run typecheck`. Manual: visit `/m/inbox/team/<a teammate uuid>?period=30d` with seeded rollup data and eyeball the line.
5. - [ ] Commit:
   ```bash
   git add src/components/v2/inbox/team-trend-chart.tsx tests/team-trend-chart.test.tsx
   git commit -m "$(cat <<'EOF'
   feat(inbox): add avg-response trend chart for teammate detail

   Renders a visx line chart of daily average response time from the metrics
   rollup, with an empty state when no history exists.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Phase 9 — cutover / cleanup

### Task 41: enable the flag for all + monitor note

**Files:**
- Modify: deployment env (set `INBOX_METRICS_HEADER_ENABLED=1`) — documented, not code
- Modify: `.env.example` or the env docs (add the flag with a comment) if such a file exists

> Spec §10 step 6: flip the flag on for all, monitor for 1 week. This is an ops step, but record it in-repo so the next engineer knows the flag default.

1. - [ ] If the repo has an `.env.example` / env documentation file (search: `rg -l "META_ACCESS_TOKEN" --glob '*.example' --glob '*.md'`), add a documented line:
   ```
   # Swaps the legacy inbox status sentence for the metrics header. Off = legacy.
   INBOX_METRICS_HEADER_ENABLED=1
   ```
   If no such file exists, add a short note to the inbox section of the relevant README/runbook (do NOT create a new doc file just for this — append to an existing one).
2. - [ ] Confirm the flag default behavior: with the env var unset, `isTruthyEnv` returns false → legacy chrome. With `=1` → metrics header. No code change.
3. - [ ] Run `npm test` (full suite) + `npm run typecheck` + `npm run lint` to confirm the whole feature is green before cutover.
4. - [ ] Commit (only if a tracked env/doc file changed):
   ```bash
   git add .env.example
   git commit -m "$(cat <<'EOF'
   chore(inbox): document INBOX_METRICS_HEADER_ENABLED flag

   Records the metrics-header rollout flag and its legacy-fallback default
   ahead of the team-wide cutover.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

### Task 42: delete the flag + dead InboxEyebrow/InboxStatusSentence code

**Files:**
- Modify: `src/components/social-inbox-client.tsx` (remove the legacy branch + imports)
- Modify: `src/app/(workspace)/convert/inbox/page.tsx` (always fetch metrics; drop the flag)
- Modify: `src/components/v2/inbox/metrics-header-gate.ts` (simplify or delete if no longer needed)
- Delete: `src/components/v2/inbox/inbox-eyebrow.tsx`, `src/components/v2/inbox/inbox-status-sentence.tsx` (and `inbox-highlights.ts` if only used by the sentence)
- Modify: `tests/inbox-top-chrome.test.ts` (remove the Eyebrow/StatusSentence cases; keep HealthRow/LayoutShell cases). Move `formatLastSyncLabel` somewhere live (it is imported by the strip in Task 29).
- Test: update/remove affected tests

> Spec §10 step 7 + §15.3. Only do this AFTER the 1-week monitor (Task 41) confirms the new header is healthy. **`formatLastSyncLabel` is now imported by `metrics-header-strip.tsx`** — before deleting `inbox-eyebrow.tsx`, move `formatLastSyncLabel` (and its private `formatAge`) into `metrics-header-strip.tsx` or a small `sync-freshness.ts`, and update the strip's import. Do that first or the build breaks.

1. - [ ] Move `formatLastSyncLabel` + `formatAge` from `inbox-eyebrow.tsx` into a new `src/components/v2/inbox/sync-freshness.ts` (no JSX needed):
   ```ts
   import type { SocialInboxSyncRun } from "../../../lib/social-inbox.ts";

   export function formatLastSyncLabel(syncRun: SocialInboxSyncRun | null, now: Date | number = Date.now()): string {
     if (!syncRun) return "Last sync · unavailable";
     const completedAt = syncRun.completed_at || syncRun.started_at;
     const age = completedAt ? formatAge(completedAt, now) : "unavailable";
     return `Last sync · ${age} · ${syncRun.status}`;
   }

   function formatAge(value: string, now: Date | number): string {
     const thenMs = Date.parse(value);
     const nowMs = typeof now === "number" ? now : now.getTime();
     if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return "unavailable";
     const minutes = Math.max(0, Math.round((nowMs - thenMs) / 60000));
     if (minutes < 1) return "now";
     if (minutes < 60) return `${minutes} min ago`;
     const hours = Math.round(minutes / 60);
     if (hours < 24) return `${hours}h ago`;
     return `${Math.round(hours / 24)}d ago`;
   }
   ```
   Update `metrics-header-strip.tsx` import from `./inbox-eyebrow.tsx` → `./sync-freshness.ts`. Run `tests/metrics-header-strip.test.tsx` (PASS).
2. - [ ] In `src/app/(workspace)/convert/inbox/page.tsx`: remove `metricsHeaderEnabled` branching — always fetch `getPersonalHeaderMetrics` and pass `headerMetrics`; drop the `metricsHeaderEnabled` prop.
3. - [ ] In `src/components/social-inbox-client.tsx`: delete the `else` (legacy) branch, the `InboxEyebrow`/`InboxStatusSentence` imports, the `metricsHeaderEnabled` prop, and `shouldRenderMetricsHeader`/`metrics-header-gate.ts` (now always-on; render the new header directly, falling back to a minimal header only if `headerMetrics` is null — keep the null-guard so a metrics fetch failure doesn't crash the page, e.g. render just `<InboxHealthRow>`).
4. - [ ] Delete `src/components/v2/inbox/inbox-eyebrow.tsx` and `src/components/v2/inbox/inbox-status-sentence.tsx`. Check `inbox-highlights.ts` usage: `rg -n "computeInboxHighlights|inbox-highlights" src/` — if only `inbox-status-sentence.tsx` used it, delete `inbox-highlights.ts` too (and its test if any).
5. - [ ] Update `tests/inbox-top-chrome.test.ts`: remove the `InboxEyebrow renders...` and `InboxStatusSentence renders...` test cases and their imports; keep the `InboxLayoutShell` and `InboxHealthRow` cases. Remove the now-dead `dashboardFixture`/`queueItem` helpers if unreferenced.
6. - [ ] Run the full suite + typecheck + lint:
   `npm test && npm run typecheck && npm run lint`. Everything green. Manual: load `/convert/inbox` (flag now irrelevant) and confirm the metrics header renders and the sync button works.
7. - [ ] Commit:
   ```bash
   git add -A
   git commit -m "$(cat <<'EOF'
   refactor(inbox): remove legacy header and metrics flag

   Makes the metrics header the only path, deletes InboxEyebrow and
   InboxStatusSentence (relocating the sync-freshness helper), and drops the
   INBOX_METRICS_HEADER_ENABLED gate after a clean monitoring window.

   Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```

---

## Appendix — spec coverage map (self-review)

| Spec section | Task(s) |
|---|---|
| §1 Summary / §4.1 Hybrid layout | 28, 29, 31 |
| §4.2 Adaptive lede (5 states) | 28 |
| §4.3 Lead nudge + teammatesOverSla def | 18, 30, 31 |
| §4.4 Manager view + 10 columns | 33, 34, 35 |
| §4.5 Read-only peek | 27, 36, 37, 38 |
| §4.6 Per-user detail + trend chart | 39, 40 |
| §5 A1/A2/A3 | 12 |
| §5 B1/B2 | 14 |
| §5 B3 (+ 'succeeded' fix) | 13 |
| §5 C1/C3 | 16 |
| §5 C2 (+ §15.1 canonical query) | 17, 24 |
| §6.2 queue hours columns | 1 |
| §6.3 user_preferences | 2 |
| §6.4 metrics_daily | 3 |
| §6.5 send_attempts index | 4 |
| §6.6 pg_cron | 5 |
| §7.1 business-hours.ts | 6–9 |
| §7.1 inbox-metrics.ts | 11–19, 33, 39 |
| §7.1 inbox-assignment.ts (+§15.1) | 20, 21, 22 |
| §7.3 rollup cron + SQL fn | 10, 24, 25 |
| §7.3 backfill (metrics; no events backfill per §15.1) | 26 |
| §8.x components & wiring (+§15.3) | 27–32, 35, 38, 40 |
| §9 RLS (adapted to ads_analyst model) | 2, 3 |
| §10 rollout / cutover | 31, 41, 42 |
| §11 testing strategy | every task's TDD steps + manual notes |
| §12 risks (assignment guard) | 22 |
| §15.1 reuse conversation_events | 17, 20, 24, 26 |
| §15.2 reuse current_app_user_id | 2, 3 (defense-in-depth) |
| §15.3 header replacement diff | 31, 42 |
| §15.4 reuse buildMetaInboxManagerDashboard | 33 |
| §15.5 bare app_user_id + empty state | 33, 35 |
| §15.6 wall-clock eyebrow replaced | 31, 42 |
| §15.7 business-hours greenfield | 6 |
| §15.8 california-time co-location | 6 |

**Spec items intentionally NOT turned into tasks (with reason):**
- §6.1 `meta_inbox_assignment_events` table + its backfill — superseded by §15.1 (reuse `meta_inbox_conversation_events`). No migration, no backfill script.
- §12 Supabase trigger "belt + suspenders" banning `assigned_user_id` UPDATE without a matching event — replaced by the source-scanning guard test (Task 22), which is cheaper and CI-visible. The DB trigger is a deferred hardening follow-up (noted, not built).
- `breached_at_eod` compute — column created (Task 3) and written as 0 (Task 24); spec defines the column but no formula, so no compute task. Flagged as follow-up.
- Deferred §15.1 JSONB partial index, §7.4 60s soft-refetch, §13 follow-ups — explicitly out of scope per spec.
