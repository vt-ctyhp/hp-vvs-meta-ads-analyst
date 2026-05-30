# Live inbox sync: Broadcast-driven realtime + cron backstop

Design spec — 2026-05-30. Branch: `claude/pensive-benz-69b88c`.

## 1. Summary

The Meta social inbox feels delayed. The cause is **not** ingestion latency — it is the
UI. Concretely (verified, see §3):

- A **webhook** (`/api/meta/webhook` → `ingestMetaWebhookPayload`) already lands inbound
  messages in the DB in near-real-time.
- But the **open inbox screen never refreshes itself**. The desktop container
  `src/components/social-inbox-client.tsx` has no queue refetch, no realtime subscription,
  no SSE, no `router.refresh()`. New data appears only when an operator clicks **"Sync
  Inbox"** or reloads the page.
- And there is **no scheduled background poll of the inbox**. The only daily cron
  (`/api/cron/sync`, `0 13 * * *`) calls `syncMetaAds` — ads insights, not the inbox. So if
  a webhook is ever missed, nothing backfills it until a human clicks Sync.

This feature makes the inbox update on its own, with a safety net:

1. **Live updates via Supabase Realtime *Broadcast*.** A database trigger emits a tiny,
   content-free "changed" ping on a private, environment-scoped channel whenever an inbox
   row is written. The subscribed browser refetches the existing authorized endpoints and
   merges — so the queue, the open conversation thread, assignment/status, and
   who's-viewing presence all update within ~1–2s with no reload. Falls back to polling if
   the websocket drops.
2. **A cron backstop.** A new `/api/cron/social-inbox-sync` route runs `syncSocialInbox("cron")`
   every ~2 minutes so the DB stays fresh even if webhooks are dropped. Its writes flow
   through the same trigger, so the UI updates from the backstop automatically.

## 2. Goals / non-goals

**Goals (Phase 1)**
- Live **queue**: new conversations appear, threads re-sort, Needs-reply/unread badges
  update, with no manual Sync or reload.
- Live **open conversation thread**: new inbound/outbound messages append in place.
- Live **assignment + status/workflow** changes (these ride the same queue refetch, so they
  are near-free).
- Live **"who's-viewing"** presence for collision awareness (tolerant of a few seconds'
  latency; reuses the existing `meta_inbox_presence` table + heartbeat).
- A **cron backstop** that guarantees DB freshness independent of webhook reliability.
- Graceful **degradation** to polling when Realtime is unavailable.

**Non-goals (Phase 2 / later)**
- Sub-second **"X is typing…"** indicators. This is the only heavy/risky slice (it wants a
  separate low-latency Realtime Presence/Broadcast channel, disconnect cleanup, and
  ghost-typing edge cases) and the least valuable for an ops inbox. Explicitly deferred.
- Any change to the inbox tables' **role-based RLS** or exposing inbox data to the
  publishable/anon key.
- Finer **multi-environment** channel scoping beyond the single active deployment
  environment (no per-user environment membership exists today — see §8).
- Replacing the webhook or the manual "Sync Inbox" button. Both stay.

## 3. Verified current state (checked, not assumed)

Verified against the migrations and runtime code; the design must not deviate.

- **Two ingestion paths exist.** Webhook (`src/app/api/meta/webhook/route.ts` →
  `ingestMetaWebhookPayload`) is the real-time path. `syncSocialInbox(trigger)` (in
  `src/lib/social-inbox.ts`) is an on-demand Graph-API poll; its **only** caller today is
  `POST /api/social-inbox/sync` (the "Sync Inbox" button). Its signature already accepts
  `"manual" | "cron" | "webhook"`.
- **No scheduled inbox poll.** `vercel.json` crons relevant to nothing-inbox-ingesting:
  `/api/cron/sync` (daily) = `syncMetaAds` (ads only); `inbox-auto-assign` (every 5 min)
  only assigns existing conversations. `meta-inbox-delivery` / `meta-inbox-comment-actions`
  cron routes exist but are not scheduled in `vercel.json`.
- **The UI does not auto-refresh.** `social-inbox-client.tsx` has only a 60s reply-window
  clock and a 10/25s presence heartbeat — no queue refetch, no realtime, no `router.refresh`.
  New data arrives via: (a) the "Sync Inbox" button (`handleSync` → `POST /api/social-inbox/sync`
  then refetch `GET /api/social-inbox` + reload selected thread), (b) page reload, or (c)
  selecting a conversation (reloads only that thread via `/api/social-inbox/conversations/[id]/messages`).
