# UI Rebuild PRD — HP/VVS Meta Ads AI Analyst

| Field | Value |
| --- | --- |
| Status | Draft for approval |
| Owner | viv |
| Date | 2026-05-20 |
| Target cutover | ~2 weeks from approval |
| Branch | `ui-rebuild` |
| Preview | Vercel branch preview, `ADS_ANALYST_ENVIRONMENT=staging` |
| Cutover | Hard switch on PR merge; Vercel revert = rollback |

## 1. Executive summary

Rebuild every authenticated UI surface of the HP/VVS Meta Ads AI Analyst app while preserving 100% of the existing data model, API contracts, webhooks, cron jobs, and server-side business logic. The new UI collapses today's nine routes into a three-room information architecture (Optimize / Convert / Operate) keyed to the marketing operator's job-to-be-done — "spot what's working and what's failing fast." A new server-side signal engine ranks daily decisions so each room opens with a triage strip instead of a flat dashboard. Sales users get a dedicated full-screen mobile inbox shell.

The rebuild lives on a long-lived `ui-rebuild` branch that ships to a Vercel preview reading the same Supabase project as production, but with `environment=staging` row fencing so writes from the preview never touch production analyst rows. Hard cutover happens at PR merge; rollback is a single Vercel revert.

## 2. Goals and non-goals

### Goals

1. Reorganize the IA from nine destinations to three rooms plus a sales-only inbox shell.
2. Replace flat tabular dashboards with a signal-first triage layer that ranks daily decisions.
3. Achieve mobile-equal experience for the inbox and AI chat surfaces.
4. Enforce platform-foundations rules across every screen: workflow-first, status sentence first, role-aware, responsive, accessible, glossary-consistent.
5. Adopt a denser viz stack (Visx + TanStack Table) suited to a data-heavy operator tool.
6. Land Phase 3 + Phase 5 data-boundary migrations in cloud so staging writes are truly fenced.
7. Add a new `send_inbox_reply` permission so sales can complete the human-approved reply workflow end to end.
8. Ship in roughly two weeks of focused work.

### Non-goals

1. No changes to API route paths, methods, request/response shapes, or auth contracts.
2. No changes to webhook signature handling or cron schedules.
3. No changes to existing Supabase tables or migrations except additive new ones.
4. No write paths into Sales/ERP Core tables (`customers`, `appointments`, `users`, `user_roles`, etc.). Existing data-boundary tests must continue passing.
5. No automatic outbound replies. Sending a reply still requires an explicit human click.
6. No new Meta permission scopes beyond what's already configured. `ads_management` remains forbidden.

## 3. Success metrics

| Metric | Target | Measurement |
| --- | --- | --- |
| Backend regressions | 0 in 30 days post-cutover | `/api/health` daily green, sync_runs success rate ≥ today's baseline, no missed webhook events |
| Room time-to-interactive | < 2 s broadband, < 4 s 4G | Lighthouse + Vercel Web Vitals on Optimize, Convert, Operate, Inbox |
| Daily review completion (secondary) | Marketing operator clears signal queue in < 5 min | Observed 3 sessions post-cutover |
| Inbox response latency (secondary) | Median outbound-reply delta down from current baseline | `meta_social_threads.last_message_at` → first matching outbound `meta_social_messages.sent_at` |

Backend integrity and performance are the two hard gates. Workflow metrics are tracked but not blockers for cutover.

## 4. Personas and jobs-to-be-done

### Marketing operator (primary)

- Daily driver of the app. Decides which creatives to scale, kill, or refresh; which campaign groups need attention; whether website funnel is leaking; whether AI chat can explain a specific drop.
- Mostly on desktop, occasionally checks signals on phone.
- Top JTBD: "Show me today's decisions in order, let me act on each one, then leave."

### Sales / client advisor

- Lives in the inbox. Reads and replies to Facebook and Instagram DMs and comments.
- Mostly on phone between appointments.
- Top JTBD: "Reply to waiting customers quickly with the right brand voice."

### Admin / owner

- Configures the team, monitors data health, manages backfill operations, occasionally reviews reports.
- Mostly on desktop.
- Top JTBD: "Keep the pipes flowing and the team configured."

### Read-only stakeholder (executives, finance)

- Looks at dashboards and reports, doesn't trigger workflows.
- Mixed devices.
- Top JTBD: "Understand business performance at a glance."

## 5. Glossary (canonical labels)

Mandatory across UI, exports, AI-generated text, and error messages. Backend column names are independent of these labels.

| Canonical label | Used for | Backend term (not user-facing) |
| --- | --- | --- |
| **Booking** | A confirmed Acuity appointment that converted | website_conversions.event_name = 'Schedule', acuity_appointment_id |
| **Customer** | A person who interacted with the brand (visitor, lead, booker) | website_visitors, website_sessions, social participants |
| **Conversation** | A Facebook or Instagram message thread or comment thread | meta_social_threads, meta_social_comments |
| **Message** | A single message inside a conversation | meta_social_messages |
| **Reply** | An outbound message authored by staff | meta_social_messages where direction='outbound' |
| **Group** | An internal campaign grouping (was "umbrella") | campaign_umbrella |
| **Creative** | The visual ad asset | meta_creatives |
| **Ad** | A delivered ad instance | meta_ads |
| **Group of Ads** | Replaces "ad set" in UI | meta_ad_sets |
| **Campaign** | A Meta campaign | meta_campaigns |
| **Brand** | HP or VVS | brands |
| **Score** | The internal creative diagnostic score | creative_score |
| **Signal** | A ranked decision item surfaced by the signal engine | ai_signals |
| **Run** | A sync or backfill execution | sync_runs, meta_ads_backfill_chunks |
| **Coverage** | Historical data completeness by month and account | meta_ads_history_coverage RPC |
| **Sign in / Sign out** | Auth verbs (never "log in", "log out") | — |
| **Save view** | Persist current filter state as a reusable view | ai_analysis_dashboards |
| **Ask AI** | Trigger a chat or analysis request | /api/chat, /api/analysis |

