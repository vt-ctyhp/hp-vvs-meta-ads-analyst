# Meta Messaging Inbox Test Plan

| Field | Value |
| --- | --- |
| Status | Draft |
| Owner | viv |
| Date | 2026-05-23 |
| Source PRD | `docs/meta-messaging-inbox/prd.md` |
| Source RFC | `docs/meta-messaging-inbox/rfc.md` |

## 1. Scope

Verify the comprehensive Meta Messaging Inbox in the Meta Ads AI app:

- inbox ownership stays in Meta Ads AI
- marketing is read-only for inbox operations
- no Snooze workflow appears
- team-based queue access works
- operational writes are limited to `sales` and `sales_lead`
- source-channel filtering works separately from queue category
- webhook ingestion normalizes customer/profile/source details
- reply-window countdown and send eligibility work
- failed-send inbox/retry and attachment receive/send handling work
- sales can public reply, private reply/DM where supported, like, hide, and delete public comments in permitted queues
- first release alerts stay in-app badges/dashboard only
- v1 measures response times and response-age buckets without SLA pass/fail targets
- AI reply/summarization/label/routing controls are hidden, disabled, or placeholder-only in first foundation build
- raw Meta payload is hidden from UI
- full manager dashboard ships in first release
- conversation detail loads full known history
- sales labels/status/Inbox Outcomes work with canonical values
- Verified Business Outcomes are read-only, conservative, and report separately from Inbox Outcomes
- manager dashboard and marketing reports aggregate correctly

## 2. Test Strategy

- Unit tests for parsers, routing rules, permission helpers, status/label validation, and history query builders.
- API tests for webhook ingest, conversation list/detail, assignment, labels, Inbox Outcomes, verified outcome matching, team access, and manager aggregates.
- Data-boundary tests proving no Sales/ERP Core writes.
- UI/browser tests for sales, manager, marketing, and admin roles.
- Migration/backfill tests for existing social thread/comment data.
- Data quality checks against staging-like webhook fixtures.

## 3. Functional Test Matrix

| Area | Test |
| --- | --- |
| Conversation list | Shows only queues allowed by user's teams. |
| All tab | Shows union of team-allowed queues only. |
| Source-channel filter | Filters Facebook Message, Instagram Message, Facebook Public Comment, Instagram Public Comment, Private Reply from Comment, Ad Referral / Click-to-Message, and Other / Unknown independent of queue category. |
| Conversation detail | Shows customer name, profile reference/link, source attribution, routing explanation, status, owner/team, Lead Quality, reason tags, Inbox Outcome, Verified Business Outcome when matched, and full known history. |
| Customer contact edit | Sales can add/edit/delete inbox-owned phone/email in accessible conversations with validation, provenance, actor, timestamp, and audit event. |
| Reply | Sales can send text and supported attachments only through explicit human-approved flow and only when send eligibility allows it. |
| Public comment actions | Sales can public reply, private reply/DM where supported, like, hide, and delete comments in permitted queues; hide/delete require confirmation and reason note. |
| Reply window | Shows standard 24-hour countdown, Human Agent / 7-day eligibility when allowed, and expired state. |
| Assignment | Sales can claim permitted queue conversations; manager can assign/reassign within scope. |
| Presence | User sees when another user is viewing, typing, or replying in the same conversation. |
| Status | Allowed statuses only: New Inquiry, Needs Reply, Waiting On Customer, Follow-Up Needed, Appointment Scheduled, Closed, Lost Lead. |
| Lead Quality | Exactly one primary label; locked multi-select reason tags. |
| Inbox Outcome | Uses canonical outcome values; Lost requires canonical Inbox Lost Reason. |
| Verified Business Outcome | Read-only system field; appears only after conservative Sales/ERP match and keeps provenance/conflict state. |
| Close/Lost validation | Cannot close/lost/final-outcome without uniform required fields across all queues: Lead Quality, reason tags, Inbox Outcome, and Inbox Lost Reason when lost. |
| Close/Lost permission | Sales can close or mark lost conversations they can access after required fields are complete. |
| Marketing | Can view reports/intelligence; cannot reply, claim, assign, label, set Inbox Outcome, follow-up, or override routing. |
| In-app alerts | Badges/dashboard indicators show needs reply, assigned to me, unassigned team queue, failed sends, overdue follow-up, unread/new activity, and public comments needing action. |
| Saved replies | Sales can create personal drafts; shared templates require sales lead/admin approval and can be filtered by queue, source channel, language, and Lead Quality. |
| Internal notes | Notes, @mentions, and coaching comments are visible internally only and never sent to Meta. |
| QA scorecards | Sales leads can optionally score selected replies/conversations for coaching and see results in manager dashboard. |
| Audit trail | Sales can see full audit trail for conversations they can access; sales leads/admin can see broader team/dashboard audit trails within scope. |
| Admin | Can inspect webhook/sync health and configure teams/routing rules in Inbox Settings where implemented. |
| AI controls | No active AI reply, summary, label, or routing workflow appears in first foundation build; placeholders/stopped states are allowed. |
| Raw Meta payload | Raw payload/debug JSON is not visible in normal UI. |

