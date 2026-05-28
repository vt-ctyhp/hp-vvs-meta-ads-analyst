# Inbox metrics header & manager view — design

**Status:** approved through brainstorming, ready for implementation plan
**Date:** 2026-05-27
**Author:** Viv (via brainstorming session)
**Surface:** `/m/inbox` (replaces current status sentence) + new `/m/inbox/team` route

---

## 1. Summary

Replace the existing `"X waiting. Oldest Ym."` sentence at the top of `/m/inbox` with a metrics-driven header that surfaces 9 metrics across three lenses: **your pipeline**, **your performance today**, and **your team contribution today**. Add a manager dashboard at `/m/inbox/team` for users with `meta_inbox_team_members.role = 'lead'` that aggregates the same metrics per team member.

The header uses an **adaptive sentence + thin stat strip** layout (Hybrid). The sentence rewrites itself based on time of day, queue state, and recent performance — calm before hours, encouraging during hours, end-of-day summary after hours.

SLA is **3 business hours**, configured per `meta_inbox_queue_categories` (admin-editable in a follow-up), 7 days/week, no holidays. Personal metrics use the user's own timezone; conversation-level SLA clocks use the conversation's queue timezone.

Architecture: live snapshot reads for "right now" metrics, live aggregation for today's running metrics, materialized daily rollup table for yesterday and the manager-view period selector (today / yesterday / 7d / 30d). No realtime in v1.

---

## 2. Goals & non-goals

**Goals**
- Give each user immediate, useful, motivating signal at the top of their inbox.
- Make team-queue urgency visible to encourage claiming unassigned conversations.
- Give team leads a per-user rollup without leaving the inbox surface.
- Keep the design on-brand: Editorial Broadsheet — quiet, serif, decisive; pink reserved for urgency.

**Non-goals (v1)**
- No realtime / websocket updates on the header.
- No admin UI for editing queue business hours (raw SQL for v1).
- No holiday calendars.
- No per-user trend charts beyond avg response time in the per-user detail page.
- No removal of the legacy `read_at` column (that was completed in commit `eff9e78`; nothing to do).

---

## 3. Scope & current state

### Current state (relevant code locations)
- Inbox page: [src/app/m/inbox/page.tsx](../../../src/app/m/inbox/page.tsx) — currently shows `"X waiting. Oldest Ym."`.
- Detail: [src/app/m/inbox/[conversationId]/page.tsx](../../../src/app/m/inbox/[conversationId]/page.tsx).
- Server entry: `getSocialInboxData(profile)` in [src/lib/social-inbox.ts](../../../src/lib/social-inbox.ts) — server-rendered, `force-dynamic`, no React Query.
- Queue mapping: `buildMetaInboxMobileConversationItems(...)` in [src/lib/meta-inbox-queue-view.ts](../../../src/lib/meta-inbox-queue-view.ts).
- UI: [src/components/v2/inbox/queue-rail.tsx](../../../src/components/v2/inbox/queue-rail.tsx), [queue-row.tsx](../../../src/components/v2/inbox/queue-row.tsx), [conversation-detail.tsx](../../../src/components/v2/inbox/conversation-detail.tsx).
- Auth: `getServerAccessProfile()` in [src/lib/server-route-auth.ts](../../../src/lib/server-route-auth.ts) — backed by `analytics.ads_analyst_identity_profiles_v1` view; sales-standalone-app-V1 owns user writes.

### Data model already in place
- `meta_inbox_conversations` with `assigned_user_id`, `assigned_team_id`, `conversation_status`, `needs_reply`, `first_inbound_at`, `latest_inbound_at`, `latest_outbound_at`, `last_activity_at`, `reply_window_expires_at`, queue_category_id.
- `meta_inbox_send_attempts` with `approved_by` (user), `sent_at`, `status` ('approved' → 'queued' → 'sending' → 'sent' / 'failed_*'). Existing index on `(environment, conversation_id, created_at DESC)`.
- `meta_inbox_comment_actions` with `requested_by`, `completed_at`, `status` — for public/private comment replies.
- `meta_inbox_teams` + `meta_inbox_team_members` (`role ∈ {member, lead}`).
- `meta_inbox_queue_categories` (no hours columns yet).
- Conversation statuses: `new_inquiry | needs_reply | waiting_on_customer | follow_up_needed | appointment_scheduled | closed | lost_lead`.

### What this spec changes
- 3 new tables / 1 new index / 1 column-set addition (Section 6 — superseded down from 4; see §15.1).
- 3 new lib modules + 8 new components/routes (Section 8).
- 1 modified page + 2 lightly-modified components + 1 modified auth helper (Section 8).
- 1 daily cron + 2 backfill scripts (Section 7).

---

## 4. User experience

### 4.1 Personal header layout (Hybrid C, selected in brainstorm)

One adaptive sentence (the lede) on top of a thin stat strip. Editorial Broadsheet styling: serif type, hairline dividers, no #000/#fff, pink `#e91d79` reserved for at-risk numbers. Topline shows date + local time + business-hours-left.

Example (normal mid-day state):
```
Your Inbox · Wednesday, May 27          11:42 PT · 4h 18m of business day left

6 of your 50 need a reply — 2 are urgent. Avg 50m today, down 15. Keep going.

On time 92%  ·  Sent 14  ·  Team Q 8 waiting  ·  You claimed 3  ·  Oldest in queue 47m
```

### 4.2 Adaptive lede states

| State | Trigger | Lede copy |
|---|---|---|
| Normal | `needsReply > 0` during business hours | `"N of your M need a reply — K urgent. Avg Xm today, down/up Y. Keep going."` |
| All caught up | `needsReply == 0` during business hours | `"All caught up. N replies sent today."` |
| Slow start | `repliesSent == 0` and business hours started | `"Day's open. N of your M need a reply."` |
| Before hours | Now < `business_hours_start` in user's tz | `"Business hours start at 10. N from yesterday still need a reply."` |
| After hours | Now > `business_hours_end` in user's tz | `"Day's done. N replies sent, X% on-time. See you tomorrow."` |

Tone rule: trend delta in lede only when `|delta| ≥ 10 min` — otherwise no false precision.

### 4.3 Lead-only nudge

