# Meta Messaging Inbox PRD

| Field | Value |
| --- | --- |
| Status | Draft |
| Owner | viv |
| Date | 2026-05-23 |
| Related docs | `docs/meta-messaging-inbox/rfc.md`, `docs/plans/2026-05-23-001-meta-messaging-inbox-implementation-plan.md`, `docs/meta-messaging-inbox/test-plan.md` |

## 1. Background / Problem Statement

The Meta Messaging Inbox should become a sales super app for Facebook and Instagram conversations, with attribution and management intelligence built into the same workflow.

Sales execution is the primary product surface: sales users need to see who the customer is, what they asked, what ad or message caused the conversation, who owns the follow-up, and what action is needed next. Marketing and management need the same underlying data to understand which campaign umbrellas, ads, creatives, and message angles produce real sales opportunities, fast replies, poor-fit leads, missed follow-ups, and conversion outcomes.

## 2. Objectives

1. Give sales one place to triage, reply, assign, follow up, and close Facebook and Instagram conversations.
2. Attribute each conversation as deeply as available: campaign umbrella, campaign, ad set, ad, creative, message/referral, and source post/comment.
3. Give managers visibility into response speed, workload, unresponded messages, failed follow-ups, lead quality, and sales-user performance.
4. Give marketing a read-only intelligence layer that connects conversation quality and outcomes back to campaigns, ads, creatives, and message angles.
5. Reuse existing Meta Ads AI app data where it is already strong, while allowing inbox-specific rebuilds where current structures are too thin.

## 3. Success Metrics

- Median first-response time by queue, team, and sales user.
- Percent of inbound conversations still unreplied by response-age bucket.
- Percent of conversations unassigned by response-age bucket.
- Percent of conversations with complete first-touch attribution.
- Percent of conversations with Lead Quality before Closed / Lost / final Inbox Outcome.
- Lead Quality, inbox outcome, and verified business outcome distribution by campaign umbrella, campaign, ad, creative, message/referral, and queue category.
- Missed follow-up count per day, queue, team, and sales user.
- Manager dashboard adoption: daily active sales leads and daily reviewed queue-health reports.

## 4. Personas / Users

### Sales User

Primary daily operator. Users with the `sales` role triage conversations, reply to customers, claim or receive assignments, mark lead quality, set follow-up status, and close or disqualify conversations. Sales owns lead-quality classification because sales sees the actual customer intent, seriousness, objections, and follow-through inside the conversation.

### Sales Lead / Manager

Primary oversight user. Users with the `sales_lead` role monitor queue health, team workload, response speed, missed follow-ups, stale conversations, and sales-user performance. Sales leads can reassign conversations, inspect lead-quality distribution, and coach reps based on actual message behavior.

### Marketing User

Read-only intelligence user for inbox operations. Marketing uses sales-classified conversation quality and outcomes to understand which campaign umbrellas, campaigns, ads, creatives, and message angles create high-quality or low-quality conversations. Marketing should not own replies, assignments, or lead-quality labels.

### Admin

Configuration and support user. Admin manages Meta connection health, app permissions, sync/webhook health, and data repair workflows. Admin is not a day-to-day inbox operator unless explicitly granted an emergency support path.

## 5. User Stories / Use Cases

- As a sales user, I can open one inbox and see only conversations from queues my teams can handle.
- As a sales user, I can see the customer's name, profile context, message history, source ad/message, queue category, and routing explanation before replying.
- As a sales user, I can claim a team-queue conversation or receive one assigned by a manager.
- As a sales user, I can reply only after explicit human approval and can see whether the latest customer message still needs a response.
- As a sales user, I can reply to public comments, send a private reply/DM from a public comment where Meta permits it, and like, hide, or delete public comments when needed.
- As a sales user, I can add, edit, or delete a customer's phone/email in accessible inbox conversations when the customer provides it, so future verified matching can improve.
- As a sales user, I can apply one Lead Quality label and locked reason tags so management and marketing can compare lead quality consistently.
- As a sales user, I can close a conversation only after required Lead Quality and Inbox Outcome fields are complete.
- As a sales user, I can close or mark lost conversations I can access.
- As a manager, I can see unanswered conversations, response-time performance, missed follow-ups, stale threads, team workload, and label completeness.
- As a manager, I can assign or reassign conversations across sales users and teams.
- As a manager, I can use the full manager dashboard in the first release, not wait for a later release.
- As a marketing user, I can read campaign/ad/creative conversation quality, sales-marked Inbox Outcome, and Verified Business Outcome reports without changing inbox state or replying to customers.
- As an admin, I can monitor webhook/sync health, diagnose missing attribution, and repair routing metadata when source data is missing or wrong.

