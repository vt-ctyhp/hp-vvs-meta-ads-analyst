# Inbox assignment: manual assign + round-robin auto-assign

Design spec — 2026-05-28. Branch: `claude/wonderful-swirles-b9a704`.

## 1. Summary

Today the inbox has only two assignment moves: **claim to self** (`claim_self`) and
**release to the team queue** (`team_queue`). There is no way to assign a conversation to
*another* person, and nothing assigns work automatically — so almost everything sits
unassigned and the personal/team metrics headers (just shipped) read ~0 for everyone.

This feature adds:

1. **An `assign_to_user` primitive** — assign a conversation to a specific person. One
   primitive powers both manual assignment and auto-assignment.
2. **Manual assign UI** — an "Assign to…" picker in the Details-drawer Workflow section.
   Any inbox user may assign any conversation to any user (the `assignment_changed` audit
   records who did it).
3. **Round-robin auto-assign** — when a conversation is confidently categorized and
   unassigned, assign it to the next eligible, on-shift person who covers that category,
   using strict round-robin per category. Messages that arrive when nobody is on shift are
   held and swept onto coverers as they come online.

Every assignment emits the existing `assignment_changed` event, which feeds the personal
header and the team rollup — so this is what finally makes those metrics meaningful.

## 2. Goals / non-goals

**Goals**
- Assign-to-specific-user (manual) and round-robin auto-assign that respects per-category
  coverage and per-person working schedules.
- Reuse the existing team / coverage / metrics machinery; add the minimum new data.
- Strict adherence to the existing data-boundary security model (see §3).

**Non-goals (v1)**
- Reassigning a conversation that is already assigned (auto never touches assigned rows;
  manual reassign is always allowed).
- Re-routing an *assigned* conversation when its category changes (only still-unassigned
  ones are re-evaluated by the sweep).
- Least-loaded / capacity-aware balancing, SLA-driven escalation, shift rotations,
  presence/online detection. (Strict round-robin + weekly schedule only.)
- Auto-assigning uncategorized / low-confidence conversations (held for human triage).

## 3. Verified security model (checked, not assumed)

This was verified against the migrations and runtime code; the design must not deviate.

- **`public.users` is owned by sales-standalone-app-V1.** Its RLS targets `authenticated`
  sessions (self/admin/sales-roster read; admin-only write). There is **no grant of any
  kind on `public.users` to the `ads_analyst_*` roles.** The Meta Ads app must never write
  users; user creation/roster management stays in sales-app-V1.
- **User identity is read only through the view `analytics.ads_analyst_identity_profiles_v1`**
  (`app_user_id, auth_user_id, email, full_name, initials, active, roles`, selected
  `from public.users`), `grant select … to ads_analyst_web` (SELECT-only, web role only).
  This view is defined in the `ads_analyst_data_boundary` migration at versions with
  seconds=`00` → it is owned by **sales-standalone-app-V1**. It is already the path
  `app-auth.ts` uses under limited-access mode.
- **All new auto-assign data is Meta-Ads-owned**, environment-scoped, and granted to the
  `ads_analyst_*` roles via the same foundation grant/RLS pattern
  (`meta_inbox_foundation.sql` table loop: `grant insert, update, delete … to
  ads_analyst_web, ads_analyst_worker, ads_analyst_ingest`; per-row RLS
  `analytics.ads_analyst_environment_matches(environment)`). Meta-Ads migrations use
  seconds=`30`.
- **Consequence — names vs. logic split:** the assigner logic operates purely on
  `app_user_id`s from Meta-Ads-owned tables (no users dependency). User *names* are needed
  only for display on the web side and are resolved through the identity view (web role).
  The cron sweep (worker role) never needs names.

### 3a. Correction to already-shipped code (in scope here)
`getTeamRollup` ([inbox-metrics-db.ts](../../../src/lib/inbox-metrics-db.ts)) and the
team-member peek read `public.users` **directly** via the web client. This works today only
because default mode swaps in the service client; under `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=1`
the scoped `ads_analyst_web` role has no `users` grant and the read is denied. This spec
routes all such reads through `analytics.ads_analyst_identity_profiles_v1`, and includes
fixing the shipped reads.

## 4. Data model (new, Meta-Ads-owned, env-scoped, seconds=30 migrations)

1. **Eligibility:** add `auto_assign_eligible boolean not null default false` to
   `public.meta_inbox_team_members`. Pool membership for a category = active members of teams
   that cover the category (via `meta_inbox_team_queue_access`) **and** `auto_assign_eligible`.
   This lets leads/part-timers be excluded without removing them from the team.
2. **`public.meta_inbox_member_schedules`** — `(environment, app_user_id, weekday smallint
   0–6, start_time time, end_time time, …)`, one row per working weekday; a missing weekday =
   day off. **Timezone reuses `meta_inbox_user_preferences.timezone`** (already shipped) — no
   duplicate tz column. PK `(environment, app_user_id, weekday)`.
3. **`public.meta_inbox_assign_rotation`** — `(environment, queue_category_key,
   last_assigned_user_id uuid null, updated_at)`, PK `(environment, queue_category_key)`. The
   strict round-robin pointer per category.

All three follow the foundation grant/RLS pattern (env-scoped, ads_analyst-writable).

## 5. The `assign_to_user` primitive

