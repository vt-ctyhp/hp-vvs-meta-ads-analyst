---
github_issue: 53
labels:
  - ready-for-agent
  - enhancement
mode: AFK
status: ready
---

# feat: /convert/inbox redesign — replier shell, four drawers, real-code aligned

## Problem Statement

The current `/convert/inbox` page is a single 4413-line client component (`src/components/social-inbox-client.tsx`) that renders 15+ panels at once on first paint: inbox-readiness banner, Meta-readiness panel, manager-snapshot panel, sync-run panel, queue tabs, ~7 filter selects, selected-item detail, message-attachment list, public-comment action panel, presence-collision banner, history-status strip, reply-attempt panel, workflow-state panel, audit-trail panel, notes/coaching panel, and QA-scorecard panel. Both personas this page must serve are slowed by the density:

- The **marketing operator** loses the lead signal in the visual noise. The most important sentence on the page ("how many are waiting, how many are over SLA, what's the team's first-response median") is buried below readiness chrome.
- The **client advisor** (replying on a desktop) has to hunt for the queue, the thread, and the composer, all of which compete with admin/coaching/QA panels they don't use every day.

The visual register also drifts from `DESIGN.md`. The current side-panel grid stacks identical-looking cards and pulls attention in too many directions, against PRODUCT.md's principles ("Status sentence first," "Workflow first, decoration second," "Quiet authority").

## Solution

Re-render `/convert/inbox` as a two-pane "Replier" shell, with everything not needed for replying or queue oversight tucked into four right-side overlay drawers. **No new functions, mutations, or data shapes are invented.** Every visible affordance maps to an existing handler, panel, or field; what changes is the layout, hierarchy, and timing (panels become drawers triggered on demand instead of side-rail components always rendered).

The redesign:

1. Leads with the status sentence (driven by the existing `inboxHighlights` computation) and a slim eyebrow strip of real `MetaInboxManagerDashboardMetric` fields.
2. Renders the queue rail at left (~400px) with the existing `buildQueue` output, a queue-category dropdown defaulting to "All categories," a collapsible filter disclosure (Source / Campaign umbrella / Type / Status + Reset), and a per-row category tag so the operator can see at a glance which queue every conversation belongs to without leaving the All view.
3. Renders the selected conversation at right (the rest of the viewport): existing presence banner, history-status strip, thread bubbles with attachments, and either the existing `ReplyAttemptPanel` (rebuilt as `ReplyComposer`) or the existing `PublicCommentActionPanel` depending on item type.
4. Surfaces four drawer chips in the conversation header — **Details / Audit / Notes / QA / Close →** — each opening a right-side slide-in overlay. Details merges the existing `ConversationSourcePanel`, `ContactMethodsPanel`, and `WorkflowStatePanel` into one drawer. Audit / Notes / QA wrap the existing panels as-is. Close → opens Details with the Status field pre-set to `closed` and a warning banner surfacing the existing closing-validation rules (Lead quality + ≥1 reason tag + Outcome required).

Pink accent is used sparingly: pink "Needs reply" label and a 6% pink-tinted row background for needs-reply rows (replacing the side-stripe pattern, which DESIGN.md bans). Over-SLA rows keep their amber warning treatment (more urgent signal stays distinct).

The prototype at `src/components/inbox-prototype/variant-a.tsx` (gated by `?variant=A` in dev) is the visual reference. It uses seed data only; folding into the real client wires every section to the existing data feed, permissions, and mutation handlers.

## User Stories

**Marketing operator — queue oversight**

1. As a marketing operator, I want a one-line status sentence at the top of the page (e.g., "9 unread · 9 needing reply"), so that I know within one second whether today's queue is healthy or backed up.
2. As a marketing operator, I want a slim metric strip showing needs-reply / unassigned / stale / median first response / QA average week, so that I can scan team health without opening a separate dashboard.
3. As a marketing operator, I want a "Sync Inbox" button visible in the eyebrow, so that I can pull the latest Meta data without leaving the page.
4. As a marketing operator, I want to see the last-sync timestamp and status next to the Sync Inbox button, so that I know whether the queue I'm looking at is fresh.
5. As a marketing operator, I want readiness problems (missing Meta env, permission gaps, sync failures) to surface only when something is wrong, so that they don't take up space when everything is healthy.
6. As a marketing operator, I want to filter the queue by category from a single dropdown (Cash for gold / Book appointment / US Product / VN Product / Custom jewelry / Repair service / General inquiry / Needs review), so that I can drill into one stream when I'm focused.
7. As a marketing operator, I want every row to carry its queue category as a tag, even on the "All categories" view, so that I can triage across categories without dropping into one at a time.
8. As a marketing operator, I want a "+ Filters" disclosure with Source / Campaign umbrella / Item type / Status filters that's collapsed by default, so that the rail isn't dominated by controls I use occasionally.
9. As a marketing operator, I want a "Reset" link visible whenever any filter is non-default, so that I can clear my drill-down in one click.
10. As a marketing operator, I want full-text search across sender, handle, message body, routing explanation, campaign umbrella, campaign, ad, and creative, so that I can locate a conversation by any attribution attribute.
11. As a marketing operator, I want rows where the conversation needs a reply to be visually distinct (pink "Needs reply" label + faint warm-pink row tint), so that I can scan the rail and see what's pending without reading every label.
12. As a marketing operator, I want rows that are over SLA to be visually distinct (amber "↑ Over SLA" label) and easily separated from the merely-pending pink-treatment rows, so that I can route urgent ones to advisors first.