## 6. Requirements / Features

### App Ownership And Cross-App Boundary

The Meta Messaging Inbox product surface lives in the Meta Ads AI app. The Meta Ads AI app owns the actual inbox UI, conversation list/detail pages, reply workflow, assignment workflow, queue routing, attribution display, lead-quality capture, conversation status/Inbox Outcome capture, read-only Verified Business Outcome display/reporting, manager dashboard, marketing reporting, Meta sync, and Meta webhook ingestion.

Meta webhook ingestion should not move into the standalone Sales app. Incoming Facebook and Instagram messages should continue to land in the Meta Ads AI app's analyst-owned social inbox tables, then be normalized for attribution, routing, inbox workflow, and reporting.

The standalone Sales app / Sales ERP should remain a supporting source of truth, not the place where Meta conversations are operated. It supplies central identity, users, roles, and canonical sales vocabulary where needed. The Meta Ads AI app should read that information through the existing data-boundary pattern rather than writing directly into Sales/ERP Core tables.

Inbox-specific queue/team membership should be stored in Meta Ads AI as an inbox-owned access model keyed to central Sales/ERP user IDs and roles. Central user identity stays canonical in Sales/ERP; inbox team membership, queue access, and routing enforcement stay in Meta Ads AI because this app owns the conversation UI and APIs.

Marketing is read-only for inbox operations. Marketing can view attribution, Lead Quality, Inbox Outcome, Verified Business Outcome, and performance reporting, but cannot send replies, claim conversations, assign/reassign conversations, change status, change Lead Quality, change Inbox Outcome, or override queue routing.

Operational inbox write access is for `sales` and `sales_lead`. `sales` users handle and label conversations. `sales_lead` users handle manager workflow: assignment, reassignment, coaching, queue review, and manager dashboard. Existing `client_advisor` and `joc` roles should not automatically receive inbox operator access unless a later decision changes the role map.

### Meta Messaging Access And Reply Windows

Current app setup should check more than "can call send." It must show whether the Meta token and Page are ready for:

- Facebook Page messages
- Instagram messages
- Facebook/Instagram comment replies
- Facebook/Instagram comment likes, hides, deletes, and private replies where Meta allows them
- webhook delivery
- profile lookup / enrichment where Meta allows it
- attachment receive/send
- Human Agent / extended reply behavior where Meta allows it

Meta's standard messaging window is 24 hours after a person messages the Page or Instagram Professional account. The 7-day idea maps to the Human Agent message tag / human escalation path, not the normal reply window. The inbox must treat this as:

- Standard Reply: inside 24 hours, eligible for normal human reply.
- Human Agent Reply: outside 24 hours but within 7 days, only when Meta policy and app/page access allow the Human Agent tag and the message is a human support response, not promotional.
- Expired Reply Window: outside allowed reply window; disable normal send and show guidance.

The UI must show a reply-window countdown and disabled/limited state before a rep writes a response. The send API must persist `reply_window_expires_at`, `human_agent_window_expires_at`, `send_eligibility`, attempted `messaging_type`, attempted `tag`, Meta error code/subcode, and final send status.

### Canonical Vocabulary And Sales Status Alignment

The inbox must not introduce a competing status vocabulary for customers, bookings, or sales outcomes. Conversation labels should align with the existing Sales/ERP concepts already used elsewhere in the app:

- Existing Sales/ERP ownership terms to understand but not automatically grant inbox access: Sales, Client Advisor, JOC, Sales Manager / Sales Lead.
- Customer state inputs: `stage_label`, `stage_key`, `sales_stage`, `conversion_status`, `lost_lead_reason`, and `lost_lead_notes` from the Sales/ERP read model.
- Appointment outcomes: Showed Up, No-show, Browsed, Sold, Lost.
- App-wide glossary: Customer, Conversation, Message, Reply, Booking, Group, Campaign, Group of Ads, Ad, Creative.

Lead quality should be treated as a sales-entered classification that supports marketing and management reporting. It should be separate from conversation workflow status and separate from final sales/appointment outcomes.

