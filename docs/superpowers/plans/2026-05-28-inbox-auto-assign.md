# Inbox Assignment (manual + round-robin auto-assign) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `assign_to_user` primitive plus a manual "Assign to…" picker and a strict round-robin, schedule-aware auto-assigner so categorized conversations get distributed to on-shift coverers (which finally makes the personal/team metrics headers non-zero).

**Architecture:** One assignment primitive (`assign_to_user`, carrying `targetUserId`) extends the existing inbox workflow and the `updateAssignment` facade — every assignment still emits the `assignment_changed` audit event. A pure decision engine (`pickAssignee` + `isOnShift`) decides who gets the next conversation, fed by three new Meta-Ads-owned, env-scoped tables. Two triggers (an arrival hook at the end of sync, and a `CRON_SECRET`-protected sweep route on a pg_cron schedule) both run the engine and persist through the facade. The cron worker runs as a "system actor" (null `actor_user_id`) and never reads `public.users`.

**Tech Stack:** Next.js (App Router, `runtime = "nodejs"`), TypeScript, Supabase/Postgres (RLS + `ads_analyst_*` scoped roles), pg_cron + pg_net, `node --test --experimental-strip-types` for tests.

---

## Pre-flight: branch, context, and hard constraints

**This plan targets branch `claude/wonderful-swirles-b9a704`** (the worktree where the spec and all its foundation already live — the metrics headers, `inbox-assignment.ts`, `inbox-metrics-db.ts`, `business-hours.ts`). Do **not** execute on a branch cut from `main`; those files do not exist there.

Read first: [docs/superpowers/specs/2026-05-28-inbox-auto-assign-design.md](../specs/2026-05-28-inbox-auto-assign-design.md).

**Constraints discovered in the code (must honor — verified, not assumed):**

1. **Assignment-write guard.** `tests/inbox-assignment-guard.test.ts` fails if any file other than `src/lib/meta-inbox-workflow.ts` or `src/lib/inbox-assignment.ts` writes `assigned_user_id` (matches `.assigned_user_id =` or `assigned_user_id:` in a payload). The auto-assign worker therefore **must** assign through the `updateAssignment` facade — never a direct DB write. `targetUserId` is a different token and does not trip the guard.
2. **System actor = null `actor_user_id`.** `updateSocialInboxConversationWorkflow` ([src/lib/social-inbox.ts:892](../../../src/lib/social-inbox.ts)) sets `actorUserId = profile.appUserId && isUuid(...) ? profile.appUserId : null` and writes it onto the event row. The sweep runs with a profile whose `appUserId` is `null`, so its `assignment_changed` events get `actor_user_id = NULL` — the v1 marker that distinguishes auto from manual. No extra metadata is added (spec §10: v1 counts both; a *future* view separates them).
3. **Worker cannot read identity/`users`.** The identity view `analytics.ads_analyst_identity_profiles_v1` is granted to `ads_analyst_web` only, and `meta_inbox_team_members` has no `active` column. So the auto pool gate is **`auto_assign_eligible`** alone (admins clear it for inactive staff). The `active` filter applies only to the web-side manual picker, which reads the identity view.

**Resolved spec open items (§13):**
- *Confidently categorized + unassigned* predicate: `assigned_user_id IS NULL AND queue_category_key IS NOT NULL AND queue_category_key <> 'uncategorized_needs_review' AND routing_confidence >= 0.85`. (`0.85` is the umbrella-routed confidence set in `inferQueueCategory`, [src/lib/meta-inbox-normalization.ts:754](../../../src/lib/meta-inbox-normalization.ts); manual overrides set `routing_confidence = 1`.)
- *Arrival hook write point*: best-effort call to `runInboxAutoAssignSweep()` at the tail of `syncSocialInbox` ([src/lib/social-inbox.ts:570-634](../../../src/lib/social-inbox.ts)). This reuses the sweep and is idempotent (only acts on currently-unassigned rows), so we avoid a fragile deep hook into the normalization writer.
- *Sweep cadence*: every 5 minutes via pg_cron + pg_net, mirroring [supabase/migrations/20260528133430_schedule_inbox_metrics_daily_cron.sql](../../../supabase/migrations/20260528133430_schedule_inbox_metrics_daily_cron.sql).

**Migration naming:** Meta-Ads migrations use `seconds=30`. Latest existing is `20260528133430`. New files in this plan use `20260528150030 / 150130 / 150230 / 150330`.

**Test commands:** Per `package.json`, the runner is `node --test --experimental-strip-types tests/*.test.ts`. Run a single file with `node --test --experimental-strip-types tests/<name>.test.ts`. Typecheck with `npm run typecheck`.

---

## File Structure

**New files**
- `supabase/migrations/20260528150030_meta_inbox_team_members_auto_assign_eligible.sql` — adds the `auto_assign_eligible` column.
- `supabase/migrations/20260528150130_meta_inbox_member_schedules.sql` — weekly per-weekday working windows.
- `supabase/migrations/20260528150230_meta_inbox_assign_rotation.sql` — per-category round-robin pointer.
- `supabase/migrations/20260528150330_schedule_inbox_auto_assign_cron.sql` — pg_cron schedule for the sweep.
- `src/lib/inbox-auto-assign.ts` — **pure** engine: `isOnShift`, `pickAssignee`, and their types. No I/O.
- `src/lib/inbox-auto-assign-worker.ts` — DB loaders + `runInboxAutoAssignSweep()` orchestration; assigns via the facade.
- `src/app/api/cron/inbox-auto-assign/route.ts` — `CRON_SECRET`-protected sweep entrypoint.
- `src/components/v2/inbox/assign-to-user-picker.tsx` — the manual "Assign to…" control.
- `src/app/api/social-inbox/team/schedules/route.ts` — admin reads/writes for eligibility + schedules.
- `src/components/v2/inbox/team-schedule-settings.tsx` — admin settings UI (eligibility toggle + weekly schedule editor).
- Tests: `tests/meta-inbox-team-members-auto-assign-migration.test.ts`, `tests/meta-inbox-member-schedules-migration.test.ts`, `tests/meta-inbox-assign-rotation-migration.test.ts`, `tests/schedule-inbox-auto-assign-cron-migration.test.ts`, `tests/inbox-auto-assign.test.ts`, `tests/inbox-assignment-assign-to-user.test.ts`, `tests/inbox-metrics-identity-view.test.ts`.

**Modified files**
- `src/lib/meta-inbox-workflow.ts` — add `assign_to_user` mode + `targetUserId`.
- `src/app/api/social-inbox/conversations/[conversationId]/workflow/route.ts` — accept `targetUserId`.
- `src/lib/inbox-assignment.ts` — facade maps a target user to `assign_to_user`.
- `src/lib/meta-inbox-access.ts` — export `SYSTEM_INBOX_PROFILE`.
- `src/lib/inbox-metrics-db.ts` — §3a fix: team rollup names via the identity view.
- `src/lib/social-inbox.ts` — arrival hook at the end of `syncSocialInbox`.
- `src/components/v2/inbox/details-drawer-panel.tsx` — mount the "Assign to…" picker in the Workflow section.

---

## Phase 1 — Data model (Meta-Ads-owned, env-scoped, seconds=30)

### Task 1: Add `auto_assign_eligible` to team members

**Files:**
- Create: `supabase/migrations/20260528150030_meta_inbox_team_members_auto_assign_eligible.sql`
- Test: `tests/meta-inbox-team-members-auto-assign-migration.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-inbox-team-members-auto-assign-migration.test.ts
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

describe("meta_inbox_team_members.auto_assign_eligible migration", () => {
  it("adds an opt-in boolean column defaulting to false", () => {
    const sql = migrationContaining("auto_assign_eligible");
    assert.match(sql, /alter table public\.meta_inbox_team_members/i);
    assert.match(sql, /add column if not exists auto_assign_eligible boolean not null default false/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/meta-inbox-team-members-auto-assign-migration.test.ts`