**Client advisor — replying**

13. As a client advisor, I want the selected conversation to dominate the right pane (header, presence, history, thread, composer) so that I can focus on the reply and not the chrome.
14. As a client advisor, I want a presence-collision banner ("Mia is replying now") visible inside the conversation pane, so that I don't double-reply when a colleague is already on it.
15. As a client advisor, I want a "Load older history" affordance with a count of how many of the known messages are loaded, so that I can pull deeper context when a customer references something I haven't seen.
16. As a client advisor, I want the conversation header to show the routing confidence percentage and the model's routing explanation, so that I can decide quickly whether the auto-routing is correct before I start replying.
17. As a client advisor, I want the conversation header to show the reply-window state ("Reply window open · 6d remaining" / "closing" / "closed"), so that I know whether I can still reply.
18. As a client advisor, I want the composer disabled when the reply window is closed, with a hint to use a saved follow-up template, so that I don't waste effort on a message that can't be delivered.
19. As a client advisor, I want a Saved Replies card showing up to 4 templates with title, body preview, and scope label (Personal Draft / Approved Shared), so that I can insert a pre-approved reply with one click.
20. As a client advisor, I want the Saved Replies card to be collapsible (default open) so that I can hide it when I'm drafting a custom reply and want vertical space for the thread.
21. As a client advisor, I want a "Draft name" input + "Save Personal Draft" button next to the composer, so that I can save my current draft as a reusable template without leaving the composer.
22. As a client advisor, I want a two-tap confirm Send pattern (first tap shows a warning row, second tap actually sends), so that I don't accidentally fire a reply to the wrong customer.
23. As a client advisor, I want the send-attempts history collapsed by default with a "Show ↕" toggle, so that I can see prior sends when I need to but they don't crowd the active composer.
24. As a client advisor, I want to retry a failed send attempt directly from the collapsed strip when it's expanded, so that I don't have to recreate the message after a transient failure.
25. As a client advisor, I want public comments to render with the existing comment-moderation surface (reason-required Hide / Delete) instead of a regular composer, so that I can't accidentally try to DM-reply when the item is a public comment.
26. As a client advisor on Instagram conversations, I want the customer's `@username` rendered italic next to their display name, so that I can address them the way Instagram expects.
27. As a client advisor on Facebook conversations, I want the customer's `@username` **not** rendered (FB doesn't use public @ handles), so that the UI doesn't fabricate handles that don't exist.
28. As a client advisor, I want a customer "Open on Instagram / Open on Facebook" link in the Details drawer regardless of whether the handle exists, so that I can drop into the customer's profile when I need to.

**Both personas — drawers**

29. As any user with view access, I want four chips at the top of the conversation pane (Details / Audit / Notes / QA), so that I can open the matching workflow without leaving the inbox.
30. As any user, I want each drawer to slide in from the right with a warm ambient shadow and a dimmed page behind it, so that the drawer reads as a momentary detour and the page returns to its full state when I close it.
31. As any user, I want a "Close →" chip in ink fill to the right of the four neutral drawer chips, so that closing a conversation is a one-click affordance (which opens Details pre-set, not a state bypass).
32. As any user clicking Close →, I want the Details drawer to open with the Status dropdown pre-set to "Closed," a visible warning border on that field, and a banner at the top explaining the validation requirements (Lead quality + ≥1 reason tag + Outcome, plus Lost reason if marking Lost), so that I know what I need to fill before Save state will accept the change.

**Details drawer (Customer + Workflow merged)**

