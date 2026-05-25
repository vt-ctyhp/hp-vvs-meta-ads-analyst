# Meta Messaging Inbox Technical Design / RFC

| Field | Value |
| --- | --- |
| Status | Draft |
| Owner | viv |
| Date | 2026-05-23 |
| Source PRD | `docs/meta-messaging-inbox/prd.md` |
| Related ADRs | `docs/adr/0001-meta-messaging-inbox-data-model.md` |

## 1. Summary

Build the comprehensive Meta Messaging Inbox inside the Meta Ads AI app. Keep raw Meta ingestion in the existing social inbox pipeline, then add an inbox operation layer for attribution, customer profile enrichment, team-based queues, assignment, statuses, Lead Quality, Outcomes, public comment operations, send/receive attachments, manager reporting, and complete conversation history loading.

## 2. Goals And Non-Goals

Goals:

- Keep the Meta Messaging Inbox UI and conversation operations inside the Meta Ads AI app.
- Keep Meta webhook ingestion inside the Meta Ads AI app.
- Add first-touch Meta attribution capture, queue routing, team-based queue access, sales-owned labels, and management reporting on top of the existing social inbox foundation.
- Reuse central Sales/ERP identity and canonical vocabulary through the existing read-only data-boundary pattern.
- Enforce Meta send eligibility, including 24-hour standard reply window and Human Agent / 7-day support reply handling where allowed.
- Support public comment reply/private reply, like, hide, and delete for sales users where Meta allows it.
- Measure response times and response-age buckets in v1 without enforcing SLA targets.
- Support all Meta-supported attachment types in v1, capability-gated by platform/account.
- Allow sales users to add/edit/delete inbox-owned customer phone/email for future conservative verified matching.
- Keep AI features out of the first foundation build; hide/disable existing AI surfaces or show placeholder/stopped states only.
- Include the full manager dashboard in the first release scope.

Non-goals:

- Do not move Facebook or Instagram webhook ingestion into the standalone Sales app.
- Do not operate Meta conversations from the standalone Sales app.
- Do not write directly into Sales/ERP Core tables from the Meta Ads AI app.
- Do not build per-user queue access as the primary permissions model. Use teams / queue access groups.
- Do not add email, Slack, SMS, or external push alerts in the first release.
- Do not ship AI reply suggestions, summaries, label suggestions, or AI routing in the first foundation build.

## 3. Current System

The current code already places the inbox inside the Meta Ads AI app:

- `/convert/inbox` renders the desktop/workspace inbox through `SocialInboxClient`.
- `/m/inbox` and `/m/inbox/[conversationId]` render the sales-focused mobile inbox shell and conversation detail.
- `/api/social-inbox`, `/api/social-inbox/sync`, `/api/social-inbox/suggest-reply`, and `/api/social-inbox/send-reply` live in this app. Existing AI/suggest-reply surfaces should be hidden or disabled for the first foundation build.
- `/api/meta/webhook` verifies Meta signatures and calls `ingestMetaWebhookPayload`.
- `meta_social_threads`, `meta_social_messages`, `meta_social_comments`, and `meta_social_sync_runs` are analyst-owned social inbox tables.

The current code also already has a Sales/ERP data boundary:

- Sales/ERP Core owns identity and operational sales data.
- Meta Ads AI user-management writes are disabled.
- In the limited runtime path, Meta Ads AI reads identity through `analytics.ads_analyst_identity_profiles_v1`.

Current Meta access check on 2026-05-24:

- Token permissions query succeeds.
- `pages_show_list`, `pages_manage_metadata`, `pages_read_engagement`, `pages_messaging`, `instagram_basic`, `instagram_manage_messages`, `instagram_manage_comments`, and `pages_manage_engagement` are granted.
- Managed Page lookup succeeds and includes the Page `MESSAGING` task.
- Connected Instagram business account is present.
- Page webhook subscribed fields include `messages`, `message_echoes`, `messaging_postbacks`, `message_deliveries`, `message_reads`, `standby`, and `messaging_handovers`.
- Current check does not prove Human Agent / 7-day eligibility, attachment send support, or every source-channel event subscription needed for the full build.