Conversation workflow status should not include a Snooze state. The inbox should keep work visible through ownership, response state, follow-up date, and closed/lost outcomes rather than hiding conversations from the active queue. Existing snooze-oriented code or database fields should be ignored, deprecated, or migrated away from the user workflow during implementation.

### Conversation Status

Conversation Status describes the inbox work state: what sales should do with this conversation now.

| Label | Use When | Example |
| --- | --- | --- |
| New Inquiry | Customer has started a conversation and no sales user has meaningfully handled it yet. | Customer messages from an ad: "How much is this ring?" No reply yet. |
| Needs Reply | Customer is waiting on a response from sales. | Customer asks: "Can I book for Saturday?" and the latest message is inbound. |
| Waiting On Customer | Sales has replied and the next move is the customer's. | Sales sent a price range and asked for budget, size, design preference, or appointment availability. |
| Follow-Up Needed | Sales owes a future touch even if the customer has not replied. Requires a follow-up date. | Sales needs to check back tomorrow after customer confirms ring size or budget. |
| Appointment Scheduled | Conversation produced a booking, consultation, viewing, or visit. | Customer books an appointment from the thread. |
| Closed | Conversation no longer needs active work and did not become a qualified lost opportunity. | Customer asks a simple question, sales answers, and there is no meaningful buying journey to track. |
| Lost Lead | A real buying opportunity existed, but the opportunity ended. Requires canonical Lost Lead Reason. | Customer stopped replying after a quote, bought elsewhere, or budget/timeline did not fit. |

The UI must show short descriptions next to these labels through inline helper text, tooltips, or a compact "when to use" disclosure. The goal is consistent sales labeling, not memorization.

### Assignment

Conversations may be assigned to a sales user or remain in a team/unassigned queue. New conversations should enter the team queue by default unless routing rules can confidently classify the conversation type. Sales users can claim conversations from the queue. Managers can assign and reassign conversations to balance workload, protect response time, and handle escalations.

Assignment should not primarily depend on existing Sales/ERP customer continuity. Many customers message before booking an appointment, so there may be no existing customer or appointment record to match. Also, the inbox sales users are a distinct team from Client Advisor / JOC ownership in the standalone sales app.

Routing rules should be based primarily on the message source and sales intent type, such as Cash for Gold, Book Appointment, US Product, Vietnam Product, custom jewelry, product inquiry, repair/service, or other campaign/message categories.

Assignment should include collision prevention:

- A sales user can see when another user is viewing or typing in the same conversation.
- Presence is live and ephemeral; it should not create permanent conversation history.
- If another user is actively typing, show "Name is typing..." or "Name is replying now" in the conversation detail.
- If a conversation is assigned to someone else, another user should see a stronger warning before replying.
- The system should still allow manager override/takeover when needed.

### Queue Categories And Access

The inbox should support category-based queues presented as tabs or filters, plus an All view. Queue categories should be driven by attribution and message intent rather than by existing Sales/ERP customer ownership.

The inbox must also support source-channel filters independent of queue category:

- Facebook Message
- Instagram Message
- Facebook Public Comment
- Instagram Public Comment
- Private Reply from Comment
- Ad Referral / Click-to-Message
- Other / Unknown

Source channel answers "where did this conversation happen?" Queue category answers "which sales team/work type should handle it?" These should be separate fields so a user can filter, for example, Cash for Gold + Instagram Messages, or All allowed queues + Public Comments.

Access should be team-based rather than maintained as one-off queue assignments on each user. A sales user belongs to one or more inbox teams, and each inbox team has access to one or more queue categories. The All view shows the union of queue categories available through the user's teams.

Team-based queue model:

- Inbox Team: named group of sales users that can work one or more queue categories.
- Team Member: central Sales/ERP user linked to an Inbox Team.
- Team Queue Access: mapping from Inbox Team to allowed queue categories.
- Conversation Assignment: either assigned to a sales user or available in the team queue.
- Manager Scope: manager can see and rebalance conversations for teams they manage.
- Admin Scope: admin can configure teams, queue access, routing rules, and fallback categories.

Inbox settings/configuration means operational setup, not personal preferences:

- inbox teams and team membership using central Sales/ERP user IDs
- team-to-queue access
- routing rules from campaign umbrella, campaign, ad, creative, message/referral, page, platform, or brand to queue category
- fallback routing behavior for General Inquiry and Uncategorized / Needs Review
- saved reply/template management if included in the same settings area
- data-quality/admin repair tools for missing profile/source/routing fields if included in the same settings area