33. As any user, I want the Details drawer to lead with the Customer section (display name, IG @handle if applicable, profile link), so that I have customer context in front of me before I edit workflow state.
34. As any user, I want the customer's contact methods listed with type, value, and source, so that I know what email/phone we have on file and where it came from.
35. As a user with `canManageInboxState` permission, I want to add / edit / delete contact methods with a change-reason captured by the existing PATCH / DELETE handlers, so that contact mutations are audited.
36. As a user without `canManageInboxState`, I want the contact-methods controls to be read-only with a hint about the required permission, so that I don't see disabled controls without an explanation.
37. As any user, I want the first-touch attribution shown as a labeled list (Umbrella, Campaign, Ad set, Ad, Creative) plus a link to the source post, so that I can connect this conversation back to the ad that produced it.
38. As any user, I want the Workflow section below Customer with the existing Queue, Status, Lead Quality, Inbox Outcome, Reason Tags, Follow-Up, and Change Note fields, so that all conversation state changes happen in one place.
39. As a user with `canManageInboxState`, I want "Claim self" / "Team queue" / "Save state" buttons that hit the existing `PATCH /conversations/{id}/workflow` endpoint with the existing assignment-mode payload, so that ownership and routing changes are recorded as audit events.
40. As any user, I want the Workflow section to enforce the existing closing validation client-side (Save state disabled, with hint, until the required fields are filled when Status = Closed or Lost Lead), so that the round-trip rejection from the server doesn't surprise me.

**Audit drawer**

41. As any user, I want the Audit drawer to show recent conversation events (state.*, contact_method.*, note.*, qa_scorecard.*, send_attempt.*, comment_action.*) as a vertical hairline timeline with actor, age, label, and summary, so that I can see what's happened to this conversation without reading raw Meta payloads.
42. As any user, I want a footer note ("Raw Meta payload stays hidden by design") so that I know the abridged view is intentional, not a missing feature.

**Notes drawer**

43. As a user with `canManageInboxState`, I want to add an Internal Note (4000 char max) or, if I also have `canCreateManagerCoaching`, a Manager Coaching note, so that I can leave context for myself or coach an advisor on this specific conversation.
44. As any user, I want to see existing notes reverse-chronologically with type, body, author, and timestamp, so that I have the conversation's coaching history in context.

**QA drawer**

45. As a user with `canCreateManagerCoaching` + `canManageInboxState`, I want to add a QA scorecard with Tone / Completeness / Accuracy / Next step / Speed / Policy compliance (1-5 each) and a coaching note, targeting either the conversation overall or a specific send attempt, so that I can grade advisor handling and feed the team's QA roll-up.
46. As any user, I want to see prior scorecards with the overall score (oldstyle big number), all six dimension scores, coaching note, reviewer, and reviewed advisor, so that I can see the trend of coaching feedback on this conversation.
47. As a user without `canCreateManagerCoaching`, I want the QA drawer to be read-only with a hint about the required role, so that the form isn't visible to me but the history is.

**Empty / error / edge states**

48. As any user, I want the inbox to gracefully handle the empty state ("Inbox is empty for the current connection") so that an empty queue doesn't look broken.
49. As any user, I want the filter rail to show a "No conversations match" message with a Reset link when filters narrow the queue to zero, so that I know it's the filters, not the data.
50. As any user, I want the readiness banner to render with the existing tone vocabulary (warning / danger / info) when Meta permissions or environment variables are unhealthy, so that I'm told why replying isn't working before I try.
51. As any user, I want clear behavior when a conversation has no loaded history yet (existing "Loading known history" / "Thread detected" empty states) so that an unsynced thread doesn't look like a bug.

**Visual register**

52. As any user, I want square-cornered chips, hairline 1px borders, oldstyle figures in prose, lining-tabular in money columns, no side-stripes, no glassmorphism, pink ≤10% of any surface — all per `DESIGN.md` — so that the surface reads like the rest of the HP/VVS broadsheet system.
53. As any user, I want no `#000` or `#fff` anywhere in the chrome except inside `<input>` fields, so that the cream foundation is consistent across the page.

## Implementation Decisions

### Module decomposition (all 20 modules confirmed)

