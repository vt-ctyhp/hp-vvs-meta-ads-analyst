---
github_issue: 61
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 8
---

# feat: rebuild ReplyAttemptPanel as ReplyComposer (collapsible saved replies, draft-name input, two-tap confirm)

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Replace the existing `ReplyAttemptPanel` with a new `ReplyComposer` that matches the prototype's layout while wiring to the existing handlers and shapes. No new mutations — the same `onCreateSendAttempt`, `onCreateSavedReply`, `onQueueSendAttempt`, `onRetrySendAttempt` are called with the same payloads.

Layout, top to bottom inside the composer card:

1. **Send-attempts strip** (collapsible, default collapsed) — header line `{N} send attempt{s} · last {age} ago · Show ↕ | Hide ↕`. When expanded, renders the existing send-attempts list cards (status pill, body preview, author, age, Retry button on `failed_retryable`, Queue Delivery button on `approved` per existing logic). Only renders when `sendAttempts.length > 0`.

2. **Saved Replies card** (collapsible, default open) — header line `Saved Replies · {N} available · Hide ↕ | Show ↕`. When open, renders up to 4 entries from `data.savedReplies` (filtered by current conversation) as a 2-column grid of cards. Each card: title (font 13px medium), 2-line body preview (11px muted), scope label (`Personal Draft` / `Approved Shared` from `savedReply.visibility`), `Insert →` button. Insert click appends the saved-reply body to the draft with `\n\n` separator when there's already a draft.

3. **Composer header** — `Reply as <em>{brand}</em>` smallcaps line. When `replyWindow.state === "closed"`: appended `Reply window closed — only follow-up tags can be sent.` in danger-tone italic.

4. **Textarea** — 3 rows, transparent background. Placeholder `Draft a reply…` when reply window is open, else `Reply window is closed. Use a saved follow-up template.` Disabled when reply window is closed.

5. **Save Personal Draft row** (matches existing UI at `social-inbox-client.tsx` lines 2309-2334):
   - `Draft name` text input (placeholder `Draft name`, disabled when draft body is empty).
   - `Save Personal Draft` button (disabled until both draft body and draft name are non-empty). Click calls existing `onCreateSavedReply` with `{ conversationId, title: draftName, body: draft, visibility: "personal" }` — exact payload shape from existing handler.

6. **Send footer** — two-tap confirm pattern:
   - **Default state**: `Send →` button at right (ink fill). Disabled until draft is non-empty AND `replyWindow.state !== "closed"`.
   - **First click** → swaps to confirming state. Confirming row renders with warning tone background, message `Send as {brand}? This will record a send attempt.`, `Cancel` button (left), and `Send →` button (right, signal-warning fill).
   - **Second click on Send →** in confirming state → fires `onCreateSendAttempt` with the existing payload shape, clears draft, returns to default state.
   - **Cancel** → returns to default state without sending.

Drop affordances confirmed as not existing in the codebase: no `Attach` button (no upload pipeline), no `Cmd ↩ to send` hint (no keybinding). If those are wanted later, they're separate PRDs.

## Acceptance criteria

- [ ] `ReplyComposer` replaces `ReplyAttemptPanel` inside `ConversationPane` (when `item.type !== "comment"`).
- [ ] Send-attempts strip:
  - [ ] Only renders when `sendAttempts.length > 0`.
  - [ ] Default collapsed.
  - [ ] Toggle button swaps between `Show ↕` and `Hide ↕`.
  - [ ] Expanded list shows existing send-attempt cards with Retry / Queue Delivery buttons gated as today.
- [ ] Saved Replies card:
  - [ ] Default open.
  - [ ] Toggle button swaps between `Hide ↕` and `Show ↕`.
  - [ ] Renders up to 4 entries from `data.savedReplies`.
  - [ ] Each card shows title, body preview, scope label (`Personal Draft` / `Approved Shared`), Insert button.
  - [ ] Insert click appends to draft with `\n\n` separator when draft is non-empty; replaces empty draft with body when draft is empty.
- [ ] Composer header shows `Reply as {brand}` and `Reply window closed` suffix when applicable.
- [ ] Textarea disabled when reply window is closed; placeholder swaps to the closed-window message.
- [ ] Save Personal Draft:
  - [ ] Both inputs disabled until draft body is non-empty.
  - [ ] Save button disabled until both draft body and draft name are non-empty.
  - [ ] Save click calls existing `onCreateSavedReply` with exact existing payload shape; no new fields invented.
- [ ] Send button:
  - [ ] Disabled until draft is non-empty AND reply window is open.
  - [ ] First click reveals confirming row; second click fires `onCreateSendAttempt`.
  - [ ] Cancel returns to default state without sending.
  - [ ] After successful send, draft is cleared and confirming state is reset.
- [ ] No `Attach` button anywhere in `ReplyComposer`.
- [ ] No `Cmd ↩` keyboard-shortcut hint copy anywhere.
- [ ] Tests for composer behavior:
  - [ ] Send button disabled state matches: empty draft, closed window, sending in progress.
  - [ ] Two-tap confirm flow: first click → confirm row, second → `onCreateSendAttempt` called with `{ conversationId, replyText }` (existing shape).
  - [ ] Cancel from confirming state reverts to default footer.
  - [ ] Save Personal Draft disabled until both draft + draft name non-empty; click calls `onCreateSavedReply` with `{ title, body }`.
  - [ ] Insert saved reply appends to draft with `\n\n` separator.
  - [ ] Saved Replies card toggles open/closed.
  - [ ] Send attempts strip toggles open/closed.
  - [ ] Retry on `failed_retryable` calls `onRetrySendAttempt` with `{ sendAttemptId }`.
- [ ] Verification: complete reply flow on `/convert/inbox` works end-to-end with existing backend; send attempts are recorded as today; saved replies are created as today.

## Blocked by

- #58 — conversation pane (composer lives inside the pane)
