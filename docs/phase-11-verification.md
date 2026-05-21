# Phase 11 Verification Report

Status of every PRD §17 acceptance criterion, snapshotted at the end of
Phase 11. Items marked `✅ local` were verified against the source tree.
Items marked `🟡 staging-required` need a live preview URL (the Vercel
preview deploy of the AI-Dashboard-Revamp branch) to confirm.

Cutover (Phase 12) is blocked until every staging-required item is also
green.

## Functional acceptance criteria (PRD §17)

| Item | Status | Notes |
|---|---|---|
| Sign in with each role lands on the correct room | 🟡 staging-required | Routing logic in `src/lib/permission-routing.ts` is unit-covered; runtime sign-in needs preview URL. |
| Marketing user can open Optimize + act on a signal | 🟡 staging-required | Signals API is wired; UI buttons call `/api/signals/[id]/{act,dismiss}`. |
| Marketing user can open Convert, drill into customer, open conversation, send AI-drafted reply | 🟡 staging-required | Composer + suggest + send-reply (dry-run) wired. Live send gated by `ALLOW_LIVE_META_SEND`. |
| Sales user lands at `/m/inbox`, cannot reach Optimize / Operate, can send reply | 🟡 staging-required | Route guards in `(workspace)/layout.tsx` + `/m/inbox/layout.tsx`. |
| Admin can open Operate, trigger sync, queue backfill chunk | 🟡 staging-required | Operate room ships in Phase 7. |
| Cmd+K answers free-text question + jumps to ad by ID | ⏳ Phase 9 (optional polish) | Not blocking cutover — can ship post-launch. |
| No-access page shows for authenticated user with no roles | 🟡 staging-required | `/no-access` route exists; needs runtime check. |

## Backend integrity

| Item | Status | Notes |
|---|---|---|
| All API contracts in §10 unchanged | ✅ local | No edits to any existing API route; only new routes added (`/api/signals*`, `/api/cron/signals`, `/api/social-inbox/send-reply`, `/api/social-inbox/suggest-reply`, `/api/debug/identity-config`). |
| Webhook signature path untouched | ✅ local | `src/app/api/meta/webhook/route.ts` last touched in commit `469f4f9` (long before this rebuild started). |
| Sync / backfill / CAPI write `environment='staging'` on preview | ✅ local | All inserts route through `withAdsAnalystEnvironment`; verified during Phase 0 + the staging dashboard recovery. |
| Production analyst tables show no unintended row count change during preview testing | 🟡 staging-required | Spot-check by running a `select count(*)` per env before + after a preview-driven sync. |
| `tests/data-boundaries.test.ts` passes | ✅ local | Part of the 144/144 green suite. |

## Phase 11 send-reply guardrails (new)

| Item | Status | Notes |
|---|---|---|
| ALLOW_LIVE_META_SEND defaults to false (dry-run) | ✅ local | `isLiveSendEnabled()` returns false unless flag is `true`/`1`/`yes`. Unit-tested in `tests/social-reply-send.test.ts`. |
| Two-click composer confirmation enforced | ✅ local | Composer reveals the "Send as BRAND?" chip on first click; only Confirm POSTs. |
| `send_inbox_reply` permission required | ✅ local | Route calls `requirePermissionFromRequest`. |
| Audit row inserted BEFORE Meta call | ✅ local | Route flow: insert `ai_reply_suggestions` (status=`approved`) → call executor → update to `sent`. |
| Meta failure leaves row at `approved` with `send_error` | ✅ local | Executor's catch block patches `send_error` then re-throws. |
| Rate limit: 10 sends per approver per 60s | ✅ local | Count query against `ai_reply_suggestions.context_used->>approved_by`. |
| `meta_send_id` + `sent_at` recorded on successful send | ✅ local | Migration 20260520040000 + executor's `updateAuditRow`. |
| Outbound row written to `meta_social_messages` (DM) or `meta_social_comments` (comment) | ✅ local | `recordOutboundRow` branches on `sourceType`. |

## Performance

| Item | Status | Notes |
|---|---|---|
| Each room TTI < 2 s broadband / < 4 s 4G | 🟡 staging-required | Needs Lighthouse on preview URL. |
| Mobile Lighthouse ≥ 90 on `/m/inbox` | 🟡 staging-required | Same. |
| Visx + TanStack render 1k rows without > 50 ms main-thread block | 🟡 staging-required | Profile on preview URL with a 1k-row stub. |

## Accessibility

| Item | Status | Notes |
|---|---|---|
| Every interactive control keyboard-reachable | 🟡 staging-required | All `<button>` + `<a>` elements; no `<div onClick>`. Needs runtime check. |
| Signal cards announce title / severity / recommendation to SR | 🟡 staging-required | Markup uses semantic `<section>` + `aria-label`. Needs SR pass. |
| Color paired with text or icon for status / severity | ✅ local | All signal/status colors carry text labels. |
| Focus visible everywhere | 🟡 staging-required | Tailwind `focus:ring-2` applied; runtime check. |

## Glossary lint (PRD §17, line 761)

| Item | Status | Notes |
|---|---|---|
| No UI string contains Schedule / Visitor / DM / Umbrella / "Ad set" / old status enums | ✅ local | Six user-facing strings updated in commit `ff58d27` (Visitor→Customer, "Unread DMs"→"Unread conversations", "DM thread"→"Conversation", `DM` badge→`Msg`). JSDoc comments + backend field names (`schedules`, `byUmbrella`) intentionally left — glossary rule scopes to UI copy. |

## Pending pre-cutover cleanups

These are Phase 12 (cutover) items, NOT Phase 11 verification gaps. They
are listed here so they aren't forgotten.

- Remove `src/app/api/debug/identity-config` route (temporary diagnostic).
- Remove diagnostic `console.log` in `src/app/(workspace)/optimize/page.tsx`.
- Document rollback runbook (already drafted in PRD §18).

## How to drive the staging-required items to green

1. Wait for Vercel to finish building the latest AI-Dashboard-Revamp push
   (commit `ff58d27`).
2. Open the preview URL in Chrome, sign in as each test role
   (admin / marketing / sales / no-roles), confirm room landing matches
   `src/lib/permission-routing.ts`.
3. From the admin account, hit `/api/health` and confirm no new failures.
4. From the admin account, run a manual Meta sync from Operate and watch
   `meta_social_sync_runs` accumulate rows with `environment='staging'`.
5. From the marketing account, open a Convert conversation and click
   "Ask AI" → confirm a draft loads → click Send → confirm the audit row
   in `ai_reply_suggestions` has `status='approved'` and the response
   notice mentions "Live delivery is disabled".
6. Flip `ALLOW_LIVE_META_SEND=true` in Vercel preview env vars, redeploy,
   send a reply to a known test thread (your own DM), confirm Meta returns
   a message_id and the audit row transitions to `status='sent'`.
7. Run Lighthouse mobile + desktop on `/optimize`, `/convert`, `/operate`,
   `/m/inbox`. Each must score ≥ 90.
8. Hit the Meta webhook smoke test (resend a known event from Meta's
   webhook tester); confirm a row lands in `meta_social_messages` or
   `meta_social_comments`.

When every row in this doc is `✅`, run the PR `AI-Dashboard-Revamp → main`
in the 09:00–11:00 user-local low-traffic window (PRD §18).