**New / extracted layout components:**
- `InboxLayoutShell` — two-pane wrapper around `QueueRail` and `ConversationPane`. Holds `useDrawerState` and renders the drawer overlay. Replaces the current `grid lg:grid-cols-[minmax(0,1fr)_340px]` shell inside `social-inbox-client.tsx`.
- `InboxEyebrow` — consumes `managerDashboard` (from existing `buildMetaInboxManagerDashboard`). Renders five real fields: `needsReply`, `unassigned`, `staleConversations` (warning tone when > 0), `medianFirstResponseMinutes`, `averageQaScore`. Right side shows last-sync info (status + `completed_at` timestamp from the most recent `syncRuns` entry) and the existing `Sync Inbox` button hooked to `handleSync()`.
- `InboxStatusSentence` — reuses existing `inboxHighlights` computation verbatim. Renders highlights as title-typography text with tone-mapped colors and a hairline divider below.
- `QueueRail` — search input (broadened across sender, handle, preview, `routingExplanation`, `firstTouch.campaign_umbrella_id`, `firstTouch.campaign_id`, `firstTouch.ad_id`, `firstTouch.creative_id`), queue-category dropdown defaulting to `"all"`, filter disclosure (default collapsed), list of `QueueRow` items, Reset link bound to `useInboxFilters().reset()`.
- `QueueRow` — single row. Per-row category tag, pink `Needs reply` label, 6%-opacity warm-pink row background when conversation `needs_reply === true`, ink fill when active, amber `↑ Over SLA` label when `overSla === true`. No side-stripe borders anywhere.
- `ConversationPane` — composes `ConversationHeader`, `PresenceCollisionBanner` (existing), `HistoryStatusStrip` (existing), thread bubbles + `MessageAttachmentList` (existing), and either `ReplyComposer` or `PublicCommentActionPanel` (existing) based on `item.type`.
- `ConversationHeader` — sender display name + IG-only `@handle`, brand/channel/category/routing-percent/routing-explanation eyebrow, assignment + age + reply-window state. Five chips at right edge: Details, Audit, Notes, QA, Close → (ink emphasized).
- `DrawerOverlay` — right-side fixed overlay with click-outside-to-close backdrop, ambient warm shadow `0 8px 24px rgba(42, 39, 37, 0.18)`, ~480px width, full viewport height. Hosts whichever drawer panel is active.

**New / consolidated drawer panels:**
- `DetailsDrawerPanel` — composes Customer section (display name, IG-only handle, profile link via `profile_url`, contact methods list + add/edit/delete form, first-touch attribution dl) + Workflow section (Queue / Status / Lead Quality / Inbox Outcome / Lost Reason / Reason Tags / Follow-Up / Change Note / Claim self / Team queue / Save state). Accepts a `preset?: "close"` prop. When `preset === "close"`, the drawer header label changes to "Close conversation," a warning banner renders at the top quoting the validation rule, and the Status field defaults to `closed` with a warning border. The Customer section uses the IG-only handle rule: render `@username` italic only when `platformOf(sourceChannel) === "IG" && profile?.username != null`. For FB, render display name only and rely on `profile_url` for the "Open on Facebook →" link. Workflow controls call existing handlers (`onWorkflowUpdate`, `onContactMethodMutation`) with the existing payload shapes — no new endpoints.
- `AuditDrawerPanel` — wraps existing `AuditTrailPanel` for the drawer container; minor presentation adjustments (no functional change). Limited to the last 6 events as today.
- `NotesDrawerPanel` — wraps existing `NotesCoachingPanel` for the drawer container.
- `QaDrawerPanel` — wraps existing `QaScorecardPanel` for the drawer container.

**Refactored existing:**
- `ReplyComposer` — replaces today's `ReplyAttemptPanel` JSX with the prototype's layout. Same handlers (`onCreateSendAttempt`, `onQueueSendAttempt`, `onRetrySendAttempt`, `onCreateSavedReply`). Collapsible Saved Replies card (default open) showing up to 4 entries with title, body preview, scope label (`Personal Draft` / `Approved Shared`), and Insert button. Inline `Draft name` input + `Save Personal Draft` button below the textarea. Two-tap confirm Send: first click shows the warning row, second click fires `onCreateSendAttempt`. Send-attempts strip collapsed by default. **Dropped** vs. the prototype's earlier draft: no `Attach` button (no backend support exists), no `Cmd ↩ to send` hint (no keybinding exists). If the team wants either of those later, they're separate PRDs.
- `PublicCommentActionPanel` — unchanged.

