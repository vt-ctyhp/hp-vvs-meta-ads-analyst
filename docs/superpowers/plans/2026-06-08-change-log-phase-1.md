# Change Log — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the dedicated Change Log page end to end — a human-friendly, AI-readable record of ad-account actions and business context, captured by talking to it in plain language and verified against live Meta data.

**Architecture:** A new `change_log_*` Supabase schema (entries + normalized entity links + append-only revisions + citations), RLS-scoped exactly like `ad_notes`/`meta_webhook_events`. Pure, unit-tested helpers for time-window intersection, filtering, and draft normalization. A capture service that extracts structured fields from free text with the existing LLM client, resolves entity names against cached `meta_ad_sets`/`meta_campaigns`, and confirms numbers via a read-only Meta Graph call. Six API routes, a server page under the Analyst room, and one client component (ported from the validated prototype, reusing existing filter primitives).

**Tech Stack:** Next.js (App Router, modified build — read `node_modules/next/dist/docs/` before route work), Supabase Postgres + RLS, TypeScript, `node --test --experimental-strip-types`.

**Spec:** `docs/superpowers/specs/2026-06-08-change-log-design.md`. **Prototype (visual reference, throwaway):** `src/app/change-log-prototype/`.

**Out of scope here (separate follow-on plans):** Phase 2 = AI grounding injection + citation recording. Phase 3 = chart annotations + dashboard signal-strip panel. This plan creates the `change_log_citations` table now so Phase 2 needs no migration.

---

## File Structure

| Path | Responsibility | Action |
|---|---|---|
| `supabase/migrations/<ts>_change_log.sql` | 4 tables, indexes, trigger, grants, RLS | Create (via generator) |
| `src/lib/change-log-types.ts` | Shared TS types (`ChangeLogEntry`, `ChangeLogEntityRef`, `ChangeLogDraft`, filter/window types) | Create |
| `src/lib/change-log-window.ts` | Pure: does an entry's effective period intersect `[start,end]` | Create |
| `src/lib/change-log-filters.ts` | Pure: apply page filters to an entry list | Create |
| `src/lib/change-log-draft.ts` | Pure: relative-date resolution + draft normalization/validation + value-verify compare | Create |
| `src/lib/access-control.ts` | Add `view_change_log` / `manage_change_log` | Modify |
| `src/lib/meta.ts` | Add exported `fetchLiveAdSetState` (read-only) | Modify |
| `src/lib/change-log.ts` | Repo: CRUD + `listChangeLogEntries` + `getChangeLogEntriesForWindow` (+ revision writes) | Create |
| `src/lib/change-log-capture.ts` | Orchestrate: LLM extract → resolve entities (cached) → live-verify → draft | Create |
| `src/app/api/change-log/route.ts` | `GET` list, `POST` create | Create |
| `src/app/api/change-log/[id]/route.ts` | `PATCH` edit, `DELETE` soft-delete | Create |
| `src/app/api/change-log/draft/route.ts` | `POST` text → AI draft | Create |
| `src/app/(workspace)/analyst/change-log/page.tsx` | Server page, permission gate, initial load | Create |
| `src/components/change-log-client.tsx` | Consolidated UI (timeline/table/filters/capture) | Create |
| `src/components/v2/workspace-nav.tsx` | Add "Change Log" Analyst nav item | Modify |
| `tests/change-log-window.test.ts` | Window intersection tests | Create |
| `tests/change-log-filters.test.ts` | Filter tests | Create |
| `tests/change-log-draft.test.ts` | Draft/date tests | Create |
| `tests/access-control-change-log.test.ts` | Permission mapping test | Create |

Reference patterns (read before writing the matching task): `src/lib/social-reply-training.ts` (authed CRUD with `createAdsAnalystClient("web")` + `withAdsAnalystEnvironment` + `uuidOrNull`), `src/app/api/analysis/route.ts` (route shape), `supabase/migrations/20260520030000_ad_notes.sql` + `...20260601221130_ai_reply_training_profiles.sql` (migration/RLS style), `src/components/filter-chip-group.tsx` (filter chips).

---

## Task 1: Migration — change_log schema

**Files:**
- Create: `supabase/migrations/<generated>_change_log.sql`

- [ ] **Step 1: Generate the migration stub**

Run: `npm run db:migration -- change_log`
Expected: prints a new path under `supabase/migrations/` ending in `30.sql` with a header comment. Open that file for the next step.

- [ ] **Step 2: Write the schema into the generated file**

Replace the file contents with (keep the generated header comment at top):

