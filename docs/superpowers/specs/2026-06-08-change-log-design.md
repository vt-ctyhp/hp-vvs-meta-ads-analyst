# Change Log — Design Spec

**Date:** 2026-06-08
**Status:** Approved direction, ready for implementation plan
**Owner:** Marketing operator (primary persona)

## 1. Problem

The AI analysis explains *what* the numbers did but is blind to *why*. When the
team raises a budget, swaps a creative, runs a promo, changes a price, or fixes a
broken page, that context lives in people's heads. The analysis can see spend
rise 41% on Jun 5 but cannot connect it to the Cash for Gold budget change made
that day.

We need a **change log**: a human-friendly, AI-readable record of the actions the
team takes and the business context around them, captured by talking to it in
plain language, verified against live data, and fed back into the AI analysis,
the dashboards, and the charts.

## 2. Scope (decided)

Captured event scope: **ad-account actions + business context.** Both the knobs
we turn inside Meta (budget, status, audience, creative) and the surrounding
causes that move performance (promotions, price changes, website/landing-page
edits, seasonality notes). Not a free-text diary of world events.

Eight `change_type` values: `budget`, `status`, `audience`, `creative`,
`promotion`, `price`, `website`, `other`.

### In scope (v1, phased)

1. **Dedicated Change Log page** — the home base. Editorial timeline (default
   readout) with a Table readout toggle over the *same* filtered entries.
   Filters: date range, brand, campaign/ad set, type. Conversational "Add a
   change" capture.
2. **AI analysis grounding (auto)** — entries overlapping an analysis's date
   range / entities are injected into the workbench and Ask AI grounding so the
   model cites them.
3. **Chart annotations** — change markers (point) and shaded bands (effective
   window) on dashboard time-series charts.
4. **Signal-strip "Recent changes" panel** — a compact recent-changes block on
   the Analyst dashboard.

Build order: **Phase 1** = data + capture + dedicated page; **Phase 2** =
AI grounding + citation tracking; **Phase 3** = chart annotations + signal-strip
panel. Each phase ships standalone value.

### Explicitly out of scope (v1)

- Writing to Meta (the product is read-only on ads; we only *read* live values).
- Auto-detecting changes from Meta's activity log (manual capture only for v1).
- Multi-select type filter (single-select in v1).
- World/macro events as a category.

## 3. Key decisions (from brainstorming)

| Question | Decision |
|---|---|
| Event scope | Ad actions + business context |
| Capture | Chat → AI drafts a structured entry → user confirms |
| Verification | Resolve entities to real IDs **and** read live values (read-only Meta) |
| Time model | Event date + optional effective window (start, end-or-ongoing) |
| Governance | Anyone with `manage_change_log` adds; edits/deletes are tracked, not erased (soft-delete + append-only revision log); author + timestamp on every entry |
| UI direction | One record, two readouts (Timeline default / Table). Filters drive that one record. Conversation is the *add* flow, not a second log. The right aside explains where the log surfaces; it does not repeat entries. |

The prototype that validated the UI lives at `src/app/change-log-prototype/`
(throwaway; delete when the real page lands).

## 4. Data model

New schema mirrors `ad_notes` (`supabase/migrations/20260520030000_ad_notes.sql`)
and `meta_webhook_events` (`...20260602042930_meta_webhook_event_log.sql`)
conventions: `environment` defaulted via
`analytics.current_ads_analyst_environment()` with a
`check (environment in ('production','staging'))`, RLS gated by
`analytics.ads_analyst_environment_matches(environment)`, role grants to
`ads_analyst_web` / `ads_analyst_worker`.

Create via `npm run db:migration -- change_log` (seconds suffix `30` is enforced
by the generator); run `npm run db:migrations:check` before finalizing.