Action verbs are also locked: **Save**, **Delete** (not Remove), **Open** (not View), **Dismiss** (not Hide), **Apply** (filters), **Send** (replies), **Cancel** (flows).

Status words are locked: **Live** (was Active), **Paused**, **Off** (was Deleted/Archived), **Queued**, **Running**, **Done** (was Completed/Success), **Failed**, **Snoozed**, **Assigned**.

## 6. Information architecture

### Top-level structure

| Route | Audience | Mobile-equal | Notes |
| --- | --- | --- | --- |
| `/optimize` | Admin, Marketing, Read-only | Read-only on mobile | Default landing for Admin and Marketing |
| `/optimize/ads/[adId]` | Same | Read-only on mobile | Drill-down for one ad |
| `/convert` | Admin, Marketing, Read-only | Inbox panel mobile-equal; funnel + ledger read-only | |
| `/convert/conversations/[id]` | Above + Sales (same surface) | Yes | Conversation detail |
| `/operate` | Admin only | Read-only on mobile | Pipelines, coverage, health, people |
| `/m/inbox` | Sales | Yes (primary) | Full-screen mobile-first inbox shell, no room nav |
| `/m/inbox/[conversationId]` | Sales | Yes | Conversation detail in sales shell |
| `/sign-in` | All (unauthenticated) | Yes | Was `/login` |
| `/no-access` | All (authenticated, no permissions) | Yes | Identical role-aware messaging |
| `/` | All authenticated | — | Server redirect to the right landing per role |

The Cmd+K command palette is available globally on every authenticated screen.

### Role landing routes

- Admin → `/optimize`
- Marketing → `/optimize`
- Sales → `/m/inbox`
- Read-only → `/optimize`
- No permissions → `/no-access`
- Unauthenticated → `/sign-in`

### Navigation chrome (Admin and Marketing)

- App shell with three top-nav items: Optimize, Convert, Operate (Operate hidden for Marketing).
- Right side: health pill, identity menu, command palette trigger (Cmd+K).
- Below top nav on every authenticated room: a 56px Signal Strip showing the top three signals for that room with a "See all (N)" expand.

### Navigation chrome (Sales)

- No top nav. Just a back button when in conversation detail, an identity menu, and a sync indicator.
- Layout is a single full-screen messaging app pattern: list → detail with vaul drawer transitions on phone, two-column on tablet/desktop.

### Removed routes (data and workflows preserved, just no destination)

- `/analysis` → ad-hoc AI moves into Cmd+K and "Save view" on Optimize. Saved dashboards listed inside Optimize.
- `/website-funnel`, `/attribution-ledger` → merged into Convert.
- `/inbox` → merged into Convert (desktop) and `/m/inbox` (sales mobile shell).
- `/admin/backfill`, `/users` → merged into Operate.

API routes powering all of the above remain at their existing paths.

## 7. Permissions matrix

Two layers: app-level (UI route + action gates) and DB-level (Postgres module roles).

### App-level permissions

| Permission | Today's roles | New roles |
| --- | --- | --- |
| view_dashboard | Admin, Marketing, Read-only, others | Same |
| view_creative_analysis | Admin, Marketing, Read-only | Same (merged into Optimize) |
| view_ai_analysis | Admin, Marketing, Read-only | Same (lives in Cmd+K and Optimize) |
| view_inbox | Admin, Marketing, Sales, Read-only | Same |
| view_backfill | Admin, Marketing (read-only), Read-only | Same |
| run_meta_sync | Admin, Marketing | Same |
| manage_backfill | Admin | Same |
| view_users | Admin, Read-only | Same (read-only roster in Operate) |
| manage_users | Admin | Disabled — Sales/ERP boundary unchanged |
| **send_inbox_reply** (new) | — | Admin, Marketing, Sales |
| **manage_inbox_state** (new) | — | Admin, Marketing, Sales (own conversations only via assigned_to check at API layer) |

`send_inbox_reply` does not introduce a new server endpoint. The existing AI reply suggestion endpoint already produces a draft; sending the draft to Meta will use a new endpoint `/api/social-inbox/send-reply` introduced under the strict server-side human-approval guard (see section 11). Preview deploys can flip-test this without touching production tokens because the Meta token is read at runtime.

### DB-level module roles

Unchanged from Phase 4 design: `ads_analyst_web`, `ads_analyst_worker`, `ads_analyst_ingest`. New permission `send_inbox_reply` requires `ads_analyst_web` to write to `meta_social_messages` and `ai_reply_suggestions`. Phase 2 grants already cover these tables.

### Permission UX rules (from platform-foundations)

- Hide nav items the user cannot use. No grayed-out forever buttons.
- Sales users typing `/optimize` directly get a 200 response that routes them to `/m/inbox`, not a 403 dead end.
- Marketing users who try `/operate` get the same gentle reroute to `/optimize`.
- Read-only stakeholders can reach every read-only surface but never see action buttons.

## 8. Per-room PRD

For every room: persona, JTBD, the five workflow questions, status sentence formula, primary action, components, states (loading, empty, error, saving), mobile reflow, accessibility notes, telemetry events.

### 8.1 Optimize room (`/optimize`)

**Persona:** Marketing operator.

**JTBD:** "Decide which creatives to scale, kill, refresh; explain anomalies; export findings."