- **Inbox-table RLS is role-based, not `auth.uid()`-based.** `meta_inbox_*` / `meta_social_*`
  policies grant SELECT only to Postgres roles `ads_analyst_web` / `ads_analyst_worker` /
  `ads_analyst_ingest`, gated by `analytics.ads_analyst_environment_matches(environment)`.
  The web app reads inbox data **server-side** (`getSocialInboxData` → `/api/social-inbox`),
  not through a client Supabase session. Migration comments are explicit: *"scoped clients
  have no auth… not load-bearing in v1."*
- **The browser nonetheless has a Supabase auth session.** `src/components/login-client.tsx`
  uses `supabase.auth`; `src/lib/app-auth.ts` resolves a profile by `user.id` (the Supabase
  auth uid) and exposes a separate `app_user_id` (the inbox team-member id). User identity is
  read through the sales-owned view `analytics.ads_analyst_identity_profiles_v1`
  (`app_user_id, auth_user_id, email, full_name, initials, active, roles`).
- **A browser Supabase client exists** in `src/lib/supabase.ts`, created with the
  publishable key. Realtime is enabled on the project (an old `supabase_realtime`
  publication exists from `0009_triggers_realtime.sql`), but **no Broadcast / `realtime.send`
  / `realtime.messages` usage exists yet** — this feature introduces the first.
- **Environment is resolved per request** via `getActiveMetaInboxEnvironment`
  (`meta-inbox-environment`); writes are stamped through `withActiveMetaInboxEnvironment`.

## 4. Rejected approach: client-side `postgres_changes`

The intuitive "add inbox tables to the `supabase_realtime` publication and subscribe in the
client" does **not** work here and is explicitly rejected:

- Realtime `postgres_changes` delivers a row to a client only if that client's connection
  role passes the table's RLS `SELECT`. The browser connects with the publishable/anon role,
  which has **no** SELECT grant on `meta_inbox_*` / `meta_social_*` (only the `ads_analyst_*`
  roles do).
- Environment scoping is **role/GUC-based** (`ads_analyst_environment_matches`), set
  per-request server-side. There is no per-connection equivalent for a long-lived client
  socket, so even if a grant existed the rows would not scope correctly.
- Making it work would require either exposing inbox data to the anon key (a security
  regression) or a JWT/RLS re-architecture of every inbox table — both out of scope.

Broadcast sidesteps all of this: it is a pub/sub channel authorized by RLS on
`realtime.messages`, completely independent of the inbox tables' policies, and it never puts
inbox data on the wire.

## 5. Architecture

```
Meta ──webhook──▶ ingestMetaWebhookPayload ─┐
Meta ◀──poll──── syncSocialInbox(manual|cron)┤
(send / assign / status / workflow mutations)─┼─▶ write meta_inbox_conversations
                                              │   + meta_inbox_conversation_events
                                              │   (presence is NOT in the trigger — see note below)
                                              ▼
                        AFTER INSERT/UPDATE trigger (SECURITY DEFINER, error-swallowing)
                            realtime.send(topic = 'inbox:<env>', event = 'inbox-changed',
                                          payload = { conversationId, kind })
                                              │
                                  Supabase Realtime (websocket, private channel)
                                              ▼
        Browser (social-inbox-client) subscribed to private 'inbox:<env>'
            on ping → debounce ~750ms → refetch GET /api/social-inbox (queue)
                                       → if ping.conversationId == open thread, reload its messages
                                       → merge into state (never clobber draft / optimistic / selection)
            socket not SUBSCRIBED → fall back to 15s polling of the same endpoints; resume on reconnect
```

**Emit is a database trigger, by design.** Inbound ingest (webhook + manual + cron),
outbound sends, assignment, and status/workflow changes **all** write through these tables.
A trigger covers every writer with no risk of forgetting a code path — which app-code emit
would carry. The trigger:

- Fires `AFTER INSERT OR UPDATE` on `meta_inbox_conversations` and
  `meta_inbox_conversation_events` only. **Presence is deliberately excluded** (refinement
  found in planning): the presence heartbeat POST already returns the full presences list and
  runs every ~10s, and putting `meta_inbox_presence` in the trigger would create a
  write→ping→write feedback loop. Who's-viewing therefore rides the existing heartbeat
  (tightened to 10s), not the broadcast.
- Is **`SECURITY DEFINER` and wraps its body in `EXCEPTION WHEN OTHERS THEN RETURN`** so a
  Realtime hiccup can never roll back or block an inbox write. This is a hard requirement: a
  raising trigger would break ingestion.
- Calls `realtime.send(payload jsonb, event text, topic text, private boolean)` with
  `topic = 'inbox:' || NEW.environment`, `event = 'inbox-changed'`, and a minimal payload of
  the affected `conversationId` plus a `kind` discriminator (`conversation` | `event`).
  **No message text, no customer PII** is ever broadcast — only ids the client uses to decide
  what to refetch.