**Deep extracted modules (testable in isolation):**
- `useInboxFilters` — hook owning `queueCategoryFilter`, `sourceChannelFilter`, `campaignUmbrellaFilter`, `itemTypeFilter`, `statusFilter`, `brandFilter`, `sourceFilter`, `adFilter`, `creativeFilter`, `query`, and the derived `filteredQueue`. Exposes setters, a `reset()` action, a `filtersDirty` boolean, and `attributionFilterOptions` (computed from the queue). The filter logic itself is lifted verbatim from the current `filteredQueue` useMemo in `social-inbox-client.tsx` — no behavior change, only extraction.
- `computeConversationSearchHaystack(conversation)` — pure function returning the concatenated, lower-cased search string. Lifts the existing inline search-field list out of `social-inbox-client.tsx` into a named function. Drives both the hook above and the test that confirms which fields are searchable.
- `useDrawerState` — hook owning `drawer: DrawerKey`, `dispositionPreset: "close" | null`. Exposes `open(drawer, preset?)`, `close()`. Trivial state machine, easy to test.
- Existing `inboxHighlights` computation reused as-is from `social-inbox-client.tsx`; lifted into a named pure function `computeInboxHighlights(queue)` so tests can target it without rendering.

### Behavioral decisions (extracted from prototype)

**Drawer state machine** (from prototype, encodes the Close → preset):

```ts
type DrawerKey = "details" | "audit" | "notes" | "qa" | null;
type DispositionPreset = "close" | null;

// Open: setDrawer(k), setPreset(p ?? null).
// Close (×, click backdrop, select new conversation): setDrawer(null), setPreset(null).
// Close → chip: open("details", "close").
// Other chips: open("details" | "audit" | "notes" | "qa").
```

**Save Personal Draft enable rule** (from prototype): button disabled until both `draft.trim()` and `draftName.trim()` are non-empty, matching the existing `MetaInboxSavedReplyInput` shape which requires both `title` and `body`.

**Saved Replies card** (from prototype): always-visible list of up to 4 entries from the existing `data.savedReplies` (filtered by current conversation). Each card click calls `onInsert(savedReply.body)` which appends to the draft (two newlines between if a draft exists). No "Insert saved reply" toggle button — the list is the affordance. Collapsible (default open) for vertical space when not in use.