**Five workflow questions:**
1. *User:* marketing operator, mid-morning, desktop.
2. *Goal:* triage today's creative + campaign decisions.
3. *First thing needed:* one sentence saying "X creatives need attention, Y are winners, total spend Z last 7 days."
4. *Most likely action:* click one signal card to act on a creative.
5. *Hide until asked:* raw insight tables, advanced filters, AI chat history.

**Status sentence formula** (two-second read):
> "{N_critical} need attention. {N_scale} winners. {spend_7d} spent last 7 days, {delta_7d_pct} vs prior."

**Primary action:** Act on top signal (single click from Signal Strip).

**Layout — desktop (≥1025 px):**

```
┌─────────────────────────────────────────────────────────────────┐
│ Status sentence + brand selector + date range                   │
├─────────────────────────────────────────────────────────────────┤
│ Signal Strip — top 3 cards + See all (N)                        │
├──────────────────────────────────┬──────────────────────────────┤
│ Time-series chart (Visx, brush)  │ Persistent chat rail         │
│ Filter chips (group, status,...) │ (collapsible)                │
├──────────────────────────────────┤                              │
│ Creative grid (TanStack, virtua) │                              │
│ Row click → side drawer          │                              │
└──────────────────────────────────┴──────────────────────────────┘
```

**Components:**
- Status sentence (left-aligned, 16px, plain prose).
- Filter bar: brand, group (was umbrella), date range, status (Live/Paused/Off), min spend.
- Signal Strip: 3 inline cards + "See all (N)" link that expands into a stacked list below the strip.
- Time-series chart: Visx line chart, brushable, comparison-period toggle (last N days vs prior N days). Tabular nums tooltip.
- Creative grid: TanStack Table, 30+ rows above the fold at 1440. Columns: preview, name, score, status, spend, primary KPI (resolved per group), CTR, CPC, frequency, fatigue chip, group, last refresh.
- Row drawer (vaul on mobile, slide-over on desktop): full insight series, video metrics on-demand, Meta rankings, recommendation, notes textarea (saved to a new `ad_notes` table — see section 12), inline scoped chat.
- Chat rail: persistent, scoped to current filter state. Calls existing `/api/chat`. "Save view" turns the current filter + chart selection into an `ai_analysis_dashboard` row.
- Reports panel: dropdown listing generated executive reports for the current filter range; "Generate" button calls `/api/reports`.

**States:**
- *Loading:* skeleton for status sentence, signal strip placeholders, chart axis only, grid header + ghost rows.
- *Empty (no data in range):* "No ads delivered in this range. Try a longer window or check that sync ran today." with a "Run sync" CTA gated on `run_meta_sync`.
- *Error:* sanitized message via existing `translateError`, "Try again" button. Never leak SQL, stack, enum values.
- *Saving (view, notes):* inline saving indicator on the affected control.

**Mobile reflow (≤640 px):**
- Status sentence stacks above filter bar.
- Signal Strip becomes vertical card list (still top 3 + expand).
- Chart collapses to a sparkline + "Open chart" link to a focused view.
- Grid collapses to a card list with score, name, primary KPI, fatigue chip.
- Chat rail becomes a bottom sheet triggered from a floating button.

**Accessibility:**
- Every interactive element keyboard-reachable.
- Cards announce title, severity, and recommendation to screen readers.
- Color is paired with text or icon for status / severity.

**Telemetry events:**
- `optimize_signal_clicked` (signal_id, type, severity).
- `optimize_view_saved`, `optimize_view_opened`.
- `optimize_report_generated`.
- `optimize_chat_message_sent`.

### 8.2 Convert room (`/convert`)

**Persona:** Marketing operator + admin (desktop) and sales (mobile via `/m/inbox`).

**JTBD:** "Turn customer interest into bookings. Spot funnel leaks, verify attribution, reply to waiting customers."

**Five workflow questions:**
1. *User:* marketing on desktop; sales on phone (but Sales goes to `/m/inbox`).
2. *Goal:* understand pipeline health and clear unread conversations.
3. *First thing needed:* sentence summarizing funnel + unread count + CAPI gap.
4. *Most likely action:* open a conversation OR open a funnel step.
5. *Hide until asked:* raw event stream, hashed PII, sync-run logs.

**Status sentence formula:**
> "{visitors_7d} visitors, {bookings_7d} bookings ({rate_pct}). {unread_conversations} waiting. {capi_gap} attribution gaps."

**Primary action:** Open a conversation needing a reply OR jump to the largest funnel leak step.

**Desktop layout (≥1025 px) — three columns:**

```
┌───────────────────────────────────────────────────────────────────┐
│ Status sentence + brand + date range                              │
├───────────────────────────────────────────────────────────────────┤
│ Signal Strip — funnel leaks, unread conversations, CAPI gaps      │
├──────────────┬───────────────────────────────┬────────────────────┤
│ Funnel viz   │ Customer ledger               │ Conversations queue│
│ (Visx)       │ (TanStack)                    │ (list, search)     │
│ step sparks  │ rows: customer, paid touch,   │ click → detail     │
│              │ CAPI status, booking, source  │ pane below         │
│              │ ad (if joinable)              │ (or full-screen on │
│              │                               │ mobile)            │
└──────────────┴───────────────────────────────┴────────────────────┘
```

Clicking a customer row expands a unified profile drawer showing their sessions, events, conversion, and any matchable conversations (joined via `fbp`/`fbc` / participant fingerprint). Clicking a conversation in the right column opens the conversation detail with AI reply composer.