Expected: FAIL — "No migration contains: auto_assign_eligible".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528150030_meta_inbox_team_members_auto_assign_eligible.sql
-- Migration: meta_inbox_team_members.auto_assign_eligible
--
-- Shared Supabase ledger file. This repo writes seconds=30 so it cannot collide
-- with the sales-standalone-app-v1 repo (which writes seconds=00).
--
-- Opt-in flag for the round-robin auto-assign pool. A member only joins the pool
-- for the categories their team covers when this is true, so leads/part-timers
-- can be excluded without removing them from the team. The column inherits the
-- table's existing grants and env-match RLS.

alter table public.meta_inbox_team_members
  add column if not exists auto_assign_eligible boolean not null default false;

comment on column public.meta_inbox_team_members.auto_assign_eligible is
  'When true, this member joins the round-robin auto-assign pool for the categories their team covers (spec 2026-05-28-inbox-auto-assign-design).';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/meta-inbox-team-members-auto-assign-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528150030_meta_inbox_team_members_auto_assign_eligible.sql tests/meta-inbox-team-members-auto-assign-migration.test.ts
git commit -m "feat(inbox): add auto_assign_eligible to team members"
```

---

### Task 2: Create `meta_inbox_member_schedules`

**Files:**
- Create: `supabase/migrations/20260528150130_meta_inbox_member_schedules.sql`
- Test: `tests/meta-inbox-member-schedules-migration.test.ts`

Template is [supabase/migrations/20260528035730_meta_inbox_user_preferences.sql](../../../supabase/migrations/20260528035730_meta_inbox_user_preferences.sql). This table adds DELETE (clearing a weekday = day off). No timezone column — tz is reused from `meta_inbox_user_preferences.timezone`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-inbox-member-schedules-migration.test.ts
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

describe("meta_inbox_member_schedules migration", () => {
  const sql = () =>
    migrationContaining("create table if not exists public.meta_inbox_member_schedules");

  it("keys one row per (environment, app_user_id, weekday) with no tz column", () => {
    assert.match(sql(), /weekday\s+smallint not null check \(weekday between 0 and 6\)/i);
    assert.match(sql(), /start_time\s+time not null/i);
    assert.match(sql(), /end_time\s+time not null/i);
    assert.match(sql(), /primary key \(environment, app_user_id, weekday\)/i);
    assert.ok(!/timezone/i.test(sql()), "schedules must not store timezone (reuse user prefs)");
  });

  it("follows the ads_analyst role + environment RLS pattern and allows delete", () => {
    assert.match(sql(), /enable row level security/i);
    assert.match(sql(), /analytics\.ads_analyst_environment_matches\(environment\)/i);
    assert.match(sql(), /grant select, insert, update, delete on table public\.meta_inbox_member_schedules/i);
    assert.match(sql(), /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/i);
    assert.match(sql(), /create policy ads_analyst_web_delete/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/meta-inbox-member-schedules-migration.test.ts`
Expected: FAIL — "No migration contains: create table if not exists public.meta_inbox_member_schedules".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528150130_meta_inbox_member_schedules.sql
-- Migration: meta_inbox_member_schedules
--
-- Shared Supabase ledger file. seconds=30 (Meta-Ads repo) so it cannot collide
-- with sales-standalone-app-v1 (seconds=00).
--
-- Inbox-owned weekly working schedule. app_user_id = meta_inbox_team_members.app_user_id
-- (NOT auth.uid()). Timezone is NOT stored here; it reuses
-- meta_inbox_user_preferences.timezone. One row per working weekday; a missing
-- weekday row = day off. An overnight shift is end_time <= start_time.
create table if not exists public.meta_inbox_member_schedules (
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  app_user_id uuid not null,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null,
  end_time    time not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (environment, app_user_id, weekday)
);

drop trigger if exists meta_inbox_member_schedules_set_updated_at
  on public.meta_inbox_member_schedules;
create trigger meta_inbox_member_schedules_set_updated_at
  before update on public.meta_inbox_member_schedules
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_member_schedules enable row level security;

grant select, insert, update, delete on table public.meta_inbox_member_schedules
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

-- Primary boundary for v1: scoped module clients + environment match.
drop policy if exists ads_analyst_select on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_web_update on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_web_delete on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_member_schedules;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_member_schedules;

create policy ads_analyst_select on public.meta_inbox_member_schedules
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_insert on public.meta_inbox_member_schedules
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_update on public.meta_inbox_member_schedules
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_delete on public.meta_inbox_member_schedules
  for delete to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_insert on public.meta_inbox_member_schedules
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_update on public.meta_inbox_member_schedules
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_insert on public.meta_inbox_member_schedules
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_update on public.meta_inbox_member_schedules
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

-- Defense-in-depth for any future direct authenticated session: a member sees
-- their own rows; a team lead manages their team members' rows. Not load-bearing
-- in v1 because scoped clients have no auth.uid().
drop policy if exists self_or_lead_select on public.meta_inbox_member_schedules;
create policy self_or_lead_select on public.meta_inbox_member_schedules
  for select to authenticated
  using (
    app_user_id = public.current_app_user_id()
    or exists (
      select 1
        from public.meta_inbox_team_members lead
        join public.meta_inbox_team_members target on target.team_id = lead.team_id
       where lead.app_user_id = public.current_app_user_id()
         and lead.role = 'lead'
         and target.app_user_id = meta_inbox_member_schedules.app_user_id
    )
  );

comment on table public.meta_inbox_member_schedules is
  'Inbox-owned weekly working windows. app_user_id = team member id, not auth.uid(). Missing weekday = day off; timezone reuses meta_inbox_user_preferences.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/meta-inbox-member-schedules-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528150130_meta_inbox_member_schedules.sql tests/meta-inbox-member-schedules-migration.test.ts
git commit -m "feat(inbox): add member schedules table for auto-assign"
```

---

### Task 3: Create `meta_inbox_assign_rotation`

**Files:**
- Create: `supabase/migrations/20260528150230_meta_inbox_assign_rotation.sql`
- Test: `tests/meta-inbox-assign-rotation-migration.test.ts`

System-only table (the round-robin pointer). No DELETE; no authenticated defense-in-depth policy needed (never read by a human session).

- [ ] **Step 1: Write the failing test**

```ts
// tests/meta-inbox-assign-rotation-migration.test.ts
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

