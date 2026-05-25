---
title: Build Comprehensive Meta Messaging Inbox
type: feat
status: draft
date: 2026-05-23
related_docs:
  - docs/meta-messaging-inbox/prd.md
  - docs/meta-messaging-inbox/rfc.md
  - docs/adr/0001-meta-messaging-inbox-data-model.md
  - docs/meta-messaging-inbox/test-plan.md
---

# Build Comprehensive Meta Messaging Inbox

## Summary

Build the comprehensive Meta Messaging Inbox inside the Meta Ads AI app. Add inbox-owned normalized conversation data, deterministic conversation identity, source-channel filters, customer/profile/source attribution capture, team-based queue access, no-snooze workflow state, reply-window eligibility, failed-send retry, send/receive attachments, public comment operations, full conversation history loading, sales-owned labels/Inbox Outcomes, conservative Verified Business Outcomes, in-app badges/dashboard, manager dashboard, QA, audit, and read-only marketing intelligence.

---

## Problem Frame

Current inbox proves Meta connectivity but is not yet a complete sales operating system. Customer names/profile details do not reliably flow through, source ad/message attribution is not normalized, conversation history is loaded from shallow global slices, marketing currently has operational inbox permissions, snooze exists in older state design, and there is no team-based queue model.

---

## Requirements

- Inbox UI and conversation operations stay in Meta Ads AI.
- Meta webhook ingestion stays in Meta Ads AI.
- Sales/ERP remains central identity/vocabulary source through read-only boundary.
- Marketing is read-only for inbox operations.
- No Snooze workflow for inbox conversations.
- Team-based queue access replaces one-off per-user queue assignment.
- Operational write access belongs to `sales` and `sales_lead`.
- Source-channel filters must include Facebook Message, Instagram Message, Facebook Public Comment, Instagram Public Comment, Private Reply from Comment, Ad Referral / Click-to-Message, and Other / Unknown.
- Webhook ingestion normalizes customer name, username/handle, profile picture, best available profile link/reference, referral/ad context, first-touch attribution, and routing explanation.
- Reply workflow models 24-hour standard window, Human Agent / 7-day eligibility where allowed, expired state, failed-send inbox, and retry.
- Inbound and outbound attachments are supported in first release where Meta allows them.
- Sales can public reply, private reply/DM where Meta allows, like, hide, and delete public comments in permitted queues.
- Alerts are in-app badges and dashboard indicators only in first release; no email, Slack, SMS, or external push alerts.
- V1 measures response times and response-age buckets only; it does not define SLA targets.
- Close/lost required fields are the same for all queues in v1: Lead Quality, reason tags, Inbox Outcome, and Inbox Lost Reason when lost.
- Attachment receive/send supports all Meta-supported types, capability-gated by platform/account.
- Sales can add/edit/delete inbox-owned customer phone/email manually on accessible conversations to improve future conservative verified matching.
- Hide/delete comment actions require confirmation and a reason note.
- Sales can create personal saved-reply drafts; sales lead/admin approves shared templates.
- No AI features ship in the first foundation build; existing AI surfaces should be hidden, disabled, or placeholder/stopped states only.
- Full manager dashboard ships in the first release.
- Manager dashboard defaults to last 7 days.
- Sales can close or mark lost conversations they can access.
- Sales can see full audit trail for conversations they can access; sales lead/admin can see broader scoped audit.
- Conversation detail loads full known history for selected conversation with pagination.
- Sales users can reply, claim permitted team-queue conversations, label Lead Quality, add locked reason tags, set status/follow-up, and set Inbox Outcome/Inbox Lost Reason. Sales leads assign/reassign within scope.
- Sales leads can monitor response time, unanswered messages, missed follow-ups, workload, label completeness, failed sends, QA, audit, Inbox Outcomes, and Verified Business Outcomes by user/team/queue/source.
- Verified Business Outcome is read-only and matched conservatively from Sales/ERP read models when high-confidence identifiers exist.

---

## Scope Boundaries

- Build and operate the inbox inside the Meta Ads AI app.
- Keep Meta webhook ingestion in the Meta Ads AI app.
- Read central users/roles/canonical vocabulary from Sales/ERP through the existing data-boundary pattern.
- Do not move conversation operations, queue routing, replies, or manager reporting into the standalone Sales app.
- Do not write directly into Sales/ERP Core tables.
- Use team-based queue access, not one-off per-user queue assignments as the primary model.

