# PRD: Harden Meta Inbox Review Findings Before Merge

## Problem Statement

The Meta Messaging Inbox is meant to be the sales team's daily operating surface for Facebook and Instagram conversations, but the current branch still has review-blocking gaps that can make customer context disappear, allow old paths to bypass new queue permissions, produce duplicate sends, miss retryable failures, mix data across environments, and report manager metrics from incomplete data.

From the user's perspective, this creates a trust problem. Sales needs to know who the customer is, what they responded to, whether they are allowed to act on the conversation, and whether their reply actually sent. Managers need response-time and failed-follow-up numbers they can trust. Marketing needs read-only attribution intelligence based on clean sales workflow data. The foundation must be hardened before the inbox can be treated as a reliable sales super app.

## Solution

Harden the current Meta Messaging Inbox foundation so normalized conversations are the main product surface, every mutation goes through team-queue authorization, legacy send paths are migrated or blocked, outbound delivery is retry-safe, attachments are validated before use, manager dashboard data is complete, public comment chains stay coherent, and no AI reply functionality is active in the first foundation build.

This PRD is not a new full-product PRD. It is a focused merge-readiness PRD for the remaining code-review findings on the current inbox foundation branch.

## User Stories

1. As a sales user, I want every accessible conversation to show in my inbox even when raw Meta thread records are capped, so that I do not miss customers who need a reply.
2. As a sales user, I want the customer name to flow through from normalized profile data, so that I know who I am replying to.
3. As a sales user, I want the customer profile reference or profile link to remain visible when Meta provides it, so that I can understand the customer context.
4. As a sales user, I want the first-touch ad, message, comment, or referral source to remain attached to the conversation, so that I know why the customer messaged us.
5. As a sales user, I want the queue category and routing explanation to stay visible, so that I know how best to reply.
6. As a sales user, I want Facebook messages, Instagram messages, public comments, private replies, ad referrals, and unknown sources to stay filterable, so that I can focus on the channel I am handling.
7. As a sales user, I want the All view to show only queues my teams can access, so that I do not accidentally act on another team's work.
8. As a sales user, I want mobile inbox detail to show the full selected conversation history, so that older messages are not hidden by the latest global message cap.
9. As a sales user, I want to send replies only through the approved inbox send workflow, so that replies are tracked, audited, and retryable.
10. As a sales user, I want old mobile reply behavior to follow the same permission model as desktop, so that queue rules are consistent everywhere.
11. As a sales user, I want unauthorized conversations to block send, comment, workflow, notes, and QA actions server-side, so that hidden UI controls are not the only protection.
12. As a marketing user, I want inbox operations to remain read-only for my role, so that reporting access does not accidentally become customer-facing access.
13. As a sales lead, I want sales users and sales leads to be the only operational inbox writers, so that ownership is clear and auditable.
14. As a sales lead, I want stale send or retry actions to be safely rejected, so that a late click cannot resend a message that already succeeded.
15. As a sales lead, I want retryable failed sends to be picked up automatically when due, so that failed-send recovery does not depend on manual database repair.
16. As a sales lead, I want terminal send failures to stop retrying, so that the team can see failures that need human review.
17. As a sales user, I want duplicate-click protection on replies, so that one accidental double submit does not create duplicate customer messages.
18. As a sales user, I want to be able to send the same valid text later as a new reply, so that duplicate protection does not block normal conversation flow forever.
19. As a sales user, I want attachment sends to reject missing or foreign attachments, so that another customer's media cannot be sent in the wrong conversation.
20. As a sales user, I want attachment support to follow platform and account capability, so that unsupported sends fail clearly before confusing the customer.
21. As a sales user, I want all requested attachments to be accounted for, so that the system never silently drops an attachment from a send.
22. As a sales user, I want public comment replies and comment actions to stay tied to the root comment chain, so that one customer discussion does not split into multiple inbox conversations.
23. As a sales user, I want hide and delete comment actions to stay audited with reason notes, so that moderation actions can be reviewed later.
24. As a sales user, I want note drafts, QA inputs, comment action forms, and reply drafts to reset or stay keyed by conversation, so that I cannot submit one customer's draft to another customer.
25. As a sales user, I want presence and typing warnings to stay scoped to the selected conversation, so that stale live signals do not mislead me.
26. As a sales user, I want conversation history to refresh or show a stale state after sync, so that I know whether I am looking at current messages.
27. As a sales user, I want reply-window labels and disabled send states to stay current, so that I do not write a reply that cannot be sent.
28. As a manager, I want first-response time to use the first outbound reply after the first inbound message, so that response metrics are accurate.
29. As a manager, I want dashboard metrics to count the whole selected date range, so that capped UI payloads do not undercount work.
30. As a manager, I want failed-send backlog and retry success metrics to reflect real delivery rows, so that I can see operational problems quickly.
31. As a manager, I want dashboard filters for team, user, queue, source channel, campaign umbrella, ad, creative, and message context to compose safely, so that I can review performance by marketing source without leaking inaccessible data.
32. As a manager, I want the dashboard to default to the last seven days, so that daily review starts with the most relevant window.
33. As an admin, I want new inbox data to stay isolated by environment even under service-role code paths, so that staging and production data never mix.
34. As an admin, I want malformed client input to return a clear 400 without mutation, so that operational errors are understandable and safe.
35. As an admin, I want malformed presence payloads rejected instead of treated as valid heartbeats, so that live collision state stays trustworthy.
36. As a product owner, I want no AI reply endpoint active in the foundation build, so that the shipped product matches the no-AI first-release decision.
37. As a product owner, I want each review-critical fix to have a slice-specific behavior test, so that future refactors do not reintroduce the same risks.
38. As an implementing agent, I want deep modules with simple testable interfaces, so that the remediation can be built in focused slices without changing unrelated behavior.