### 4.1 `change_log_entries` (canonical, current state)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | `gen_random_uuid()` |
| `environment` | text | default `analytics.current_ads_analyst_environment()`, check prod/staging |
| `brand_code` | text not null | `'HP'` / `'VVS'` |
| `meta_account_id` | text null | null for account-less business context |
| `event_date` | date not null | when the change happened |
| `effective_start` | date null | start of the in-force window |
| `effective_end` | date null | end of window; null + `effective_start` set ⇒ ongoing |
| `change_type` | text not null | check in the 8 values |
| `title` | text not null | short headline (AI-drafted, editable) |
| `reason` | text not null | the *why*; `check (length(trim(reason)) > 0)` |
| `before_value` | text null | e.g. `$80/day`, `Live`, `Lookalike 5%` |
| `after_value` | text null | e.g. `$120/day`, `Paused` |
| `raw_input` | text null | the original user message (provenance) |
| `verify_entity` | text not null | `matched` / `ambiguous` / `none`, default `none` |
| `verify_value` | text not null | `confirmed` / `mismatch` / `na`, default `na` |
| `status` | text not null | `active` / `deleted`, default `active` |
| `created_by` | uuid null | `AccessProfile.appUserId` |
| `created_by_email` | text null | denormalized for audit |
| `created_at` | timestamptz | default `now()` |
| `updated_at` | timestamptz | default `now()`, maintained by trigger (ai_signals pattern) |
| `deleted_at` | timestamptz null | set on soft delete |
| `deleted_by` / `deleted_by_email` | uuid / text null | who deleted |

Indexes:
- `(environment, brand_code, event_date desc)` — page list, dashboards.
- `(environment, change_type, event_date desc)` — type filter.
- `(environment, event_date desc) where status = 'active'` — partial, default scans.

### 4.2 `change_log_entry_entities` (entry → affected objects, many-to-one)

Normalized so the grounding query can find "entries touching ad_set X in window."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `entry_id` | uuid not null | references `change_log_entries(id) on delete cascade` |
| `environment` | text | scoped, matches parent |
| `entity_kind` | text not null | `ad_set` / `campaign` / `creative` / `account` / `website` |
| `entity_meta_id` | text null | the Meta object id when resolved (e.g. ad_set_id) |
| `entity_name` | text not null | display name (resolved or as typed) |
| `match_status` | text not null | `matched` / `ambiguous` / `unmatched`, default `unmatched` |

Index: `(environment, entity_meta_id)` and `(entry_id)`.

### 4.3 `change_log_entry_revisions` (append-only audit)

Every create/edit/delete/restore writes a full snapshot. Guarantees a cited
entry's history can't silently change or vanish.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `entry_id` | uuid not null | references entries `on delete cascade` |
| `environment` | text | |
| `action` | text not null | `create` / `edit` / `delete` / `restore` |
| `snapshot` | jsonb not null | full entry + entities at the time |
| `actor_id` | uuid null / `actor_email` text null | who |
| `created_at` | timestamptz | default `now()` |

Index: `(environment, entry_id, created_at desc)`.

### 4.4 `change_log_citations` (Phase 2 — "Cited in N")

Populated when grounding actually injects an entry into an analysis run.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `entry_id` | uuid not null | references entries `on delete cascade` |
| `analysis_run_id` | text not null | the workbench/chat run id (soft reference) |
| `environment` | text | |
| `created_at` | timestamptz | default `now()` |

Index: `(environment, entry_id)`. "Cited in N" = distinct `analysis_run_id`
count per entry.

### RLS / grants

- `grant select on change_log_entries, _entities, _revisions, _citations to ads_analyst_web, ads_analyst_worker;`
- `grant insert, update on change_log_entries, _entities, _revisions, _citations to ads_analyst_web;`
- Policies: `for select/insert/update` to the granted roles `using/with check
  (analytics.ads_analyst_environment_matches(environment))`.
- Hard `DELETE` is **not** granted; deletion is a soft `status='deleted'` UPDATE.
- App-layer permission (below) distinguishes read (`view_change_log`) from write
  (`manage_change_log`); DB RLS enforces environment + role.

## 5. Permissions

Add to `src/lib/access-control.ts`:
- `view_change_log` — read the log; auto-grounding consumes it.
- `manage_change_log` — add / edit / delete entries.

Wire into `AppPermission` (lines 5-18), `APP_PERMISSIONS` (label+description),
`PERMISSION_GROUPS`, and `permissionsForRoles()` (lines 162-254):
- `admin`, `marketing` → `view_change_log` + `manage_change_log`.
- `executive` → `view_change_log` only (read-only stakeholder).
- `sales` and others → none.