## 6. Components

**New files**
- **Migration** `supabase/migrations/<ts30>_inbox_live_broadcast.sql` (created via
  `npm run db:migration -- inbox_live_broadcast`):
  - Trigger function `analytics.broadcast_inbox_change()` (SECURITY DEFINER, error-swallowing)
    + `AFTER INSERT OR UPDATE` triggers on the two tables above
    (`meta_inbox_conversations`, `meta_inbox_conversation_events`; presence excluded — see §5).
  - Read authorization for the private channel: a policy on `realtime.messages` for `select`
    to `authenticated`, scoped to `realtime.topic() like 'inbox:%'` and an
    `analytics.is_active_inbox_user()` SECURITY DEFINER helper (checks `auth.uid()` against
    `analytics.ads_analyst_identity_profiles_v1` for an active profile). See §8.
- **`src/app/api/cron/social-inbox-sync/route.ts`** — `GET`, guarded by
  `isAuthorizedCronRequest` (from `src/lib/http.ts`), calls `syncSocialInbox("cron")`,
  returns its metrics. Mirrors `src/app/api/cron/sync/route.ts` (`runtime = "nodejs"`,
  `dynamic = "force-dynamic"`, `maxDuration = 300`).
- **`src/components/v2/inbox/use-inbox-live.ts`** — the client hook: subscribes to the
  private `inbox:<env>` channel via the browser Supabase client (after
  `supabase.realtime.setAuth()`), debounces pings, drives refetch + merge through the
  callbacks the existing mutations hook already exposes, manages the polling fallback, and
  reports a connection state for a small indicator.

**Changed files**
- **`vercel.json`** — add `{ "path": "/api/cron/social-inbox-sync", "schedule": "*/2 * * * *" }`.
  Widen to `*/5` if §12 verification shows `syncPage` is not recency-bounded.
- **`src/components/social-inbox-client.tsx`** — wire `use-inbox-live` into the existing
  `setInboxData` / `loadConversationHistory` / `upsertConversationEvents` it already owns, and
  surface a subtle "live / reconnecting" indicator in the eyebrow status area.

## 7. Data flow & merge rules

- Pings are **debounced ~750ms** on the client to coalesce bursts (a single sync can write
  many rows → many pings).
- On a flushed ping: **always** refetch the queue (`GET /api/social-inbox`, `cache: no-store`)
  → merge. Refetch the **open thread** only if the ping's `conversationId` matches the current
  selection (or if the payload carried no id). Refetch **presence** only for the open thread
  on a `presence` ping.
- **Merge must preserve local state.** Server truth is applied by upserting on id, which
  dedups optimistic in-flight sends. The composer **draft is local React state** and is
  untouched by a data refetch. Current selection is preserved. Auto-scroll the thread only if
  the user is already pinned to the bottom.
- This reuses existing endpoints (queue `GET /api/social-inbox`, thread history
  `GET /api/social-inbox/conversations/[id]/messages`, and the conversation `…/presence`
  route the client already calls) — no new read surface, no new authorization path.

## 8. Channel authorization & security

- **Private channel**, topic `inbox:<environment>` where `<environment>` comes from
  `getActiveMetaInboxEnvironment`. The client calls `supabase.realtime.setAuth()` so the
  Realtime server evaluates `realtime.messages` RLS with the user's JWT (role `authenticated`).
- **Read policy** authorizes a connecting user who is an **active app user**:
  `realtime.topic() like 'inbox:%' AND analytics.is_active_inbox_user()`. The helper is
  `SECURITY DEFINER` (owned by a role with SELECT on the sales-owned identity view) and
  resolves `auth.uid()` → an active row in `analytics.ads_analyst_identity_profiles_v1`. The
  browser cannot query that view directly (it is granted to `ads_analyst_web`, not
  `authenticated`), hence the definer helper.
- **Environment scoping today is deployment-level.** No per-user environment membership
  exists, and this deployment serves one environment (HP). v1 therefore authorizes "active
  authenticated app user" for the `inbox:<env>` topic. Finer per-user multi-environment
  scoping is a future item gated on a user↔environment mapping that does not exist yet
  (recorded as a non-goal in §2).
- **Blast radius is minimal regardless.** The payload is content-free (opaque ids + a kind),
  the actual data still comes through the RLS-protected server route, and subscription
  requires a valid Supabase session of an active app user — not just the publishable key.