## Implementation Decisions

- Build or modify a canonical conversation read model module. It should expose normalized conversation list/detail data as the primary inbox surface, with raw Meta threads, comments, and messages treated as optional display context.
- Build or modify a conversation history module. It should load selected conversation history directly and support pagination or completeness state rather than depending on shallow global message slices.
- Build or modify an inbox authorization gateway module. It should resolve the current user's role, team memberships, allowed queues, and conversation access in one reusable service boundary.
- Build or modify a legacy send adapter. It should migrate old raw-source send calls into the normalized send-attempt workflow or reject unsafe calls before any Meta send occurs.
- Build or modify a reply reliability module. It should create submit-scoped send attempts, enforce idempotency by submit and payload identity, and expose safe queue/retry transitions.
- Build or modify a public comment action module. It should validate comment action permissions, require reason notes for moderation actions, and use the same lifecycle and retry guarantees as sends.
- Build or modify delivery worker modules. They should process queued and due retryable rows, handle bounded retries, avoid duplicate sends, and never mark a row failed after Meta already accepted the customer-visible action.
- Build or modify an attachment validation module. It should validate ownership, requested count, platform/account capability, sendability, and payload identity before approval and before delivery.
- Build or modify an environment boundary module. It should make environment filtering explicit in new inbox reads and writes, and support schema checks that prove child rows carry environment consistently.
- Build or modify an API validation module. It should standardize bad request responses for malformed JSON and wrong field shapes across inbox mutation routes.
- Build or modify UI state helper modules. They should key local drafts, note forms, QA forms, comment action inputs, presence responses, and history refresh state by selected conversation.
- Build or modify a manager dashboard metrics module. It should compute first-response time, unresponded counts, failed-send backlog, workload, label completeness, and attribution filters from complete date-range data.
- Build or modify a public comment identity normalizer. It should use root comment identity for public comment chains while preserving reply-level events in history.
- Build or modify a foundation AI gate. It should ensure no active AI reply, summary, label, or routing endpoint can run in the foundation build.
- Schema changes should be additive where possible. If constraints or indexes need tightening, they should preserve current data and make the rollout path explicit.
- Service-level authorization should be treated as required even when a route already checks permissions, because future UI, mobile, internal API, or agent callers may bypass a specific route.
- The implementation should prefer deep modules that can be tested in isolation: conversation access, canonical queue building, lifecycle transitions, retry claiming, attachment validation, dashboard metrics, public comment identity, and API body parsing.