Enforce with `requirePagePermission("view_change_log", "/analyst/change-log")`
on the page and `requirePermissionFromRequest(request, …)` on each API route.

## 6. Backend services

### 6.1 Repo — `src/lib/change-log.ts`

Reads:
- `listChangeLogEntries(filters)` — `{ range, brandCode, changeType, query,
  entityMetaId }` → active entries + their entities, newest first. Powers the
  page list and the Table readout.
- `getChangeLogEntriesForWindow({ brandCode, accountId, entityMetaIds, start,
  end })` — entries whose `[effective_start, effective_end]` (falling back to
  `event_date`) intersects `[start, end]`, optionally narrowed to entity ids.
  Shared by AI grounding, chart annotations, and the signal-strip panel.
- `getChangeLogEntry(id)` — single entry + entities + revision history.

Writes (each also appends a revision row in the same transaction):
- `createChangeLogEntry(draft, profile)`
- `updateChangeLogEntry(id, patch, profile)`
- `softDeleteChangeLogEntry(id, profile)` / `restoreChangeLogEntry(id, profile)`

### 6.2 Capture extraction — `src/lib/change-log-capture.ts`

`draftChangeLogEntryFromText({ text, brandCode })` → a non-persisted draft:

1. **Extract** structured fields from `text` using the existing analysis LLM
   client (reuse the integration in `src/lib/ai.ts`; do **not** introduce a new
   provider). Output a strict JSON shape: `change_type`, `title`, `reason`,
   `event_date` (resolve relative dates like "last Friday" against today,
   returning a note), `effective_start/end`, `before/after`, and candidate
   entity names with kinds.
2. **Resolve entities** against cached `meta_ad_sets` / `meta_campaigns` /
   `meta_ads` by name within the brand's account → set `entity_meta_id` and
   `match_status` (`matched` if exactly one, `ambiguous` if several, `unmatched`
   if none).
