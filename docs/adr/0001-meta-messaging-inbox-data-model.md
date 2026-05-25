# 0001. Meta Messaging Inbox Data Model

| Field | Value |
| --- | --- |
| Status | Proposed |
| Date | 2026-05-23 |
| Source RFC | `docs/meta-messaging-inbox/rfc.md` |

## Context

The current Meta Ads AI app already owns the social inbox routes, APIs, Meta webhook endpoint, and analyst-owned social inbox tables. Sales/ERP Core remains the system of record for identity and canonical sales vocabulary, and this app already has a documented data boundary that disables Sales/ERP Core writes from Ads Analyst.

The planned inbox expansion needs conversation operations, deterministic conversation identity, source-channel filters, attribution, queue routing, team access, sales labels, reply-window handling, full conversation history, send/receive attachments, public comment operations, failed-send retry, customer profile enrichment, in-app badges, and management reporting. These are inbox-specific capabilities tied to Meta messages and should live with the Meta Ads AI inbox rather than moving conversation operation or webhook ingestion into the standalone Sales app.

## Decision

Keep the comprehensive Meta Messaging Inbox inside the Meta Ads AI app.

The Meta Ads AI app owns:

- Meta webhook ingestion and social inbox sync
- conversation list/detail UI
- reply workflow
- queue routing and team-based queue access enforcement
- assignment workflow
- lead quality, conversation status, and Inbox Outcome capture
- read-only Verified Business Outcome matching from Sales/ERP when conservative confidence is high
- attribution display and marketing/manager reporting
- failed-send inbox and retry workflow
- attachment receive/send workflow
- public comment reply/private reply, like, hide, and delete workflow
- in-app badges and dashboard indicators
- live conversation presence/collision prevention
- saved replies, internal notes, coaching comments, QA scorecards, and scoped audit trail

Sales/ERP remains a supporting source of truth for central identity, users, roles, and canonical sales vocabulary. Meta Ads AI reads that data through the existing data-boundary pattern and does not write directly into Sales/ERP Core tables.

Use team-based queue access as the primary access model. Users inherit queue visibility through inbox teams. Do not build per-user queue assignment as the primary model.

Operational inbox write access belongs to `sales` and `sales_lead`. Existing Client Advisor / JOC roles do not automatically become inbox operators.

Do not include Snooze in the inbox workflow. Existing snooze-oriented schema/code may remain temporarily for compatibility, but new UI/API behavior should use status, owner/team, response state, and follow-up date instead.

Marketing is read-only for inbox operations. Marketing may view reporting and attribution intelligence, but may not reply, assign, label, change Inbox Outcome, or override routing.

Webhook ingestion must normalize first-touch attribution and customer profile data into inbox-owned structures. Conversation detail must load full known thread history through conversation-specific queries rather than shallow global message slices.

Conversation identity must be canonical and source-channel aware. Facebook messages, Instagram messages, Facebook public comments, Instagram public comments, private replies from comments, ad referrals, and unknown sources must be filterable independently from queue category.

Meta send eligibility must be modeled explicitly. The standard reply window is 24 hours. Human Agent / 7-day replies are a separate eligibility path and must not be assumed for every conversation or platform.

Use a dual-outcome model. Inbox Outcome is sales-entered in the Meta Ads AI inbox for daily workflow. Verified Business Outcome is read-only, derived from conservative Sales/ERP matching, and used as the stronger business-reporting signal when matched. The system must preserve both values, show conflicts, and never overwrite sales-entered Inbox Outcome with a loose or name-only match.

First release measures response time and response-age buckets but does not enforce SLA targets. Alerts are in-app badges and dashboard indicators only; no email, Slack, SMS, or external push alerts in v1.

Sales and sales leads may perform public comment actions in permitted queues: public reply, private reply/DM where Meta allows, like, hide, and delete. Hide/delete require confirmation and a reason note, and all comment actions require audit events and Meta result/error capture.

Sales users may directly change queue category for conversations they can access. This is a manual routing override and must be audited. Profile enrichment uses a hybrid model: webhook fields are stored immediately, then async repair fills missing profile/source data where Meta allows. QA scorecards are optional manager coaching tools, not required workflow gates.

Inbox operational configuration should live inside Inbox Settings, preferably as its own inbox subpage, rather than under global Operate/User Admin.

Close/lost required fields are uniform across all queues in v1. Attachment receive/send should support all Meta-supported types, gated by platform/account capability. Sales users may manually add, edit, or delete inbox-owned customer phone/email for future conservative verified matching; these values require validation, provenance, audit history, and must not write directly to Sales/ERP Core.

Sales users may create personal saved-reply drafts for their own use. Shared saved replies/templates require sales lead/admin approval before team-wide use.

No AI features ship in the first foundation build. Existing AI reply/summarization/label/routing surfaces should be hidden, disabled, or represented only as future placeholders/stopped states. Raw Meta payload is stored for backend/debug needs but hidden from normal UI. The full manager dashboard is included in first-release scope.

Manager dashboard defaults to the last 7 days. Sales can close or mark lost conversations they can access when required fields are complete.

Sales can see the full audit trail for conversations they can access. Sales leads/admin can see broader team/dashboard audit trails within their scope. Raw Meta payload remains hidden from product UI.

## Consequences

- New inbox tables or columns should be analyst-owned, not Sales/ERP Core tables.
- Queue/team membership should be keyed to central users/roles but enforced in the Meta Ads AI app.
- Meta webhook ingestion changes happen in the existing Meta Ads AI webhook path.
- The permission model must be updated so marketing is read-only for inbox operations while `sales` and `sales_lead` roles can reply, assign, and label according to scope.
- Existing snooze-oriented state should be avoided or migrated away from the user workflow because the accepted PRD status model does not include Snooze.
- New implementation must add tests for team-based queue access, marketing read-only behavior, no Snooze controls/API contract, source-channel filtering, webhook normalization, reply-window eligibility, failed-send retry, attachment receive/send, public comment actions, in-app badges/dashboard alerts, response-time measurement without SLA targets, conversation presence, dual-outcome reporting, conservative verified outcome matching, full manager dashboard metrics, AI controls hidden/disabled/placeholder-only, raw payload hidden from UI, and full conversation history retrieval.

## Alternatives Considered

- Move inbox operation into the Sales app: rejected because the current product surface, routes, APIs, and Meta ingestion already live in Meta Ads AI, and the user clarified the actual inbox UI should stay here.
- Move Meta webhook ingestion into the Sales app: rejected because Meta Ads AI already owns Meta integrations and no product need requires moving ingestion.
- Assign queues directly per user: rejected in favor of team-based queue access.
- Keep global message slice for conversation detail: rejected because selected conversations can show incomplete history.
- Use hard conversation locks only: rejected for v1 because live presence can disconnect. Use soft collision warnings plus assignment ownership and manager override.
- Collapse Inbox Outcome and Verified Business Outcome into one field: rejected because sales needs a fast workflow label while managers/marketing need a conservative verified business signal with provenance.