- Extend `MetaInboxAssignmentMode` ([meta-inbox-workflow.ts](../../../src/lib/meta-inbox-workflow.ts))
  with `assign_to_user`, carrying a `targetUserId`. The workflow sets
  `next.assigned_user_id = targetUserId` and emits the same `assignment_changed` event
  (previous→next) — no new audit path.
- Extend the `updateAssignment` facade ([inbox-assignment.ts](../../../src/lib/inbox-assignment.ts))
  and the workflow API route to carry `targetUserId`. The facade's existing assertion (an
  `assignment_changed` event must be emitted) still applies.
- **Actor:** manual assigns record the acting user; auto-assigns record a **system actor**
  so the two are distinguishable in the audit log and in metrics.

## 6. Auto-assign decision engine (pure, unit-tested)

`pickAssignee(input)` — a pure function, no I/O:
- **Input:** category, candidate members (each: `app_user_id`, eligible flag, schedule rows,
  tz), `now`, current rotation pointer for the category.
- **Filters, in order:** covers category → `auto_assign_eligible` && active → **on-shift**
  (`now` falls within the user's window for `now`'s weekday, in the user's tz).
- **Pick:** strict round-robin — the next user after `last_assigned_user_id` in a stable
  ordering of the on-shift candidates (wraps; skips anyone now off-shift). Returns the chosen
  `app_user_id` and the new pointer value.
- **`isOnShift(scheduleRows, tz, now)`** helper does the weekday + tz window check (small,
  unit-tested; analogous to the `todaysWindow` logic in `business-hours.ts`).

## 7. Triggers (both call §6 then §5; both act only on unassigned + confidently-categorized)

- **Arrival hook:** after the ingest/normalization pipeline sets `queue_category_key` to a
  real (non-`uncategorized_needs_review`, high-enough-confidence) category on an unassigned
  conversation, run the assigner. If nobody is on shift, leave it unassigned (the sweep
  handles it).
- **Sweep:** `GET/POST /api/cron/inbox-auto-assign` (protected by `CRON_SECRET` via the
  existing `cron-auth.ts` pattern), scheduled ~every few minutes through the pg_cron + pg_net
  pattern already used by the metrics rollup. It finds unassigned + confidently-categorized
  conversations and assigns each to an on-shift coverer via round-robin — distributing the
  overnight backlog fairly as the team comes online.
- Both paths are idempotent: they only ever act on currently-unassigned rows.

## 8. Manual assign UI

- In the Details-drawer **Workflow** section ([details-drawer-panel.tsx](../../../src/components/v2/inbox/details-drawer-panel.tsx),
  where `claimSelf` / `returnToTeamQueue` already live): add an **"Assign to…"** picker over
  active inbox users (covering members surfaced first), → `assign_to_user`. Any user may
  assign to any user; the audit event records the actor.
- The picker's user list comes from `analytics.ads_analyst_identity_profiles_v1` (web role),
  filtered to `active`.

## 9. Admin UI (lead/admin)

A settings surface under the team view for leads/admins to:
- toggle each member's `auto_assign_eligible`,
- edit each member's weekly schedule (per-weekday start/end; blank = day off).

Writes go only to `meta_inbox_team_members` and `meta_inbox_member_schedules` (Meta-Ads-owned,
env-scoped). It never creates or edits `users` — the roster is managed in sales-app-V1. The
member list it edits is sourced from team membership + the identity view (names).

## 10. Metrics tie-in

Every assignment (manual or auto) emits `assignment_changed`, which already feeds:
- the personal header's "needs reply / at risk" (now non-zero once work is assigned), and
- the team rollup's "team claims" (C2).

Auto-assignments carry the system actor, so a future view could separate auto vs. human
claims; v1 counts both.

## 11. Edge cases / error handling

- No eligible on-shift coverer at arrival → stays unassigned; sweep retries.
- Already assigned → auto never touches it. Manual reassign always allowed.
- Conversation recategorized while still unassigned → sweep evaluates it under the new
  category. Once assigned, category changes do not re-route it.
- Assigner failure → logged; never blocks ingest or crashes the sweep (per-conversation
  try/catch).
- Rotation pointer references someone now off-shift → on-shift filter runs first; the pointer
  is only used to choose among current on-shift candidates.

## 12. Testing

- **Unit:** `pickAssignee` (coverage/eligible/on-shift filters; round-robin wrap + off-shift
  skip; empty pool), `isOnShift` (tz, weekday boundaries, day off, overnight-safe).
- **Migration-shape tests:** the three schema changes + `assign_to_user`.
- **Facade guard:** `assign_to_user` emits `assignment_changed`.
- **Identity-view routing:** unit/integration check that name lookups hit the view, not
  `public.users`.
- **Sweep route + arrival hook:** thin orchestration; integration-verified against real data.

## 13. Open items / follow-ups

- **Confidence threshold** for "confidently categorized" — reuse the existing routing
  confidence (e.g. the ~85% shown in the UI); exact field/threshold to confirm during
  planning.
- **Exact ingest categorization write point** for the arrival hook — to confirm during
  planning (the categorization step in the sync/normalization path).
- **Sweep cadence** (e.g. every 5 min) — tunable.
- Whether the identity view needs any added column — current columns
  (`app_user_id, full_name, active, roles`) are sufficient; if not, that is a sales-app-V1
  (seconds=`00`) change, not a Meta-Ads one.