3. **Read live values** for matched ad sets / campaigns via `graphFetch` in
   `src/lib/meta.ts` (`fields=daily_budget,status,name` — read-only). Use the
   live value to confirm/auto-fill `after_value` and set `verify_value`
   (`confirmed` if it matches the user's number, `mismatch` if not). Business
   context (promotion/price/website) has no live value → `verify_value='na'`.
4. **Degrade gracefully**: if the Meta token is missing or the live read fails,
   the draft still returns with `verify_value='na'` and a soft warning. Live
   verification never blocks logging.

Returns `{ draft, warnings, resolution }` for the confirm card.

### 6.3 API routes — `src/app/api/change-log/`

| Method · Path | Permission | Purpose |
|---|---|---|
| `POST /draft` | `manage_change_log` | text → AI draft (calls 6.2) |
| `POST /` | `manage_change_log` | create from confirmed draft |
| `PATCH /[id]` | `manage_change_log` | edit (writes revision) |
| `DELETE /[id]` | `manage_change_log` | soft delete (writes revision) |
| `GET /` | `view_change_log` | filtered list (page + table) |
| `GET /annotations` | `view_change_log` | entries for a date window/entity (charts) |

Conventions from existing routes: `export const runtime = "nodejs"`,
`dynamic = "force-dynamic"`, `maxDuration` raised on `/draft` (LLM + Meta calls),
`requirePermissionFromRequest` first, `jsonError` on failure.

## 7. AI grounding integration (Phase 2)

Two injection points, both build a user-message JSON before calling the model:

1. **Workbench** — `composeAnalysisWorkbenchNarrativeWithAI` in
   `src/lib/analysis-workbench-narrative.ts` (user message JSON ~line 26).
2. **Ask AI chat** — `answerExecutiveChat` in `src/lib/ai.ts` (user message JSON
   ~lines 180-185).

At each point:
- Call `getChangeLogEntriesForWindow` with the analysis's date range + brand +
  any entity ids already in context.
- Add a `changeLogEntries` array (compact: date, effective window, type, title,
  reason, before/after, entity names/ids) to the JSON.
- Add a `requirements` line instructing the model to cite a change-log entry by
  date/title when a metric movement coincides with one, and to never invent
  changes not in the list.
- Record `change_log_citations` for each entry actually included, keyed by the
  run id, so the page can show "Cited in N", and store the cited entry ids on the
  run result for traceability.

QA-gate note: the workbench QA gate checks for rendered sections; adding
grounding text must not strip required labels (`answer`, `source notes`, etc.).

## 8. Frontend

### 8.1 Page — `src/app/(workspace)/analyst/change-log/page.tsx`

Server component: `requirePagePermission("view_change_log", …)`, load initial
entries via the repo, render the client. Add a **Change Log** item to the Analyst
room in `src/components/v2/workspace-nav.tsx` (`ROOM_ITEMS.analyst`, permission
`view_change_log`).

### 8.2 Client — `src/components/change-log-client.tsx`

Consolidated direction (validated by the prototype):
- **Status sentence** first (e.g. "7 changes in the last 30 days. 4 cited by AI
  analysis."), recomputed from the active filter set.
- **Filter bar** reusing existing primitives: `FilterChipGroup`
  (`src/components/filter-chip-group.tsx`) for Brand and Type, a date-range
  control, and a search input for campaign/ad set. Consider `FilterBar`
  (`src/components/filter-bar.tsx`) for the active-chips + clear-all affordance.
- **View toggle** Timeline / Table over the *same* filtered entries (no second
  data source). Timeline = editorial date-grouped blocks; Table = dense lookup
  rows following the `team-metrics-table.tsx` pattern.
- **Add a change** opens the conversational capture panel inline (no modal, per
  DESIGN). Calls `POST /draft`, shows the live-verified confirm card, then
  `POST /`; on success the entry appears in the record. The chat is ephemeral.
- **Usage aside**: "Where this log shows up" + an Ask-AI-grounded example. It
  explains surfaces; it does **not** list entries (no duplication).
- Editorial system throughout: square corners, hairline rules, smallcaps
  eyebrows, oldstyle figures in prose / lining-tabular in money, **one** gilt
  mark per view, pink ≤10%.

### 8.3 Chart annotations (Phase 3)

Extend the dashboard time-series chart component(s) to overlay markers (point
events) and faint pink shaded bands (effective windows) sourced from
`GET /annotations`. Hover reveals the entry title/reason.

### 8.4 Signal-strip "Recent changes" panel (Phase 3)

A compact component on the Analyst dashboard listing the most recent active
entries (reusing the repo), each linking into the Change Log page. Read-only.

## 9. Testing

- **Repo / migration**: `npm run db:migrations:check`; unit tests for window
  intersection logic in `getChangeLogEntriesForWindow` (point vs ongoing vs
  closed window, boundary dates). Note the `node --test` extensionless-import
  gotcha for `src/lib/*.ts` — run full `npm test` after lib edits.
- **Capture**: tests for relative-date resolution, entity match/ambiguous/none,
  and the live-read-failure degrade path (mock `graphFetch`).
- **Permissions**: a `view_change_log` user cannot POST; an unauthenticated
  request is rejected; environment scoping holds.
- **Grounding**: a fixture run over a window containing one entry includes it in
  the model JSON and records a citation; the QA gate still passes.
- **UI**: filters narrow the single record; Timeline/Table render the same set;
  capture round-trips draft → confirm → list.

## 10. Risks & open items

- **Live-read coverage**: only ad sets/campaigns expose budget/status cheaply via
  Graph; creatives and account-level context won't have a live numeric check.
  Acceptable — `verify_value='na'` is honest.
- **Entity ambiguity**: duplicate ad-set names produce `ambiguous`; the confirm
  card must let the user pick. Don't auto-pick.
- **Citation accuracy**: only record a citation when an entry is actually placed
  in the model context, not merely fetched, so "Cited in N" stays truthful.
- **Spend strip on the page**: included as a compact strip, but the canonical
  annotation surface is the dashboards; can be feature-flagged off if it adds
  noise.
- **Honest empty/missing states**: missing live data shows as unavailable, never
  as a fake zero (per PRODUCT.md).