This configuration should live under Inbox Settings inside the inbox, preferably as its own subpage, instead of under a global Operate/User Admin area.

Initial canonical queue categories:

1. Cash for Gold
2. Book Appointment
3. US Product
4. VN Product
5. Custom Jewelry
6. Repair / Service
7. General Inquiry
8. Uncategorized / Needs Review

The All view must respect queue permissions. If a sales user has access to Cash for Gold and Book Appointment queues, All shows only Cash for Gold and Book Appointment conversations, not every conversation in the system.

Queue category should be assigned from the best available source in this order:

1. Exact Meta ad/message attribution from the conversation start, when available.
2. Joined Meta ad hierarchy: campaign umbrella, campaign, group of ads, ad, creative, and message/referral context.
3. Configured routing rules that map campaign umbrella, campaign, ad, creative, message/referral, page, platform, or brand to a queue category.
4. Rules-based message intent classification when ad attribution is missing. AI classification should be disabled or placeholder-only in the first foundation build.
5. Manual manager/sales correction when automatic classification is missing or wrong.

Queue category must be visible and explainable in the UI. Sales users should be able to see why a conversation landed in a queue, such as "Cash for Gold queue because first message came from Campaign Group X / Ad Y." Reporting should track attribution coverage and queue classification confidence.

### Public Comment Operations

Sales users should be able to operate public comment conversations directly in the inbox when platform permissions allow:

- public reply to a Facebook or Instagram comment
- private reply / DM from a public comment where Meta supports that flow
- like a public comment
- hide a public comment
- delete a public comment

These actions are customer-visible or moderation-sensitive, so every action must write an audit event with actor, timestamp, platform, source comment ID, action type, Meta result, and error details when the action fails. Hide/delete actions should require clear confirmation and a reason note in the UI before sending the request to Meta. Marketing remains read-only and cannot perform comment actions.

### Webhook And Attribution Capture Requirements

The current inbox implementation is not sufficient for the planned routing flow because it does not normalize first-touch referral/ad context from incoming Meta message webhooks. The comprehensive inbox build must update webhook ingestion so new conversations preserve the data needed for attribution, queue routing, and reporting.

When an inbound conversation starts, the system must persist the best available first-touch source data, including:

- platform: Facebook or Instagram
- page / Instagram business account
- participant/customer scoped ID
- customer display name, when available
- customer username/handle, when available
- customer profile picture URL, when available
- best available profile link or profile reference, when available
- source permalink for post/comment/media/ad context, when available
- message ID and timestamp
- referral object, when present
- `ad_id`, when present
- `ads_context_data`, when present
- `ref` or referral parameter, when present
- source post/media/comment/product identifiers, when present
- raw webhook payload stored for backend audit/debug only, hidden from UI
- normalized source confidence and source method

The first-touch source should be stored on the conversation/customer profile and remain stable even if later messages arrive without referral data. Later messages may add more context, but they should not overwrite the original source unless a permitted user performs an explicit correction.

Profile enrichment should use a hybrid model. Webhook data should populate customer/profile/source fields immediately when present. Async repair jobs should later fill or improve missing display name, username/handle, profile picture, profile reference/link, source fields, and attribution joins when Meta APIs and permissions allow.

The system must join first-touch `ad_id` or source identifiers to the existing Meta ads hierarchy where possible:

- campaign umbrella / Group
- campaign
- Group of Ads
- ad
- creative
- message/referral context

Routing rules then map that normalized source to a queue category. If source data is missing, the system may use rules-based message-intent classification, then route to General Inquiry or Uncategorized / Needs Review when confidence is low. AI-assisted classification should not ship in the first foundation build; any AI UI should be hidden, disabled, or shown only as a placeholder/stopped state.

Sales users can directly change the queue category for conversations they can access. This should be treated as a manual routing override and must write audit metadata. Sales leads/admin can change queue categories across their broader management/admin scope.

Required queue-routing audit fields:

- selected queue category
- routing source: ad attribution, campaign rule, message-intent classifier, manual correction
- routing confidence
- routing explanation shown in UI
- actor and timestamp for manual overrides
- override reason when the UI requires one

### Conversation Identity Requirements

Conversation identity must be deterministic so history, assignment, metrics, and attribution do not split across duplicate records.

Each operational conversation should have:

- canonical conversation ID
- source channel
- platform
- source type: direct message thread, public comment, private reply, ad referral, other
- platform thread/conversation ID when Meta provides one
- page ID / Instagram business account ID
- participant scoped ID
- parent content ID for comments/posts/media
- original raw social row reference
- merge/split audit history