**Close → preset flow** (from prototype):
1. Click `Close →` chip → `open("details", "close")`.
2. Drawer renders with warning banner: "Closing this conversation. Status is pre-set to **Closed**. Save state requires Lead quality, ≥1 reason tag, and an Outcome filled in below."
3. Status `<select>` defaults to `closed` with `border-signal-warning`.
4. Operator fills remaining required fields. Save state button (existing, hits `PATCH /conversations/{id}/workflow`) enforces validation — if required fields are missing, it stays disabled with a hint (same hint pattern as today's `WorkflowStatePanel`).
5. On successful save, drawer closes and the conversation row updates per the existing workflow-mutation flow.

**Pink/needs-reply visual treatment** (replaces side-stripe pattern):
- Pink "Needs reply" label only when `conv.workflowStatus === "needs_reply"` AND `!conv.overSla` (over-SLA rows keep amber as the more urgent signal).
- Warm-pink row background tint `bg-hp-pink/[0.06]` only when `conv.workflowStatus === "needs_reply"` AND row is not active (active rows keep `bg-hp-ink` regardless).
- These two treatments compose: an over-SLA row stays amber for the label but still picks up the row tint as a needs-reply row.
- Side-stripe borders are forbidden per DESIGN.md absolute ban.

**FB vs. IG handle display rule**:
- Conversation header `<h2>`: render `@handle` italic only when `platformOf(sourceChannel) === "IG"` AND `customerProfile?.username` is non-null.
- Details drawer Customer section:
  - IG with handle: `@username` italic + `Open on Instagram →` link via `profile_url`.
  - FB: `Open on Facebook →` link via `profile_url`. No `@handle`.
  - Neither: muted "No profile link available" note.

**Eyebrow metrics — exactly five fields, all real**:
- `Needs reply`: `managerDashboard.metrics.needsReply` — ink tone.
- `Unassigned`: `managerDashboard.metrics.unassigned` — ink tone.
- `Stale`: `managerDashboard.metrics.staleConversations` — warning tone when > 0, else ink.
- `Median first`: `managerDashboard.metrics.medianFirstResponseMinutes` formatted as `{n}m` or `—` if null.
- `QA avg`: `managerDashboard.metrics.averageQaScore` to 1 decimal — positive tone.

Right side: `Last sync · {N} min ago · {status}` derived from `data.syncRuns[0]` (most recent), plus the existing `Sync Inbox` button calling `handleSync()`. No invented `View team →` link.

**Status sentence format**: directly from `computeInboxHighlights(queue)`:
- If `queue.length === 0`: `Inbox is empty for the current connection` (neutral tone).
- If `unread > 0`: `{N} unread` (warning tone).
- If `needsReply > 0`: `{N} needing reply` (warning tone).
- Otherwise: `{N} threads, all caught up` (positive tone).
- Highlights separated by ` · ` separator.

### Permission gates (unchanged from existing code, restated for clarity)

- `canManageInboxState` → workflow saves, contact methods CRUD, note creation.
- `canSendInboxReply` → send attempts (create / queue / retry), saved reply creation, comment moderation actions (hide / delete / queue / retry).
- `canCreateManagerCoaching` → manager_coaching note type, QA scorecard creation.

All drawer panels render in read-only mode when the relevant permission is missing, with the existing hint copy.

### Cleanup

- Delete `src/components/inbox-prototype/` entirely.
- Delete the dev-only `parseVariant` branch in `src/app/(workspace)/convert/inbox/page.tsx`. Restore the original single rendering path: `<SocialInboxClient ... />`.
- Move the existing panel components (`AuditTrailPanel`, `NotesCoachingPanel`, `QaScorecardPanel`, `WorkflowStatePanel`, `ConversationSourcePanel`, `ContactMethodsPanel`, `MessageAttachmentList`, `PresenceCollisionBanner`, `HistoryStatusStrip`, `ReplyAttemptPanel`, `PublicCommentActionPanel`, `ManagerSnapshotPanel`, `SyncRunPanel`, `MetaReadinessPanel`, `InboxReadinessBanner`, `QueueTabs`, `QueueTab`, `QueueItem`, `EmptyThreadState`) into per-component files under `src/components/v2/inbox/`. `social-inbox-client.tsx` becomes a thin orchestrator (data fetching, mutation handlers, drawer state, and rendering the new shell + drawer overlay).

## Testing Decisions

Comprehensive test coverage requested. Tests should target external behavior only — what a user, advisor, or manager would observe — not internal React component implementation. Pure logic modules get unit tests; React components get React Testing Library tests that assert on rendered text and accessibility roles, not on element trees.

**Prior art in the repo**: tests live in `tests/` and run via `node --test --experimental-strip-types tests/*.test.ts`. Look at `tests/meta-inbox-normalization.test.ts`, `tests/meta-inbox-history.test.ts`, `tests/social-reply-foundation-gate.test.ts`, `tests/social-inbox-ui-contract.test.ts` for the style. Hook tests can use `react-test-renderer` or the project's existing patterns.

**Modules with tests (all listed are required, plus integration tests where useful):**

1. **`useInboxFilters` hook**:
   - Returns the full queue when all filters are at their defaults.
   - Narrows by `queueCategoryFilter` to a single category.
   - Narrows by `sourceChannelFilter` to a single channel.
   - Narrows by `campaignUmbrellaFilter` to a single umbrella ID.
   - Narrows by `adFilter` and `creativeFilter` independently.
   - Narrows by `itemTypeFilter` to messages-only or comments-only.
   - Narrows by `statusFilter` to unread-only or needs-reply-only.
   - Combines two or more filters and returns only conversations matching all of them.
   - Search query narrows by sender, handle, preview body, routing explanation, and each of the firstTouch attribution fields.
   - `reset()` returns all filters to defaults and clears the query.
   - `filtersDirty` is false at defaults, true when any filter or query is non-default.
   - `attributionFilterOptions` returns deduplicated umbrella / ad / creative options derived from the queue.
   - Snapshot a sample inboxData fixture covering all categories and assert filter combos.

2. **`computeConversationSearchHaystack` pure function**:
   - Returns concatenated lower-cased string covering: brand, channel, type, status, sender, preview, routing explanation, campaign umbrella ID, campaign ID, adset ID, ad ID, creative ID, ref, queue category label, source channel label.
   - Null / undefined fields are handled without throwing.
   - Snapshot the output for a known conversation fixture to lock the field set.
   - Update test: if a new searchable field is added, the snapshot will fail until intentionally updated.

3. **`useDrawerState` hook**:
   - Initial state: `drawer === null`, `preset === null`.
   - `open("audit")` sets `drawer === "audit"`, `preset === null`.
   - `open("details", "close")` sets `drawer === "details"`, `preset === "close"`.
   - `close()` resets both to `null`.
   - Opening a different drawer while one is open replaces drawer and resets preset.

4. **Close-preset integration test (React Testing Library)**:
   - Render `ConversationPane` with a fixture conversation.
   - Click the `Close →` chip.
   - Assert the Details drawer is visible, the warning banner text contains "Lead quality" and "reason tag" and "Outcome," and the Status field's value is `closed`.
   - Assert the Status field has a warning-tone border (via aria attribute or test ID, not class name).

5. **`QueueRow` snapshot tests** (using fixtures):
   - Needs-reply row renders with pink label and warm-pink background (assert via test ID or aria attribute on the row marking its "needs-reply" mode).
   - Over-SLA row renders with amber label and the warm-pink background tint (both apply).
   - Selected row renders with ink fill regardless of needs-reply or over-SLA state.
   - Resolved row renders without label and without tint.

6. **`InboxStatusSentence` (via `computeInboxHighlights`)**:
   - Empty queue → "Inbox is empty for the current connection."
   - 5 unread, 0 needs-reply → "5 unread."
   - 0 unread, 7 needs-reply → "7 needing reply."
   - 3 unread, 5 needs-reply → "3 unread · 5 needing reply."
   - 0 unread, 0 needs-reply, 10 items → "10 threads, all caught up."

7. **`InboxEyebrow` rendering**:
   - All five metrics render with their real values.
   - `staleConversations: 0` renders ink tone; `staleConversations: 3` renders warning tone.
   - `medianFirstResponseMinutes: null` renders as `—`.
   - `averageQaScore: null` renders as `—`.
   - Sync Inbox button click calls the injected `onSync` prop.

8. **FB vs. IG handle rendering**:
   - Render `ConversationHeader` with IG conversation + username → assert `@username` italic appears.
   - Render with FB conversation + null username → assert no `@` text appears anywhere in the header.
   - Render with FB conversation that has a username (vanity URL case) → assert no `@` text appears (FB never shows `@handle` by rule).
   - Render `DetailsDrawerPanel` Customer section for IG + handle → assert "Open on Instagram" link.
   - Render for FB → assert "Open on Facebook" link.
   - Render for unknown platform + no profile URL → assert "No profile link available" muted note.

9. **`ReplyComposer` behavior**:
   - Reply textarea is disabled when `replyWindow.state === "closed"`.
   - Send button is disabled until `draft.trim()` is non-empty.
   - First click on Send shows the confirm row; second click calls `onCreateSendAttempt` with the draft text.
   - "Cancel" in the confirm row reverts to the normal footer without sending.
   - `Save Personal Draft` button is disabled until both draft and draft-name are non-empty, then click calls `onCreateSavedReply` with `{ title, body }`.
   - Insert click on a Saved Replies card appends the body to the draft with a `\n\n` separator when there's already a draft.
   - Saved Replies card collapses and reopens on toggle.
   - Send-attempts strip collapses and reopens on toggle; expanded list shows status, body preview, author, age; Retry button only renders on `failed_retryable` attempts and calls `onRetrySendAttempt`.

10. **`DetailsDrawerPanel` permission rendering**:
    - With `canManageInboxState: false`, contact-methods controls are read-only with the hint copy.
    - With `canManageInboxState: true`, controls are enabled.
    - Save state button is disabled when Status is Closed and required fields aren't filled; enabled when they are.

11. **`AuditDrawerPanel`**:
    - Empty events → "No audit events yet for this conversation."
    - Events render reverse-chronologically with actor, age, label, summary.
    - Capped at the last 6 events.

12. **`NotesDrawerPanel`**:
    - With `canManageInboxState: true`, Add Note button click calls `onCreateNote` with `{ noteType, body, mentionUserIds }`.
    - With `canManageInboxState: false`, form is hidden and a hint is visible.
    - Type dropdown shows `manager_coaching` option only when `canCreateManagerCoaching` is true.
    - 4000-char counter increments as user types.

13. **`QaDrawerPanel`**:
    - With `canCreateManagerCoaching: false`, form is hidden, history renders read-only.
    - With permission, all six 1-5 buttons render for each dimension; Add Scorecard button calls `onCreateQaScorecard` with the chosen scores + coaching note + target.

14. **`ConversationPane` end-to-end snapshot**:
    - Comment item type → renders `PublicCommentActionPanel`, not `ReplyComposer`.
    - Thread item type → renders `ReplyComposer`, not `PublicCommentActionPanel`.
    - With presences populated → presence banner renders above the thread.
    - With history `nextCursor` populated → "Load older history" affordance visible.

15. **`InboxLayoutShell` orchestration**:
    - Selecting a different conversation from the rail closes any open drawer.
    - Clicking the drawer backdrop closes the drawer and resets the preset.
    - Hitting the X button closes the drawer and resets the preset.

## Out of Scope

The following are out of scope for this PRD. Each is a candidate for a follow-up if the team wants it:

- **Mobile inbox redesign** (`/m/inbox`). The mobile shell at `src/app/m/inbox/` is unchanged. The side-stripe-border violation noted in the prototype audit ([conversation-list-mobile.tsx:70](src/components/v2/inbox/conversation-list-mobile.tsx:70)) is still present and should be addressed in a separate PRD using the same pink-label + row-tint pattern adopted here.
- **Attachment composing** in outbound replies. The Meta API supports it, but the current code has no `MessageAttachmentList` mirror on the send side, no Attach handler, and no upload pipeline. Adding `Attach` is its own backend + frontend project.
- **Keyboard shortcuts** (Cmd ↩ to send, J/K to navigate the queue, etc.). None exist today. If desired, a separate keybinding PRD.
- **Manager team-breakdown route**. The current `ManagerSnapshotPanel` renders inline on the page; this redesign doesn't add a separate route. If the team wants `/convert/inbox/team` (or similar), that's a separate decision about IA, not a layout change.
- **AI reply suggestions / drafting**. The PRD at `issues/ai-reply-suggestions.md` covers the AI surface; this redesign neither enables nor disables it.
- **New backend data fields**. Every visible affordance maps to an existing `SocialInboxData` field, an existing `managerDashboard` metric, or an existing handler. No new server fields, no schema changes, no new API routes.
- **The 4413-line monolith split itself**. Cleanup section above describes the split as part of this PRD, but if the implementing agent prefers a two-PR sequence (layout first, then file-split), that's acceptable. The behavior contract is unchanged either way.

## Further Notes

**Prototype location**: `src/components/inbox-prototype/variant-a.tsx` (gated by `?variant=A` in dev only). The prototype is the visual contract for this PRD. It uses seed data; folding into production wires every section to the existing data feed.

**Existing-code anchors** (every prototype affordance maps to one of these):
- `SocialInboxClient` body in `src/components/social-inbox-client.tsx` lines 277-1589.
- `MetaInboxManagerDashboardMetric` in `src/lib/meta-inbox-manager-dashboard.ts`.
- `inboxHighlights` useMemo at lines 356-376.
- `ReplyAttemptPanel` at lines 2166-2493 (composer, saved replies, send attempts).
- `WorkflowStatePanel` at lines 2845-3134 (Close validation rules).
- `ConversationSourcePanel` + `ContactMethodsPanel` at lines 2560-2844.
- `AuditTrailPanel` at line 3135.
- `NotesCoachingPanel` at line 3186.
- `QaScorecardPanel` at line 3335.
- `PublicCommentActionPanel` at line 1850.
- `MessageAttachmentList` at line 1802.
- `HistoryStatusStrip` at line 2112.
- `PresenceCollisionBanner` at line 2060.
- Sync handler `handleSync()` at line 1212; Sync Inbox button at line 1456-1460.

**DESIGN.md guardrails**:
- Square corners on chips, inputs, buttons, data cards.
- Hairline 1px borders only. No side-stripes, no thick or colored side accents.
- No `#000`, no `#fff` outside of `<input>` backgrounds.
- Pink (`#e91d79`) ≤10% of any rendered surface; single gilt mark (`❦`) per view at most.
- Cardo for body, Cormorant Garamond for display/headlines, no sans-serif anywhere in chrome.
- Oldstyle figures in prose; lining-tabular in money columns and metric strips.
- No em dashes; no glassmorphism (the top nav's `bg-hp-card/90` is the only sanctioned translucency).
- Ambient warm shadow `0 8px 24px rgba(42, 39, 37, 0.08)` reserved for popovers, dropdowns, and overlays. Static cards stay flat.

**Validation copy** (lifted verbatim from existing code where possible):
- Close requirement banner: "Closing this conversation. Status is pre-set to **Closed**. Save state requires Lead quality, ≥1 reason tag, and an Outcome filled in below." (Matches the existing `WorkflowStatePanel` rule: "Close and lost updates require Lead Quality, at least one reason tag, Inbox Outcome, and Lost Reason when lost.")
- Audit footer: "Raw Meta payload stays hidden by design."
- Notes hint (existing): "Internal notes and coaching comments are never sent to the customer. Use @name for manager follow-up..."

**Verification expectations** (per project convention):
- `node --test --experimental-strip-types tests/*.test.ts` passes for all new tests.
- `npm run lint` passes.
- `npx tsc --noEmit --pretty false` passes (known unrelated failures at `tests/meta-ads-e2e-truth.test.ts:286` should not regress).
- Manual browser verification at 1440x900 (desktop), 1024x768 (small desktop / large tablet) — including each of the four drawers, the Close → preset flow, FB vs. IG handle rendering, the queue filter combinations, and the empty-state rendering.

**Risk note**: this is a layout-only redesign. Behavioral risk is the drawer state machine and the Close-preset behavior — those have integration tests in the testing list above. Data-mutation paths are unchanged; the same handlers run as today.