Main gaps against the PRD:

- Marketing currently has `send_inbox_reply` and `manage_inbox_state` through `PERMISSION_GROUPS`, but the PRD says marketing should be read-only for inbox operations.
- Existing state columns and older docs include `snoozed_until` / snooze concepts, but the PRD says no Snooze workflow.
- There is no team-based queue access model yet.
- There are no canonical queue categories, lead-quality labels, lead-quality reason tags, conversation outcomes, lost-reason enforcement, or manager metrics yet.
- Webhook ingestion stores raw payloads but does not normalize first-touch referral/ad context, customer profile data, ad attribution, or routing explanations.
- Conversation history loading is currently shallow: latest threads and global latest messages, not full selected-thread history.
- Current readiness checks include `pages_messaging`, `instagram_manage_messages`, `instagram_manage_comments`, and `pages_manage_engagement`, but do not verify Human Agent / 7-day behavior or per-conversation send eligibility.

## 4. Proposed Design

Use a layered design:

1. Raw ingestion layer: existing `meta_social_threads`, `meta_social_messages`, `meta_social_comments`, `meta_social_sync_runs`, and Meta webhook route keep receiving platform payloads.
2. Normalization layer: extract participant profile, first-touch source, referral/ad context, source permalink, attribution join keys, and conversation identity from raw webhook/sync payloads.
3. Inbox operation layer: store queue category, team access, assignment, conversation status, follow-up date, Lead Quality, reason tags, Inbox Outcome, Lost Reason, and audit trail.
4. Reporting layer: aggregate response time, label completeness, queue health, team/user workload, attribution quality, Inbox Outcome, Verified Business Outcome, and source performance by campaign/ad/creative/message.

This keeps Meta data and inbox operations in Meta Ads AI while reading central user identity and canonical Sales vocabulary through existing Sales/ERP boundary views.

## 5. Data Model

Recommended model:

- Keep raw Meta records in existing social tables.
- Add inbox-owned normalized conversation/state tables instead of overloading raw ingestion rows.
- Leave existing snooze columns unused and remove them from UI/API contracts.

Core entities:

| Entity | Purpose |
| --- | --- |
| `meta_inbox_conversations` | One operational conversation row per message thread/comment chain/source conversation. |
| `meta_inbox_customer_profiles` | Best available customer identity/profile fields by platform/page/participant scoped ID. |
| `meta_inbox_customer_contact_methods` | Inbox-owned manually captured phone/email identifiers with source, actor, and audit provenance. |
| `meta_inbox_first_touch_sources` | Stable first-touch attribution captured at conversation start. |
| `meta_inbox_queue_categories` | Locked queue category list: Cash for Gold, Book Appointment, US Product, VN Product, Custom Jewelry, Repair / Service, General Inquiry, Uncategorized / Needs Review. |
| `meta_inbox_teams` | Inbox-owned sales teams. |
| `meta_inbox_team_members` | Maps central Sales/ERP users to inbox teams. |
| `meta_inbox_team_queue_access` | Maps teams to queue categories. |
| `meta_inbox_routing_rules` | Rules mapping attribution/source/message intent to queue categories. |
| `meta_inbox_conversation_events` | Audit log for assignments, status changes, labels, inbox outcome changes, routing overrides, and follow-up changes. |
| `meta_inbox_verified_outcome_matches` | Read-only Sales/ERP outcome match provenance for conservative verified business outcomes. |
| `meta_inbox_attachments` | Normalized attachment metadata for inbound and outbound media/files. |
| `meta_inbox_send_attempts` | Outbound send attempts, failure state, retry metadata, and Meta error details. |
| `meta_inbox_comment_actions` | Public comment reply/private reply, like, hide, delete attempts, Meta result, and audit metadata. |
| `meta_inbox_in_app_alert_states` | User/conversation badge state for in-app alerts only. |
| `meta_inbox_saved_replies` | Personal draft and shared approved reply/template library by queue, channel, language, and Lead Quality. |
| `meta_inbox_internal_notes` | Internal notes, @mentions, and coaching comments not visible to customers. |
| `meta_inbox_qa_scorecards` | Manager QA reviews for sales replies/conversations. |