---

## Context & Research

- Current routes and APIs already live in Meta Ads AI: `/convert/inbox`, `/m/inbox`, `/api/social-inbox/*`, `/api/meta/webhook`.
- Current social tables store raw threads/messages/comments/sync runs.
- Current webhook stores raw payload but does not normalize first-touch ad/referral/profile/routing data.
- Current detail reads latest global messages, which can omit older or non-latest messages for selected thread.
- Current Sales/ERP boundary disables Ads Analyst user-management writes and provides read-only identity profile path in limited mode.
- Current permission groups give marketing send/manage access, which must change.
- Current conversation state migration includes snooze fields, which must not appear in new inbox workflow.
- Current send code uses normal response sends and does not yet model Human Agent / 7-day eligibility or per-conversation reply countdown.
- Current send code is text-only and does not include outbound attachment send, public comment operations, or an operator-facing failed-send inbox/retry workflow.
- Current suggest-reply/AI surfaces are not part of the first foundation build and should be hidden, disabled, or placeholder-only.

---

## Key Technical Decisions

- Meta Ads AI owns inbox UI, APIs, webhook ingestion, queue routing, labels, manager dashboard, and marketing reports.
- Sales/ERP supplies central identity and canonical vocabulary through read-only boundary.
- Queue access is team-based.
- Marketing is read-only for inbox operations.
- No Snooze state/control/API behavior.
- Add normalized inbox operation layer rather than relying only on raw social rows.
- Add conversation-specific history API and storage/backfill path.
- Add canonical conversation identity and source-channel filtering separate from queue category.
- Add soft realtime collision prevention through viewing/typing/replying presence.
- Add reply-window countdown, failed-send tracking, and retry workflow.
- Use dual outcomes: editable Inbox Outcome for sales workflow, read-only Verified Business Outcome for conservative business reporting.
- Build foundation first: permissions, no-snooze contract, normalized shell, team queues, source-channel identity, and basic read/write state before advanced productivity/reporting.
- Use in-app badges/dashboard alerts only in first release.
- Do not set SLA targets in v1; collect baseline response-time data first.
- Support public comment reply/private reply, like, hide, and delete for sales/sales lead within permitted queues.
- Sales can directly change queue category for conversations they can access.
- Use hybrid profile enrichment: webhook data immediately, async repair for missing profile/source data.
- QA scorecards are optional manager coaching tools, not required workflow gates.
- Inbox settings live inside the inbox, likely as `/convert/inbox/settings`, for teams, queue access, routing rules, fallback routing, templates if grouped there, and data-quality repair tools if grouped there.
- Close/lost field requirements are uniform across queue categories in v1.
- Attachment support uses platform/account capability gating instead of narrowing to a small hardcoded type set.
- Sales-entered phone/email add/edit/delete is inbox-owned, audited, and not written directly to Sales/ERP Core.
- Shared saved replies/templates require sales lead/admin approval; sales personal drafts do not.
- No AI reply suggestions, AI summaries, AI label suggestions, or AI routing in first foundation build.
- Manager dashboard is full first-release scope, not a later nice-to-have.

---

## Open Questions

- Which Human Agent / 7-day behavior is available for each platform/account, and exact send parameters required.
- Which Sales/ERP read-only identifiers beyond sales-entered inbox phone/email are available in v1 for conservative verified business outcome matching.
- Whether queue-specific SLA targets should be added later after baseline response-time data is collected.

---

## Phase Gates

### Phase 1: Foundation

- Align permissions: marketing read-only, sales/sales lead operational writes.
- Remove Snooze from inbox UI/API contract.
- Add locked source-channel, queue category, status, Lead Quality, reason tag, Inbox Outcome, Lost Reason, and customer contact method vocabularies.
- Add normalized conversation shell, canonical conversation identity, team queues, team access, All-as-allowed-union, basic list/detail read path, assignment/claiming, and audit events.

### Phase 2: Ingestion And History

- Normalize webhook/profile/source/referral/ad fields.
- Preserve first-touch attribution.
- Add routing rules and routing explanation.
- Add hybrid customer profile enrichment/repair: immediate webhook fields plus async repair job.
- Add full selected-conversation history pagination.