```sql
-- Migration: change_log
--
-- Shared Supabase ledger file. This repo writes seconds=30
-- so it cannot collide with the sales-standalone-app-v1 repo (which writes seconds=00).

create table if not exists public.change_log_entries (
  id uuid primary key default gen_random_uuid(),
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  brand_code text not null check (brand_code in ('HP', 'VVS')),
  meta_account_id text,
  event_date date not null,
  effective_start date,
  effective_end date,
  change_type text not null check (change_type in
    ('budget','status','audience','creative','promotion','price','website','other')),
  title text not null check (length(trim(title)) > 0),
  reason text not null check (length(trim(reason)) > 0),
  before_value text,
  after_value text,
  raw_input text,
  verify_entity text not null default 'none'
    check (verify_entity in ('matched','ambiguous','none')),
  verify_value text not null default 'na'
    check (verify_value in ('confirmed','mismatch','na')),
  status text not null default 'active' check (status in ('active','deleted')),
  created_by uuid,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_by_email text
);

create index if not exists change_log_entries_brand_date_idx
  on public.change_log_entries (environment, brand_code, event_date desc);
create index if not exists change_log_entries_type_date_idx
  on public.change_log_entries (environment, change_type, event_date desc);
create index if not exists change_log_entries_active_idx
  on public.change_log_entries (environment, event_date desc) where status = 'active';

create table if not exists public.change_log_entry_entities (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.change_log_entries(id) on delete cascade,
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  entity_kind text not null
    check (entity_kind in ('ad_set','campaign','creative','account','website')),
  entity_meta_id text,
  entity_name text not null,
  match_status text not null default 'unmatched'
    check (match_status in ('matched','ambiguous','unmatched')),
  created_at timestamptz not null default now()
);
create index if not exists change_log_entry_entities_entry_idx
  on public.change_log_entry_entities (entry_id);
create index if not exists change_log_entry_entities_meta_idx
  on public.change_log_entry_entities (environment, entity_meta_id);

create table if not exists public.change_log_entry_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.change_log_entries(id) on delete cascade,
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  action text not null check (action in ('create','edit','delete','restore')),
  snapshot jsonb not null,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists change_log_entry_revisions_entry_idx
  on public.change_log_entry_revisions (environment, entry_id, created_at desc);

create table if not exists public.change_log_citations (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.change_log_entries(id) on delete cascade,
  environment text not null default analytics.current_ads_analyst_environment()
    check (environment in ('production', 'staging')),
  analysis_run_id text not null,
  created_at timestamptz not null default now()
);
create index if not exists change_log_citations_entry_idx
  on public.change_log_citations (environment, entry_id);

create or replace function public.change_log_entries_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
create trigger change_log_entries_set_updated_at
  before update on public.change_log_entries
  for each row execute function public.change_log_entries_set_updated_at();

grant select on table
  public.change_log_entries, public.change_log_entry_entities,
  public.change_log_entry_revisions, public.change_log_citations
  to ads_analyst_web, ads_analyst_worker;
grant insert, update on table
  public.change_log_entries, public.change_log_entry_entities,
  public.change_log_entry_revisions, public.change_log_citations
  to ads_analyst_web;

alter table public.change_log_entries enable row level security;
alter table public.change_log_entry_entities enable row level security;
alter table public.change_log_entry_revisions enable row level security;
alter table public.change_log_citations enable row level security;

create policy change_log_entries_select on public.change_log_entries
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
create policy change_log_entries_insert on public.change_log_entries
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy change_log_entries_update on public.change_log_entries
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy change_log_entry_entities_select on public.change_log_entry_entities
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
create policy change_log_entry_entities_insert on public.change_log_entry_entities
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
create policy change_log_entry_entities_update on public.change_log_entry_entities
  for update to ads_analyst_web
  using (analytics.ads_analyst_environment_matches(environment))
  with check (analytics.ads_analyst_environment_matches(environment));

create policy change_log_entry_revisions_select on public.change_log_entry_revisions
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
create policy change_log_entry_revisions_insert on public.change_log_entry_revisions
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));

create policy change_log_citations_select on public.change_log_citations
  for select to ads_analyst_web, ads_analyst_worker
  using (analytics.ads_analyst_environment_matches(environment));
create policy change_log_citations_insert on public.change_log_citations
  for insert to ads_analyst_web
  with check (analytics.ads_analyst_environment_matches(environment));
```

- [ ] **Step 3: Validate the migration ledger**

Run: `npm run db:migrations:check`
Expected: PASS (no "out of order" / "wrong seconds offset" errors).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations
git commit -m "feat(change-log): add change_log schema, RLS, and indexes"
```

---

## Task 2: Shared types

**Files:**
- Create: `src/lib/change-log-types.ts`

- [ ] **Step 1: Write the types**

```typescript
export type ChangeType =
  | "budget" | "status" | "audience" | "creative"
  | "promotion" | "price" | "website" | "other";

export const CHANGE_TYPES: ChangeType[] = [
  "budget", "status", "audience", "creative", "promotion", "price", "website", "other",
];

export type BrandCode = "HP" | "VVS";
export type EntityKind = "ad_set" | "campaign" | "creative" | "account" | "website";
export type MatchStatus = "matched" | "ambiguous" | "unmatched";
export type VerifyEntity = "matched" | "ambiguous" | "none";
export type VerifyValue = "confirmed" | "mismatch" | "na";

export type ChangeLogEntityRef = {
  entityKind: EntityKind;
  entityMetaId: string | null;
  entityName: string;
  matchStatus: MatchStatus;
};

export type ChangeLogEntry = {
  id: string;
  brandCode: BrandCode;
  metaAccountId: string | null;
  eventDate: string;          // YYYY-MM-DD
  effectiveStart: string | null;
  effectiveEnd: string | null; // null + effectiveStart set => ongoing
  changeType: ChangeType;
  title: string;
  reason: string;
  beforeValue: string | null;
  afterValue: string | null;
  verifyEntity: VerifyEntity;
  verifyValue: VerifyValue;
  entities: ChangeLogEntityRef[];
  citationCount: number;
  createdByEmail: string | null;
  createdAt: string;
};

// Draft = a not-yet-persisted entry produced by the capture service.
export type ChangeLogDraft = {
  brandCode: BrandCode;
  eventDate: string;
  eventDateNote: string | null;
  effectiveStart: string | null;
  effectiveEnd: string | null;
  changeType: ChangeType;
  title: string;
  reason: string;
  beforeValue: string | null;
  afterValue: string | null;
  rawInput: string;
  verifyEntity: VerifyEntity;
  verifyValue: VerifyValue;
  entities: ChangeLogEntityRef[];
  warnings: string[];
};

export type ChangeLogFilters = {
  rangeDays: number | null; // null = all time (UI control offers 7/30/90)
  brandCode: BrandCode | null;
  changeType: ChangeType | null;
  query: string;                 // matches title / entity names
};

export type ChangeLogWindow = {
  start: string; // YYYY-MM-DD inclusive
  end: string;   // YYYY-MM-DD inclusive
};
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/change-log-types.ts
git commit -m "feat(change-log): shared types"
```

---

## Task 3: Permissions

**Files:**
- Modify: `src/lib/access-control.ts`
- Test: `tests/access-control-change-log.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { permissionsForRoles } from "../src/lib/access-control.ts";

test("marketing can view and manage the change log", () => {
  const perms = permissionsForRoles(["marketing"]);
  assert.ok(perms.includes("view_change_log"));
  assert.ok(perms.includes("manage_change_log"));
});