## Testing Decisions

- Good tests should assert external behavior: visible queue output, route status and body, whether a service call happens, lifecycle row state, worker result counts, dashboard metric values, and generated delivery payloads.
- Tests should not rely on implementation details when a behavior-level seam exists. Source-string assertions may remain only as light smoke tests for wiring, migration readiness, or route existence.
- Every review-critical fix should start with a failing slice-specific test, then the implementation, then the affected focused suite.
- The canonical conversation read model should be tested with normalized conversations that have missing or capped raw rows.
- The conversation history module should be tested with selected conversations whose older messages are outside the global latest-message slice.
- The authorization gateway should be tested for sales, sales lead, marketing, read-only, client advisor, and disallowed queue cases.
- The legacy send adapter should be tested to prove unsafe raw-source sends do not call Meta and do not write successful attempts.
- Reply reliability should be tested for duplicate submit, later same-text submit, payload mismatch, stale queue transitions, due retries, future retries, max retries, and Meta-success/local-audit-failure behavior.
- Public comment actions should be tested for public reply, private reply where allowed, like, hide, delete, reason-note enforcement, retries, and Meta-success/local-audit-failure behavior.
- Attachment validation should be tested for valid sends, missing IDs, foreign IDs, unsupported media, count mismatch, and idempotency with different payloads.
- Environment isolation should be tested with fake service-role data containing multiple environments.
- API validation should be tested with malformed JSON, invalid body shapes, empty allowed bodies where applicable, and valid bodies.
- UI state helpers should be tested with conversation switching, stale presence responses, sync refresh, and reply-window time updates.
- Manager dashboard metrics should be tested above UI cap volume and with multiple outbound messages after the first inbound.
- Public comment identity should be tested with root comments, replies, orphan replies, and ordered history.
- The AI gate should be tested to prove foundation-mode calls do not invoke an AI provider.
- Existing prior art includes the project's Node test runner, fake Supabase worker tests, access-control tests, inbox UI contract tests, dashboard helper tests, schema readiness tests, and data-boundary tests.

## Out of Scope

- Moving the inbox UI, webhook ingestion, routing, or manager dashboard into the standalone Sales app.
- Adding first-release AI reply suggestions, summaries, label suggestions, or AI routing.
- Adding Snooze back into the inbox workflow.
- Broad visual redesign of the inbox page.
- Final manager dashboard chart polish beyond data correctness and access-safe filtering.
- External alerts through email, Slack, SMS, or push notifications.
- New SLA targets. This remediation should keep measuring response times without enforcing targets.
- Full Sales/ERP write integration. Sales/ERP remains a read-only supporting source for identity and canonical vocabulary.
- Full component rewrite of the inbox UI unless a small extraction is needed for testable behavior.

## Further Notes

- This PRD supersedes the earlier ad hoc remediation plan issue body created during the previous attempt.
- The existing full inbox PRD, RFC, ADR, implementation plan, and test plan remain the product source of truth. This PRD narrows that work to the remaining review-critical hardening needed before merge.
- The current branch already contains a TDD repair for the duplicate-send risk after Meta accepts a send or comment action but local audit persistence fails. Keep that behavior and coverage.
- The preferred implementation order is canonical read model, write-path authorization, delivery lifecycle, environment/API safety, attachments, UI state safety, public comment identity, manager metrics, and test modernization.