### Phase 3: Reply Reliability

- Add reply-window countdown, standard/Human Agent/expired eligibility, failed-send inbox, retry flow, attachment receive/send, and public comment actions.
- Add soft realtime collision prevention.

### Phase 4: Management, Intelligence, And Productivity

- Add full manager dashboard, in-app badges, marketing intelligence, conservative Verified Business Outcome matching, saved replies, internal notes, @mentions, coaching comments, optional QA scorecards, audit UI, and data-quality reporting. This phase remains part of first-release scope.

---

## Implementation Units

### Unit 1: Permission Alignment

- Remove `send_inbox_reply` and `manage_inbox_state` from marketing roles.
- Restrict operational inbox writes to `sales` and `sales_lead`.
- Do not grant inbox operator permissions to `client_advisor` or `joc` by default.
- Update permission labels/descriptions to remove snooze language.
- Add/adjust tests proving marketing can view inbox/reporting but cannot reply, assign, label, set Inbox Outcome, or override routing.

### Unit 2: No-Snooze State Contract

- Remove Snooze controls from inbox UI if present.
- Do not expose snooze in new APIs.
- Leave old DB columns untouched unless a safe migration is approved.
- Add regression tests proving no Snooze status/control appears in inbox workflows.

### Unit 3: Team-Based Queue Model

- Add inbox-owned team tables keyed to central Sales/ERP user IDs.
- Add locked queue categories.
- Add team-to-queue access mapping.
- Add Inbox Settings subpage configuration path or seed/config-based setup for first release.
- Enforce All view as union of allowed queue categories.

### Unit 4: Normalized Conversation Layer

- Add inbox-owned normalized conversation/state tables.
- Add canonical conversation identity fields and source-channel enum.
- Add source-channel filters independent of queue category.
- Backfill conversations from `meta_social_threads` and `meta_social_comments`.
- Track conversation status, assigned team/user, follow-up date, Lead Quality, locked reason tags, Inbox Outcome, Inbox Lost Reason, and audit events.
- Add uniform close/lost validation across all queues.

### Unit 5: Webhook Normalization

- Update `ingestMetaWebhookPayload` flow after raw upsert.
- Extract customer display name, username/handle, profile picture, profile link/reference, platform/page/IG IDs, participant ID, message ID, timestamp, referral, `ad_id`, `ads_context_data`, `ref`, source post/media/comment/product IDs, source permalink, and raw payload.
- Store raw payload for backend/debug only; do not expose raw Meta payload in UI.
- Preserve first-touch source and do not overwrite it with later weaker data.
- Join first-touch source to existing campaign umbrella/campaign/ad set/ad/creative data when possible.
- Apply routing rules and save category, confidence, and explanation.
- Support manual queue override by sales for conversations they can access, with audit event.

### Unit 6: Profile Enrichment And Repair

- Fill profile fields immediately from webhook payload when present.
- Add async profile lookup/repair path for conversations missing customer name/profile metadata.
- Store best available profile reference when full profile link is unavailable.
- Add inbox-owned phone/email contact method storage with validation, provenance, actor, add/edit/delete support, and audit events.
- Add admin/data-quality report for missing name/profile/source fields.

### Unit 7: Full Conversation History

- Add conversation-specific messages endpoint with cursor pagination.
- Change conversation detail to load by selected conversation/thread ID.
- Add sync/backfill pagination for older messages where Meta allows.
- Show history completeness state in UI.

### Unit 8: Reply Eligibility, Failed Sends, Attachments, And Public Comment Actions

- Add reply-window fields and countdown.
- Add send eligibility: standard reply allowed, Human Agent allowed, expired, unknown.
- Add send attempt table/state and failed-send inbox.
- Store Meta error code/subcode/message/trace when available.
- Add retry action with duplicate-send protection.
- Normalize inbound attachment metadata and display supported attachments.
- Add outbound attachment send support for all Meta-supported types where the platform/account/media type capability allows it.
- Add public comment action support: public reply, private reply/DM where supported, like, hide, delete.
- Require confirmation, reason note, and audit trail for hide/delete.

### Unit 9: Presence And Collision Prevention