**Conversation detail components:**
- Message list (virtualized).
- Inline customer card: name (if known), brand, last seen, source ad if joinable, profile link.
- Composer: text area, language toggle (auto/en/vi), Ask AI for draft button, Send button.
- Send button: disabled until human focus; requires explicit click; calls new `/api/social-inbox/send-reply` (see section 11).
- Snooze and Assign controls (new): snooze until time, assign to teammate.
- Mark as read state inferred from open + read affordance, persisted via `manage_inbox_state` permission.

**States:**
- *Loading:* funnel skeleton, ledger ghost rows, conversation list skeleton.
- *Empty funnel:* "No sessions recorded in this range. Check that the booking site pixel is firing."
- *Empty conversations:* "Inbox is clear." with last sync timestamp and Sync now CTA.
- *Send failure:* sanitized error in composer with "Try again" and recovery guidance (no token leak).

**Mobile reflow:**
- Tabs at top: Funnel / Customers / Inbox.
- Funnel: vertical step list with drop-off bars.
- Customers: card list with paid-touch chip + CAPI chip.
- Inbox: list → conversation detail (vaul drawer).
- Marketing users on phone get the same Convert mobile layout. Sales users always land at `/m/inbox` and never see Funnel / Customers tabs.

**Telemetry events:**
- `convert_conversation_opened` (platform, conversation_id).
- `convert_reply_sent` (platform, conversation_id, ai_draft_used: bool).
- `convert_funnel_step_opened` (step_label).
- `convert_customer_expanded` (visitor_id).

### 8.3 Operate room (`/operate`) — Admin only

**Persona:** Admin.

**JTBD:** "Keep sync pipes healthy, fill historical gaps, manage roster, see when something is broken."

**Status sentence formula:**
> "{last_sync_rel}. {failed_chunks_24h} failed chunks. {coverage_pct} historical coverage. {seat_count} active teammates."

**Tabs:**
1. **Pipelines** — sync runs ledger, manual Run sync button (admin only), recent backfill jobs with pause / resume / retry-failed controls.
2. **Coverage** — month × account heatmap from `meta_ads_history_coverage` RPC. Click a cell to queue a backfill job for that month + account.
3. **Health** — `/api/health` + `/api/system-health` output, env fence indicator (production / staging), Meta permission readiness, social inbox permission readiness.
4. **People** — read-only roster from `analytics.ads_analyst_identity_profiles_v1`. Each row shows email, name, roles, active. Top of tab has a callout: "Roster lives in ERP. Manage at: {erp_link}." Write controls hidden.

**States:** standard loading, empty, error coverage. Empty Pipelines tab is realistic only on a freshly seeded staging environment; copy says "No runs yet. Run sync now or wait for the next cron." with the Run sync CTA gated on `run_meta_sync`.

**Telemetry events:**
- `operate_sync_triggered`, `operate_backfill_created`, `operate_chunk_retried`.

### 8.4 Sales mobile inbox shell (`/m/inbox`)

**Persona:** Sales.

**JTBD:** "Clear waiting conversations with brand-correct replies. Mostly on phone, sometimes tablet."

**Status sentence formula:**
> "{N_waiting} waiting. Oldest {oldest_rel}. {N_snoozed} snoozed."

**Layout:**
- Phone: single column. Top: status sentence + sync indicator. Below: conversation list (last message preview, age chip, brand chip, snooze chip). Tap a conversation → vaul-style page push to detail.
- Tablet portrait: two-column split (list / detail).
- Tablet landscape and desktop: same two-column split with more spacing.

**Conversation detail:** identical to Convert room's conversation detail. Same composer, same human-approval send guardrail, same snooze and assign controls.

**No room navigation.** No Optimize, no Convert, no Operate links anywhere in this shell. Identity menu at top right with sign out and profile.

**Special state:** when a sales user navigates to `/optimize` or `/convert` directly, server redirect to `/m/inbox` with a one-time toast: "This area is not part of your workflow."

### 8.5 Cmd+K command palette (global)

**Always available** for authenticated users.

Inputs accepted:
- Free-text natural language question → routed to `/api/chat` (if `view_dashboard`) or `/api/analysis` (if `view_ai_analysis`) and answered inline.
- "go {optimize|convert|operate|inbox|sign out}" → navigation.
- Ad ID, creative name, campaign name → jump to the relevant ad or creative drill-down.
- "/help" → list of commands.

The palette is **not** a search input over the whole DB; it's an intent router with a small set of verbs.

### 8.6 Sign in (`/sign-in`)

Behavior identical to today's `/login`. New shell only. Single field order: email, password. Primary action labeled "Sign in" (per glossary). Recovery link below. After success, server-side router sends to role landing route. Failure shows single neutral message "Sign-in failed. Check your email and password." with no backend leakage.

### 8.7 No access (`/no-access`)

Identical behavior. Shows current email, "Sign out" action, polite message: "Your account is signed in but does not have access to this app. Contact your admin to grant access."

## 9. Signal engine specification

The signal engine is the daemon behind Option B's Signal Strip. It computes a ranked list of decisions for each room and stores them in a new `ai_signals` table.

### Signal types (v1)