describe("meta_inbox_assign_rotation migration", () => {
  const sql = () =>
    migrationContaining("create table if not exists public.meta_inbox_assign_rotation");

  it("keys one pointer row per (environment, queue_category_key)", () => {
    assert.match(sql(), /queue_category_key text not null/i);
    assert.match(sql(), /last_assigned_user_id uuid/i);
    assert.match(sql(), /primary key \(environment, queue_category_key\)/i);
  });

  it("follows the ads_analyst role + environment RLS pattern", () => {
    assert.match(sql(), /enable row level security/i);
    assert.match(sql(), /analytics\.ads_analyst_environment_matches\(environment\)/i);
    assert.match(sql(), /grant select, insert, update on table public\.meta_inbox_assign_rotation/i);
    assert.match(sql(), /to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/meta-inbox-assign-rotation-migration.test.ts`
Expected: FAIL — "No migration contains: create table if not exists public.meta_inbox_assign_rotation".

- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/20260528150230_meta_inbox_assign_rotation.sql
-- Migration: meta_inbox_assign_rotation
--
-- Shared Supabase ledger file. seconds=30 (Meta-Ads repo).
--
-- Strict round-robin pointer per category. last_assigned_user_id is an
-- app_user_id (nullable when the rotation is fresh). System-only table: written
-- by the auto-assign worker, never by a human session.
create table if not exists public.meta_inbox_assign_rotation (
  environment           text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  queue_category_key    text not null,
  last_assigned_user_id uuid,
  updated_at            timestamptz not null default now(),
  primary key (environment, queue_category_key)
);

drop trigger if exists meta_inbox_assign_rotation_set_updated_at
  on public.meta_inbox_assign_rotation;
create trigger meta_inbox_assign_rotation_set_updated_at
  before update on public.meta_inbox_assign_rotation
  for each row execute function public.set_updated_at();

alter table public.meta_inbox_assign_rotation enable row level security;

grant select, insert, update on table public.meta_inbox_assign_rotation
  to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest;

drop policy if exists ads_analyst_select on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_web_insert on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_web_update on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_worker_insert on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_worker_update on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_ingest_insert on public.meta_inbox_assign_rotation;
drop policy if exists ads_analyst_ingest_update on public.meta_inbox_assign_rotation;

create policy ads_analyst_select on public.meta_inbox_assign_rotation
  for select to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_insert on public.meta_inbox_assign_rotation
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_web_update on public.meta_inbox_assign_rotation
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_insert on public.meta_inbox_assign_rotation
  for insert to ads_analyst_worker
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_worker_update on public.meta_inbox_assign_rotation
  for update to ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_insert on public.meta_inbox_assign_rotation
  for insert to ads_analyst_ingest
  with check (analytics.ads_analyst_environment_matches(environment));
create policy ads_analyst_ingest_update on public.meta_inbox_assign_rotation
  for update to ads_analyst_ingest
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

comment on table public.meta_inbox_assign_rotation is
  'Strict round-robin pointer per queue category. last_assigned_user_id = app_user_id. System-only writes.';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/meta-inbox-assign-rotation-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528150230_meta_inbox_assign_rotation.sql tests/meta-inbox-assign-rotation-migration.test.ts
git commit -m "feat(inbox): add round-robin rotation pointer table"
```

---

## Phase 2 — The `assign_to_user` primitive

### Task 4: Add `assign_to_user` mode to the workflow

**Files:**
- Modify: `src/lib/meta-inbox-workflow.ts:19` (mode union), `:21-32` (patch input), `:104-113` (assignment branch)
- Test: `tests/inbox-assignment-assign-to-user.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/inbox-assignment-assign-to-user.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildMetaInboxWorkflowMutation,
  type MetaInboxWorkflowPatchInput,
} from "../src/lib/meta-inbox-workflow.ts";

type Conversation = Parameters<typeof buildMetaInboxWorkflowMutation>[0];

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "33333333-3333-4333-8333-333333333333";

// Minimal conversation fixture mirroring tests/meta-inbox-workflow.test.ts.
function conversationFixture(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    assigned_user_id: null,
    assigned_team_id: null,
    queue_category_key: "cash_for_gold",
    routing_source: null,
    routing_confidence: null,
    routing_explanation: null,
    conversation_status: "new_inquiry",
    follow_up_at: null,
    lead_quality: null,
    lead_quality_reason_tags: [],
    inbox_outcome: "no_outcome_yet",
    inbox_lost_reason: null,
    ...overrides,
  } as unknown as Conversation;
}

describe("assign_to_user workflow mode", () => {
  it("assigns the conversation to the target user and emits assignment_changed", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: ACTOR_ID, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.equal(mutation.update.assigned_user_id, TARGET_ID);
    assert.equal(mutation.events.length, 1);
    assert.equal(mutation.events[0].eventType, "assignment_changed");
    assert.deepEqual(mutation.events[0].newValue, {
      assignedUserId: TARGET_ID,
      assignedTeamId: null,
    });
  });

  it("records a null actor for a system (auto) assign while still moving the user", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: null, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.equal(mutation.update.assigned_user_id, TARGET_ID);
    assert.equal(mutation.events[0].eventType, "assignment_changed");
  });

  it("is a no-op (no event) when the target is already assigned", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture({ assigned_user_id: TARGET_ID } as Partial<Conversation>),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: ACTOR_ID, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.equal(mutation.events.length, 0);
  });

  it("throws when targetUserId is missing or not a uuid", () => {
    assert.throws(
      () =>
        buildMetaInboxWorkflowMutation(
          conversationFixture(),
          { assignmentMode: "assign_to_user" } as MetaInboxWorkflowPatchInput,
          { actorUserId: ACTOR_ID, now: "2026-05-28T18:00:00.000Z" },
        ),
      /target user/i,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/inbox-assignment-assign-to-user.test.ts`
Expected: FAIL — the type rejects `"assign_to_user"` / `targetUserId`, and the assign branch does not set the target.

- [ ] **Step 3: Implement the mode**

In `src/lib/meta-inbox-workflow.ts`, change the union (line 19):

```ts
export type MetaInboxAssignmentMode = "claim_self" | "team_queue" | "assign_to_user";
```

Add `targetUserId` to `MetaInboxWorkflowPatchInput` (insert after `assignedTeamId` on line 23):

```ts
  assignedTeamId?: string | null;
  targetUserId?: string | null;
```

Replace the assignment branch in `applyAssignment` (lines 106-113) with:

```ts
  if (input.assignmentMode === "claim_self") {
    if (!context.actorUserId || !isUuid(context.actorUserId)) {
      throw new Error("A valid sales user is required to claim a conversation.");
    }
    next.assigned_user_id = context.actorUserId;
  } else if (input.assignmentMode === "assign_to_user") {
    const target = normalizeOptionalUuid(input.targetUserId ?? null, "Assigned User");
    if (!target) {
      throw new Error("A target user is required to assign a conversation.");
    }
    next.assigned_user_id = target;
  } else {
    next.assigned_user_id = null;
  }
```

(`normalizeOptionalUuid` and `isUuid` already exist in this file at lines 399 and 416.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/inbox-assignment-assign-to-user.test.ts`
Expected: PASS (all four cases).

- [ ] **Step 5: Run the existing workflow + guard tests (no regressions)**

Run: `node --test --experimental-strip-types tests/meta-inbox-workflow.test.ts tests/inbox-assignment-guard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/meta-inbox-workflow.ts tests/inbox-assignment-assign-to-user.test.ts
git commit -m "feat(inbox): add assign_to_user workflow mode"
```

---

### Task 5: Accept `targetUserId` on the workflow route

**Files:**
- Modify: `src/app/api/social-inbox/conversations/[conversationId]/workflow/route.ts:16-27`

- [ ] **Step 1: Add the body field**

In `WORKFLOW_BODY_FIELDS`, add `targetUserId` right after `assignedTeamId` (line 18):

```ts
const WORKFLOW_BODY_FIELDS = {
  assignmentMode: { type: "string", nullable: true },
  assignedTeamId: { type: "string", nullable: true },
  targetUserId: { type: "string", nullable: true },
  queueCategoryKey: { type: "string", nullable: true },
  conversationStatus: { type: "string", nullable: true },
  followUpAt: { type: "string", nullable: true },
  leadQuality: { type: "string", nullable: true },
  leadQualityReasonTags: { type: "stringArray", nullable: true },
  inboxOutcome: { type: "string", nullable: true },
  inboxLostReason: { type: "string", nullable: true },
  changeReason: { type: "string", nullable: true },
} as const;
```

- [ ] **Step 2: Verify typecheck (the route forwards the validated body into `updateSocialInboxConversationWorkflow`)**

Run: `npm run typecheck`
Expected: PASS (no type errors). The field flows through `MetaInboxWorkflowPatchInput`, now widened in Task 4.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/social-inbox/conversations/[conversationId]/workflow/route.ts"
git commit -m "feat(inbox): accept targetUserId on workflow route"
```

---

### Task 6: Route the facade through `assign_to_user`

**Files:**
- Modify: `src/lib/inbox-assignment.ts:20-37`
- Test: append to `tests/inbox-assignment-assign-to-user.test.ts` (guard coverage for §12 "facade guard")

`updateAssignment` currently maps any present `user_id` to `claim_self`, which forces the *actor* — it cannot assign to another person. Map it to `assign_to_user` carrying the target.

- [ ] **Step 1: Add the failing guard test (append to the existing file)**

```ts
// append to tests/inbox-assignment-assign-to-user.test.ts
import { assertAssignmentEventEmitted } from "../src/lib/inbox-assignment.ts";

describe("facade assignment-event guard", () => {
  it("passes for an assign_to_user mutation (an assignment_changed event was emitted)", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture(),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: null, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.doesNotThrow(() => assertAssignmentEventEmitted(mutation));
  });

  it("throws for a no-op assignment (no event emitted)", () => {
    const mutation = buildMetaInboxWorkflowMutation(
      conversationFixture({ assigned_user_id: TARGET_ID } as Partial<Conversation>),
      { assignmentMode: "assign_to_user", targetUserId: TARGET_ID } as MetaInboxWorkflowPatchInput,
      { actorUserId: null, now: "2026-05-28T18:00:00.000Z" },
    );
    assert.throws(() => assertAssignmentEventEmitted(mutation), /assignment_changed/);
  });
});
```

- [ ] **Step 2: Run to verify the new guard cases pass already (the guard is pure) but the facade still mis-maps**

Run: `node --test --experimental-strip-types tests/inbox-assignment-assign-to-user.test.ts`
Expected: the two new guard cases PASS (guard is independent of the facade mapping). This step confirms `assertAssignmentEventEmitted` behaves; the mapping fix is verified by typecheck + the manual-UI integration in Task 14.

- [ ] **Step 3: Fix the facade mapping**

In `src/lib/inbox-assignment.ts`, replace the workflow call inside `updateAssignment` (lines 26-29):

```ts
  const { updateSocialInboxConversationWorkflow } = await import("./social-inbox.ts");
  const result = await updateSocialInboxConversationWorkflow(conversationId, profile, {
    assignmentMode: next.user_id ? "assign_to_user" : "team_queue",
    targetUserId: next.user_id,
    assignedTeamId: next.team_id,
  });
```

- [ ] **Step 4: Run typecheck + the full assign test + the guard test**

Run: `npm run typecheck && node --test --experimental-strip-types tests/inbox-assignment-assign-to-user.test.ts tests/inbox-assignment-guard.test.ts`
Expected: PASS. (The guard still passes — `inbox-assignment.ts` is a sanctioned writer.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox-assignment.ts tests/inbox-assignment-assign-to-user.test.ts
git commit -m "feat(inbox): facade assigns to a target user via assign_to_user"
```

---

## Phase 3 — Security correction (spec §3a)

### Task 7: Read team-rollup names from the identity view, not `public.users`

**Files:**
- Modify: `src/lib/inbox-metrics-db.ts:255-259`
- Test: `tests/inbox-metrics-identity-view.test.ts`

`getTeamRollup` reads `public.users` directly (line 256), which is denied under `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=1`. Route it through `analytics.ads_analyst_identity_profiles_v1` (granted to `ads_analyst_web`), exactly as [src/lib/app-auth.ts:182-187](../../../src/lib/app-auth.ts) does.

- [ ] **Step 1: Write the failing test**

```ts
// tests/inbox-metrics-identity-view.test.ts
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

const SRC = readFileSync(resolve("src/lib/inbox-metrics-db.ts"), "utf8");

describe("team rollup name resolution stays inside the data boundary", () => {
  it("never reads public.users directly", () => {
    assert.ok(!SRC.includes('.from("users")'), "must not read public.users from the metrics module");
  });
  it("resolves names through the ads_analyst identity view", () => {
    assert.match(SRC, /ads_analyst_identity_profiles_v1/);
    assert.match(SRC, /\.schema\("analytics"\)/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/inbox-metrics-identity-view.test.ts`
Expected: FAIL — `.from("users")` is still present; the view is not referenced.

- [ ] **Step 3: Implement the fix**

In `src/lib/inbox-metrics-db.ts`, replace lines 255-259:

```ts
  // Names via the data-boundary identity view (web role has SELECT here; it has
  // no grant on public.users under limited-access mode). app_user_id == user id.
  const { data: userRows } = await supabase
    .schema("analytics")
    .from("ads_analyst_identity_profiles_v1")
    .select("app_user_id,full_name")
    .in("app_user_id", ids);
  const nameById = new Map<string, string | null>(
    ((userRows || []) as { app_user_id: string; full_name: string | null }[]).map(
      (u) => [u.app_user_id, u.full_name],
    ),
  );
```

If any other read in this module (e.g. the team-member peek) also hits `.from("users")`, apply the same view-based replacement so the test's "never reads public.users" assertion holds module-wide.

- [ ] **Step 4: Run test + typecheck**

Run: `npm run typecheck && node --test --experimental-strip-types tests/inbox-metrics-identity-view.test.ts tests/inbox-metrics-team.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox-metrics-db.ts tests/inbox-metrics-identity-view.test.ts
git commit -m "fix(inbox): resolve team rollup names via identity view"
```

---

## Phase 4 — Pure decision engine (no I/O, fully unit-tested)

### Task 8: `isOnShift` helper

**Files:**
- Create: `src/lib/inbox-auto-assign.ts`
- Test: `tests/inbox-auto-assign.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/inbox-auto-assign.test.ts
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOnShift, type ScheduleRow } from "../src/lib/inbox-auto-assign.ts";

// weekday: 0=Sun..6=Sat. Times "HH:MM".
const PT = "America/Los_Angeles";

describe("isOnShift", () => {
  it("is on shift inside a same-day window in the user's tz", () => {
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }]; // Thu
    // 2026-05-28 is a Thursday. 18:00 UTC == 11:00 PT.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-28T18:00:00Z")), true);
  });

  it("is off shift before the window opens", () => {
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }];
    // 16:00 UTC == 09:00 PT, before 10:00.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-28T16:00:00Z")), false);
  });

  it("is off shift on a weekday with no row (day off)", () => {
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }];
    // 2026-05-29 is a Friday (weekday 5), no row.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T18:00:00Z")), false);
  });

  it("respects the user's timezone (same instant, different local day/time)", () => {
    const rows: ScheduleRow[] = [{ weekday: 5, startTime: "00:00", endTime: "06:00" }]; // Fri early
    // 2026-05-29T05:00:00Z == Fri 12:00 in Asia/Ho_Chi_Minh (UTC+7) -> not in 00:00-06:00.
    assert.equal(isOnShift(rows, "Asia/Ho_Chi_Minh", new Date("2026-05-29T05:00:00Z")), false);
    // Same instant in PT == Thu 22:00 -> also not in a Fri 00:00-06:00 window.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T05:00:00Z")), false);
  });

  it("handles an overnight window that spills into the next day", () => {
    // Thu 22:00 -> Fri 02:00 (end <= start = overnight).
    const rows: ScheduleRow[] = [{ weekday: 4, startTime: "22:00", endTime: "02:00" }];
    // Fri 01:00 PT: 2026-05-29 09:00Z == 02:00 PT (just after end) -> off.
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T09:00:00Z")), false);
    // Fri 00:30 PT: 2026-05-29 07:30Z == 00:30 PT -> on (spill from Thu row).
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T07:30:00Z")), true);
    // Thu 23:00 PT: 2026-05-29 06:00Z == 23:00 PT Thu -> on (evening portion).
    assert.equal(isOnShift(rows, PT, new Date("2026-05-29T06:00:00Z")), true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/inbox-auto-assign.test.ts`
Expected: FAIL — `Cannot find module .../inbox-auto-assign.ts`.

- [ ] **Step 3: Implement `isOnShift`**

```ts
// src/lib/inbox-auto-assign.ts
export type ScheduleRow = {
  weekday: number; // 0=Sun .. 6=Sat
  startTime: string; // "HH:MM" or "HH:MM:SS"
  endTime: string; // "HH:MM" or "HH:MM:SS"
};

const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function zonedWeekdayAndMinutes(now: Date, tz: string): { weekday: number; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const map: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
  const weekday = WEEKDAY_INDEX[map.weekday];
  const hour = map.hour === "24" ? 0 : Number(map.hour);
  return { weekday, minutes: hour * 60 + Number(map.minute) };
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":");
  return Number(h) * 60 + Number(m);
}

// True when `now`, expressed in `tz`, falls inside any of the member's windows.
// Same-day windows (end > start) match on their weekday. Overnight windows
// (end <= start) match the evening portion on their weekday and the early-morning
// spill on the following weekday.
export function isOnShift(rows: readonly ScheduleRow[], tz: string, now: Date): boolean {
  const { weekday, minutes } = zonedWeekdayAndMinutes(now, tz);
  for (const row of rows) {
    const start = toMinutes(row.startTime);
    const end = toMinutes(row.endTime);
    if (end > start) {
      if (row.weekday === weekday && minutes >= start && minutes < end) return true;
    } else {
      if (row.weekday === weekday && minutes >= start) return true; // evening portion
      if (row.weekday === (weekday + 6) % 7 && minutes < end) return true; // morning spill
    }
  }
  return false;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/inbox-auto-assign.test.ts`
Expected: PASS (all five `isOnShift` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox-auto-assign.ts tests/inbox-auto-assign.test.ts
git commit -m "feat(inbox): add tz-aware isOnShift helper"
```

---

### Task 9: `pickAssignee` round-robin

**Files:**
- Modify: `src/lib/inbox-auto-assign.ts` (add `pickAssignee` + types)
- Test: `tests/inbox-auto-assign.test.ts` (append)

- [ ] **Step 1: Write the failing test (append)**

```ts
// append to tests/inbox-auto-assign.test.ts
import { pickAssignee, type Candidate } from "../src/lib/inbox-auto-assign.ts";

const NOW = new Date("2026-05-28T18:00:00Z"); // Thu 11:00 PT
const SHIFT: ScheduleRow[] = [{ weekday: 4, startTime: "10:00", endTime: "19:00" }];

function cand(id: string, over: Partial<Candidate> = {}): Candidate {
  return { appUserId: id, coversCategory: true, eligible: true, scheduleRows: SHIFT, tz: PT, ...over };
}

describe("pickAssignee", () => {
  it("returns null when the on-shift, eligible, covering pool is empty", () => {
    assert.equal(pickAssignee({ candidates: [cand("a", { eligible: false })], now: NOW, lastAssignedUserId: null }), null);
    assert.equal(pickAssignee({ candidates: [cand("a", { coversCategory: false })], now: NOW, lastAssignedUserId: null }), null);
    assert.equal(pickAssignee({ candidates: [cand("a", { scheduleRows: [] })], now: NOW, lastAssignedUserId: null }), null);
    assert.equal(pickAssignee({ candidates: [], now: NOW, lastAssignedUserId: null }), null);
  });

  it("picks the first in stable order when there is no pointer", () => {
    const r = pickAssignee({ candidates: [cand("b"), cand("a")], now: NOW, lastAssignedUserId: null });
    assert.deepEqual(r, { assignedUserId: "a", nextPointer: "a" });
  });

  it("advances strictly to the next user after the pointer", () => {
    const r = pickAssignee({ candidates: [cand("a"), cand("b"), cand("c")], now: NOW, lastAssignedUserId: "a" });
    assert.deepEqual(r, { assignedUserId: "b", nextPointer: "b" });
  });

  it("wraps around at the end of the pool", () => {
    const r = pickAssignee({ candidates: [cand("a"), cand("b"), cand("c")], now: NOW, lastAssignedUserId: "c" });
    assert.deepEqual(r, { assignedUserId: "a", nextPointer: "a" });
  });

  it("starts from the first when the pointer is now off-shift / not in the pool", () => {
    const r = pickAssignee({ candidates: [cand("a"), cand("b")], now: NOW, lastAssignedUserId: "zzz-gone" });
    assert.deepEqual(r, { assignedUserId: "a", nextPointer: "a" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/inbox-auto-assign.test.ts`
Expected: FAIL — `pickAssignee`/`Candidate` not exported.

- [ ] **Step 3: Implement `pickAssignee`**

Append to `src/lib/inbox-auto-assign.ts`:

```ts
export type Candidate = {
  appUserId: string;
  coversCategory: boolean;
  eligible: boolean; // auto_assign_eligible (the worker's pool gate; see plan pre-flight)
  scheduleRows: readonly ScheduleRow[];
  tz: string;
};

export type PickAssigneeInput = {
  candidates: readonly Candidate[];
  now: Date;
  lastAssignedUserId: string | null;
};

export type PickAssigneeResult = { assignedUserId: string; nextPointer: string } | null;

// Strict round-robin over the on-shift, eligible, covering candidates in a stable
// (app_user_id-sorted) order. Returns the chosen user and the new rotation pointer,
// or null when the pool is empty.
export function pickAssignee(input: PickAssigneeInput): PickAssigneeResult {
  const pool = input.candidates
    .filter((c) => c.coversCategory && c.eligible && isOnShift(c.scheduleRows, c.tz, input.now))
    .map((c) => c.appUserId)
    .sort();
  if (pool.length === 0) return null;
  const lastIdx = input.lastAssignedUserId ? pool.indexOf(input.lastAssignedUserId) : -1;
  const nextIdx = (lastIdx + 1) % pool.length; // lastIdx === -1 -> 0
  const chosen = pool[nextIdx];
  return { assignedUserId: chosen, nextPointer: chosen };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/inbox-auto-assign.test.ts`
Expected: PASS (all `isOnShift` + `pickAssignee` cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/inbox-auto-assign.ts tests/inbox-auto-assign.test.ts
git commit -m "feat(inbox): add round-robin pickAssignee engine"
```

---

## Phase 5 — Worker (data + persistence)

### Task 10: System profile + sweep worker

**Files:**
- Modify: `src/lib/meta-inbox-access.ts` (export `SYSTEM_INBOX_PROFILE`)
- Create: `src/lib/inbox-auto-assign-worker.ts`

The worker (a) loads unassigned + confident conversations, (b) for each category loads the eligible/covering candidates with their schedules + tz and the rotation pointer, (c) runs `pickAssignee`, (d) assigns through the `updateAssignment` facade using `SYSTEM_INBOX_PROFILE` (null `appUserId` → null actor), and (e) advances the rotation pointer. Per-conversation `try/catch` keeps one failure from aborting the sweep.

`SYSTEM_INBOX_PROFILE` uses `roles: ["admin"]` so `metaInboxQueueAccessScopeForProfile` returns `mode: "all"` ([src/lib/meta-inbox-access.ts:53-59](../../../src/lib/meta-inbox-access.ts)) — full queue write access — and `appUserId: null` makes the workflow record a null (system) actor.

- [ ] **Step 1: Export the system profile**

In `src/lib/meta-inbox-access.ts`, after the `MetaInboxAccessProfile` type (line 8), add:

```ts
// Used by the auto-assign cron worker. appUserId === null => the workflow records
// actor_user_id = NULL, the v1 marker that distinguishes auto from manual assigns.
// roles ["admin"] grants full queue-write access (mode: "all").
export const SYSTEM_INBOX_PROFILE: MetaInboxAccessProfile = {
  appUserId: null,
  roles: ["admin"],
  permissions: ["manage_inbox_state"],
};
```

- [ ] **Step 2: Write the worker**

`updateActiveMetaInboxRows`/`selectActiveMetaInboxRows` helpers and the env helper already exist; reads use the worker-role client `createAdsAnalystClient("worker")` ([src/lib/ads-analyst-db.ts:16](../../../src/lib/ads-analyst-db.ts)). The assignment **write** goes through `updateAssignment`, which internally uses the web-role client — do **not** write `assigned_user_id` here (guard).

```ts
// src/lib/inbox-auto-assign-worker.ts
import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import { updateAssignment } from "./inbox-assignment.ts";
import { pickAssignee, type Candidate, type ScheduleRow } from "./inbox-auto-assign.ts";
import { getActiveMetaInboxEnvironment } from "./meta-inbox-environment.ts";
import { SYSTEM_INBOX_PROFILE } from "./meta-inbox-access.ts";

type ConfidentConversation = {
  id: string;
  queue_category_key: string;
  assigned_team_id: string | null;
};

export type AutoAssignSweepResult = {
  scanned: number;
  assigned: number;
  skippedNoCoverer: number;
  errors: number;
};

const CONFIDENCE_FLOOR = 0.85;

export async function runInboxAutoAssignSweep(): Promise<AutoAssignSweepResult> {
  const env = getActiveMetaInboxEnvironment();
  const supabase = createAdsAnalystClient("worker");
  const result: AutoAssignSweepResult = { scanned: 0, assigned: 0, skippedNoCoverer: 0, errors: 0 };

  // (a) Unassigned + confidently categorized conversations.
  const { data: convRows } = await supabase
    .schema("public")
    .from("meta_inbox_conversations")
    .select("id,queue_category_key,assigned_team_id,routing_confidence,assigned_user_id")
    .eq("environment", env)
    .is("assigned_user_id", null)
    .not("queue_category_key", "is", null)
    .neq("queue_category_key", "uncategorized_needs_review")
    .gte("routing_confidence", CONFIDENCE_FLOOR);
  const conversations = (convRows || []) as (ConfidentConversation & { routing_confidence: number })[];
  result.scanned = conversations.length;
  if (conversations.length === 0) return result;

  // Group by category so each category's rotation advances coherently.
  const byCategory = new Map<string, ConfidentConversation[]>();
  for (const c of conversations) {
    byCategory.set(c.queue_category_key, [...(byCategory.get(c.queue_category_key) || []), c]);
  }

  for (const [categoryKey, convs] of byCategory) {
    let candidates: Candidate[];
    let pointer: string | null;
    try {
      candidates = await loadCandidates(supabase, env, categoryKey);
      pointer = await loadRotationPointer(supabase, env, categoryKey);
    } catch {
      result.errors += convs.length;
      continue;
    }

    for (const conv of convs) {
      try {
        const pick = pickAssignee({ candidates, now: new Date(), lastAssignedUserId: pointer });
        if (!pick) {
          result.skippedNoCoverer += 1;
          continue;
        }
        await updateAssignment(
          conv.id,
          { user_id: pick.assignedUserId, team_id: conv.assigned_team_id, actor_id: "system" },
          SYSTEM_INBOX_PROFILE,
        );
        await saveRotationPointer(supabase, env, categoryKey, pick.nextPointer);
        pointer = pick.nextPointer;
        result.assigned += 1;
      } catch {
        result.errors += 1;
      }
    }
  }

  return result;
}

async function loadCandidates(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  env: string,
  categoryKey: string,
): Promise<Candidate[]> {
  // Teams covering this category.
  const { data: accessRows } = await supabase
    .schema("public")
    .from("meta_inbox_team_queue_access")
    .select("team_id")
    .eq("environment", env)
    .eq("queue_category_key", categoryKey);
  const teamIds = Array.from(new Set(((accessRows || []) as { team_id: string }[]).map((r) => r.team_id)));
  if (teamIds.length === 0) return [];

  // Eligible members of those teams (auto_assign_eligible is the worker pool gate).
  const { data: memberRows } = await supabase
    .schema("public")
    .from("meta_inbox_team_members")
    .select("app_user_id,auto_assign_eligible,team_id")
    .eq("environment", env)
    .in("team_id", teamIds)
    .eq("auto_assign_eligible", true);
  const memberIds = Array.from(
    new Set(((memberRows || []) as { app_user_id: string }[]).map((r) => r.app_user_id)),
  );
  if (memberIds.length === 0) return [];

  // Schedules + timezone for those members.
  const { data: scheduleRows } = await supabase
    .schema("public")
    .from("meta_inbox_member_schedules")
    .select("app_user_id,weekday,start_time,end_time")
    .eq("environment", env)
    .in("app_user_id", memberIds);
  const schedulesByUser = new Map<string, ScheduleRow[]>();
  for (const r of (scheduleRows || []) as {
    app_user_id: string; weekday: number; start_time: string; end_time: string;
  }[]) {
    schedulesByUser.set(r.app_user_id, [
      ...(schedulesByUser.get(r.app_user_id) || []),
      { weekday: r.weekday, startTime: r.start_time, endTime: r.end_time },
    ]);
  }

  const { data: prefRows } = await supabase
    .schema("public")
    .from("meta_inbox_user_preferences")
    .select("user_id,timezone")
    .eq("environment", env)
    .in("user_id", memberIds);
  const tzByUser = new Map<string, string>();
  for (const r of (prefRows || []) as { user_id: string; timezone: string }[]) {
    tzByUser.set(r.user_id, r.timezone);
  }

  return memberIds.map((appUserId) => ({
    appUserId,
    coversCategory: true,
    eligible: true,
    scheduleRows: schedulesByUser.get(appUserId) || [],
    tz: tzByUser.get(appUserId) || "America/Los_Angeles",
  }));
}

async function loadRotationPointer(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  env: string,
  categoryKey: string,
): Promise<string | null> {
  const { data } = await supabase
    .schema("public")
    .from("meta_inbox_assign_rotation")
    .select("last_assigned_user_id")
    .eq("environment", env)
    .eq("queue_category_key", categoryKey)
    .maybeSingle();
  return (data as { last_assigned_user_id: string | null } | null)?.last_assigned_user_id ?? null;
}

async function saveRotationPointer(
  supabase: ReturnType<typeof createAdsAnalystClient>,
  env: string,
  categoryKey: string,
  nextPointer: string,
): Promise<void> {
  await supabase
    .schema("public")
    .from("meta_inbox_assign_rotation")
    .upsert(
      { environment: env, queue_category_key: categoryKey, last_assigned_user_id: nextPointer },
      { onConflict: "environment,queue_category_key" },
    );
}
```

> Implementation note: confirm the exact import path/name of the environment helper (`getActiveMetaInboxEnvironment`) and the `createAdsAnalystClient` schema-access shape against the branch — both are used elsewhere in `src/lib/inbox-metrics-db.ts` and `src/lib/social-inbox.ts`; match whichever wrapper those use (`dynamicSupabase`/`dynamicSupabaseWeb`) if the raw client's `.schema("public")` typing is awkward.

- [ ] **Step 3: Typecheck + run the guard test (worker must NOT write `assigned_user_id`)**

Run: `npm run typecheck && node --test --experimental-strip-types tests/inbox-assignment-guard.test.ts`
Expected: PASS. The guard confirms the worker only passes `user_id`/`targetUserId`, never writing `assigned_user_id`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/meta-inbox-access.ts src/lib/inbox-auto-assign-worker.ts
git commit -m "feat(inbox): add auto-assign sweep worker + system profile"
```

---

## Phase 6 — Triggers

### Task 11: Sweep cron route

**Files:**
- Create: `src/app/api/cron/inbox-auto-assign/route.ts`

Mirror [src/app/api/cron/meta-inbox-delivery/route.ts](../../../src/app/api/cron/meta-inbox-delivery/route.ts): `isAuthorizedCronRequest` from `@/lib/http`, thin delegation to the worker.

- [ ] **Step 1: Write the route**

```ts
// src/app/api/cron/inbox-auto-assign/route.ts
import { isAuthorizedCronRequest, jsonError } from "@/lib/http";
import { runInboxAutoAssignSweep } from "@/lib/inbox-auto-assign-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Round-robin auto-assign sweep. Assigns unassigned + confidently-categorized
 * conversations to on-shift coverers as the team comes online. Idempotent:
 * only ever acts on currently-unassigned rows.
 */
async function handle(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return Response.json({ error: "Unauthorized cron request" }, { status: 401 });
  }
  try {
    return Response.json(await runInboxAutoAssignSweep());
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Integration verify (real data, local dev server)**

Start the dev server, then:

```bash
# Unauthorized -> 401
curl -i -X POST http://localhost:3000/api/cron/inbox-auto-assign
# Authorized -> 200 JSON { scanned, assigned, skippedNoCoverer, errors }
curl -i -X POST http://localhost:3000/api/cron/inbox-auto-assign \
  -H "x-cron-secret: $CRON_SECRET"
```

Expected: 401 without the secret; 200 with a result body. Confirm in the DB that newly-assigned conversations have an `assignment_changed` event with `actor_user_id IS NULL`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/inbox-auto-assign/route.ts
git commit -m "feat(inbox): add auto-assign sweep cron route"
```

---

### Task 12: Arrival hook in `syncSocialInbox`

**Files:**
- Modify: `src/lib/social-inbox.ts:570-634`

Run the sweep best-effort at the end of a successful sync so freshly-categorized, unassigned conversations get an on-shift assignee immediately (and nothing is assigned if no one is on shift — the cron retries).

- [ ] **Step 1: Insert the hook before the success `return` (line 634)**

Immediately before `return { status, metrics, errors, syncRunId };`:

```ts
  // Arrival hook: assign any freshly-categorized, still-unassigned conversations
  // to on-shift coverers. Best-effort — never block or fail a sync on assignment.
  try {
    const { runInboxAutoAssignSweep } = await import("./inbox-auto-assign-worker.ts");
    await runInboxAutoAssignSweep();
  } catch (hookError) {
    console.error("inbox auto-assign arrival hook failed", hookError);
  }
```

(Use a dynamic `import()` to avoid a static import cycle between `social-inbox.ts` and the worker, which itself imports `inbox-assignment.ts` → `social-inbox.ts`.)

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Integration verify**

Trigger a manual sync (`POST /api/social-inbox/sync` as a permitted user, or the cron sync route). Confirm the response still has the normal `{ status, metrics, errors, syncRunId }` shape and that unassigned-but-confident conversations become assigned when a coverer is on shift.

- [ ] **Step 4: Commit**

```bash
git add src/lib/social-inbox.ts
git commit -m "feat(inbox): run auto-assign sweep at end of sync"
```

---

### Task 13: pg_cron schedule for the sweep

**Files:**
- Create: `supabase/migrations/20260528150330_schedule_inbox_auto_assign_cron.sql`
- Test: `tests/schedule-inbox-auto-assign-cron-migration.test.ts`

Model on [supabase/migrations/20260528133430_schedule_inbox_metrics_daily_cron.sql](../../../supabase/migrations/20260528133430_schedule_inbox_metrics_daily_cron.sql). **Before writing, open that file** and copy its exact `cron.schedule(...)` + `pg_net` dispatch shape (function name, secret handling, base-URL/GUC pattern). The block below shows the intended structure — reconcile every identifier (GUC names, helper function, header construction) with the metrics file so it deploys identically.

- [ ] **Step 1: Write the failing test**

```ts
// tests/schedule-inbox-auto-assign-cron-migration.test.ts
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

describe("inbox auto-assign cron schedule migration", () => {
  const sql = () => migrationContaining("inbox-auto-assign");
  it("schedules a recurring job that posts to the sweep route", () => {
    assert.match(sql(), /cron\.schedule\(/i);
    assert.match(sql(), /\/api\/cron\/inbox-auto-assign/);
    assert.match(sql(), /\*\/5 \* \* \* \*/); // every 5 minutes
  });
  it("dispatches via pg_net with the cron secret", () => {
    assert.match(sql(), /net\.http_post/i);
    assert.match(sql(), /x-cron-secret/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types tests/schedule-inbox-auto-assign-cron-migration.test.ts`
Expected: FAIL — "No migration contains: inbox-auto-assign".

- [ ] **Step 3: Write the migration**

Adapt the metrics dispatch pattern; intended structure (reconcile identifiers with the metrics file):

```sql
-- supabase/migrations/20260528150330_schedule_inbox_auto_assign_cron.sql
-- Migration: schedule inbox auto-assign sweep (seconds=30, Meta-Ads repo)
--
-- Recurring round-robin sweep every 5 minutes via pg_cron + pg_net, mirroring
-- the inbox-metrics-daily dispatch. Posts to /api/cron/inbox-auto-assign with the
-- shared CRON_SECRET so distributed overnight backlog gets assigned fairly as the
-- team comes online.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'inbox-auto-assign') then
    perform cron.unschedule('inbox-auto-assign');
  end if;
end $$;

select cron.schedule(
  'inbox-auto-assign',
  '*/5 * * * *',
  $cron$
  select net.http_post(
    url := current_setting('app.cron_base_url', true) || '/api/cron/inbox-auto-assign',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-cron-secret', current_setting('app.cron_secret', true)
    ),
    body := '{}'::jsonb
  );
  $cron$
);
```

> The GUCs (`app.cron_base_url`, `app.cron_secret`) and the exact `net.http_post` call must match whatever `20260528133430_schedule_inbox_metrics_daily_cron.sql` uses. If that file calls a wrapper function (e.g. `public.run_inbox_metrics_daily_dispatch()`), prefer adding a parallel `public.run_inbox_auto_assign_dispatch()` and scheduling that, for consistency.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types tests/schedule-inbox-auto-assign-cron-migration.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260528150330_schedule_inbox_auto_assign_cron.sql tests/schedule-inbox-auto-assign-cron-migration.test.ts
git commit -m "feat(inbox): schedule auto-assign sweep via pg_cron"
```

---

## Phase 7 — UI

### Task 14: Manual "Assign to…" picker

**Files:**
- Create: `src/components/v2/inbox/assign-to-user-picker.tsx`
- Modify: `src/components/v2/inbox/details-drawer-panel.tsx` (import + mount in the Workflow button grid, ~line 644-669)

The active-user list comes from the existing `GET /api/users` endpoint, which already reads `analytics.ads_analyst_identity_profiles_v1` via `loadUsersPayloadFromBoundaryView` ([src/app/api/users/route.ts](../../../src/app/api/users/route.ts)). Filter to `active`. Selecting a user calls `onWorkflowUpdate(conversation.id, { assignmentMode: "assign_to_user", targetUserId })`.

- [ ] **Step 1: Build the picker component**

```tsx
// src/components/v2/inbox/assign-to-user-picker.tsx
"use client";

import { useEffect, useState } from "react";

type ActiveUser = { id: string; fullName: string | null; initials: string | null };

export function AssignToUserPicker({
  disabled,
  onAssign,
}: {
  disabled: boolean;
  onAssign: (targetUserId: string) => void;
}) {
  const [users, setUsers] = useState<ActiveUser[]>([]);
  const [value, setValue] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/users")
      .then((r) => (r.ok ? r.json() : { users: [] }))
      .then((payload: { users?: { id: string; fullName: string | null; initials: string | null; active: boolean }[] }) => {
        if (cancelled) return;
        const active = (payload.users || [])
          .filter((u) => u.active)
          .map((u) => ({ id: u.id, fullName: u.fullName, initials: u.initials }));
        setUsers(active);
      })
      .catch(() => {
        if (!cancelled) setUsers([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        Assign to
      </span>
      <select
        value={value}
        disabled={disabled || users.length === 0}
        onChange={(event) => {
          const next = event.target.value;
          setValue(next);
          if (next) onAssign(next);
        }}
        className="w-full border border-hp-rule bg-white px-3 py-2 text-sm text-hp-body outline-none focus:border-hp-ink disabled:bg-hp-inset disabled:text-hp-muted"
      >
        <option value="">Select a teammate…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>
            {u.fullName || u.initials || u.id}
          </option>
        ))}
      </select>
    </label>
  );
}
```

> Confirm the `/api/users` JSON field names (`fullName`, `initials`, `active`) against `loadUsersPayloadFromBoundaryView`; the default-mode mapper in `src/app/api/users/route.ts` returns exactly those camelCase keys.

- [ ] **Step 2: Mount it in the Workflow section**

In `src/components/v2/inbox/details-drawer-panel.tsx`, add the import near the other component imports:

```tsx
import { AssignToUserPicker } from "./assign-to-user-picker.tsx";
```

Then, inside `WorkflowSection`, render the picker just above the Claim/Team Queue/Save button grid (before line 644's `<div className="grid gap-2 sm:grid-cols-3">`):

```tsx
        <AssignToUserPicker
          disabled={!canEditWorkflow || isSaving}
          onAssign={(targetUserId) => {
            if (!conversation || !canEditWorkflow) return;
            onWorkflowUpdate(conversation.id, {
              assignmentMode: "assign_to_user",
              targetUserId,
              changeReason: changeReasonDraft || "Assigned from inbox workflow panel.",
            });
          }}
        />
```

- [ ] **Step 3: Typecheck + browser verify**

Run: `npm run typecheck`. Then in the running app: open a conversation's Details drawer → Workflow section, pick a teammate from "Assign to…", and confirm the conversation's assignee updates and an `assignment_changed` event is written with the acting (non-null) user as `actor_user_id`.

- [ ] **Step 4: Commit**

```bash
git add src/components/v2/inbox/assign-to-user-picker.tsx src/components/v2/inbox/details-drawer-panel.tsx
git commit -m "feat(inbox): add manual Assign to… picker"
```

---

### Task 15: Admin settings — eligibility + weekly schedule

**Files:**
- Create: `src/app/api/social-inbox/team/schedules/route.ts`
- Create: `src/components/v2/inbox/team-schedule-settings.tsx`
- Mount the component under the existing team/lead settings surface (place it next to the team view; confirm the host page during implementation).

Lead/admin-only. Writes go only to `meta_inbox_team_members.auto_assign_eligible` and `meta_inbox_member_schedules` (never `users`). The member list + names come from team membership + the identity view (reuse `GET /api/users` for names, filtered to team members).

- [ ] **Step 1: Build the API route (GET current settings, PATCH updates)**

Use `requirePermissionFromRequest(request, "manage_inbox_state")` for the gate (the same permission the workflow route uses; confirm a lead/admin-scoped permission exists — if a dedicated `manage_inbox_team` permission exists, prefer it). All DB access is via the web client + env scope.

```ts
// src/app/api/social-inbox/team/schedules/route.ts
import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { parseJsonObjectBody } from "@/lib/meta-inbox-api-validation";
import {
  loadInboxTeamScheduleSettings,
  saveInboxTeamScheduleSettings,
  type InboxTeamSchedulePatch,
} from "@/lib/inbox-team-schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    return Response.json(await loadInboxTeamScheduleSettings(profile));
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_inbox_state");
    const body = await parseJsonObjectBody<InboxTeamSchedulePatch>(request, {
      appUserId: { type: "string", nullable: false },
      autoAssignEligible: { type: "boolean", nullable: true },
      schedules: { type: "json", nullable: true },
    });
    return Response.json(await saveInboxTeamScheduleSettings(profile, body));
  } catch (error) {
    return jsonError(error);
  }
}
```

Create the data module `src/lib/inbox-team-schedules.ts` with:
- `loadInboxTeamScheduleSettings(profile)` → for each team member the profile can manage, return `{ appUserId, autoAssignEligible, schedules: [{weekday,startTime,endTime}] }` (join `meta_inbox_team_members` + `meta_inbox_member_schedules`; names resolved via the identity view).
- `saveInboxTeamScheduleSettings(profile, patch)` → update `auto_assign_eligible` on the member row; replace that member's schedule rows (delete rows for weekdays now blank, upsert the rest). Guard that `appUserId` is a member of a team the profile leads/admins.

> Confirm `parseJsonObjectBody` supports `"boolean"` and `"json"` field types; if not, validate `schedules` manually (array of `{weekday:0-6, startTime:"HH:MM", endTime:"HH:MM"}`).

- [ ] **Step 2: Build the settings component**

`src/components/v2/inbox/team-schedule-settings.tsx`: a table of managed members; per member an eligibility toggle and seven weekday rows with start/end `<input type="time">` (blank = day off). On change, `PATCH /api/social-inbox/team/schedules` with that member's patch. Use square-cornered, hairline-bordered controls per the design system (no sans-serif, pink ≤10%).

- [ ] **Step 3: Typecheck + browser verify**

Run: `npm run typecheck`. Then as a lead/admin: toggle a member's eligibility and set a weekday window; reload and confirm persistence; as a non-lead, confirm the surface is hidden/forbidden (403). Then run the sweep (Task 11 curl) and confirm only eligible, on-shift members receive assignments.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/social-inbox/team/schedules/route.ts src/lib/inbox-team-schedules.ts src/components/v2/inbox/team-schedule-settings.tsx
git commit -m "feat(inbox): add admin eligibility + schedule settings"
```

---

## Final verification

- [ ] **Full test suite:** `node --test --experimental-strip-types tests/*.test.ts` — all green, including `tests/inbox-assignment-guard.test.ts` (no new direct `assigned_user_id` writers) and `tests/inbox-metrics-identity-view.test.ts`.
- [ ] **Typecheck:** `npm run typecheck`.
- [ ] **Lint:** `npm run lint`.
- [ ] **End-to-end (real data):** apply migrations; set one member eligible with an on-shift window; run the sweep; confirm an unassigned + confident conversation gets assigned, the rotation pointer advances, the personal/team metrics headers move off zero, and the `assignment_changed` event carries `actor_user_id = NULL` for the auto-assign.

---

## Self-Review (performed during authoring)

**Spec coverage:**
- §1/§5 `assign_to_user` primitive → Tasks 4–6. §2 manual + auto round-robin → Tasks 4–6, 8–13. §3 security model → honored throughout (system profile, worker never reads `users`). §3a shipped-read fix → Task 7. §4 data model (3 tables) → Tasks 1–3. §6 decision engine (`pickAssignee`, `isOnShift`) → Tasks 8–9. §7 triggers (arrival hook + sweep) → Tasks 11–13. §8 manual UI → Task 14. §9 admin UI → Task 15. §10 metrics tie-in → satisfied because every assign emits `assignment_changed` (Tasks 4/6), consumed by `getTeamRollup`/personal header. §11 edge cases → no coverer (pickAssignee→null, skip), already-assigned (predicate filters them; manual reassign allowed), recategorized-while-unassigned (sweep re-reads), per-conversation try/catch, off-shift pointer (on-shift filter before pointer use). §12 tests → migration-shape (Tasks 1–3, 13), `pickAssignee`/`isOnShift` units (8–9), facade guard (6), identity-view routing (7), sweep+hook integration (11–12). §13 open items → resolved in pre-flight.

**Placeholder scan:** No "TBD"/"add error handling"/"similar to Task N". The few "confirm against the branch" notes are verification reminders for identifiers I could not 100% pin (cron GUC names in Task 13; `/api/users` JSON keys in Task 14; `parseJsonObjectBody` field-type support in Task 15) — each ships with concrete code plus the exact file to reconcile against, not a blank.

**Type consistency:** `MetaInboxAssignmentMode` gains `assign_to_user` (Task 4) and is used identically in the route (5), facade (6), worker (10), and UI (14). `targetUserId` is the single name everywhere. `Candidate`/`ScheduleRow`/`PickAssigneeResult` defined in Task 8–9 are imported unchanged by the worker (10). `SYSTEM_INBOX_PROFILE` defined in Task 10 is reused by the arrival hook via the worker. Rotation pointer is `last_assigned_user_id` (DB) ↔ `lastAssignedUserId`/`nextPointer` (engine) consistently.