Conversation fields:

- `platform`
- `source_channel`: facebook_message, instagram_message, facebook_public_comment, instagram_public_comment, private_reply_from_comment, ad_referral, other_unknown
- `source_type`: message thread, comment, referral, other future source
- `source_id`
- `page_id`
- `ig_user_id`
- `participant_id`
- `platform_thread_id`
- `parent_content_id`
- `canonical_conversation_key`
- `latest_inbound_at`
- `latest_outbound_at`
- `first_inbound_at`
- `needs_reply`
- `reply_window_expires_at`
- `human_agent_window_expires_at`
- `send_eligibility`: standard_reply_allowed, human_agent_allowed, expired, unknown
- `conversation_status`
- `assigned_team_id`
- `assigned_user_id`
- `follow_up_at`
- `lead_quality`
- `lead_quality_reason_tags`
- `inbox_outcome`
- `inbox_lost_reason`
- `inbox_outcome_updated_by`
- `inbox_outcome_updated_at`
- `verified_business_outcome`
- `verified_business_lost_reason`
- `verified_business_outcome_source_type`
- `verified_business_outcome_source_id`
- `verified_business_outcome_confidence`
- `verified_business_outcome_match_basis`
- `verified_business_outcome_matched_entity_type`
- `verified_business_outcome_matched_entity_id`
- `verified_business_outcome_matched_at`
- `outcome_conflict`
- `closed_at`

Verified outcome match fields:

- `conversation_id`
- `verified_business_outcome`
- `verified_business_lost_reason`
- `source_system`: Sales/ERP read model, booking read model, order/deposit read model, future approved identity map
- `source_entity_type`
- `source_entity_id`
- `match_basis`: customer_id, appointment_id, order_id, phone, email, approved_profile_reference, approved_identity_map
- `match_confidence`
- `matched_at`
- `raw_match_snapshot_json`

Customer profile fields:

- `platform`
- `page_id` / `ig_user_id`
- `participant_id`
- `display_name`
- `username`
- `profile_picture_url`
- `profile_url`
- `profile_reference`
- `locale`
- `timezone`
- `raw_profile_json`
- `last_profile_synced_at`

Customer contact method fields:

- `customer_profile_id`
- `type`: phone, email
- `value_normalized`
- `value_display`
- `source`: sales_entered, webhook, profile_enrichment, future_verified_source
- `provided_in_message_id`
- `entered_by`
- `entered_at`
- `deleted_by`
- `deleted_at`
- `verified_for_matching_at`
- `raw_input`
- `audit_event_id`

First-touch source fields:

- `conversation_id`
- `first_message_id`
- `first_message_at`
- `referral_json`
- `ad_id`
- `ads_context_data_json`
- `ref`
- `source_post_id`
- `source_media_id`
- `source_comment_id`
- `source_product_id`
- `source_permalink`
- `campaign_umbrella_id` / key when joinable
- `campaign_id`
- `adset_id`
- `ad_id`
- `creative_id`
- `attribution_method`
- `attribution_confidence`
- `raw_payload_json`: stored for backend/debug only; hidden from UI

Routing fields:

- `queue_category_key`
- `routing_source`: ad attribution, campaign rule, message-intent classifier, manual correction
- `routing_confidence`
- `routing_explanation`
- `routing_rule_id`
- `manual_override_by`
- `manual_override_at`

Send attempt fields:

- `conversation_id`
- `message_id` / outbound local ID
- `approved_by`
- `status`: approved, queued, sending, sent, failed_retryable, failed_terminal, canceled
- `messaging_type`
- `tag`
- `attachment_ids`
- `meta_send_id`
- `meta_error_message`
- `meta_error_code`
- `meta_error_subcode`
- `meta_trace_id`
- `attempt_count`
- `next_retry_at`
- `sent_at`

Comment action fields:

- `conversation_id`
- `source_comment_id`
- `platform`
- `action_type`: public_reply, private_reply, like, hide, delete
- `approved_by`
- `reason_note`
- `status`: approved, sending, succeeded, failed_retryable, failed_terminal, canceled
- `request_payload_json`
- `meta_result_id`
- `meta_error_message`
- `meta_error_code`
- `meta_error_subcode`
- `meta_trace_id`
- `attempt_count`
- `created_at`
- `completed_at`