| Type | Severity rules | Computed from | Surfaces in |
| --- | --- | --- | --- |
| `scale_candidate` | Critical if score ≥ 85 and freq < 2 and 7d trend up | `meta_daily_insights` + creative score | Optimize |
| `fatigue_kill` | Critical if freq ≥ 4 and CTR ↓ ≥ 25% w/w | `meta_daily_insights` 14-day window | Optimize |
| `funnel_leak` | Critical if step→step rate ↓ ≥ 20% w/w | `website_events` step rollup | Convert |
| `unread_conversation` | Warn if unread + oldest > 4 h; critical if > 24 h | `meta_social_threads` | Convert + `/m/inbox` |
| `attribution_gap` | Warn if `last_paid_touch` null but `fbp`/`fbc` present and conversion in last 7 d | `website_conversions` | Convert |
| `capi_failure` | Critical if `meta_capi_status in (failed, error)` in last 24 h | `website_conversions` | Convert |
| `sync_stall` | Critical if latest `sync_runs` > 30 h old | `sync_runs` | Operate |
| `backfill_stall` | Warn if any chunk attempts ≥ 3 with status='failed' | `meta_ads_backfill_chunks` | Operate |
| `env_drift` | Critical if `/api/health` reports missing perm or `ads_management` granted | runtime check | Operate |

Severity is a three-step ordinal: `info`, `warn`, `critical`. Score is a 0–100 integer used for sort within a severity tier. Ties broken by `created_at` desc.

### Implementation

- New file `src/lib/signal-engine.ts` exposes `computeSignals(environment: 'production' | 'staging'): Promise<Signal[]>` that internally calls existing primitives (`buildCreativeDiagnostics`, fatigue helpers, funnel analyzers, social inbox retrieval, attribution ledger).
- New cron endpoint `GET /api/cron/signals` runs every 15 minutes, secured by `CRON_SECRET`. Calls `computeSignals` and upserts `ai_signals`. Old signals beyond their `expires_at` are soft-cleared.
- Read endpoint `GET /api/signals?room=optimize|convert|operate`. Returns the top N signals scoped to caller's environment and the requested room.
- Action endpoints: `POST /api/signals/:id/dismiss` (writes `dismissed_at`), `POST /api/signals/:id/act` (telemetry only, no state mutation). Both authorized via the same permission as the room they belong to.

### Telemetry

Each signal carries a `signal_id` so the dashboard can correlate click-through and dismissal rates. No PII stored in signal payload.

## 10. Backend contract preservation guarantee

The following endpoints must remain byte-identical in request and response shape during and after the rebuild. The new UI must not change any of them. CI test coverage exists for several; we will not weaken any existing test.

| Endpoint | Method | New UI behavior |
| --- | --- | --- |
| `/api/auth/session` | POST, DELETE | Unchanged; new sign-in page calls same payload |
| `/api/auth/me` | GET | Unchanged |
| `/api/users` | GET | Unchanged; POST/PATCH stay returning 403 |
| `/api/sync` | POST | Unchanged; called from Operate manual sync |
| `/api/cron/sync` | GET | Unchanged; not called from UI |
| `/api/meta/backfill` | GET, POST, PATCH | Unchanged; surfaced in Operate |
| `/api/meta/backfill/run` | POST | Unchanged; cron only |
| `/api/cron/meta-backfill` | GET | Unchanged; cron only |
| `/api/meta/backfill/month-resync` | POST | Unchanged; cron only |
| `/api/meta/data-health` | GET | Unchanged; surfaced in Operate Health tab |
| `/api/meta/webhook` | GET, POST | Unchanged; signature path frozen |
| `/api/social-inbox` | GET | Unchanged |
| `/api/social-inbox/sync` | POST | Unchanged |
| `/api/social-inbox/suggest-reply` | POST | Unchanged |
| `/api/website/events` | POST, OPTIONS | Unchanged; not called from UI |
| `/api/website/conversions` | POST, OPTIONS | Unchanged; not called from UI |
| `/api/website/attribution/resolve` | POST, OPTIONS | Unchanged; not called from UI |
| `/api/chat` | POST | Unchanged; called from Optimize chat rail and Cmd+K |
| `/api/reports` | POST | Unchanged; called from Optimize reports panel |
| `/api/analysis` | GET, POST, PATCH, DELETE | Unchanged; called from Cmd+K and Optimize Save view |
| `/api/creative-analysis/ad-video-metrics` | GET | Unchanged; called from creative drawer |
| `/api/health` | GET | Unchanged |
| `/api/system-health` | GET | Unchanged |

### New endpoints introduced

| Endpoint | Method | Purpose | Auth |
| --- | --- | --- | --- |
| `/api/signals` | GET | List signals for room | Cookie + room-matching permission |
| `/api/signals/[id]/dismiss` | POST | Soft-dismiss a signal | Same |
| `/api/signals/[id]/act` | POST | Telemetry only | Same |
| `/api/cron/signals` | GET | Recompute signals | CRON_SECRET |
| `/api/social-inbox/send-reply` | POST | Send a human-approved reply to Meta | Cookie + `send_inbox_reply` permission |
| `/api/social-inbox/state` | PATCH | Snooze, assign, mark-read | Cookie + `manage_inbox_state` permission |

The new endpoints follow the existing route handler conventions, use existing helpers (`ads-analyst-db.ts`, `app-auth.ts`, `runtime-guardrails.ts`), and stamp `environment` on every write.

### Webhook handling guarantee

`/api/meta/webhook` is the single most fragile contract. The new UI never calls it. The handler code is not touched. Production verify token, signature secret, and subscription fields stay where they are.

## 11. Human-approval reply send guardrail (critical)

Adding `send_inbox_reply` introduces a code path that calls Meta to send a message or comment. The platform-foundations skill and existing security docs both require that no automation sends a customer-facing message without explicit human action. The PRD enforces this contract at every layer.

1. UI: the Send button is disabled until the composer text field has focus + non-empty content. It is also disabled while a draft is being generated or refreshed.
2. UI: clicking Send opens a small inline confirmation chip ("Send as {brand}? Reply will be sent on your behalf.") with explicit Confirm. Two-step click is required.
3. Server: `/api/social-inbox/send-reply` requires a per-request CSRF nonce issued by `/api/auth/me` and rotated per session.
4. Server: the request body must include the exact draft text the user saw. The server compares against the latest stored `ai_reply_suggestions` row for that source. If text was generated by AI, the row's status moves to `approved` then `sent`.
5. Server: the call to Meta is made with rate limiting per page and per user.
6. Audit: every send writes a row to `meta_social_messages` with `direction='outbound'` and a metadata field linking back to the originating draft and sending user.