## 4. Webhook / Sync Test Matrix

| Case | Expected |
| --- | --- |
| Valid signed Facebook message webhook | Raw message stored; normalized conversation created/updated. |
| Valid signed Instagram message webhook | Raw message stored; normalized conversation created/updated. |
| Invalid signature | Rejected before parsing/writes. |
| Duplicate webhook retry | Does not create duplicate message/comment/conversation/event rows. |
| First inbound message with referral/ad data | First-touch source stored and linked to conversation. |
| Later message without referral | Does not overwrite first-touch source. |
| Later message with better data | Adds supplemental context but does not replace first-touch unless explicit correction path used. |
| Customer name present in payload | Customer profile row stores display name. |
| Customer profile missing in payload | Webhook ingest stores available fields immediately; async profile enrichment/repair marks missing or fills best available metadata later. |
| Profile link unavailable from Meta | Stores scoped profile reference and does not fabricate public URL. |
| `ad_id` present | Attempts join to campaign/ad hierarchy. |
| `ads_context_data` present | Stored raw and normalized where fields are known. |
| `ref` present | Stored and available for routing/reporting. |
| Comment/media/post source present | Source IDs/permalink stored where available. |
| Manual sync/backfill | Preserves raw rows and updates normalized layer without duplicate conversations. |
| Inbound image/video/file attachment | Attachment metadata stored and conversation detail displays supported media or fallback. |
| Outbound supported attachment | Send attempt stores attachment metadata, sends via Meta when eligible, and appears in ordered history. |
| All Meta-supported attachment types | Composer capability matrix enables all attachment types supported by that conversation's platform/account and disables unsupported types. |
| Outbound unsupported attachment | UI blocks send before Meta call or records failed_terminal with clear platform limitation. |
| Unsupported attachment | Shows safe placeholder and keeps raw metadata for debug. |

## 4.1 Public Comment Action Test Matrix

| Case | Expected |
| --- | --- |
| Sales public reply on permitted queue | Reply sends to Meta, stores action/send attempt, and appears in conversation history. |
| Sales private reply/DM from comment where supported | Private reply sends to Meta, preserves original public comment context, and links resulting private conversation when available. |
| Sales likes comment | Like action sends to Meta and writes audit event. |
| Sales hides comment | UI requires confirmation and reason note, sends action, stores Meta result, and writes audit event. |
| Sales deletes comment | UI requires confirmation and reason note, sends action, stores Meta result, and writes audit event. |
| Marketing attempts comment action | API rejects action even if UI is bypassed. |
| Comment action Meta failure | Failed action appears in failed-send/action workflow with error code/subcode/trace when available. |

## 5. Attribution Test Matrix

| Case | Expected |
| --- | --- |
| Exact ad attribution | Queue category assigned from ad/campaign rule with high confidence. |
| Campaign umbrella match only | Queue category assigned from umbrella rule with clear explanation. |
| Creative/message match | Conversation report includes creative/message context. |
| No attribution but clear message intent | Rules-based intent classification assigns category with lower confidence. |
| No attribution and unclear intent | Routes to Uncategorized / Needs Review. |
| Manual routing override | Sales can directly change queue category for conversations they can access; new category saved with actor, timestamp, reason when required, and audit event. |
| Attribution report | Coverage shows complete, partial, missing, and manually corrected source counts. |

## 5.1 Verified Business Outcome Test Matrix

| Case | Expected |
| --- | --- |
| Sales sets Inbox Outcome | Inbox Outcome updates with actor/timestamp and audit event. |
| User attempts to edit Verified Business Outcome | API rejects edit; UI exposes it read-only only. |
| Strong identifier match | Verified Business Outcome attaches with source, matched entity, match basis, confidence, and timestamp. |
| Valid sales-entered phone/email match | Can be used as a matching candidate only with provenance and audit history. |
| Invalid sales-entered phone/email | Cannot be used for verified matching and shows validation issue. |
| Name-only match | No verified outcome is attached. |
| Loose timing/context match | No verified outcome is attached. |
| Inbox Outcome agrees with verified outcome | Reporting shows both values and no conflict. |
| Inbox Outcome disagrees with verified outcome | Reporting preserves both values and marks conflict. |
| Verified lost outcome | Uses canonical Sales/ERP lost reason when available. |