Conversation identity:

- Canonical key should be deterministic from source channel + platform + page/IG account + participant/thread/comment identifiers.
- Public comments and DMs are separate conversations unless a private reply links them.
- Private replies preserve both the public comment origin and the resulting private thread.
- Webhook synthetic thread IDs must reconcile with Graph conversation IDs when later sync returns the same thread.
- Cross-platform customer merge is not automatic in v1.
- Manual merge/split is manager/admin-only and writes audit events.

## 6. API / Webhook Design

Webhook ingestion:

- Keep endpoint at `/api/meta/webhook`.
- Keep signature verification before parsing.
- Parse inbound message, echo, referral, postback, comment, and standby events.
- Parse delivery/read/edit/reaction/failure-adjacent events where available and store as conversation events instead of dropping them.
- Upsert raw message/comment rows first.
- Normalize or update conversation row after raw row exists.
- Capture first-touch source only when conversation has no first-touch row yet, unless manager/admin performs explicit correction.
- Extract customer identity from webhook payload when present.
- Enrich customer profile through Meta profile lookup when permissions and platform data allow.
- Use hybrid profile enrichment: populate fields immediately from webhook payload, then run async repair/enrichment for missing or stale profile/source/attribution fields.
- Store best available profile link/reference; do not assume Meta always returns a public profile URL.
- Extract `message.referral`, `ad_id`, `ads_context_data`, `ref`, post/media/comment/product IDs, source permalink, and raw payload.
- Join `ad_id` and related source IDs to existing Meta ads hierarchy data.
- Apply routing rules and save queue category, confidence, and explanation.
- If no confident source exists, run rules-based message-intent classification or route to Uncategorized / Needs Review. AI classification remains disabled/placeholder-only in the first foundation build.
- Recalculate reply-window fields from latest inbound message and supported Meta send mode.
- Idempotently process Meta retries using platform event/message/comment IDs and raw event hash.

Sync/backfill:

- Existing `/api/social-inbox/sync` can remain the manual proof path.
- Expand conversation message fields beyond `id,message,created_time,from,to,attachments` when Meta supports referral/profile/context fields.
- Add thread-specific message pagination so selected conversations can load full stored history.
- Add repair job for conversations missing first-touch source, customer profile, queue category, or profile metadata.
- Repair job runs asynchronously after ingest and can be re-run by admin/data-quality workflow.
- Backfill source-channel and canonical conversation identity for existing social rows.

Read APIs:

- Conversation list API should return queue summaries, latest message preview, customer profile, source attribution summary, status, owner/team, and response state.
- Conversation detail API should return full known message history for one selected conversation with cursor pagination for older messages.
- Manager dashboard API should aggregate by team, sales user, queue category, status, response-age bucket, follow-up, Lead Quality, Inbox Outcome, Verified Business Outcome, and attribution.
- Presence API/realtime channel should expose ephemeral "viewing" and "typing/replying" state for collision prevention.

Write APIs:

- Send reply: `sales` and `sales_lead` only, explicit human approval only. Admin send access is emergency/support-only if explicitly enabled.
- Send attachment: `sales` and `sales_lead` only, explicit human approval only, same reply-window and failed-send checks as text sends.
- Public comment actions: `sales` and `sales_lead` can public reply, private reply/DM where Meta allows, like, hide, and delete comments within permitted queues. Hide/delete require explicit UI confirmation, reason note, and audit event.
- Claim/assign: sales can claim from permitted team queues; sales leads can assign/reassign within scope.
- Status/follow-up/Lead Quality/Inbox Outcome updates: sales and sales leads only.
- Close/lost: sales and sales leads can close or mark lost conversations they can access, subject to required-field validation.
- Customer contact update: sales and sales leads can add/edit/delete inbox-owned phone/email on conversations they can access. Store actor/source/audit; do not write to Sales/ERP Core.
- Verified Business Outcome updates: system-only from conservative read-only Sales/ERP matching. No user edits and no Sales/ERP Core writes.
- Routing override: sales can directly change queue category for conversations they can access; sales leads/admin can change queue category within broader management/admin scope. Team/queue config remains sales lead/admin.
- Marketing: read-only endpoints only.
- Saved replies/templates: sales users can create personal drafts for their own use. Sales leads/admin approve shared templates before team-wide use.
- Internal notes/@mentions/coaching: sales and sales leads can write scoped notes; marketing cannot.
- Failed-send retry: sales/sales_lead can retry when eligible and permission checks pass.
- Audit trail read: sales can see full audit trail for conversations they can access; sales leads/admin can see broader team/dashboard audit trails within scope.