Identity rules:

1. Facebook message threads and Instagram message threads should become message conversations keyed by platform + business account/page + thread/conversation/participant identity.
2. Public comments should be separate comment conversations unless a private reply creates or links to a DM thread.
3. A private reply from a comment should preserve both contexts: the original public comment and the resulting private conversation.
4. The same customer across Facebook and Instagram should not be automatically merged unless a future identity-confidence rule supports it.
5. Existing synced threads and new webhook-created synthetic threads must reconcile to one canonical conversation when they represent the same platform/page/participant thread.
6. Manual merge/split should be manager/admin-only and audited.

### Conversation History Requirements

The inbox must not rely on a shallow global message limit when a sales user opens a conversation. Conversation detail should load the full known history for that thread or comment chain, ordered oldest to newest, with cursor pagination for older messages when needed.

Requirements:

- Conversation list may use summarized latest-message data for speed.
- Conversation detail must query by selected `thread_id` / `conversation_id`, not by global latest message slice.
- Historical sync/backfill should page through Meta conversation messages when allowed by the API and store all available message rows.
- UI should show whether history is complete, still loading, or partially unavailable because Meta did not return older data.
- Attachments, images, files, stickers, quick replies, postbacks, reactions, read/delivery events, edits, referrals, and raw payload references should remain available for backend audit/debug when present. Raw Meta payload should be hidden from normal UI.
- Outbound messages sent from this app should appear in the same ordered history as inbound messages.

### Attachments, Failed Sends, And Retries

The inbox must support receiving and displaying customer attachments where Meta provides them:

- image
- video
- audio
- file
- sticker
- product/share attachment
- unsupported/unknown attachment placeholder

The first release should support sending approved attachments where Meta allows them. Attachment send must use the same human-approved reply workflow, reply-window checks, failed-send tracking, retry behavior, and audit trail as text sends. If a platform or account cannot send a specific attachment type, the UI should show that limitation before send rather than fail silently.

V1 attachment support should attempt all Meta-supported attachment/media types, capability-gated by platform and connected account. The app should maintain a capability matrix so the composer only enables attachment types currently sendable for that conversation's platform/account.

Failed sends must be first-class. A failed send should not disappear into logs. The inbox needs:

- Failed Send Inbox / retry queue
- send attempt status: approved, queued, sending, sent, failed_retryable, failed_terminal, canceled
- Meta error message, code, subcode, trace ID when available
- attempt count and timestamps
- retry action with permission checks
- "Meta accepted send but local DB insert failed" warning state
- duplicate-send protection

Webhook retries from Meta must be idempotent. Duplicate webhook deliveries should not create duplicate messages, comments, or conversation events.

### Saved Replies, Notes, Coaching, QA, And Audit

The inbox should include productivity and management tools without overcrowding the main reply area:

- Saved replies/templates filtered by queue category, source channel, language, Lead Quality, and source/ad context.
- Sales users can create personal draft replies/templates for their own use.
- Shared templates require sales lead/admin approval before other users can use them.
- Template variables for customer name, product/ad, appointment link, store hours, and next-step questions.
- Internal notes that are never sent to the customer.
- @mentions for sales leads/managers.
- Manager coaching comments tied to a conversation or specific sales reply.
- Optional QA scorecards for manager coaching on selected sales replies, including tone, completeness, accuracy, next step, speed, and policy/compliance risk.
- Audit trail for assignment, status, quality, Inbox Outcome, verified outcome matches/conflicts, routing override, send attempts, notes, coaching, and QA.

These should be organized as secondary panels or tabs so the page remains usable for fast replies.

Audit trail visibility:

- Sales users can see the full audit trail for conversations they can access.
- Sales leads/admin can see broader team/dashboard audit trails within their scope.
- Marketing remains read-only for reporting and should not receive operational audit controls.
- Raw Meta payload stays hidden from product UI even when the audit trail is visible.

### In-App Alerts And Badges

The first release should use in-app badges and dashboard indicators only. Do not add email, Slack, SMS, or external push alerts in v1.

Badges/dashboard indicators should cover at minimum:

- needs reply
- assigned to me
- team queue unassigned
- failed sends / retry needed
- overdue follow-up
- unread/new activity
- public comments needing moderation/action

### Lead Quality