- **Cross-repo boundary:** the trigger function, helper, and `realtime.messages` policy are
  Meta-Ads-owned artifacts authored at migration seconds `30` (this repo's convention). They
  must not write or alter sales-owned objects; they only *read* the identity view via the
  definer helper. **This cross-boundary read is approved (decision 2026-05-30); private
  channels are the design, not the public-ping fallback.**

## 9. The cron backstop (#2)

- `/api/cron/social-inbox-sync` calls `syncSocialInbox("cron")` — the same code path the
  manual button runs, recorded in `meta_social_sync_runs` with `trigger = 'cron'`.
- Schedule `*/2 * * * *` — **confirmed at 2 minutes (decision 2026-05-30)** (the repo already
  runs sub-hourly crons, e.g. `*/5`, `*/15`, so the plan is on a tier that allows it). The
  webhook remains the primary/instant path; the cron is purely a safety net.
- Because the cron's writes flow through the §5 trigger, any rows it recovers also push a live
  ping — the operator's screen updates from the backstop with no extra wiring.

## 10. Error handling & degradation

- **Socket connect/subscribe failure or `CHANNEL_ERROR`/`TIMED_OUT`** → start a 15s polling
  interval over the same refetch path; show a subtle "reconnecting" dot; stop polling when the
  channel returns to `SUBSCRIBED`.
- **Refetch failure** → keep last-good data and retry on the next tick; never blank the UI.
- **Server emit failure** → impossible to surface as a user-facing failure by construction:
  the trigger swallows its own exceptions, so a Realtime outage degrades to "no live pings"
  (cron backstop + manual Sync still work), never to broken ingestion.
- **Token expiry** → refresh `setAuth()` on Supabase auth token refresh so the private channel
  stays authorized across long sessions.

## 11. Testing

- **Migration test** (`tests/*-migration.test.ts` pattern): assert the trigger function +
  two triggers exist, the `realtime.messages` read policy exists and references the active-
  user helper, and the helper is `SECURITY DEFINER`.
- **Client merge unit test**: a ping → refetch → merge preserves composer draft, current
  selection, and optimistic events (no duplication, no clobber).
- **Cron route test**: rejects unauthorized requests; on authorized request calls
  `syncSocialInbox("cron")` and returns metrics.
- **Fallback test**: when the channel reports an error state, the hook starts polling and
  stops on reconnect.
- **Preview verification** (per repo memory: temporary unguarded route + typed fixture, or a
  direct row insert): insert an inbound `meta_inbox_conversation_events` row (or run a sync),
  confirm the queue + open thread update with no reload; simulate socket loss, confirm the
  polling fallback.

## 12. Open verification items (resolve during planning/implementation, not blockers)

1. **`syncPage` recency bound.** Confirm `syncSocialInbox` → `syncPage` pulls a *recent*
   window of threads/messages (not full history) so `*/2` cadence is Graph-API-rate-safe. If
   it is unbounded, add a recency bound or widen the cron to `*/5`.
2. **`realtime.send()` availability.** Confirm this project's Supabase/Realtime version
   exposes `realtime.send()` (and the private-channel `realtime.messages` authorization
   model). If unavailable, fall back to a **stateless app-code emit** posting to the Realtime
   Broadcast REST endpoint from the ingest choke points (`ingestMetaWebhookPayload`,
   `syncSocialInbox`, send-reply) instead of the DB trigger — same channel, same payload.
3. **Definer-helper grant path.** Cross-boundary identity read is **approved** (decision
   2026-05-30) — private channels are the design; the public-ping fallback is dropped.
   Implementation step (not a blocker): ensure the owner of
   `analytics.is_active_inbox_user()` has SELECT on
   `analytics.ads_analyst_identity_profiles_v1` and that `authenticated` may EXECUTE the
   helper; if a grant is missing, add it as a Meta-Ads-owned (seconds=`30`) migration. The
   helper only *reads* the sales-owned view; it never writes sales-owned objects.

## 13. Phasing / rollout

- **Phase 1 (this spec):** trigger + private channel + client live hook (queue, open thread,
  assignment/status, who's-viewing presence) + polling fallback + cron backstop.
- **Phase 2 (deferred):** sub-second "X is typing…" indicators on a dedicated low-latency
  channel.
- Live updates are **additive and safe to ship incrementally**: the manual "Sync Inbox"
  button and webhook are untouched, so if the live layer is disabled or fails, the inbox
  behaves exactly as it does today.

## 14. Migration tooling notes (repo rules)

- Create the migration with `npm run db:migration -- inbox_live_broadcast` (this repo writes
  timestamp seconds `30`; do **not** hand-author migration filenames).
- Run `npm run db:migrations:check` before finalizing (`npm test` and `npm run typecheck` run
  it automatically).