## 7. Permissions And Privacy

Current mismatch:

- `marketing` currently receives `send_inbox_reply` and `manage_inbox_state`; this must change.
- `manage_inbox_state` currently describes snooze; this must change.

Target permission behavior:

| Actor | View Conversations | Reply / Attachments / Comment Actions | Assign/Reassign | Label Quality/Inbox Outcome | Manage Teams/Rules | View Reports |
| --- | --- | --- | --- | --- | --- | --- |
| Sales | Own permitted queues | Yes, including public reply/private reply, like, hide, delete within permitted queues | Claim permitted team-queue conversations | Yes | Direct queue override for accessible conversations | Own/team limited |
| Sales Lead | Managed teams/queues | Yes, including public reply/private reply, like, hide, delete within managed scope | Yes | Yes | Routing override and maybe team/rule config | Yes |
| Marketing | Read-only reporting | No | No | No | No | Yes |
| Admin | All/config support | Emergency/support only if explicitly allowed | Yes for support/config | Support only | Yes | Yes |

Implementation options:

- Short term: remove send/manage permissions from marketing and update `manage_inbox_state` description to remove snooze.
- Longer term: split coarse `manage_inbox_state` into more precise permissions if needed: reply, send attachments, public comment actions, assign, label/Inbox Outcome, manage teams, manage routing rules, view reports.

Privacy constraints:

- Store scoped platform IDs and profile references carefully.
- Avoid exposing profile data outside users with inbox/report permissions.
- Keep raw webhook payloads for backend audit/debug but do not display raw JSON in product UI. Use backend logs/database/admin tooling only when debugging.
- Keep all inbox writes analyst-owned; no direct writes to Sales/ERP Core.
- Internal notes, @mentions, coaching comments, and QA scorecards are internal-only and must never be sent to Meta.
- Public comment hide/delete actions must be confirmed, require a reason note, audited, and restricted to conversations visible through team queue access.
- Manually entered phone/email add/edit/delete actions must be validated, audited, and visible with provenance because they can affect future verified matching.
- Audit trail can be visible to sales for accessible conversations, but raw Meta payload remains hidden from product UI.

## 8. UI Architecture

Routes stay in Meta Ads AI:

- Desktop/workspace inbox: `/convert/inbox`
- Sales-focused mobile inbox: `/m/inbox`
- Conversation detail: `/m/inbox/[conversationId]`
- Manager dashboard: included in first release, likely under `/convert/inbox/manager` or an Inbox tab.
- Inbox settings: own subpage inside the inbox, likely `/convert/inbox/settings`.

Inbox settings scope:

- inbox teams and team membership using central Sales/ERP user IDs
- team-to-queue access
- routing rules from source/ad/message attributes to queue category
- fallback routing behavior
- saved reply/template management if grouped with inbox configuration
- data-quality/admin repair tools if grouped with inbox configuration

Inbox list:

- Queue tabs: All, Cash for Gold, Book Appointment, US Product, VN Product, Custom Jewelry, Repair / Service, General Inquiry, Uncategorized / Needs Review.
- All tab = union of queues allowed by user's teams.
- Filters: status, assigned user, team, age, needs reply, follow-up due, Lead Quality missing, campaign umbrella, campaign, ad, creative, source confidence.
- In-app badges: assigned to me, needs reply, unassigned team queue, failed send/retry, overdue follow-up, unread/new activity, public comments needing action.

Conversation detail:

- Customer block: name, username/handle, profile picture, profile link/reference, platform/page, customer IDs hidden behind debug/admin affordance.
- Source block: first-touch ad/message/referral, campaign umbrella, campaign, ad set/group of ads, ad, creative, source permalink, routing explanation.
- Ad creative preview: image/video thumbnail, ad title/body when available, CTA, destination/product, and source permalink.
- Message history: full known thread history, ordered oldest to newest, with older-message pagination and history completeness state.
- Workflow panel: status, assigned team/user, follow-up date, Lead Quality, reason tags, Inbox Outcome, Inbox Lost Reason, and read-only Verified Business Outcome when matched.
- Reply composer: human-approved send only, reply-window countdown, saved replies/templates, text and attachment send, and live "other user typing/replying" warning.
- Attachment picker: expose all Meta-supported attachment types that are currently allowed by platform/account capability checks.
- Public comment action bar: public reply, private reply/DM when supported, like, hide, delete, with confirmation and reason note for hide/delete.
- Customer profile panel: allow sales to add/edit/delete inbox-owned phone/email with source/provenance display.
- Secondary panels: internal notes, @mentions, manager coaching, optional QA scorecards, audit trail, and send attempts.

Marketing view:

- Read-only attribution and quality reporting.
- No reply composer.
- No assignment/status/label/comment action controls.

## 9. Analytics And Reporting

Manager metrics:

- Unresponded inbound messages by day/team/user/queue.
- Average and median first-response time.
- Response-age buckets for unreplied conversations.
- Oldest waiting inbound message.
- Missed follow-ups.
- Conversations closed without Lead Quality.
- Workload by assigned user and team queue.
- Inbox outcome, verified business outcome, outcome conflict, and lost reason by user/team/queue.
- Failed sends and retry backlog by user/team/queue.
- Optional QA scorecard averages and coaching follow-up by user/team.

The first release should include the full manager dashboard covering the metrics above, not a thin placeholder dashboard.

Manager dashboard date filter defaults to the last 7 days, with user-selectable ranges for review.

Marketing metrics:

- Lead Quality distribution by campaign umbrella, campaign, ad set/group of ads, ad, creative, and message/referral.
- High-intent count/rate by source.
- Inbox-marked booked/sold/lost rate and verified booked/sold/lost rate by source.
- Spam/invalid and low-intent rate by source.
- Attribution coverage and missing-source rate.
- Manual routing override rate by source/rule/user role.

Data quality metrics:

- Percent conversations with customer display name.
- Percent conversations with profile link/reference.
- Percent conversations with first-touch source.
- Percent conversations with ad/campaign join.
- Percent conversations with complete known history.

## 10. Migration / Backfill

Suggested sequence:

1. Add normalized inbox tables and locked enum/check constraints for statuses, queue categories, Lead Quality, reason tags, Inbox Outcomes, Verified Business Outcome fields, Lost Reasons, and customer contact method types.
2. Backfill `meta_inbox_conversations` from existing `meta_social_threads` and `meta_social_comments`.
3. Backfill profile fields from existing sender/author fields where present.
4. Backfill first-touch source from earliest stored message/comment raw payload when available.
5. Route existing conversations through routing rules/fallback classifier.
6. Deprecate UI/API use of snooze fields.
7. Update permissions so marketing is read-only for inbox ops.
8. Add thread-specific history endpoint and pagination.
9. Add reply-window eligibility and failed-send tracking.
10. Add all Meta-supported attachment receive/display/send support, capability-gated by platform/account.
11. Add public comment action support.
12. Add presence/collision prevention.
13. Add saved replies, notes, coaching, optional QA scorecards, and audit UI.
14. Add manager dashboard aggregates and in-app badges.

Verified business outcome matching:

- Use conservative matching only.
- Match through explicit identifiers first: existing customer ID, appointment/booking ID, phone, email, approved profile link/reference, or future approved identity map.
- Include inbox-owned sales-entered phone/email in candidate matching only when format is valid and provenance is present.
- Do not automatically verify with name-only or loose time-window matches.
- Store match confidence, match basis, matched source, matched entity type/id, matched timestamp, and conflict state.
- If Inbox Outcome and Verified Business Outcome disagree, preserve both and show conflict in manager/marketing reporting.