## 6. Permission Test Matrix

| Role | Expected |
| --- | --- |
| Marketing | `view_inbox`/reporting only; no send/manage/assign/label/Inbox Outcome/routing writes. |
| Sales | Can view permitted team queues, reply when eligible, claim, update status, change queue category for accessible conversations, add/edit/delete phone/email, create personal saved-reply drafts, add Lead Quality/reasons/Inbox Outcome. |
| Sales Lead | Can view managed team queues, assign/reassign, inspect metrics, correct labels/routing within scope, coach, and optionally QA. |
| Admin | Can view/manage all inbox configuration and health. |
| Read-only | Can view only allowed read surfaces, no writes. |

Specific regressions:

- `marketing` role must not receive `send_inbox_reply`.
- `marketing` role must not receive `manage_inbox_state`.
- `client_advisor` and `joc` must not receive inbox operator writes by default.
- API write endpoints reject marketing even if UI hides controls.
- Team access enforced server-side, not only in UI.

## 7. Manager Dashboard Test Matrix

| Metric | Test |
| --- | --- |
| Unresponded messages | Counts inbound latest-message conversations needing sales reply by day/team/user/queue. |
| First-response time | Calculates from first inbound to first outbound response. |
| Average/median response time | Correct by user/team/queue/date range. |
| Default date range | Dashboard loads with last 7 days selected by default. |
| Response-age buckets | Groups open unreplied conversations by waiting age without marking SLA pass/fail. |
| Missed follow-ups | Counts follow-up dates/times past due without completion/status change. |
| Stale conversations | Flags conversations inactive past threshold by status. |
| Workload | Counts assigned, unassigned/team queue, closed, lost, due follow-up by user/team. |
| Label completeness | Counts conversations missing Lead Quality before close/lost/final outcome. |
| Outcomes | Rolls Inbox Outcome and Verified Business Outcome separately by user/team/queue/source. |
| Failed sends | Counts failed_retryable, failed_terminal, retry backlog, and retry success rate. |
| QA scorecards | Aggregates optional score averages and coaching notes by user/team/queue. |
| Audit trail | Shows who changed assignment, status, quality, Inbox Outcome, routing, send retry, and QA. Sales sees accessible conversation audit; sales lead/admin sees broader scoped audit. |
| Full dashboard | First release dashboard includes queue health, response times, response-age buckets, unresponded messages, missed follow-ups, stale conversations, workload, label completeness, failed sends, optional QA/coaching, audit visibility, Inbox Outcomes, Verified Business Outcomes, and outcome conflicts. |

## 8. Data Quality Checks

- Percent conversations with customer display name.
- Percent conversations with username/handle.
- Percent conversations with profile link or profile reference.
- Percent conversations with profile picture URL.
- Percent conversations with inbox-owned phone/email and provenance.
- Percent conversations repaired by async profile/source enrichment.
- Percent conversations with first-touch source.
- Percent conversations with joined campaign/ad hierarchy.
- Percent conversations with canonical source channel.
- Percent conversations in Uncategorized / Needs Review.
- Percent conversations with low routing confidence.
- Percent conversations with full known history loaded.
- Percent messages with supported attachment metadata.
- Percent outbound attachment sends succeeded/failed by platform/media type.
- Percent send attempts failed by error code/subcode.
- Percent conversations with verified business outcome.
- Percent conversations with outcome conflict.
- Duplicate conversation detection by platform/page/participant/source.

## 9. UI / Responsive Checks