Lead Quality is a sales-entered judgment about buying intent and usefulness for marketing/management reporting. It is separate from Conversation Status, Inbox Outcome, and Verified Business Outcome.

| Label | Use When | Example |
| --- | --- | --- |
| High Intent | Customer shows buying signals and enough detail for a clear next action. | Asks for appointment availability, shares budget, asks for quote, sends inspiration, asks custom design timeline, or asks deposit/payment process. |
| Medium Intent | Customer shows real interest but not enough commitment or detail yet. | Asks general pricing, asks if custom is possible, asks about diamond types, or sends a vague but responsive "interested." |
| Low Intent | Customer shows weak buying signal or shallow engagement. | Sends only "price?", reacts once, asks a generic question, gives no budget/timeline/design detail, or replies inconsistently. |
| Not A Fit | Real person, but the business should not pursue as a qualified opportunity. | Budget far below offering, asks for a product/service not offered, wrong location/timeline, or request conflicts with business policy. |
| Spam / Invalid | Not a real customer opportunity. | Bot, scam, unrelated solicitation, nonsense, or duplicate spam. |

The UI must provide the same kind of short "when to use" guidance for Lead Quality so sales users apply labels consistently.

Each conversation should have one primary Lead Quality label. Sales users may also apply reason tags for deeper reporting. Reason tags should support multi-select and should explain why the quality label was chosen without replacing the simple primary label.

Lead Quality should not block fast sales replies. It becomes required before a sales user can close a conversation, mark a conversation as Lost Lead, or assign a final Inbox Outcome other than No Outcome Yet. Manager reporting should separately expose conversations that are still missing Lead Quality.

Close/lost required fields are the same for all queue categories in v1. Before close/lost/final outcome, every queue requires Lead Quality, reason tags, Inbox Outcome, and Inbox Lost Reason when outcome/status is Lost. Queue-specific required fields are intentionally deferred.

Reason tags should be locked and canonical. Sales users should choose from the approved list rather than creating ad hoc tags, so management and marketing reports remain clean and comparable.

Initial Lead Quality reason-tag examples:

| Tag | Use When |
| --- | --- |
| Asked Appointment | Customer asks about booking, availability, consultation, or visit. |
| Asked Price | Customer asks for price, estimate, quote, discount, or budget range. |
| Budget Shared | Customer provides a budget or target spend. |
| Design Details Shared | Customer sends inspiration, reference photos, style notes, size, metal, stone, or customization details. |
| Custom Design | Customer asks about custom jewelry, redesign, CAD, 3D, or made-to-order work. |
| Diamond Inquiry | Customer asks about diamond, lab/natural, shape, carat, quality, or stone sourcing. |
| Repair / Service | Customer asks about repair, resizing, cleaning, appraisal, or service work. |
| Price Shopping | Customer appears mainly focused on comparing price or requesting lowest price. |
| Budget Mismatch | Customer's budget appears too low or misaligned with offering. |
| Timeline Mismatch | Customer needs a timeline the business likely cannot meet. |
| Wrong Product / Service | Customer asks for something the business does not offer or does not want to pursue. |
| Unresponsive | Customer stops replying after sales response or follow-up. |
| Duplicate | Same customer/conversation already exists elsewhere. |
| Spam / Bot | Automated, scam, unrelated solicitation, or nonsense. |

### Outcome

Outcome vocabulary describes what eventually happened after the conversation. It should reuse existing Sales app vocabulary wherever possible.

| Label | Use When |
| --- | --- |
| No Outcome Yet | Conversation is still active or no business result is known. |
| Booked | Conversation produced a booking, consultation, viewing, or appointment. |
| Showed Up | Customer attended the booked appointment or visit. |
| No-show | Customer missed the booked appointment or visit. |
| Browsed | Customer engaged or came in but did not buy or commit. |
| Sold | Purchase, deposit, order, or sale was committed. |
| Lost | Opportunity ended without sale. |

Lost outcomes must use the existing canonical Sales app Lost Lead Reasons: No Response, Price Concerns, Bought Elsewhere, Timeline Issue, Budget Not Aligned, Design Not Preferred, Cancelled by Client, Duplicate Lead, Lost After No Show, Other.

Outcome should use a dual-outcome model:

- Inbox Outcome: sales-entered result from the conversation. This is fast and useful for daily workflow, but it is not the final business source of truth.
- Verified Business Outcome: later read-only outcome matched from Sales/ERP when confidence is high enough. This is the stronger reporting signal for bookings, show/no-show, purchases, deposits, and lost records already proven by Sales/ERP.