No cron path, scheduled task, or automation can call this endpoint. AI cannot send replies. Only a signed-in user with `send_inbox_reply` and an explicit two-step click can trigger a send.

## 12. New migrations

All migrations are additive. No drops, no destructive alters, no changes to existing constraints except those that add environment scoping (already in Phase 5).

### 12.1 `ai_signals`

```sql
-- 20260520010000_ai_signals.sql
create table public.ai_signals (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production', 'staging')),
  signal_type text not null,
  severity text not null check (severity in ('info','warn','critical')),
  entity_type text not null,
  entity_id text,
  brand text,
  title text not null,
  summary text,
  score smallint not null check (score between 0 and 100),
  recommendation text,
  payload jsonb default '{}'::jsonb,
  expires_at timestamptz,
  dismissed_at timestamptz,
  dismissed_by uuid,
  created_at timestamptz not null default now()
);
create index ai_signals_room_idx
  on public.ai_signals (environment, dismissed_at, severity, score desc, created_at desc);
create index ai_signals_entity_idx
  on public.ai_signals (entity_type, entity_id);
-- Row-level security follows existing analyst-table pattern (Phase 3).
```

### 12.2 Conversation state columns

```sql
-- 20260520020000_conversation_state.sql
alter table public.meta_social_threads
  add column if not exists snoozed_until timestamptz,
  add column if not exists assigned_to uuid,
  add column if not exists read_at timestamptz;

alter table public.meta_social_comments
  add column if not exists snoozed_until timestamptz,
  add column if not exists assigned_to uuid,
  add column if not exists read_at timestamptz;

create index if not exists meta_social_threads_state_idx
  on public.meta_social_threads (environment, snoozed_until, read_at, last_message_at desc);
create index if not exists meta_social_comments_state_idx
  on public.meta_social_comments (environment, snoozed_until, read_at, created_time desc);
```

### 12.3 Ad notes

```sql
-- 20260520030000_ad_notes.sql
create table public.ad_notes (
  id uuid primary key default gen_random_uuid(),
  environment text not null default 'production'
    check (environment in ('production','staging')),
  meta_account_id text not null,
  ad_id text not null,
  body text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ad_notes_ad_idx
  on public.ad_notes (environment, meta_account_id, ad_id, created_at desc);
```

### 12.4 Permission enum additions

```sql
-- 20260520040000_permissions.sql
-- Extend permission enum used by access-control.ts:
alter type public.permission add value if not exists 'send_inbox_reply';
alter type public.permission add value if not exists 'manage_inbox_state';
-- Update role permission grants in access-control.ts to match.
```

All four new migrations live in `supabase/migrations/` under the existing date convention. The static data-boundary test in `tests/data-boundaries.test.ts` is updated to whitelist the new tables for analyst writes.

## 13. Tech stack changes

### Adds

- `@visx/visx` — composable D3 wrapper for chart density.
- `@tanstack/react-table` — headless table primitive for the creative grid and customer ledger.
- `@tanstack/react-virtual` — virtualization helper.
- `cmdk` — accessible command palette.
- `vaul` — mobile drawer / bottom sheet primitive.
- `sonner` — toast notifications.

### Removed / deprecated

- `recharts` — replaced by Visx in the new surfaces. Old code paths can keep using it during transition only if any are not rewritten; the goal is zero-Recharts at cutover.

### Kept

- Next.js 16.2.6, React 19, Tailwind 4, Supabase, OpenAI SDK, Zod, date-fns, lucide-react, clsx, tailwind-merge.

### Build and ops

- ESLint config unchanged.
- TypeScript strict checks unchanged.
- `npm test` continues to run `tests/*.test.ts`.
- `vercel.json` updated to register the new cron `/api/cron/signals`.

## 14. Visual system (operates under platform-foundations + Hung Phat hybrid)

This skill defers visuals to a brand skill where present. The brand here is Hung Phat luxury jewelry. The visual system fuses HP brand restraint with internal-tool density.

- **Type:** editorial serif (Hung Phat title face) for room headers and primary status sentences; system sans for everything else; tabular nums for all metric cells.
- **Palette:** beige page background, charcoal text, HP signature pink as the single accent (CTA, active state, severity-critical indicator), neutral grays for surfaces. Dark mode is a charcoal-on-near-black variant with the same accent.
- **Density:** 32px default row height, 24px compact. Card padding capped at 16px. 30+ table rows above the fold at 1440 viewport.
- **Motion:** 120ms ease-in-out for state transitions. No decorative animation. No splashy hero motion. Drawer transitions use vaul defaults.
- **Iconography:** lucide-react throughout. No emoji in chrome (signals may use a single optional severity icon).
- **Touch targets:** 44 × 44 pt minimum on mobile and tablet, 8px gap between adjacent targets.
- **Focus states:** visible 2px outline at the platform default accent, 2px offset, never removed.

## 15. Telemetry and observability

- Page navigation events: route_loaded (route, role, ms).
- Per-room actions listed in section 8.
- Signal lifecycle: `signal_created` (in server), `signal_clicked`, `signal_dismissed`, `signal_acted`.
- Reply send: `inbox_reply_sent` (platform, draft_was_ai_generated, time_from_received).
- Errors: every sanitized error message logged with a stable error code.