test("executive can view but not manage the change log", () => {
  const perms = permissionsForRoles(["executive"]);
  assert.ok(perms.includes("view_change_log"));
  assert.ok(!perms.includes("manage_change_log"));
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `node --test --experimental-strip-types tests/access-control-change-log.test.ts`
Expected: FAIL — `view_change_log` not in the permission set (type error or assertion failure).

- [ ] **Step 3: Add the two permissions to the union**

In `src/lib/access-control.ts`, extend the `AppPermission` union (after `"manage_inbox_state"`):

```typescript
  | "manage_inbox_state"
  | "view_change_log"
  | "manage_change_log";
```

- [ ] **Step 4: Add descriptions to APP_PERMISSIONS**

Add two entries to the `APP_PERMISSIONS` object:

```typescript
  view_change_log: {
    label: "Change Log",
    description: "View the log of ad-account changes and business context.",
  },
  manage_change_log: {
    label: "Manage Change Log",
    description: "Add, edit, and remove change-log entries.",
  },
```

- [ ] **Step 5: Grant in PERMISSION_GROUPS**

Append `"view_change_log"` and `"manage_change_log"` to the `permissions` array of the `admin` group and the `marketing` group.

- [ ] **Step 6: Grant view to the executive branch**

In `permissionsForRoles()`, in the `executive` branch array, add `"view_change_log"`:

```typescript
    [
      "view_dashboard",
      "view_creative_analysis",
      "view_ai_analysis",
      "view_inbox",
      "view_backfill",
      "view_outcomes",
      "view_change_log",
    ].forEach((permission) => permissions.add(permission as AppPermission));
```

- [ ] **Step 7: Run the test, expect pass**

Run: `node --test --experimental-strip-types tests/access-control-change-log.test.ts`
Expected: PASS (both tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/access-control.ts tests/access-control-change-log.test.ts
git commit -m "feat(change-log): view_change_log and manage_change_log permissions"
```

---

## Task 4: Window-intersection helper (pure, TDD)

**Files:**
- Create: `src/lib/change-log-window.ts`
- Test: `tests/change-log-window.test.ts`

The grounding/annotation query asks: "is this entry in effect during `[start,end]`?"
Rule: use `[effectiveStart, effectiveEnd]` if `effectiveStart` is set (ongoing when `effectiveEnd` is null); otherwise treat the entry as the single day `eventDate`.

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { entryIntersectsWindow } from "../src/lib/change-log-window.ts";
import type { ChangeLogEntry } from "../src/lib/change-log-types.ts";

function entry(partial: Partial<ChangeLogEntry>): ChangeLogEntry {
  return {
    id: "x", brandCode: "HP", metaAccountId: null,
    eventDate: "2026-06-05", effectiveStart: null, effectiveEnd: null,
    changeType: "budget", title: "t", reason: "r",
    beforeValue: null, afterValue: null,
    verifyEntity: "none", verifyValue: "na",
    entities: [], citationCount: 0, createdByEmail: null, createdAt: "",
    ...partial,
  };
}

test("point event matches only when eventDate is inside the window", () => {
  const e = entry({ eventDate: "2026-06-05" });
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-01", end: "2026-06-10" }), true);
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-06", end: "2026-06-10" }), false);
});

test("closed window overlaps when ranges touch", () => {
  const e = entry({ effectiveStart: "2026-06-06", effectiveEnd: "2026-06-15" });
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-01", end: "2026-06-06" }), true);
  assert.equal(entryIntersectsWindow(e, { start: "2026-05-01", end: "2026-06-05" }), false);
});

test("ongoing window has no end and matches any later window", () => {
  const e = entry({ effectiveStart: "2026-05-28", effectiveEnd: null });
  assert.equal(entryIntersectsWindow(e, { start: "2026-06-01", end: "2026-06-10" }), true);
  assert.equal(entryIntersectsWindow(e, { start: "2026-05-01", end: "2026-05-27" }), false);
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `node --test --experimental-strip-types tests/change-log-window.test.ts`
Expected: FAIL — `entryIntersectsWindow` not defined.

- [ ] **Step 3: Implement**

```typescript
import type { ChangeLogEntry, ChangeLogWindow } from "./change-log-types.ts";

/** Inclusive overlap of two ISO date ranges (YYYY-MM-DD compares lexically). */
function rangesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string) {
  return aStart <= bEnd && bStart <= aEnd;
}

export function entryIntersectsWindow(entry: ChangeLogEntry, window: ChangeLogWindow): boolean {
  const start = entry.effectiveStart ?? entry.eventDate;
  const end = entry.effectiveStart ? entry.effectiveEnd ?? "9999-12-31" : entry.eventDate;
  return rangesOverlap(start, end, window.start, window.end);
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `node --test --experimental-strip-types tests/change-log-window.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/change-log-window.ts tests/change-log-window.test.ts
git commit -m "feat(change-log): window intersection helper"
```

---

## Task 5: Filter helper (pure, TDD)

**Files:**
- Create: `src/lib/change-log-filters.ts`
- Test: `tests/change-log-filters.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { applyChangeLogFilters } from "../src/lib/change-log-filters.ts";
import type { ChangeLogEntry } from "../src/lib/change-log-types.ts";

const base = {
  metaAccountId: null, effectiveStart: null, effectiveEnd: null,
  reason: "r", beforeValue: null, afterValue: null,
  verifyEntity: "none" as const, verifyValue: "na" as const,
  citationCount: 0, createdByEmail: null, createdAt: "",
};
const entries: ChangeLogEntry[] = [
  { ...base, id: "1", brandCode: "HP", eventDate: "2026-06-05", changeType: "budget",
    title: "Raised Cash for Gold budget", entities: [{ entityKind: "ad_set", entityMetaId: "1203847", entityName: "Cash for Gold, Prospecting", matchStatus: "matched" }] },
  { ...base, id: "2", brandCode: "VVS", eventDate: "2026-06-02", changeType: "creative",
    title: "Swapped statics for UGC", entities: [{ entityKind: "ad_set", entityMetaId: "9981245", entityName: "Engagement, Broad", matchStatus: "matched" }] },
];

test("brand filter narrows to the brand", () => {
  const out = applyChangeLogFilters(entries, { rangeDays: null, brandCode: "VVS", changeType: null, query: "" }, "2026-06-08");
  assert.deepEqual(out.map((e) => e.id), ["2"]);
});

test("query matches entity name case-insensitively", () => {
  const out = applyChangeLogFilters(entries, { rangeDays: null, brandCode: null, changeType: null, query: "cash" }, "2026-06-08");
  assert.deepEqual(out.map((e) => e.id), ["1"]);
});

test("range excludes entries older than the cutoff", () => {
  const out = applyChangeLogFilters(entries, { rangeDays: 3, brandCode: null, changeType: null, query: "" }, "2026-06-08");
  // cutoff = 2026-06-05; only the Jun 5 entry qualifies
  assert.deepEqual(out.map((e) => e.id), ["1"]);
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `node --test --experimental-strip-types tests/change-log-filters.test.ts`
Expected: FAIL — `applyChangeLogFilters` not defined.

- [ ] **Step 3: Implement**

```typescript
import type { ChangeLogEntry, ChangeLogFilters } from "./change-log-types.ts";

/** Subtract `days` from an ISO date (YYYY-MM-DD), returning an ISO date. */
export function isoMinusDays(today: string, days: number): string {
  const [y, m, d] = today.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d) - days * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

export function applyChangeLogFilters(
  entries: ChangeLogEntry[],
  filters: ChangeLogFilters,
  today: string,
): ChangeLogEntry[] {
  const cutoff = filters.rangeDays == null ? null : isoMinusDays(today, filters.rangeDays);
  const q = filters.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (cutoff && e.eventDate < cutoff) return false;
    if (filters.brandCode && e.brandCode !== filters.brandCode) return false;
    if (filters.changeType && e.changeType !== filters.changeType) return false;
    if (q) {
      const hay = [e.title, ...e.entities.map((x) => x.entityName)].join(" ").toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `node --test --experimental-strip-types tests/change-log-filters.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/change-log-filters.ts tests/change-log-filters.test.ts
git commit -m "feat(change-log): filter helper"
```

---

## Task 6: Draft helpers (pure, TDD)

**Files:**
- Create: `src/lib/change-log-draft.ts`
- Test: `tests/change-log-draft.test.ts`

These are the deterministic pieces of capture: resolving a relative date against "today", and comparing a user's stated value against a live-read value to set `verify_value`.

- [ ] **Step 1: Write the failing test**

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";

import { resolveRelativeDate, compareVerifyValue } from "../src/lib/change-log-draft.ts";

test("resolves 'last friday' relative to a Monday", () => {
  // 2026-06-08 is a Monday; the previous Friday is 2026-06-05.
  const r = resolveRelativeDate("last friday", "2026-06-08");
  assert.equal(r.date, "2026-06-05");
  assert.match(r.note ?? "", /last friday/i);
});

test("passes an explicit ISO date through unchanged", () => {
  const r = resolveRelativeDate("2026-05-30", "2026-06-08");
  assert.equal(r.date, "2026-05-30");
  assert.equal(r.note, null);
});

test("compareVerifyValue confirms a matching number", () => {
  assert.equal(compareVerifyValue("$120/day", "120"), "confirmed");
  assert.equal(compareVerifyValue("$120/day", "80"), "mismatch");
  assert.equal(compareVerifyValue(null, "120"), "na");
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `node --test --experimental-strip-types tests/change-log-draft.test.ts`
Expected: FAIL — functions not defined.

- [ ] **Step 3: Implement**

```typescript
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

export type ResolvedDate = { date: string; note: string | null };

function isoToUtcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Resolve a small set of relative phrases against `today` (YYYY-MM-DD). */
export function resolveRelativeDate(input: string, today: string): ResolvedDate {
  const text = input.trim().toLowerCase();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return { date: text, note: null };

  const todayDate = isoToUtcDate(today);
  const todayDow = todayDate.getUTCDay();

  if (text === "today") return { date: today, note: null };
  if (text === "yesterday") {
    return { date: toIso(new Date(todayDate.getTime() - 86_400_000)), note: `Read "yesterday" as ${toIso(new Date(todayDate.getTime() - 86_400_000))}` };
  }

  const weekdayMatch = text.match(/(?:last\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)/);
  if (weekdayMatch) {
    const target = WEEKDAYS.indexOf(weekdayMatch[1]);
    // most recent past occurrence (1..7 days back)
    let delta = (todayDow - target + 7) % 7;
    if (delta === 0) delta = 7;
    const resolved = toIso(new Date(todayDate.getTime() - delta * 86_400_000));
    return { date: resolved, note: `Read "${weekdayMatch[0]}" as ${resolved}` };
  }

  // Unknown phrase: default to today, flag it.
  return { date: today, note: `Could not read "${input}"; defaulted to today` };
}

/** Does the user's stated value agree with the live-read numeric value? */
export function compareVerifyValue(stated: string | null, liveNumeric: string | null): "confirmed" | "mismatch" | "na" {
  if (!stated || !liveNumeric) return "na";
  const statedNum = stated.replace(/[^0-9.]/g, "");
  const liveNum = liveNumeric.replace(/[^0-9.]/g, "");
  if (!statedNum || !liveNum) return "na";
  return Number(statedNum) === Number(liveNum) ? "confirmed" : "mismatch";
}
```

- [ ] **Step 4: Run the test, expect pass**

Run: `node --test --experimental-strip-types tests/change-log-draft.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/change-log-draft.ts tests/change-log-draft.test.ts
git commit -m "feat(change-log): draft date-resolution and value-verify helpers"
```

---

## Task 7: Live Meta read — `fetchLiveAdSetState`

**Files:**
- Modify: `src/lib/meta.ts`

`graphFetch` is private in `meta.ts`; add an exported wrapper in the same module so it can call it.

- [ ] **Step 1: Add the exported function**

Near the other exported `fetch*` functions in `src/lib/meta.ts`, add:

```typescript
export type LiveAdSetState = {
  id: string;
  name: string | null;
  status: string | null;
  dailyBudget: string | null;   // Meta returns minor units as a string
};

/**
 * Read-only live read of an ad set's current status and daily budget.
 * Returns null if Meta is unreachable or the token is missing — callers must
 * degrade gracefully (verify_value = 'na'); this never throws to the caller.
 */
export async function fetchLiveAdSetState(adSetId: string): Promise<LiveAdSetState | null> {
  try {
    const data = await graphFetch<{ id: string; name?: string; status?: string; daily_budget?: string }>(
      adSetId,
      { fields: "id,name,status,daily_budget" },
    );
    const node = data as { id: string; name?: string; status?: string; daily_budget?: string };
    return {
      id: node.id,
      name: node.name ?? null,
      status: node.status ?? null,
      dailyBudget: node.daily_budget ?? null,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If `graphFetch`'s generic return type differs, adjust the cast to match its signature; do not change `graphFetch` itself.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/meta.ts
git commit -m "feat(change-log): read-only fetchLiveAdSetState"
```

---

## Task 8: Repo — `change-log.ts`

**Files:**
- Create: `src/lib/change-log.ts`

Mirror the authed-CRUD pattern in `src/lib/social-reply-training.ts`: `createAdsAnalystClient("web")`, `withAdsAnalystEnvironment(...)` on writes, `uuidOrNull(...)` for actor ids. Reads filter by `getAdsAnalystEnvironment()` and `status = 'active'`. Each write also inserts a `change_log_entry_revisions` snapshot.

- [ ] **Step 1: Write the repo**

```typescript
import {
  createAdsAnalystClient,
  getAdsAnalystEnvironment,
  withAdsAnalystEnvironment,
} from "./ads-analyst-db.ts";
import { entryIntersectsWindow } from "./change-log-window.ts";
import type {
  ChangeLogDraft, ChangeLogEntry, ChangeLogEntityRef, ChangeLogWindow,
} from "./change-log-types.ts";

type Actor = { appUserId: string | null; email: string | null };

function uuidOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

// Cast to a loosely-typed client (matches social-reply-training.ts usage).
type DynamicSupabaseClient = ReturnType<typeof createAdsAnalystClient> & {
  from: (table: string) => any;
};
function db(): DynamicSupabaseClient {
  return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient;
}

type EntityRow = {
  entry_id: string; entity_kind: string; entity_meta_id: string | null;
  entity_name: string; match_status: string;
};
type EntryRow = {
  id: string; brand_code: string; meta_account_id: string | null;
  event_date: string; effective_start: string | null; effective_end: string | null;
  change_type: string; title: string; reason: string;
  before_value: string | null; after_value: string | null;
  verify_entity: string; verify_value: string;
  created_by_email: string | null; created_at: string;
};

function mapEntry(row: EntryRow, entities: ChangeLogEntityRef[], citationCount: number): ChangeLogEntry {
  return {
    id: row.id,
    brandCode: row.brand_code as ChangeLogEntry["brandCode"],
    metaAccountId: row.meta_account_id,
    eventDate: row.event_date,
    effectiveStart: row.effective_start,
    effectiveEnd: row.effective_end,
    changeType: row.change_type as ChangeLogEntry["changeType"],
    title: row.title,
    reason: row.reason,
    beforeValue: row.before_value,
    afterValue: row.after_value,
    verifyEntity: row.verify_entity as ChangeLogEntry["verifyEntity"],
    verifyValue: row.verify_value as ChangeLogEntry["verifyValue"],
    entities,
    citationCount,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
  };
}

async function hydrate(rows: EntryRow[]): Promise<ChangeLogEntry[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const supabase = db();
  const [{ data: entityRows }, { data: citationRows }] = await Promise.all([
    supabase.from("change_log_entry_entities").select("*").in("entry_id", ids),
    supabase.from("change_log_citations").select("entry_id").in("entry_id", ids),
  ]);
  const byEntry = new Map<string, ChangeLogEntityRef[]>();
  for (const e of (entityRows ?? []) as EntityRow[]) {
    const ref: ChangeLogEntityRef = {
      entityKind: e.entity_kind as ChangeLogEntityRef["entityKind"],
      entityMetaId: e.entity_meta_id,
      entityName: e.entity_name,
      matchStatus: e.match_status as ChangeLogEntityRef["matchStatus"],
    };
    byEntry.set(e.entry_id, [...(byEntry.get(e.entry_id) ?? []), ref]);
  }
  const counts = new Map<string, number>();
  for (const c of (citationRows ?? []) as { entry_id: string }[]) {
    counts.set(c.entry_id, (counts.get(c.entry_id) ?? 0) + 1);
  }
  return rows.map((r) => mapEntry(r, byEntry.get(r.id) ?? [], counts.get(r.id) ?? 0));
}

export async function listChangeLogEntries(): Promise<ChangeLogEntry[]> {
  const supabase = db();
  const { data, error } = await supabase
    .from("change_log_entries")
    .select("*")
    .eq("environment", getAdsAnalystEnvironment())
    .eq("status", "active")
    .order("event_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return hydrate((data ?? []) as EntryRow[]);
}

export async function getChangeLogEntriesForWindow(input: {
  brandCode?: string | null;
  entityMetaIds?: string[];
  window: ChangeLogWindow;
}): Promise<ChangeLogEntry[]> {
  const all = await listChangeLogEntries();
  return all.filter((e) => {
    if (input.brandCode && e.brandCode !== input.brandCode) return false;
    if (input.entityMetaIds && input.entityMetaIds.length > 0) {
      const ids = new Set(input.entityMetaIds);
      if (!e.entities.some((x) => x.entityMetaId && ids.has(x.entityMetaId))) return false;
    }
    return entryIntersectsWindow(e, input.window);
  });
}

export async function createChangeLogEntry(draft: ChangeLogDraft, actor: Actor): Promise<string> {
  const supabase = db();
  const { data, error } = await supabase
    .from("change_log_entries")
    .insert(withAdsAnalystEnvironment({
      brand_code: draft.brandCode,
      meta_account_id: null,
      event_date: draft.eventDate,
      effective_start: draft.effectiveStart,
      effective_end: draft.effectiveEnd,
      change_type: draft.changeType,
      title: draft.title,
      reason: draft.reason,
      before_value: draft.beforeValue,
      after_value: draft.afterValue,
      raw_input: draft.rawInput,
      verify_entity: draft.verifyEntity,
      verify_value: draft.verifyValue,
      created_by: uuidOrNull(actor.appUserId),
      created_by_email: actor.email,
    }))
    .select("id")
    .single();
  if (error) throw error;
  const entryId = (data as { id: string }).id;

  if (draft.entities.length > 0) {
    const { error: entErr } = await supabase
      .from("change_log_entry_entities")
      .insert(draft.entities.map((e) => withAdsAnalystEnvironment({
        entry_id: entryId,
        entity_kind: e.entityKind,
        entity_meta_id: e.entityMetaId,
        entity_name: e.entityName,
        match_status: e.matchStatus,
      })));
    if (entErr) throw entErr;
  }

  await writeRevision(entryId, "create", { draft }, actor);
  return entryId;
}

export async function updateChangeLogEntry(
  id: string,
  patch: Partial<Pick<ChangeLogEntry, "title" | "reason" | "beforeValue" | "afterValue" | "eventDate" | "effectiveStart" | "effectiveEnd" | "changeType">>,
  actor: Actor,
): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from("change_log_entries")
    .update({
      ...(patch.title !== undefined ? { title: patch.title } : {}),
      ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
      ...(patch.beforeValue !== undefined ? { before_value: patch.beforeValue } : {}),
      ...(patch.afterValue !== undefined ? { after_value: patch.afterValue } : {}),
      ...(patch.eventDate !== undefined ? { event_date: patch.eventDate } : {}),
      ...(patch.effectiveStart !== undefined ? { effective_start: patch.effectiveStart } : {}),
      ...(patch.effectiveEnd !== undefined ? { effective_end: patch.effectiveEnd } : {}),
      ...(patch.changeType !== undefined ? { change_type: patch.changeType } : {}),
    })
    .eq("id", id)
    .eq("environment", getAdsAnalystEnvironment());
  if (error) throw error;
  await writeRevision(id, "edit", { patch }, actor);
}

export async function softDeleteChangeLogEntry(id: string, actor: Actor): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from("change_log_entries")
    .update({ status: "deleted", deleted_at: new Date().toISOString(), deleted_by: uuidOrNull(actor.appUserId), deleted_by_email: actor.email })
    .eq("id", id)
    .eq("environment", getAdsAnalystEnvironment());
  if (error) throw error;
  await writeRevision(id, "delete", {}, actor);
}

async function writeRevision(entryId: string, action: "create" | "edit" | "delete" | "restore", snapshot: unknown, actor: Actor): Promise<void> {
  const supabase = db();
  const { error } = await supabase
    .from("change_log_entry_revisions")
    .insert(withAdsAnalystEnvironment({
      entry_id: entryId,
      action,
      snapshot,
      actor_id: uuidOrNull(actor.appUserId),
      actor_email: actor.email,
    }));
  if (error) throw error;
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS. (If the dynamic client cast complains, match the exact cast used at `src/lib/social-reply-training.ts:253`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/change-log.ts
git commit -m "feat(change-log): repo with CRUD, window query, and revision log"
```

---

## Task 9: Capture service — `change-log-capture.ts`

**Files:**
- Create: `src/lib/change-log-capture.ts`

Orchestrates: LLM extraction → entity resolution (cached tables) → live verify → `ChangeLogDraft`. Reuses the existing LLM client used by `src/lib/ai.ts` (do not add a new provider — read `ai.ts` for the exact client/import and model name, and reuse it). The deterministic pieces (`resolveRelativeDate`, `compareVerifyValue`) come from Task 6 and are already tested.

- [ ] **Step 1: Write the entity resolver + orchestrator**

```typescript
import { createAdsAnalystClient, getAdsAnalystEnvironment } from "./ads-analyst-db.ts";
import { compareVerifyValue, resolveRelativeDate } from "./change-log-draft.ts";
import { fetchLiveAdSetState } from "./meta.ts";
import type {
  BrandCode, ChangeLogDraft, ChangeLogEntityRef, ChangeType, EntityKind,
} from "./change-log-types.ts";

type DynamicSupabaseClient = ReturnType<typeof createAdsAnalystClient> & { from: (t: string) => any };
function db() { return createAdsAnalystClient("web") as unknown as DynamicSupabaseClient; }

// The strict JSON shape we ask the model to return.
type Extraction = {
  changeType: ChangeType;
  title: string;
  reason: string;
  eventPhrase: string;       // e.g. "last friday" or "2026-05-30"
  effectiveStart: string | null;
  effectiveEnd: string | null;
  beforeValue: string | null;
  afterValue: string | null;
  entities: { kind: EntityKind; name: string }[];
};

/**
 * Resolve an entity name against cached Meta tables for this brand's account.
 * matched = exactly one row; ambiguous = several; unmatched = none.
 */
async function resolveEntity(
  kind: EntityKind,
  name: string,
  metaAccountId: string | null,
): Promise<ChangeLogEntityRef> {
  if ((kind !== "ad_set" && kind !== "campaign") || !metaAccountId) {
    return { entityKind: kind, entityMetaId: null, entityName: name, matchStatus: "unmatched" };
  }
  const supabase = db();
  const table = kind === "ad_set" ? "meta_ad_sets" : "meta_campaigns";
  const idCol = kind === "ad_set" ? "ad_set_id" : "campaign_id";
  const { data } = await supabase
    .from(table)
    .select(`${idCol}, name`)
    .eq("environment", getAdsAnalystEnvironment())
    .eq("meta_account_id", metaAccountId)
    .ilike("name", `%${name}%`)
    .limit(5);
  const rows = (data ?? []) as Record<string, string>[];
  if (rows.length === 1) {
    return { entityKind: kind, entityMetaId: rows[0][idCol], entityName: rows[0].name ?? name, matchStatus: "matched" };
  }
  if (rows.length > 1) {
    return { entityKind: kind, entityMetaId: null, entityName: name, matchStatus: "ambiguous" };
  }
  return { entityKind: kind, entityMetaId: null, entityName: name, matchStatus: "unmatched" };
}

/** Extract structured fields from free text using the existing analysis LLM client. */
async function extractFields(text: string): Promise<Extraction> {
  // REUSE the model client/import already configured in src/lib/ai.ts.
  // Prompt the model to return ONLY JSON matching the Extraction type, with
  // changeType in budget|status|audience|creative|promotion|price|website|other.
  // Parse and validate; on any parse failure, throw a 422-style error the route maps.
  // (Implement against the same client ai.ts uses; keep the schema strict.)
  throw new Error("extractFields: wire to the ai.ts model client");
}

export async function draftChangeLogEntryFromText(input: {
  text: string;
  brandCode: BrandCode;
  metaAccountId: string | null;
  today: string;
}): Promise<ChangeLogDraft> {
  const warnings: string[] = [];
  const extraction = await extractFields(input.text);

  const resolvedDate = resolveRelativeDate(extraction.eventPhrase, input.today);

  const entities: ChangeLogEntityRef[] = [];
  for (const e of extraction.entities) {
    const ref = await resolveEntity(e.kind, e.name, input.metaAccountId);
    if (ref.matchStatus === "ambiguous") warnings.push(`"${e.name}" matched more than one ${e.kind}. Pick the right one.`);
    if (ref.matchStatus === "unmatched" && (e.kind === "ad_set" || e.kind === "campaign")) {
      warnings.push(`Could not find a ${e.kind} named "${e.name}".`);
    }
    entities.push(ref);
  }

  // Live-verify the first matched ad set, if any.
  let verifyValue: ChangeLogDraft["verifyValue"] = "na";
  let afterValue = extraction.afterValue;
  const matchedAdSet = entities.find((e) => e.entityKind === "ad_set" && e.matchStatus === "matched");
  if (matchedAdSet?.entityMetaId && extraction.changeType === "budget") {
    const live = await fetchLiveAdSetState(matchedAdSet.entityMetaId);
    if (live?.dailyBudget) {
      verifyValue = compareVerifyValue(extraction.afterValue, live.dailyBudget);
      if (verifyValue === "na" && !afterValue) afterValue = `$${(Number(live.dailyBudget) / 100).toFixed(0)}/day`;
    } else {
      warnings.push("Could not read the live budget from Meta; logged without a value check.");
    }
  }

  const verifyEntity: ChangeLogDraft["verifyEntity"] =
    entities.some((e) => e.matchStatus === "ambiguous") ? "ambiguous"
    : entities.some((e) => e.matchStatus === "matched") ? "matched"
    : "none";

  return {
    brandCode: input.brandCode,
    eventDate: resolvedDate.date,
    eventDateNote: resolvedDate.note,
    effectiveStart: extraction.effectiveStart,
    effectiveEnd: extraction.effectiveEnd,
    changeType: extraction.changeType,
    title: extraction.title,
    reason: extraction.reason,
    beforeValue: extraction.beforeValue,
    afterValue,
    rawInput: input.text,
    verifyEntity,
    verifyValue,
    entities,
    warnings,
  };
}
```

- [ ] **Step 2: Wire `extractFields` to the real model client**

Open `src/lib/ai.ts`, find the model client and call style used by `answerExecutiveChat`, and replace the `extractFields` body to call that client with a strict JSON-only prompt returning the `Extraction` shape. Parse with `JSON.parse`, validate `changeType` against the union, and throw on malformed output.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/change-log-capture.ts
git commit -m "feat(change-log): capture service (extract, resolve, live-verify)"
```

---

## Task 10: API routes

**Files:**
- Create: `src/app/api/change-log/route.ts`
- Create: `src/app/api/change-log/[id]/route.ts`
- Create: `src/app/api/change-log/draft/route.ts`

Follow the shape of `src/app/api/analysis/route.ts`: `requirePermissionFromRequest` first, `Response.json(...)` for success, `jsonError(error)` in `catch`.

- [ ] **Step 1: List + create — `route.ts`**

```typescript
import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { createChangeLogEntry, listChangeLogEntries } from "@/lib/change-log";
import type { ChangeLogDraft } from "@/lib/change-log-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requirePermissionFromRequest(request, "view_change_log");
    return Response.json({ entries: await listChangeLogEntries() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_change_log");
    const body = (await request.json()) as { draft?: ChangeLogDraft };
    if (!body.draft) return Response.json({ error: "Missing draft." }, { status: 400 });
    const id = await createChangeLogEntry(body.draft, { appUserId: profile.appUserId, email: profile.email });
    return Response.json({ id });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 2: Edit + delete — `[id]/route.ts`**

```typescript
import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { softDeleteChangeLogEntry, updateChangeLogEntry } from "@/lib/change-log";
import type { ChangeLogEntry } from "@/lib/change-log-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Ctx) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_change_log");
    const { id } = await ctx.params;
    const patch = (await request.json()) as Partial<ChangeLogEntry>;
    await updateChangeLogEntry(id, patch, { appUserId: profile.appUserId, email: profile.email });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, ctx: Ctx) {
  try {
    const profile = await requirePermissionFromRequest(request, "manage_change_log");
    const { id } = await ctx.params;
    await softDeleteChangeLogEntry(id, { appUserId: profile.appUserId, email: profile.email });
    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 3: Draft — `draft/route.ts`**

```typescript
import { requirePermissionFromRequest } from "@/lib/app-auth";
import { jsonError } from "@/lib/http";
import { draftChangeLogEntryFromText } from "@/lib/change-log-capture";
import type { BrandCode } from "@/lib/change-log-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    await requirePermissionFromRequest(request, "manage_change_log");
    const body = (await request.json()) as { text?: string; brandCode?: BrandCode; metaAccountId?: string | null; today?: string };
    if (!body.text?.trim()) return Response.json({ error: "Tell me what changed." }, { status: 400 });
    const draft = await draftChangeLogEntryFromText({
      text: body.text,
      brandCode: body.brandCode ?? "HP",
      metaAccountId: body.metaAccountId ?? null,
      today: body.today ?? new Date().toISOString().slice(0, 10),
    });
    return Response.json({ draft });
  } catch (error) {
    return jsonError(error);
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/change-log
git commit -m "feat(change-log): list/create/edit/delete/draft API routes"
```

---

## Task 11: Nav entry

**Files:**
- Modify: `src/components/v2/workspace-nav.tsx`

- [ ] **Step 1: Add the Analyst nav item**

In `ROOM_ITEMS.analyst`, after the existing `AI Analysis` item, add:

```typescript
    { href: "/analyst/change-log", label: "Change Log", permission: "view_change_log" },
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/v2/workspace-nav.tsx
git commit -m "feat(change-log): add Change Log to Analyst nav"
```

---

## Task 12: Page + client component

**Files:**
- Create: `src/app/(workspace)/analyst/change-log/page.tsx`
- Create: `src/components/change-log-client.tsx`

The client is a port of the validated prototype (`src/app/change-log-prototype/prototype-client.tsx`) with three changes: (1) read entries from props/`GET /api/change-log` instead of fixtures, (2) reuse `src/components/filter-chip-group.tsx` for Brand/Type instead of the bespoke `Seg`, (3) the "Add a change" panel posts to `/api/change-log/draft` then `/api/change-log`. Keep the editorial system, one gilt mark, Timeline/Table toggle, and the usage aside (which must NOT list entries).

- [ ] **Step 1: Server page**

```typescript
import { ChangeLogClient } from "@/components/change-log-client";
import { listChangeLogEntries } from "@/lib/change-log";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function ChangeLogPage() {
  await requirePagePermission("view_change_log", "/analyst/change-log");
  const entries = await listChangeLogEntries();
  return <ChangeLogClient initialEntries={entries} today={new Date().toISOString().slice(0, 10)} />;
}
```

- [ ] **Step 2: Client component**

Create `src/components/change-log-client.tsx` (`"use client"`). Port the prototype's primitives (`Eyebrow`, `TypeTag`, `BrandTag`, `EntityChip`, `VerifyBadge`, `CitedTag`, `Avatar`, `TimelineView`, `TableView`, `UsageAside`, `AnnotatedSpendChart`) but:

- Props: `{ initialEntries: ChangeLogEntry[]; today: string }`. Hold entries in state; map field names to the `ChangeLogEntry` type from `change-log-types.ts` (e.g. `entityName`, `changeType`, `citationCount`).
- Filtering: use `applyChangeLogFilters(entries, filters, today)` from `change-log-filters.ts` (don't re-implement).
- Brand/Type controls: render with `FilterChipGroup` (`src/components/filter-chip-group.tsx`) — `{ label, value, onChange, options }`.
- Capture handlers:

```typescript
async function requestDraft(text: string, brandCode: "HP" | "VVS") {
  const res = await fetch("/api/change-log/draft", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, brandCode, today }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Draft failed");
  return (await res.json()).draft as ChangeLogDraft;
}

async function saveDraft(draft: ChangeLogDraft) {
  const res = await fetch("/api/change-log", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ draft }),
  });
  if (!res.ok) throw new Error((await res.json()).error ?? "Save failed");
  // re-fetch the list so the new entry appears in the record
  const list = await (await fetch("/api/change-log")).json();
  setEntries(list.entries as ChangeLogEntry[]);
}
```

- The capture panel shows: a text box (calls `requestDraft` on submit), the returned draft card with `VerifyBadge` + `warnings`, and Save (calls `saveDraft`, then closes) / Edit. No second persisted list.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Verify in the browser (preview)**

Start the dev server (`.claude/launch.json` → `analyst-dev`) and confirm the page renders, the Timeline/Table toggle switches the same data, the filters narrow it, and the "Add a change" panel posts a draft and saves. (Auth-gated; sign in or use the local test-auth path.) Compare against the prototype at `/change-log-prototype`.

- [ ] **Step 5: Commit**

```bash
git add src/app/(workspace)/analyst/change-log src/components/change-log-client.tsx
git commit -m "feat(change-log): Analyst page and consolidated client UI"
```

---

## Task 13: Full verification + cleanup

- [ ] **Step 1: Full test suite**

Run: `npm test`
Expected: PASS (runs `db:migrations:check` via pretest, then all `tests/*.test.ts`).

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS (fix any issues in the new files).

- [ ] **Step 4: Remove the throwaway prototype**

```bash
git rm -r src/app/change-log-prototype
git checkout .claude/launch.json   # revert the autoPort tweak added during prototyping
git commit -m "chore(change-log): remove UI prototype and revert preview config"
```

---

## Self-Review (completed by plan author)

- **Spec coverage:** Data model → Task 1/2/8. Permissions → Task 3. Capture (extract/resolve/live-verify, degrade) → Task 6/7/9. Time model (event date + window) → Task 1 columns + Task 4. Governance (soft-delete + revisions) → Task 1 + Task 8. Dedicated page (timeline/table/filters/conversation/usage-aside) → Task 5/11/12. Phase 2 (grounding, citations) and Phase 3 (annotations, signal-strip) are explicitly deferred; the `change_log_citations` table is created now (Task 1) so Phase 2 needs no migration.
- **Placeholder scan:** The only intentionally-deferred body is `extractFields` (Task 9 Step 1), which Task 9 Step 2 wires to the real `ai.ts` client — called out as an explicit step, not a hidden TODO.
- **Type consistency:** `ChangeLogEntry` / `ChangeLogDraft` / `ChangeLogEntityRef` field names are defined in Task 2 and used unchanged in Tasks 4, 5, 8, 9, 10, 12. Repo column↔camelCase mapping lives only in `mapEntry` (Task 8).
- **Open follow-ups for Phase 2/3 plans:** thread the analyzed window + entity ids into `getChangeLogEntriesForWindow` at the two grounding injection points; record `change_log_citations`; build the chart-annotation overlay and the dashboard signal-strip panel.
```