Verified business matching must be conservative. The inbox should only attach a verified business outcome when there is high-confidence evidence such as an approved customer identity match, phone/email/profile linkage, booking link, or other explicit identifier. Name-only or loose timing/context matches should not automatically verify an outcome.

Sales users may manually add, edit, or delete customer phone/email in accessible inbox conversations when the customer provides it in conversation or during follow-up. These are inbox-owned contact identifiers used to improve future verified matching. They must store source, actor, timestamp, and audit history. They must not write directly to Sales/ERP Core unless a future approved data flow is designed.

Reports should clearly distinguish:

- sales-marked inbox outcome
- verified business outcome
- unmatched / not verified yet
- conflicting outcome, where inbox outcome and verified Sales/ERP outcome disagree

## 7. UX / User Flow

Primary sales flow:

1. Sales user opens Inbox in Meta Ads AI.
2. User sees tabs/filters for allowed queue categories plus All.
3. User selects a conversation from New Inquiry / Needs Reply / Follow-Up Needed work.
4. Conversation detail shows customer identity, profile context, source ad/message, queue category, routing reason, full message history, status, owner/team, Lead Quality, reason tags, Inbox Outcome, Verified Business Outcome when matched, and follow-up state.
5. User claims or accepts assignment if needed.
6. User replies with explicit human action.
7. User updates status and follow-up date.
8. User adds Lead Quality, reason tags, and required Inbox Outcome fields before closing/lost/final outcome.

Primary manager flow:

1. Manager opens Manager Dashboard.
2. Manager reviews unanswered conversations, oldest waiting customer, missed follow-ups, stale threads, workload by sales user/team, and missing Lead Quality.
3. Manager drills into queue/team/user.
4. Manager assigns/reassigns or coaches based on response time, labels, outcomes, and conversation examples.

The full manager dashboard is part of the first release scope. It should include queue health, response-time metrics, response-age buckets, unresponded messages, missed follow-ups, stale conversations, workload, label completeness, failed sends, optional QA/coaching, audit visibility, Inbox Outcomes, Verified Business Outcomes, and outcome conflicts.

The manager dashboard should default to the last 7 days. Users can change the date range for deeper review.

Primary marketing flow:

1. Marketing opens read-only inbox intelligence/reporting.
2. Marketing filters by campaign umbrella, campaign, ad set/group of ads, ad, creative, message/referral, queue category, Lead Quality, Inbox Outcome, and Verified Business Outcome.
3. Marketing reviews which ads/messages create high-quality conversations without changing inbox state.

## 8. Analytics / Measurement

- Daily queue health: new, needs reply, waiting on customer, follow-up needed, appointment scheduled, closed, lost.
- Response metrics: first response time, latest response time, average response time, median response time, current wait time, and response-age buckets.
- Workload metrics: assigned count, unassigned/team queue count, closed count, lost count, follow-up due count by user/team/queue.
- Follow-up metrics: due today, overdue, completed, missed.
- Quality metrics: Lead Quality distribution, reason-tag distribution, missing label count.
- Outcome metrics: booked, showed up, no-show, browsed, sold, lost, and loss reason, split by Inbox Outcome and Verified Business Outcome.
- Outcome integrity metrics: inbox outcome only, verified outcome, unmatched, and conflicting outcomes.
- Attribution metrics: source coverage, campaign umbrella, campaign, group of ads, ad, creative, message/referral, source confidence, manual override count.
- Marketing intelligence: high-intent rate, booked rate, sold rate, lost rate, spam/invalid rate, response-time impact by campaign/ad/creative.
- Management review: leaderboard by response speed, completion, quality labeling, missed follow-ups, customer outcomes.
- Dashboard default date range: last 7 days.

Manager metric definitions:

- Needs Reply: latest customer/inbound message is newer than latest sales/outbound message, and conversation is not Closed or Lost Lead.
- First Response Time: time from first inbound customer message to first outbound human reply.
- Current Wait Time: time since latest inbound customer message when Needs Reply is true.
- Response Time Average/Median: aggregate of inbound-to-next-outbound response pairs.
- Response Age Bucket: grouping of open unreplied conversations by how long the customer has been waiting. V1 measures age but does not define SLA pass/fail targets.
- Missed Follow-Up: follow-up date/time is past due and no qualifying outbound reply or status change completed it.
- Stale Conversation: conversation has had no new inbound/outbound activity past the threshold for its current status.
- Workload: assigned open conversations plus visible team-queue conversations.