Telemetry sink: existing Supabase logging or a lightweight `events_telemetry` table; no third-party analytics added in this rebuild. Final sink choice in section 18 open questions.

## 16. Phases and milestones

Two weeks of focused work, twelve phases. Each phase has a clear deliverable. Phases 0–4 are the foundation and must finish before any user-facing room is shipped.

### Phase 0 — Verify cloud state (½ day)

- Run `npx supabase@latest migration list --linked` to compare local vs cloud migration ledger.
- List Vercel preview-scope env vars; confirm `SUPABASE_ADS_ANALYST_WEB_JWT`, `_WORKER_JWT`, `_INGEST_JWT` present.
- Sanity-check Phase 2/3/4/5 migrations are applied; if not, apply them on a maintenance window with explicit approval.
- Spot-check that an inserted row with `environment='staging'` is invisible to a production-scoped client.

Deliverable: a short Phase 0 report appended to this doc with checkboxes. No code shipped.

### Phase 1 — Branch and Vercel preview (½ day)

- Create `ui-rebuild` branch off `main`.
- Push empty commit to trigger Vercel preview build.
- Set preview-scope env vars:
  - `ADS_ANALYST_ENVIRONMENT=staging`
  - `ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS=true`
  - `ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS=true`
- Confirm `/api/health` green on the preview URL.

### Phase 2 — Install viz stack and design tokens (½ day)

- `npm i @visx/visx @tanstack/react-table @tanstack/react-virtual cmdk vaul sonner`.
- Add design tokens module under `src/lib/design-tokens.ts` codifying typography scale, spacing scale, color tokens, motion durations.
- Add a `src/components/v2/` directory for the new component library.

### Phase 3 — New migrations and signal engine (2 days)

- Author and apply migrations from section 12 to the cloud Supabase project.
- Implement `src/lib/signal-engine.ts` with all nine signal types.
- Implement `/api/cron/signals`, `/api/signals`, `/api/signals/[id]/dismiss`, `/api/signals/[id]/act`.
- Update `vercel.json` to register the 15-minute cron.
- Add tests for each signal type covering one positive and one negative case.

### Phase 4 — New app shell and navigation (1 day)

- New `src/components/v2/app-shell.tsx` with role-aware nav, health pill, identity menu, Cmd+K trigger.
- Sign-in page reskinned.
- No-access page reskinned.
- Server-side router that maps role → landing route.
- Signal Strip component reading from `/api/signals`.

### Phase 5 — Optimize room (3 days)

- Status sentence component.
- Filter bar.
- Visx time-series chart with brush + comparison toggle.
- TanStack creative grid + drawer.
- Chat rail.
- Save view + Open view + Reports panel.
- Loading, empty, error, saving states.
- Mobile reflow.

### Phase 6 — Convert room (3 days)

- Status sentence component.
- Funnel viz (Visx funnel + step sparklines).
- Customer ledger (TanStack).
- Conversation queue + detail.
- AI reply composer with human-approval guardrail.
- Snooze and assign.
- Mobile reflow.

### Phase 7 — Operate room (1.5 days)

- Pipelines tab.
- Coverage heatmap.
- Health tab (mirrors `/api/health` + `/api/system-health`).
- People tab (read-only roster from analytics view).

### Phase 8 — Sales mobile inbox shell (1 day)

- `/m/inbox` route group with isolated layout.
- Conversation list + detail (vaul transitions).
- Reuses Convert room's conversation detail components.
- Sign-out, identity menu, sync indicator only.

### Phase 9 — Cmd+K palette (½ day)

- cmdk-based palette with router and intent matcher.
- Routes free-text to `/api/chat` or `/api/analysis`.
- "go" verbs route inside the app.
- Entity lookup (ad id, creative name) jumps to the right drill-down.

### Phase 10 — Glossary enforcement + polish (½ day)

- Lint pass for any UI string that still uses old labels (Schedule, Visitor, DM, Umbrella, ad set, Active/Deleted, etc.).
- Add a small `glossary.ts` runtime helper that any UI module can call to format a status word or noun.
- Confirm all action verbs match the glossary.

### Phase 11 — Verification (1 day)

- Acceptance criteria checklist (section 17).
- `npm test` passes.
- `/api/health` green on preview.
- Manual sync triggered against preview; new row in `sync_runs` with `environment='staging'`.
- AI report generated; row in `ai_reports` with `environment='staging'`.
- AI reply suggestion generated; row in `ai_reply_suggestions` with `environment='staging'`.
- Send reply path tested end-to-end against a staging Meta sandbox conversation only.
- Webhook smoke test: signed payload posted to preview `/api/meta/webhook`, row lands in staging-fenced `meta_social_messages`.
- Lighthouse on each room ≥ 90 mobile and desktop; TTI within targets.
- Spot-check production analyst tables for unchanged row counts during the preview test window.

### Phase 12 — Cutover (½ day)

- Open PR `ui-rebuild → main`.
- Production env vars updated (new module JWTs already present; only `vercel.json` cron addition needs to land).
- Merge during a low-traffic window.
- Watch `/api/health`, sync runs, and Meta webhook log for 60 minutes.
- Rollback runbook: Vercel one-click revert of the deployment; data is unaffected because no destructive migrations exist.

Total: roughly 16 working days. Slack built in for review and re-cuts.

## 17. Acceptance criteria

Cutover is blocked until every item is true.

### Functional

- [ ] Sign in with each role lands on the correct room.
- [ ] Marketing user can open Optimize and act on a signal end-to-end.
- [ ] Marketing user can open Convert, drill into a customer, open their conversation, and send an AI-drafted reply (against staging conversation).
- [ ] Sales user lands at `/m/inbox`, cannot reach Optimize or Operate, and can send a reply.
- [ ] Admin user can open Operate, manually trigger sync, and queue a backfill chunk for one month.
- [ ] Cmd+K answers a free-text question and jumps to a known ad by ID.
- [ ] No-access page shows for an authenticated user with no roles.