When `profile.teamLead === true` and any teammate has > 0 at-risk-or-breached conversations:

```
3 teammates over SLA today · view team →
```

Appears as a single line below the stat strip on `/m/inbox`. Links to `/m/inbox/team`.

**`teammatesOverSla` definition:** `COUNT(DISTINCT u.id)` for users `u` such that (`u.id IN profile.teamIds`'s members) AND (∃ conversation `c` with `c.assigned_user_id = u.id` AND `c.needs_reply = true` AND `businessSecondsRemainingUntil(c.breachAt, now, queueWindow) <= 1800`). Computed in `getPersonalHeaderMetrics` only when `profile.teamLead === true`; omitted otherwise so non-leads pay nothing.

### 4.4 Manager view at `/m/inbox/team`

Gated by `profile.teamLead`. Header: team name + period selector (Today default, Yesterday, Last 7 days, Last 30 days). Below: per-user table.

Columns per row (10):
- Name + role
- Open assigned (A1)
- Needs reply now (A2)
- At risk / breached (A3, pink)
- Avg first-response time, period (B1)
- On-time rate, period (B2)
- Replies sent, period (B3)
- Team-queue claims, period (C2)
- Oldest unanswered conversation age (live)
- Last active (last `sent_at` from `meta_inbox_send_attempts`)

Row click → opens read-only peek drawer (Section 4.5). Each row also has a "Full report" link → `/m/inbox/team/[userId]`.

### 4.5 Read-only peek

Slide-in drawer/sheet showing the teammate's inbox using the existing `<QueueRail>` and `<ConversationDetail>` components with `readOnly={true}`:
- No reply composer.
- No assign / snooze / status-change buttons.
- Pure visibility for coaching.

### 4.6 Per-user detail page at `/m/inbox/team/[userId]`

Gated by `profile.teamLead && targetUser.teamId IN profile.teamIds`. Same metric set, period selector, plus a single line chart of avg response over time pulled from `meta_inbox_metrics_daily`. Out of scope for v1: per-day on-time chart, claims chart.

---

## 5. Metric definitions (the math)

Each metric specifies source, business-hours rule, compute time, edge cases.

### A1 — Open assigned to you
- **SQL shape:** `COUNT(*) FROM meta_inbox_conversations WHERE environment=? AND assigned_user_id=me AND conversation_status NOT IN ('closed','lost_lead')`.
- **Compute:** live. Index needed: `(environment, assigned_user_id, conversation_status)`.

### A2 — Of those, needs reply
- Same scope as A1 + `AND needs_reply = true`.
- Live, same index.

### A3 — At risk or breached
- **At risk:** `needs_reply=true AND businessSecondsRemainingUntil(breachAt, now, queueWindow) BETWEEN 0 AND 1800`.
- **Breached:** `businessSecondsRemainingUntil(...) <= 0`.
- Displayed as one number (sum). Copy: "X at risk" — the action is the same either way.
- `breachAt = breachAt(latest_inbound_at, 3*3600, queueWindow)` — computed in app code (timezone math too messy for SQL).
- Live. Computed in JS over the (small) result set of A2.

### B1 — Avg time-to-first-response, today vs yesterday
- **Per conversation:** `businessSecondsBetween(firstInboundAt, firstOutboundAt, queueWindow)`.
- **`firstOutboundAt`:** `MIN(sent_at) FROM meta_inbox_send_attempts WHERE conversation_id=? AND approved_by=me AND status='sent'`.
- **Window for "today":** `sent_at` falls in user's tz today's business window.
- **Window for "yesterday":** `sent_at` falls in user's tz yesterday's full business window.
- **Today compute:** live aggregation, indexed by `(environment, approved_by, sent_at) WHERE status='sent'`.
- **Yesterday compute:** read from `meta_inbox_metrics_daily.avg_response_seconds`.
- **Edge cases:**
  - Zero replies today → display `—`, lede uses "Slow start" or "All caught up" copy.
  - Two-clock rule: business seconds use the **queue's** tz; bucketing into today/yesterday uses the **user's** tz.
  - Conversations whose `meta_inbox_conversations.first_inbound_at` is older than 7 days at reply time are excluded from B1's avg (a long-pending thread would distort the average and isn't representative of "today's responsiveness"). They still count in B3 (reply volume) and B2 (on-time — they're always late, so on-time rate honestly reflects what happened).

### B2 — On-time rate today
- `on_time_replies / total_replies` for the user, today.
- "On-time" = `businessSecondsBetween(firstInboundAt, firstOutboundAt, queueWindow) ≤ 3 hours`.
- SLA config read **as-of `sent_at`** = current config (no versioning in v1). Documented as: "hours changes apply going forward."
- Today: live. Yesterday/historical: rollup.

### B3 — Replies sent today
- Counts both:
  - `meta_inbox_send_attempts WHERE approved_by=me AND status='sent' AND sent_at IN <user's today business window>`
  - `meta_inbox_comment_actions WHERE requested_by=me AND status='completed' AND completed_at IN <user's today business window>`
- Live.

### C1 — Unassigned in team queue right now
- `COUNT(*) FROM meta_inbox_conversations WHERE environment=? AND assigned_user_id IS NULL AND conversation_status NOT IN ('closed','lost_lead')`.
- No team filter in v1 — users see the whole inbox.
- Live.

### C2 — Of today's unassigned arrivals, how many you claimed
- **Denominator:** conversations with `first_inbound_at` in user's tz today business window AND no assignment event before `first_inbound_at`.
- **Numerator:** subset where `meta_inbox_conversation_events` has a row with `event_type='assignment_changed'`, `(previous_value->>'assignedUserId') IS NULL`, `(new_value->>'assignedUserId')=me`, and `event_at` within today's business window. (See §15.1 for the canonical SQL.)
- **Display:** "3 of 10". If denominator = 0, hide the line.
- Today: live (joins). Yesterday/historical: rollup.

### C3 — Oldest unassigned age
- `MIN(first_inbound_at) FROM meta_inbox_conversations WHERE assigned_user_id IS NULL AND conversation_status NOT IN ('closed','lost_lead')`.
- Display: `businessSecondsBetween(min, now, queueWindow)` in business minutes.
- Live.

### Manager-view metrics
Same definitions as A1-A3, B1-B3, C2, applied per teammate. Period selector ∈ `today | yesterday | 7d | 30d` switches the time window. Today reads live + rollup, other periods read rollup.

---

## 6. Data model

Five migrations, all named with `XX`-second offset to coexist with sales-standalone-app-V1's `00`-second migrations on the shared ledger.

### 6.1 ~~New table `meta_inbox_assignment_events`~~ — superseded

> ⚠ **Superseded by §15.1.** The existing `meta_inbox_conversation_events` table with `event_type = 'assignment_changed'` already covers this. No new table; no migration to write. The original definition below is preserved for historical context only — do **not** implement it.

Audit trail for assignment changes. Drives C2 and the manager view's history.

```sql
CREATE TABLE meta_inbox_assignment_events (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  environment       text NOT NULL,
  conversation_id   uuid NOT NULL REFERENCES meta_inbox_conversations(id) ON DELETE CASCADE,
  prior_user_id     uuid,                              -- NULL = was unassigned
  prior_team_id     uuid,
  assigned_user_id  uuid,                              -- NULL = unassigning
  assigned_team_id  uuid,
  assigned_by       uuid NOT NULL,                     -- actor; = assigned_user_id for self-claim
  assigned_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX meta_inbox_assignment_events_user_at_idx
  ON meta_inbox_assignment_events (environment, assigned_user_id, assigned_at DESC);
CREATE INDEX meta_inbox_assignment_events_conv_at_idx
  ON meta_inbox_assignment_events (environment, conversation_id, assigned_at DESC);
```

**"Took on"** = `prior_user_id IS NULL AND assigned_user_id = me`.

**Backfill:** one row per existing `meta_inbox_conversations` where `assigned_user_id IS NOT NULL`, with `assigned_at = COALESCE(updated_at, created_at)`, `assigned_by = assigned_user_id`, `prior_user_id = NULL`.

### 6.2 Column additions on `meta_inbox_queue_categories`

```sql
ALTER TABLE meta_inbox_queue_categories
  ADD COLUMN timezone             text NOT NULL DEFAULT 'America/Los_Angeles',
  ADD COLUMN business_hours_start time NOT NULL DEFAULT '10:00:00',
  ADD COLUMN business_hours_end   time NOT NULL DEFAULT '19:00:00';

UPDATE meta_inbox_queue_categories
   SET timezone = 'Asia/Ho_Chi_Minh'
 WHERE slug LIKE 'vn_%';
```

### 6.3 New table `meta_inbox_user_preferences`

Inbox-owned, singleton per user. Sales-standalone-app-V1 owns user records, so we don't touch `public.users`.

```sql
CREATE TABLE meta_inbox_user_preferences (
  user_id     uuid PRIMARY KEY,                       -- meta_inbox_team_members.app_user_id (NOT auth.uid())
  timezone    text NOT NULL DEFAULT 'America/Los_Angeles',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
```

**Identity note:** `user_id` here is the `app_user_id` (matches `meta_inbox_team_members.app_user_id` and every inbox table keyed by user). It is **not** `auth.uid()` directly.

> ⚠ **See §15.2.** Do not create a new identity helper. Use the existing `public.current_app_user_id()` defined at [supabase/migrations/0001_identity.sql:33-44](../../../supabase/migrations/0001_identity.sql). Same file also exposes `public.current_user_has_role(p_role)` and `public.current_user_has_any_role(p_roles)` for permission checks.

All RLS predicates that reference "this user" use `public.current_app_user_id()`.

Read pattern from app code: `LEFT JOIN meta_inbox_user_preferences ON user_id = profile.id`, default `'America/Los_Angeles'` applied in app code if no row (`profile.id` is the app_user_id, already resolved by `getServerAccessProfile()`).

### 6.4 New table `meta_inbox_metrics_daily`

```sql
CREATE TABLE meta_inbox_metrics_daily (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  environment            text NOT NULL,
  user_id                uuid NOT NULL,
  date                   date NOT NULL,                  -- in user's timezone at rollup time
  timezone               text NOT NULL,                  -- snapshot of user's tz on rollup day
  avg_response_seconds   integer,                        -- nullable: no replies that day
  on_time_replies        integer NOT NULL DEFAULT 0,
  total_replies          integer NOT NULL DEFAULT 0,
  team_claims            integer NOT NULL DEFAULT 0,
  breached_at_eod        integer NOT NULL DEFAULT 0,
  computed_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX meta_inbox_metrics_daily_user_date_idx
  ON meta_inbox_metrics_daily (environment, user_id, date);
CREATE INDEX meta_inbox_metrics_daily_date_idx
  ON meta_inbox_metrics_daily (environment, date DESC);
```

### 6.5 Index on `meta_inbox_send_attempts`

```sql
CREATE INDEX meta_inbox_send_attempts_approved_sent_idx
  ON meta_inbox_send_attempts (environment, approved_by, sent_at)
  WHERE status = 'sent';
```

### 6.6 Enable `pg_cron`

```sql
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
```

Confirmed available on the project (default_version 1.6.4, currently not installed).

---

## 7. Architecture & data flow

### 7.1 New lib modules

**`src/lib/business-hours.ts`** — pure functions, no I/O. Single source of truth for SLA arithmetic.

```ts
type BusinessWindow = { tz: string; startHour: number; endHour: number };  // 7d/week, no holidays

export function businessSecondsBetween(from: Date, to: Date, w: BusinessWindow): number;
export function businessSecondsRemainingUntil(deadline: Date, now: Date, w: BusinessWindow): number;
export function breachAt(arrivedAt: Date, slaSeconds: number, w: BusinessWindow): Date;
export function todaysWindow(now: Date, w: BusinessWindow): { start: Date; end: Date; state: 'before' | 'open' | 'after' };
export function yesterdaysWindow(now: Date, w: BusinessWindow): { start: Date; end: Date };
```

Used by both personal header (user's tz) and per-conversation SLA clock (queue's tz). Tested without a DB.

**`src/lib/inbox-metrics.ts`** — the metrics layer. Pure Supabase reads + business-hours math.

```ts
export type PersonalHeaderMetrics = {
  windowState: 'before_hours' | 'open' | 'after_hours';
  user:     { id: string; timezone: string; businessSecondsRemainingToday: number };
  pipeline: { assigned: number; needsReply: number; atRisk: number };           // A1–A3
  today:    { avgResponseSec: number | null; onTimeRate: number | null; repliesSent: number }; // B1–B3
  yesterday:{ avgResponseSec: number | null };                                   // from rollup
  team:     {
    unassigned: number;                       // C1
    claimedByMe: number;                      // C2 numerator
    todayUnassignedDenominator: number;       // C2 denominator
    oldestUnassignedSec: number | null;       // C3
    teammatesOverSla?: number;                // present only when profile.teamLead === true; drives <LeadNudge />
  };
};

export type Period = 'today' | 'yesterday' | '7d' | '30d';

export type TeamRow = {
  userId: string;
  name: string;
  role: string;
  assigned: number;        needsReply: number;   atRisk: number;
  avgResponseSec: number|null; onTimeRate: number|null; repliesSent: number;
  teamClaims: number;
  oldestUnansweredSec: number|null;
  lastActiveAt: Date|null;
};

export type TeamRollup = { period: Period; teamName: string; rows: TeamRow[] };

export async function getPersonalHeaderMetrics(profile, now): Promise<PersonalHeaderMetrics>;
export async function getTeamRollup(profile, period, now): Promise<TeamRollup>;
export async function getUserDailyHistory(userId, period, environment): Promise<DailyHistoryRow[]>;
```

**`src/lib/inbox-assignment.ts`** — the only sanctioned mutation path.

```ts
export async function updateAssignment(
  conversationId: string,
  next: { user_id: string | null; team_id: string | null; actor_id: string }
): Promise<void>;
```

> ⚠ **Adapted per §15.1.** The existing workflow at [src/lib/meta-inbox-workflow.ts:131-141](../../../src/lib/meta-inbox-workflow.ts) already writes an `assignment_changed` event into `meta_inbox_conversation_events` on every assignment mutation. `updateAssignment()` therefore is a thin facade that delegates to the workflow's mutation function and asserts the event was emitted — it does **not** write to a parallel audit table. Every existing assignment mutation site is migrated to route through this facade.

### 7.2 Page wiring

[src/app/m/inbox/page.tsx](../../../src/app/m/inbox/page.tsx):

```ts
const [inbox, metrics] = await Promise.all([
  getSocialInboxData(profile),
  getPersonalHeaderMetrics(profile, new Date()),
]);
return <>
  <InboxMetricsHeader metrics={metrics} />
  {profile.teamLead && metrics.team.teammatesOverSla > 0 && <LeadNudge count={...} />}
  <QueueRail items={...} />
</>;
```

[src/app/m/inbox/team/page.tsx](../../../src/app/m/inbox/team/page.tsx) (new):

```ts
if (!profile.teamLead) notFound();
const rollup = await getTeamRollup(profile, period, new Date());
return <TeamMetricsDashboard rollup={rollup} period={period} />;
```

### 7.3 Daily rollup cron

`pg_cron` runs **every 15 minutes** invoking SQL function `compute_inbox_metrics_daily_for_tz(tz text)` for each distinct timezone present in `meta_inbox_user_preferences` (plus the default `America/Los_Angeles` for users with no preference row). The function:

- Determines `current_date` and `current_time` in the given tz.
- If `current_time` is between 00:00 and 00:30 in that tz, computes a row for `current_date - 1` for every user whose effective tz matches. Otherwise no-op for that tz.
- Iterating over distinct timezones (not hardcoded PT/ICT) means future timezones added via user preferences are handled automatically.
- Idempotent: `INSERT … ON CONFLICT (environment, user_id, date) DO UPDATE`.
- Business-time math is implemented in a single `business_seconds_between(from_ts, to_ts, tz, start_time, end_time)` PL/pgSQL function whose semantics are kept in lockstep with `business-hours.ts` via cross-tested fixtures (same input/output table tested both in JS and SQL).

**Backfill scripts** (one-shot, in `scripts/`):
- `scripts/backfill-inbox-assignment-events.ts` — seeds historical assignment_events.
- `scripts/backfill-inbox-metrics-daily.ts` — loops `(user, date)` since 2026-01-01 (cutoff configurable), invokes the same SQL function per date.

### 7.4 Refresh model

- Page load only in v1.
- Header is a Server Component; revalidates on navigation.
- Deferred: a 60s client-side soft refetch on header only, behind a separate flag.

---

## 8. UI components & file structure

> ⚠ **See §15.3 for the concrete render diff.** `InboxEyebrow` and `InboxStatusSentence` are **replaced** (not built alongside). `InboxHealthRow` and `InboxLayoutShell` are **kept**. The new `InboxMetricsHeaderStrip` **must absorb the sync button** currently inside `InboxEyebrow` or production loses the sync affordance. `metrics-header.tsx` as a wrapper component is dropped — the Lede + Strip render directly in `social-inbox-client.tsx`.

### 8.1 New files

| Path | Purpose |
|---|---|
| `src/components/v2/inbox/metrics-header.tsx` | Hybrid (C) layout wrapper. Server component. |
| `src/components/v2/inbox/metrics-header-lede.tsx` | Adaptive sentence. Pure function of `metrics` → JSX. 5 states. |
| `src/components/v2/inbox/metrics-header-strip.tsx` | Thin stat row beneath the lede. |
| `src/components/v2/inbox/lead-nudge.tsx` | Lead-only "N teammates over SLA · view team →" line. |
| `src/app/m/inbox/team/page.tsx` | Manager dashboard route. |
| `src/components/v2/inbox/team-metrics-table.tsx` | Per-user table with click-to-peek. |
| `src/components/v2/inbox/team-member-peek.tsx` | Drawer with read-only inbox. |
| `src/app/m/inbox/team/[userId]/page.tsx` | Per-user detail page with trend chart. |
| `src/components/v2/inbox/team-trend-chart.tsx` | Avg-response line chart from daily rollup. |
| `src/lib/business-hours.ts` | Pure SLA / business-time utility. |
| `src/lib/inbox-metrics.ts` | All metric computation. |
| `src/lib/inbox-assignment.ts` | Sole sanctioned assignment-mutation helper. |

### 8.2 Modified files

| Path | Change |
|---|---|
| `src/app/m/inbox/page.tsx` | Drop `"X waiting. Oldest Ym."` sentence; render `<InboxMetricsHeader />` + optional `<LeadNudge />`. |
| `src/components/v2/inbox/queue-rail.tsx` | Accept optional `readOnly` prop; hide mutation buttons when true. |
| `src/components/v2/inbox/conversation-detail.tsx` | Accept optional `readOnly` prop; hide reply composer + status/assign actions when true. |
| `src/lib/server-route-auth.ts` | Extend profile with `teamLead: boolean` and `teamIds: string[]` from `meta_inbox_team_members` join. |
| Existing assignment-mutation sites in `src/lib/social-inbox.ts` (and any others discovered) | Route through `updateAssignment()`. |

### 8.3 Component contracts (small, explicit)

- `<InboxMetricsHeader metrics={PersonalHeaderMetrics} />` — dumb renderer.
- `<MetricsHeaderLede metrics={...} />` — picks one of 5 adaptive states; each state a separate exported function for direct testing.
- `<TeamMetricsTable rows={TeamRow[]} period={Period} onSelectUser={(id) => void} />`.
- `<TeamMemberPeek userId={uuid} onClose={() => void} />` — loads its own data via server action with Suspense.

### 8.4 ReadOnly enforcement

A `ReadOnlyContext` + `useReadOnly()` hook. Every mutation button in the inbox tree calls `useReadOnly()` and self-hides when true. New mutation buttons added later don't need to know about peek — they just have to obey the hook.

---

## 9. Permissions & RLS

> ⚠ **Superseded model — see §15.9.** DB-layer RLS scopes by role + environment only (matching existing inbox tables); the per-user/per-team predicates below are advisory defense-in-depth. The authoritative boundary is the server-action layer. This was a deliberate user decision to stay consistent with the codebase's auth model.

### `meta_inbox_conversation_events` (used for assignment audit per §15.1)

> ⚠ **Use existing table.** Original spec proposed a new `meta_inbox_assignment_events` table; superseded — see §15.1. RLS for the existing table is already in place from migration `20260523090000`. No new policies needed. The existing workflow at [src/lib/meta-inbox-workflow.ts:131-141](../../../src/lib/meta-inbox-workflow.ts) is the sanctioned writer; the `inbox-assignment.ts` facade ensures all assignment mutation sites route through it (§7.1).

### `meta_inbox_user_preferences`
- **SELECT:** caller owns the row OR caller is a lead in the target's team:
  ```sql
  user_id = public.current_app_user_id()
  OR EXISTS (
    SELECT 1
      FROM meta_inbox_team_members lead
      JOIN meta_inbox_team_members target ON target.team_id = lead.team_id
     WHERE lead.app_user_id = public.current_app_user_id()
       AND lead.role = 'lead'
       AND target.app_user_id = meta_inbox_user_preferences.user_id
  )
  ```
- **INSERT / UPDATE:** `user_id = public.current_app_user_id()` only.
- **DELETE:** forbidden in v1.

### `meta_inbox_metrics_daily`
- **SELECT:** caller owns the row OR caller is *any* lead (`EXISTS (SELECT 1 FROM meta_inbox_team_members WHERE app_user_id = public.current_app_user_id() AND role = 'lead')`). Team narrowing happens in the server action layer (`getTeamRollup` filters by `profile.teamIds`) — keeps the RLS predicate simple and fast.
- **INSERT / UPDATE:** `service_role` only (cron + backfill).
- **DELETE:** forbidden.

### `meta_inbox_queue_categories` (column additions)
- Existing policies preserved. No new write surface in v1.

### Existing permissions reused
- `view_inbox` — existing.
- `send_inbox_reply` — existing.
- `manage_inbox_state` — existing.
- No new permissions added in v1 — the lead check is structural (`meta_inbox_team_members.role = 'lead'`).

---

## 10. Rollout plan

Phased; each phase is reversible.

1. **Migrations PR** — all 5 migrations + `pg_cron` enable + RLS policies. Shipped behind no flag; pure schema. Verify on staging via `list_tables` and a smoke query.
2. **Backfill PR** — both backfill scripts. Run on staging, verify counts, then on prod.
3. **Server-action + lib PR** — `business-hours.ts`, `inbox-metrics.ts`, `inbox-assignment.ts`, profile extension. All assignment sites migrated to `updateAssignment()`. ESLint rule banning direct `assigned_user_id` updates. No UI change.
4. **UI PR** — new header + components, gated by env flag `INBOX_METRICS_HEADER_ENABLED`. Flag off = old sentence. Flag on for self only first.
5. **Manager view PR** — `/m/inbox/team` route + components. Naturally gated by `teamLead`. No flag needed.
6. **Cutover** — flip flag on for all, monitor for 1 week.
7. **Cleanup PR** — delete flag, delete old sentence code path, delete unread-related dead code if still hanging around.

Rollback per phase: revert PR. Migrations are additive (no drops); even if everything later reverts, the schema additions are harmless.

---

## 11. Testing strategy

### Unit tests (high coverage required)
- `business-hours.ts` — extensive. Test matrix: PT & ICT timezones × before/during/after hours × overnight rollover × DST boundary (March 9 / Nov 2) × midnight edge × negative remaining time (breached).
- `metrics-header-lede.tsx` — one test per adaptive state (5 tests) + trend-delta threshold tests (Δ = 9, 10, 11 minutes).
- `inbox-assignment.ts` — transaction atomicity (conversation update + event insert both succeed or both rollback).

### Integration tests
- Per-metric: seed a fixture (3 users, 2 queues with different tz, 20 conversations spanning yesterday + today), call `getPersonalHeaderMetrics`, assert each of A1–C3.
- Two-clock rule: VN-queue conversation + PT user; assert business-second math uses ICT, bucketing uses PT.
- Mixed-queue user: 5 PT-queue + 5 VN-queue conversations, single user's header — assert today/yesterday split bucketed in user's tz.
- Zero-state: user with 0 assigned, 0 replies; assert `null` displays as `—` and lede picks "Slow start" or "All caught up" correctly.
- Manager view happy path: 3 users, 2 days of seed data, period=today and period=7d.

### Migration tests
- Spin up schema, run `assignment_events` backfill, assert row count = `COUNT(*) FROM meta_inbox_conversations WHERE assigned_user_id IS NOT NULL`.
- Run `metrics_daily` backfill for 7 days; assert at least one row per active user per day.
- pg_cron schedule lookup: assert the daily job exists with the right schedule string.

### Manual QA
- Eyeball each adaptive lede state by setting clock + seeding fixtures.
- Manager view drill-in: confirm read-only — every mutation control hidden.
- Mobile responsive: stat strip wraps gracefully on narrow viewport.

---

## 12. Risks

- **Assignment mutation site missed.** A future PR sets `assigned_user_id` directly, bypassing `updateAssignment()` → claims count drifts.
  **Mitigation:** ESLint rule banning direct UPDATEs + Supabase trigger that errors on UPDATE of `assigned_user_id` without a matching event row (belt + suspenders).
- **VN Promotions ambiguity.** User mentioned this on Q4; no matching queue category in the enum. Could be a campaign tag.
  **Mitigation:** treat all `vn_*` slugs as ICT for v1; raise as a follow-up clarification.
- **SLA config has no version history.** Changing hours mid-day affects how we judge "on-time" for already-sent replies.
  **Mitigation:** documented behavior — changes apply going forward. Admin runbook note.
- **Cross-timezone daily rollup edge.** A VN user's "yesterday" closes at a different real-time moment than a PT user's. The single midnight-PT cron leaves VN users with a stale "yesterday" for ~14h.
  **Mitigation:** the cron iterates over distinct user timezones (PT + ICT for v1). Each pass uses its own `target_date`.
- **Read-only peek prop drilling.** Future mutation child component forgets to consume `useReadOnly()` → manager can mutate teammate's inbox.
  **Mitigation:** single `ReadOnlyContext` + hook. Code review checklist item. Unit test: render peek, assert no mutation buttons present.
- **Manager view N+1 queries.** Per-row metrics across a 10-user team = 90 metric calls if naïve.
  **Mitigation:** `getTeamRollup` is one query per metric kind, scoped by `WHERE user_id IN (...)` with GROUP BY. Bench on a 25-user fixture during integration tests.

---

## 13. Open follow-ups (deferred, not in this scope)

- Admin UI for editing `meta_inbox_queue_categories` business hours.
- Holiday calendar support.
- Realtime updates on the header (Supabase channel on `meta_inbox_send_attempts` + assignment_events).
- Per-user trend charts for on-time % and claims/day (v1 only does avg response).
- "VN Promotions" clarification — is it a real queue category or a campaign tag?
- Versioned SLA config so historical on-time math survives policy changes.
- Per-team queue scoping (v1 = global team queue; v2 might scope by team membership).
- **Mobile metrics header** — render the header on the mobile `src/app/m/inbox/page.tsx` list surface (v1 is desktop-only per §15.10).
- **True DB-layer per-user RLS** — if the auth model ever moves to `authenticated` + `auth.uid()` JWTs, revisit §15.9 to push per-user enforcement into the database.

---

## 14. Appendix — decisions captured during brainstorming

| # | Decision | Reasoning |
|---|---|---|
| Q1 | 3h business-hours SLA, subject to change | User-stated baseline |
| Q1 | Business hours 10–7 PT default, 10–7 ICT for VN | User-stated |
| Q2 | Metrics included: A1, A2, A3, B1, B2, B3, C1, C2, C3 | User confirmed full set |
| Q3 | Add `meta_inbox_assignment_events` table | Audit trail needed for manager view + accurate "took on" attribution |
| Q4 | Business-hours-only window | Avoids overnight skew in averages |
| Q4 | 7 days/week, all holidays open | User-stated |
| Q4 | Per-queue admin-adjustable hours | User-stated, attached to `meta_inbox_queue_categories` |
| Q4 | Personal metrics in user's own timezone | Easier reasoning for user; conversation SLA still uses queue tz |
| Q5 | Separate `/m/inbox/team` route | Cleaner mental model; extends to date range / export |
| Q5 | `meta_inbox_team_members.role = 'lead'` gates manager view | Existing data model |
| Q5 | Today default + selector for yesterday / 7d / 30d | User-stated |
| Q5 | Click row → read-only peek + "Full report" link | Both — best for coaching |
| Q6 | Layout: Hybrid C (sentence + strip) | User-selected from mockups |
| § | Approach 3: live snapshot + materialized history | Avoids trigger complexity, scales for manager view |
| § | B3 counts both `send_attempts` (sent) + `comment_actions` (completed) | User-confirmed |
| § | SLA config not versioned in v1 | User-accepted tradeoff |
| § | User table is read-only — new `meta_inbox_user_preferences` owned here | Cross-app boundary with sales-standalone-app-V1 |
| § | Unread/read_at removal already shipped (commit eff9e78); out of scope here | Verified against main |
| § | pg_cron available and confirmed | Will be enabled via migration |
| §15 | Reuse `meta_inbox_conversation_events` instead of new table | Verified existing infra |
| §15 | Reuse `public.current_app_user_id()` instead of new helper | Verified existing infra |
| §15 | Replace `InboxEyebrow` + `InboxStatusSentence`; keep `InboxHealthRow` + `InboxLayoutShell` | Verified current chrome |
| §15 | Reuse `buildMetaInboxManagerDashboard.byAssignee` for team rollup | Avoids parallel aggregation |

---

## 15. Amendments after schema verification (2026-05-27)

After §1–§14 were approved, a deeper Opus-grade schema/code verification turned up existing infrastructure that supersedes parts of §6–§9. **Where §15 conflicts with earlier sections, §15 wins.** Affected sections carry inline notes pointing here.

### 15.1 Reuse `meta_inbox_conversation_events` — do not create `meta_inbox_assignment_events`

[supabase/migrations/20260523090000_meta_inbox_foundation.sql:276-302](../../../supabase/migrations/20260523090000_meta_inbox_foundation.sql) already defines an append-only audit table whose `event_type` CHECK constraint includes `'assignment_changed'`. Schema:

```sql
public.meta_inbox_conversation_events (
  id uuid PRIMARY KEY,
  environment text NOT NULL,                  -- 'production' | 'staging'
  conversation_id uuid NOT NULL REFERENCES meta_inbox_conversations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'conversation_created', 'assignment_changed', 'status_changed',
    'lead_quality_changed', 'inbox_outcome_changed', 'routing_changed',
    'follow_up_changed', 'contact_method_changed', 'comment_action',
    'send_attempt', 'note_added', 'qa_scorecard_added'
  )),
  actor_user_id uuid,                         -- = assigned_by for assignment events
  dedupe_key text,
  event_at timestamptz NOT NULL DEFAULT now(),
  previous_value jsonb,                       -- { assignedUserId, assignedTeamId } for assignment
  new_value jsonb,                            -- { assignedUserId, assignedTeamId } for assignment
  metadata jsonb NOT NULL DEFAULT '{}'
)
```

Existing indexes:
- `meta_inbox_conversation_events_dedupe_idx` UNIQUE `(environment, dedupe_key)`
- `meta_inbox_conversation_events_lookup_idx` `(environment, conversation_id, event_at DESC)`
- `meta_inbox_conversation_events_type_idx` `(environment, event_type, event_at DESC)` — **covers C2's "claims today" query**

Existing writer: [src/lib/meta-inbox-workflow.ts:131-141](../../../src/lib/meta-inbox-workflow.ts) emits an `assignment_changed` event on every assignment mutation with `previous_value = {assignedUserId, assignedTeamId}` and `new_value = {assignedUserId, assignedTeamId}`. The audit drawer [src/components/v2/inbox/audit-drawer-panel.tsx:103-109](../../../src/components/v2/inbox/audit-drawer-panel.tsx) already renders these.

**Amendments to §6.1:** drop the migration. The substrate exists.

**Amendments to §7.1's `inbox-assignment.ts`:** still build the helper, but its job changes — instead of writing to a new audit table, it ensures every caller routes through `meta-inbox-workflow`'s existing event-emission path. Concretely, `updateAssignment()` becomes a thin facade that calls the workflow's mutation function and asserts the event was emitted.

**Canonical C2 query** (replaces §5/C2's pseudo-SQL):

```sql
SELECT COUNT(*)
  FROM meta_inbox_conversation_events e
 WHERE e.environment = $1
   AND e.event_type  = 'assignment_changed'
   AND e.event_at >= $2                              -- user's today business-start in user's tz
   AND (e.previous_value->>'assignedUserId') IS NULL
   AND (e.new_value->>'assignedUserId') = $3;        -- target user
```

**Deferred:** if JSONB extraction shows up as slow under production load, add a partial expression index:
```sql
CREATE INDEX meta_inbox_conv_events_new_user_idx
  ON meta_inbox_conversation_events ((new_value->>'assignedUserId'), event_at)
  WHERE event_type = 'assignment_changed';
```
This is a non-breaking follow-up — not required for v1.

### 15.2 Reuse `public.current_app_user_id()` — do not create a new identity helper

[supabase/migrations/0001_identity.sql:33-44](../../../supabase/migrations/0001_identity.sql) already provides three helpers:

```sql
public.current_app_user_id() RETURNS uuid                       -- = app_user_id for auth.uid()'s user
public.current_user_has_role(p_role text) RETURNS boolean
public.current_user_has_any_role(p_roles text[]) RETURNS boolean
```

**Amendments to §6.3:** drop the previously-spec'd new helper. Use `public.current_app_user_id()` everywhere.

**Amendments to §9 (RLS):** all predicates that reference "this user" use `public.current_app_user_id()`. The revised `meta_inbox_user_preferences.SELECT` predicate is:

```sql
user_id = public.current_app_user_id()
OR EXISTS (
  SELECT 1
    FROM meta_inbox_team_members lead
    JOIN meta_inbox_team_members target ON target.team_id = lead.team_id
   WHERE lead.app_user_id  = public.current_app_user_id()
     AND lead.role         = 'lead'
     AND target.app_user_id = meta_inbox_user_preferences.user_id
)
```

`meta_inbox_metrics_daily.SELECT` mirrors with the lead clause `EXISTS (SELECT 1 FROM meta_inbox_team_members WHERE app_user_id = public.current_app_user_id() AND role = 'lead')`.

### 15.3 Header replacement target — concrete render diff

Current render at [src/components/social-inbox-client.tsx:393-403](../../../src/components/social-inbox-client.tsx):

```
<section max-w-7xl>
  <InboxEyebrow dashboard syncRun ... />        ← REPLACE
  <InboxHealthRow status syncRun />              ← KEEP (sync-health, orthogonal to metrics)
  <InboxStatusSentence queue={queue} />          ← REPLACE
</section>
<InboxLayoutShell ... />                          ← KEEP (pure grid)
```

After this design lands:

```
<section max-w-7xl>
  <InboxMetricsHeaderLede metrics={metrics} />                          ← NEW
  <InboxMetricsHeaderStrip metrics={metrics}
    onSync={onSync} isSyncing={isSyncing} syncDisabled={syncDisabled}
    syncRun={syncRun} />                                                ← NEW (absorbs sync button)
  <InboxHealthRow status={status} syncRun={syncRun} />                  ← KEEP
  {profile.teamLead && metrics.team.teammatesOverSla > 0 && (
    <LeadNudge teammatesOverSla={metrics.team.teammatesOverSla} />      ← NEW
  )}
</section>
<InboxLayoutShell ... />                                                 ← KEEP
```

**Critical constraint:** the sync button currently lives inside `InboxEyebrow`. The new strip MUST absorb its props (`onSync`, `isSyncing`, `syncDisabled`, `syncRun`) and render the sync affordance. Losing it would regress production. Suggested placement: right edge of the strip, label like "Sync · last 2m ago".

**Amendments to §8.1:** the new components are `InboxMetricsHeaderLede`, `InboxMetricsHeaderStrip`, `LeadNudge`. The old `InboxEyebrow` and `InboxStatusSentence` are deleted (along with their imports in `social-inbox-client.tsx`). `InboxHealthRow` and `InboxLayoutShell` are untouched.

### 15.4 Reuse `buildMetaInboxManagerDashboard` for `/m/inbox/team`

The team route does NOT build a parallel rollup. It calls existing `buildMetaInboxManagerDashboard(data, options)` to get `byAssignee[]` rows (already grouped by `assigned_user_id`) with:

```ts
type ManagerDashboardAssigneeRow = {
  assigneeUserId: string | "unassigned";
  totalConversations: number;
  needsReply: number;
  missedFollowUps: number;
  failedSends: number;
  averageFirstResponseMinutes: number | null;   // wall-clock — see §15.6
};
```

`inbox-metrics.ts/getTeamRollup` adds adjunct, business-hours-aware fields on top:

```ts
async function getTeamRollup(profile, period, now): Promise<TeamRollup> {
  const dashboard = await buildMetaInboxManagerDashboard(data, { period });

  return {
    period,
    teamName: ...,
    rows: dashboard.byAssignee.map(row => ({
      ...row,
      avgResponseSec:    await businessHoursAvgResponse(row.assigneeUserId, period),
      onTimeRate:        await onTimeRate(row.assigneeUserId, period),
      teamClaims:        await claimsCount(row.assigneeUserId, period),
      oldestUnansweredSec: oldestForAssignee(row.assigneeUserId),
      atRisk:            await atRiskCount(row.assigneeUserId),
    })),
  };
}
```

Net effect: `getTeamRollup` shrinks from ~250 lines to ~50.

### 15.5 `meta_inbox_team_members.app_user_id` is bare uuid; no seed members

Verified schema:

```sql
public.meta_inbox_team_members (
  id uuid PRIMARY KEY,
  environment text,
  team_id uuid NOT NULL REFERENCES meta_inbox_teams(id) ON DELETE CASCADE,
  app_user_id uuid NOT NULL,                       -- NOT a FK
  role text NOT NULL CHECK (role IN ('member','lead')) DEFAULT 'member',
  created_at timestamptz, updated_at timestamptz,
  UNIQUE (team_id, app_user_id)
)
```

`app_user_id` does not reference `public.users`. The team route must `LEFT JOIN public.users ON public.users.id = meta_inbox_team_members.app_user_id` and tolerate join-nulls (display "Unknown" / placeholder).

No `meta_inbox_team_members` seed exists. `/m/inbox/team` must render a distinct empty-state when zero team rows return (acceptance test required).

### 15.6 Existing 5 eyebrow metrics are wall-clock — preserve elsewhere, replace on `/m/inbox`

`InboxEyebrow`'s `needsReply / unassigned / stale / medianFirst / qaAvg` computed in [src/lib/meta-inbox-manager-dashboard.ts:193-213](../../../src/lib/meta-inbox-manager-dashboard.ts) are wall-clock over the filter range (default 30 days), no business-hours adjustment. Our new metrics replace them on `/m/inbox`. The dashboard module itself stays — used on `/m/inbox/team` for aggregate panels (e.g., "stale" remains a useful 48h-wall-clock signal in the team rollup's top strip).

### 15.7 `business-hours.ts` is greenfield (unchanged)

Grep for `businessHours / businessTime / slaClock / business_hours` returns zero hits in `src/`. The module is greenfield as originally specified in §7.1.

### 15.8 `california-time.ts` co-locates

Existing [src/lib/california-time.ts](../../../src/lib/california-time.ts) (39 lines) provides `CALIFORNIA_TIME_ZONE`, `formatCaliforniaDateTime`, `californiaDateString`. New `src/lib/business-hours.ts` lives next to it and imports `CALIFORNIA_TIME_ZONE` as the default `tz` constant for `BusinessWindow`.

### 15.9 RLS is role+environment scoped at the DB; per-user/per-team narrowing is enforced in the app layer (user decision 2026-05-27)

**Verified reality:** existing inbox tables are not protected by `authenticated` + `auth.uid()` policies. They use scoped JWT roles (`ads_analyst_web`, `ads_analyst_worker`, `ads_analyst_ingest`) plus `analytics.ads_analyst_environment_matches(environment)`. In those connections `public.current_app_user_id()` returns `NULL`, so a `user_id = public.current_app_user_id()` policy would deny everything rather than scope per-user — DB-layer per-user RLS as described in §9/§15.2 **does not work in this codebase's auth model.**

**User decision (approved 2026-05-27):** match the existing pattern. The new tables (`meta_inbox_user_preferences`, `meta_inbox_metrics_daily`) get RLS policies that:
- Grant `SELECT` to the scoped roles with `analytics.ads_analyst_environment_matches(environment)` (same as `meta_inbox_conversations`).
- Restrict `INSERT`/`UPDATE` on `meta_inbox_metrics_daily` to the worker/service role (cron + backfill).
- Allow `INSERT`/`UPDATE` on `meta_inbox_user_preferences` from the web role.

**Per-user and per-team narrowing is enforced in the server-action layer**, not RLS:
- `getPersonalHeaderMetrics` only ever queries `user_id = profile.appUserId`.
- `getTeamRollup` filters to `profile.teamIds` and asserts `profile.teamLead`.
- `getInboxForUser` (peek) asserts `profile.teamLead && targetUser ∈ profile.teamIds` before running.
- The `/m/inbox/team` route calls `notFound()` for non-leads.

The spec's `public.current_app_user_id()`-based predicates in §9/§15.2 are retained **only as harmless defense-in-depth** where they don't break access; the authoritative guarantee is the app layer. This is consistent with how every other inbox surface in the codebase is secured.

> **Amendment to §9 and §15.2:** the DB layer no longer claims per-user enforcement. Treat §9's per-user/per-team predicates as advisory; the real boundary is the server-action assertions listed above.

### 15.10 v1 is desktop-only; mobile header is a fast follow-up (user decision 2026-05-27)

The metrics header replaces `InboxEyebrow` + `InboxStatusSentence` on the **desktop** surface ([src/components/social-inbox-client.tsx:394-402](../../../src/components/social-inbox-client.tsx)). The separate **mobile** list surface ([src/app/m/inbox/page.tsx](../../../src/app/m/inbox/page.tsx)) keeps its current sentence for v1 and is **out of scope for this plan.**

The "stat strip wraps gracefully on narrow viewport" testing note in §11 refers to the desktop header's responsive behavior (the desktop inbox can be viewed at narrow widths), not the mobile list surface. Adding the header to the mobile `m/inbox` list is a tracked follow-up (see §13 Open follow-ups).