- Desktop inbox shows queue tabs, filters, list, detail, source panel, workflow panel, and composer without overlap.
- Inbox Settings subpage is reachable from the inbox for users with configuration access.
- Mobile inbox keeps list/detail usable and does not hide key source/customer context.
- Marketing UI has no reply composer or write controls.
- Sales UI shows helper text/tooltips for status, Lead Quality, reason tags, Inbox Outcome, and Inbox Lost Reason.
- Same close/lost required-field validation appears for every queue category.
- No Snooze label/control/filter appears anywhere in inbox UI.
- Reply composer shows reply-window countdown and expired/Human Agent state.
- Reply composer supports sending approved attachments where Meta allows.
- Attachment picker capability-gates all Meta-supported types by platform/account.
- Conversation detail shows live collision warning when another user is typing/replying.
- Conversation detail shows ad creative preview when source data exists.
- Public comment conversations show public reply, private reply/DM, like, hide, delete controls for sales and sales lead only.
- Hide/delete controls require confirmation and reason note.
- Failed-send inbox shows retryable and terminal failures.
- In-app badges/dashboard indicators render without external email/Slack/SMS alert dependencies.
- Secondary panels for templates, notes, coaching, QA, audit, and send attempts do not crowd the main reply workflow.
- Long customer names, campaign names, ad names, and profile references wrap without layout break.
- Empty states cover no conversations, no permitted queues, missing source, missing profile, and incomplete history.

## 10. Security / Privacy Checks

- Webhook signature verification remains required.
- Raw Meta payload/debug JSON is hidden from product UI; backend/debug tooling can still inspect stored payloads when needed.
- Audit trail visibility does not expose raw Meta payload.
- Raw Meta payload is hidden from normal UI surfaces.
- Profile data exposed only to users with inbox/report permissions.
- Manually entered phone/email values validate format, store provenance, and audit create/update/delete actions.
- Server enforces team queue access on reads and writes.
- No direct writes to Sales/ERP Core tables.
- Reply endpoint keeps explicit human approval and rate-limit/audit behavior.
- Reply endpoint blocks expired windows and records Human Agent tag usage when used.
- Failed-send retry repeats permission and send-eligibility checks.
- Public comment hide/delete actions require explicit confirmation, reason note, queue permission, and audit event.
- Internal notes/coaching/QA are never included in customer-facing send payloads.
- Marketing write attempts fail server-side.

## 11. Regression Checks

- Existing `/convert/inbox` still loads.
- Existing `/m/inbox` and detail routes still load.
- Existing manual sync still works.
- Existing reply send dry-run/live-send guardrails still work.
- Existing data-boundary tests still pass.
- Existing Meta webhook raw ingestion still stores messages/comments.
- Existing dashboard/analyst routes unaffected by inbox permission changes.
- Existing text-only send behavior remains valid alongside attachment send.
- Existing AI/suggest-reply surfaces are hidden, disabled, or placeholder-only for the first foundation build.

## 12. Acceptance Criteria

- Marketing is read-only for all inbox operations.
- No Snooze workflow exists in inbox UI/API contract.
- Team-based queue access controls list, detail, All tab, and write actions.
- Operational writes are restricted to sales and sales lead.
- Source-channel filters work independently from queue category.
- New conversations store customer name/profile metadata when available and clear missing states when unavailable.
- First-touch attribution is preserved and visible with routing explanation.
- Conversations route to canonical queue categories with confidence and audit trail.
- Reply-window countdown and send eligibility prevent invalid sends.
- Failed-send inbox and retry workflow expose Meta send failures.
- Attachments received from customers display or show safe fallback.
- Supported outbound attachments can be sent in first release where Meta allows them.
- All Meta-supported attachment types are enabled/disabled by platform/account capability, not by a narrow hardcoded first-release type list.
- Close/lost required fields are uniform across all queues.
- Sales-entered inbox phone/email can be added/edited/deleted to improve future verified matching but does not write directly to Sales/ERP Core.
- Public comment operations support public reply, private reply/DM where supported, like, hide, and delete, with audit trail plus confirmation/reason note for hide/delete.
- In-app badges/dashboard indicators cover needs reply, assigned to me, unassigned team queue, failed sends, overdue follow-up, unread/new activity, and public comments needing action.
- Response-time reporting measures first response, average/median response, current wait, and response-age buckets without SLA pass/fail targets.
- Live collision prevention shows other user typing/replying state.
- Ad creative preview appears in conversation detail when source data exists.
- Conversation detail loads full known history for selected conversation, not shallow global latest-message slices.
- Sales can apply canonical status, Lead Quality, reason tags, Inbox Outcome, and Inbox Lost Reason.
- Verified Business Outcome is read-only, attached only through conservative high-confidence Sales/ERP matching, and never created from name-only or loose timing/context matches.
- Manager dashboard reports response time, unresponded messages, missed follow-ups, workload, label completeness, failed sends, QA, audit, Inbox Outcomes, Verified Business Outcomes, and outcome conflicts.
- Full manager dashboard is included in first release.
- Raw Meta payload is hidden from normal UI.
- Sales can see full audit trail for accessible conversations.
- No active AI features ship in first foundation build.
- No implementation writes directly to Sales/ERP Core tables.