### Backend integrity

- [ ] All API contracts in section 10 unchanged. Spot-test request/response with existing scripts where they exist.
- [ ] Webhook signature path untouched. Smoke test from Meta sandbox lands a row.
- [ ] Sync, backfill, and CAPI paths all write to `environment='staging'` on the preview deployment.
- [ ] Spot-checked production analyst tables show no unintended row count change during preview testing.
- [ ] Data-boundary test (`tests/data-boundaries.test.ts`) passes; analyst code does not write Sales/ERP Core tables.

### Performance

- [ ] Each room TTI < 2 s broadband, < 4 s 4G simulated.
- [ ] Mobile Lighthouse ≥ 90 on inbox.
- [ ] Visx chart and TanStack table both render 1k rows without main-thread block > 50 ms.

### Accessibility

- [ ] Every interactive control keyboard-reachable.
- [ ] Signal cards announce title, severity, and recommendation to screen readers.
- [ ] Color paired with text or icon for status and severity.
- [ ] Focus visible everywhere.

### Glossary

- [ ] No UI string contains "Schedule" (use Booking), "Visitor" (use Customer), "DM" (use Conversation), "Umbrella" (use Group), "Ad set" in user copy (use Group of Ads), or old status enums.

## 18. Cutover and rollback runbook

### Cutover

1. Verify all acceptance criteria checked.
2. Confirm production env vars: every variable the new UI reads must exist in production scope, not only preview scope.
3. Merge PR `ui-rebuild → main` during 09:00–11:00 user-local low-traffic window.
4. Vercel auto-deploys main to production.
5. Watch dashboards for 60 minutes: `/api/health`, sync runs, webhook log, error rate.

### Rollback

1. Vercel dashboard → Deployments → previous production deployment → Promote to production.
2. Production reverts within ~30 seconds.
3. Data is safe: no destructive migrations were applied. New tables (`ai_signals`, `ad_notes`) remain in cloud but are unread by the reverted UI.
4. New permissions remain in the enum and are inert until the UI is re-released.

### What "broken" looks like

- `/api/health` reports new failures.
- Sync runs start failing.
- Webhook events stop landing.
- 5xx rate on any non-test endpoint rises above baseline.

Any of the above triggers immediate rollback. Investigation continues on the `ui-rebuild` branch.

## 19. Open questions (resolve before Phase 11)

1. Telemetry sink: keep events in Supabase or wire a lightweight Posthog/Mixpanel? PRD assumes Supabase for now.
2. Notifications: do unread-conversation signals need to push to email or Slack for sales after-hours? PRD assumes in-app only for v1.
3. Multi-brand UX: when VVS access goes live, do we want a brand switcher (HP / VVS / Both) or per-brand sub-routes (`/optimize?brand=vvs`)? PRD assumes filter-based.
4. Saved views and ad notes: per-user only or shareable with the team? PRD assumes per-user with a "Share" follow-up enhancement.
5. Read-only stakeholder identity: should they see all signals or only signals at severity warn+? PRD assumes all signals visible, only act/dismiss disabled.

## 20. Appendix — file and directory plan

```
src/
  app/
    (auth)/
      sign-in/page.tsx
      no-access/page.tsx
    (workspace)/
      layout.tsx                  # role-aware shell
      optimize/
        page.tsx
        ads/[adId]/page.tsx
      convert/
        page.tsx
        conversations/[id]/page.tsx
      operate/page.tsx
    (mobile)/
      m/inbox/
        page.tsx
        [conversationId]/page.tsx
    page.tsx                       # server redirect to role landing
    api/
      auth/...                     # unchanged
      sync/...                     # unchanged
      meta/...                     # unchanged
      social-inbox/
        route.ts                   # unchanged
        sync/route.ts              # unchanged
        suggest-reply/route.ts     # unchanged
        send-reply/route.ts        # NEW
        state/route.ts             # NEW
      website/...                  # unchanged
      reports/...                  # unchanged
      chat/...                     # unchanged
      analysis/...                 # unchanged
      health/...                   # unchanged
      system-health/...            # unchanged
      creative-analysis/...        # unchanged
      signals/
        route.ts                   # NEW
        [id]/dismiss/route.ts      # NEW
        [id]/act/route.ts          # NEW
      cron/
        sync/route.ts              # unchanged
        meta-backfill/route.ts     # unchanged
        signals/route.ts           # NEW
  components/
    v2/
      app-shell/...
      signal-strip/...
      status-sentence/...
      filter-bar/...
      chart/...                    # Visx wrappers
      table/...                    # TanStack wrappers
      drawer/...                   # vaul wrappers
      command-palette/...          # cmdk wrappers
      composer/...
      conversation-list/...
      conversation-detail/...
      funnel/...
      coverage-heatmap/...
      backfill-pipeline/...
      health-panel/...
      people-roster/...
  lib/
    signal-engine.ts               # NEW
    design-tokens.ts               # NEW
    permission-routing.ts          # NEW (role → landing route)
    (everything else unchanged)
supabase/migrations/
  20260520010000_ai_signals.sql                # NEW
  20260520020000_conversation_state.sql        # NEW
  20260520030000_ad_notes.sql                  # NEW
  20260520040000_permissions.sql               # NEW
docs/
  ui-rebuild-prd.md                            # this file
  ui-rebuild-cutover-runbook.md                # generated in Phase 12
```

— End of PRD —