Dashboards should support both wall-clock metrics and business-hours-adjusted metrics. Business-hours-adjusted metrics should use a configurable business timezone and holiday/closed-day calendar. First release should measure response times only; SLA targets can be added later after baseline data is reviewed.

## 9. Assumptions

- Meta APIs and webhooks can provide enough message/referral/ad context for some, but not all, conversations.
- Some conversations will have no usable ad attribution and must route through intent classification or manual review.
- Sales team using this inbox is distinct from existing Client Advisor / JOC ownership in the standalone sales app.
- Central user identity remains in Sales/ERP, while inbox teams and queue access are Meta Ads AI-owned.
- Marketing needs read-only insight, not operational control.
- Verified business outcomes are read-only and only attached through conservative high-confidence matching.
- First release has no SLA target; it measures response times and response-age buckets only.
- Close/lost required fields are uniform across all queue categories in v1.
- No AI features ship in the first foundation build. Existing AI surfaces should be disabled, hidden, or represented as future placeholders.

## 10. Dependencies

- Existing Meta Ads AI auth and permission system.
- Existing Meta webhook and social inbox sync code.
- Existing Meta ads hierarchy data used by the analyst surfaces.
- Existing Sales/ERP identity read model / data-boundary view.
- Canonical Sales app vocabulary for lost reasons and outcomes.
- Meta app permissions needed for messaging, profile lookups, page/IG account context, and webhook subscriptions.
- Meta permissions needed for public comment reply, private reply, like, hide, delete, and attachment send where supported.
- Capability matrix for all Meta-supported attachment types by platform/account.
- Meta messaging policy support for standard 24-hour replies and Human Agent / 7-day human support replies where applicable.
- Read-only Sales/ERP views or APIs for conservative verified business outcome matching.

## 11. Risks / Constraints

- Meta may not provide profile link or full profile fields for every participant. Store best available profile reference and show missing data clearly.
- Referral/ad context may only appear on first message. Preserve first-touch data and do not overwrite it accidentally.
- Current sync/history approach may miss older messages. Need thread-specific pagination and backfill.
- Existing snooze columns may remain in schema. Implementation must avoid exposing Snooze as a workflow state.
- Marketing permissions currently conflict with the desired read-only model and must be corrected.
- Queue routing errors can send leads to wrong team. UI must show routing explanation and allow sales users to directly correct queue category on conversations they can access, with audit trail.
- Direct Sales/ERP writes would violate the existing data boundary. Keep inbox data analyst-owned.
- Reply windows can close before sales responds. The UI and API must prevent invalid sends and explain when only Human Agent or no reply is allowed.
- Human Agent / 7-day behavior may require Meta policy eligibility, tag support, and platform-specific handling. Do not assume every conversation can be replied to for seven days.
- Loose Sales/ERP matching can corrupt reporting. Verification must fail closed unless confidence is high.
- Manually entered phone/email can improve matching but also increases privacy and data-quality risk. Validate format, audit add/edit/delete actions, and show source/provenance.
- Public comment hide/delete actions can affect customer-visible conversations. Require permissions, confirmation, reason note, audit trail, and Meta error handling.

## 12. Out Of Scope

- Moving Meta webhook ingestion into the standalone Sales app.
- Operating Meta conversations from the standalone Sales app.
- Direct writes to Sales/ERP Core customer, appointment, user, or order tables.
- AI reply suggestions, AI summaries, AI lead-quality suggestions, AI routing suggestions, and automated AI sending in the first foundation build. Placeholders/stopped states are acceptable.
- User-created ad hoc Lead Quality reason tags.
- Snooze workflow for inbox conversations.
- Email, Slack, SMS, or external push alerts in the first release.
- Queue-specific close/lost required fields in v1.

## 13. Open Questions

- Which existing Sales/ERP read-only identifiers beyond sales-entered inbox phone/email are available in v1 for conservative verified business outcome matching?
- Should queue-specific SLA targets be introduced later after baseline response-time data is collected?

## 14. Future Work

- AI summarization of long conversations.
- AI objection clustering and concern themes by campaign/ad/creative.
- Suggested reply drafting based on source ad, lead quality, customer context, and approved brand voice.
- Forecasting queue load by campaign spend and historical message volume.
- Cross-surface customer matching with bookings/orders only through approved read-only views or future approved APIs.