## 11. Rollout / Rollback

Rollout:

- Foundation PR 1: permissions, no-snooze contract, locked queue/source-channel vocabularies, normalized conversation shell, and team queue schema.
- Foundation PR 2: conversation identity, source-channel filters, list/detail read path skeleton, and backfill from existing social rows.
- Foundation PR 3: team access enforcement, basic assignment/claiming, status/Lead Quality/Inbox Outcome fields, and audit events.
- Phase 2: webhook normalization, customer profile enrichment, first-touch attribution, ad creative preview data, and full history pagination.
- Phase 3: reply-window eligibility, Human Agent checks, failed-send inbox/retry, attachments receive/send, and public comment operations.
- Phase 4: full manager dashboard, in-app badges, verified business outcome matching, marketing reporting, saved replies, notes, coaching, optional QA scorecards, and audit UI. Phase 4 remains inside first-release scope.

Rollback:

- Keep raw social inbox tables untouched.
- If normalized layer fails, switch reads back to existing social inbox API.
- If webhook normalization fails, keep raw webhook ingestion active and disable normalization flag.
- If permission migration causes access issue, admin can temporarily grant fallback view-only access while preserving no-reply marketing rule.

## 12. Alternatives Considered

- Move inbox UI to Sales app: rejected. User clarified inbox UI stays in Meta Ads AI.
- Move Meta webhook ingestion to Sales app: rejected. Meta Ads AI already owns Meta integration and social inbox tables.
- Use per-user queue permissions: rejected. Team-based queue access is accepted.
- Keep snooze workflow: rejected. Accepted conversation status model has no Snooze.
- Store all state directly on raw `meta_social_threads` / `meta_social_comments`: possible short-term, but normalized operation tables reduce coupling and support threads/comments/future sources consistently.

## 13. Risks And Mitigations

- Missing Meta profile link/name: store best available profile reference, show missing state, and add repair/enrichment job.
- Missing first-touch referral/ad context: store raw payload, preserve first-touch when present, classify fallback, and report attribution coverage.
- Wrong queue routing: show routing explanation, confidence, and manual override audit.
- Shallow history: add detail-specific history API and sync pagination; show history completeness state.
- Permission leakage: add tests proving marketing cannot reply, assign, label, or override.
- Snooze leakage from existing code/schema: remove UI references and tests for no snooze controls/state.
- Sales/ERP boundary drift: keep new tables analyst-owned and test no Sales/ERP Core writes.
- Send-window errors: compute eligibility before send, block invalid attempts, and surface Human Agent/expired state.
- Attachment media expiry: cache metadata and handle expired/unsupported media gracefully.
- Outbound attachment send support varies by platform/account/media type. Check capability before send, store Meta failures, and keep text send available.
- Manual phone/email entry risk: validate, audit, deduplicate, and show source/provenance before using it for verified matching.
- Comment moderation risk: require confirmation and reason note for hide/delete, store audit events, and surface failed Meta actions in the same failed-action workflow.
- Presence reliability: treat typing/collision as advisory, not a hard lock, because realtime presence can disconnect.
- Outcome drift: preserve Inbox Outcome and Verified Business Outcome separately; fail closed on weak matches and surface conflicts.

## 14. Open Questions

- Whether full historical Meta pagination is feasible for all platform/thread types.
- Whether Human Agent / 7-day replies are available for every needed platform/account and what tag/messaging type each platform requires.
- Which Sales/ERP read-only identifiers beyond sales-entered inbox phone/email are available in v1 for conservative verified business outcome matching.
- Whether queue-specific SLA targets should be added later after baseline response-time data is collected.

## 15. External References

- Meta Send API docs: `https://developers.facebook.com/docs/messenger-platform/send-messages`. Standard messaging window is 24 hours; Human Agent tag can allow manual human response within 7 days when policy allows it.
- Meta webhook message docs: `https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages`. Ad referral webhook payload can include `message.referral.ref`, `ad_id`, and `ads_context_data`.
- Meta user profile docs: `https://developers.facebook.com/docs/messenger-platform/identity/user-profile/`. Profile enrichment may require Advanced Access for Business Asset User Profile Access.