- Add realtime presence channel for viewing/typing/replying in a conversation.
- Show "Name is typing/replying" warning in conversation detail.
- Treat presence as advisory, not a hard lock.
- Keep assignment ownership as stronger guardrail.

### Unit 10: Sales Inbox UI

- Add queue tabs and filters.
- Hide/disable AI reply/summarization/label/routing controls or render future placeholder/stopped states only.
- Add Inbox Settings subpage entry point for users with configuration access.
- Add source-channel filter.
- Add in-app badges for assigned to me, needs reply, unassigned team queue, failed send/retry, overdue follow-up, unread/new activity, and public comments needing action.
- Add customer/source attribution panel at top of conversation detail.
- Add ad creative preview in conversation detail.
- Add status, assignment, follow-up, Lead Quality, reason tags, Inbox Outcome, and Inbox Lost Reason controls.
- Add uniform close/lost validation helper text across all queues.
- Allow sales to close or mark lost accessible conversations after required fields are complete.
- Add customer phone/email add/edit/delete controls in profile panel with provenance display.
- Add helper text/tooltips for canonical labels.
- Add saved reply/template picker by queue, source channel, language, and Lead Quality.
- Add secondary panels for internal notes, @mentions, manager coaching, optional QA scorecards, audit trail, and send attempts.
- Show full audit trail to sales for conversations they can access while keeping raw Meta payload hidden from UI.

### Unit 11: Manager Dashboard

- Build full manager dashboard metrics for unanswered messages, first-response time, response-age buckets, missed follow-ups, stale threads, workload, label completeness, Inbox Outcomes, and Verified Business Outcomes.
- Default manager dashboard date range to last 7 days.
- Add failed sends, retry backlog, optional QA scorecards, audit events, and coaching metrics.
- Add filters by user/team/queue/source-channel/campaign umbrella/ad/creative/message.
- Use in-app dashboard indicators only; do not add email, Slack, SMS, or external push alerts in first release.

### Unit 12: Marketing Intelligence

- Build read-only reporting for Lead Quality, Inbox Outcome, and Verified Business Outcome by campaign umbrella, campaign, ad set/group of ads, ad, creative, message/referral, and queue.
- Include attribution coverage and missing-source reports.

### Unit 13: Conservative Verified Business Outcome Matching

- Read candidate identifiers from approved Sales/ERP read-only views or APIs only.
- Match verified outcomes only through high-confidence identifiers such as customer ID, booking/appointment ID, phone, email, approved profile reference, or future approved identity map.
- Include sales-entered inbox phone/email only when valid and audited.
- Do not verify from name-only or loose timing/context matches.
- Store verified outcome, verified lost reason, source type/id, match basis, confidence, matched entity type/id, matched timestamp, and conflict state.
- Show conflicts between Inbox Outcome and Verified Business Outcome in manager/marketing reporting without overwriting either value.

### Unit 14: Saved Replies, Notes, Coaching, QA, Audit, And Data Quality

- Add saved reply/template management: sales can create personal drafts; sales lead/admin approves shared templates.
- Add internal notes and @mentions.
- Add manager coaching comments.
- Add optional QA scorecards for manager coaching on selected sales replies.
- Add audit events for assignment, status, label, Inbox Outcome, routing override, and follow-up changes.
- Add data-quality checks for missing source, missing profile, missing lead quality, shallow history, and routing confidence.

---

## Verification

- Permission tests.
- Data-boundary tests.
- Webhook normalization unit tests.
- Routing rule tests.
- Team queue access tests.
- Source-channel filtering and conversation identity tests.
- Conversation history pagination tests.
- Reply-window eligibility, Human Agent eligibility, failed-send, retry, attachment receive/send, and public comment action tests.
- Presence/collision prevention tests.
- UI tests for no Snooze, marketing read-only, in-app badges, full history state, source/customer panels, reply countdown, public comment action controls, attachment send, and creative preview.
- Manager dashboard aggregate tests.
- Tests proving AI controls are hidden/disabled/placeholder-only in the first foundation build.
- Dual-outcome tests proving sales can set Inbox Outcome, Verified Business Outcome is system-only/read-only, weak Sales/ERP matches fail closed, and reports distinguish inbox-marked from verified outcomes.
- Regression tests for existing inbox reply send guardrails.
