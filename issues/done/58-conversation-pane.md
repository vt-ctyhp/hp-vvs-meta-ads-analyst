---
github_issue: 58
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 5
---

# feat: conversation pane + header with routing context, reply window, FB/IG handle rule

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Build the right-pane conversation surface. Drawer chips render but are no-ops (wired in Slice 6). The old side-rail stack (Workflow/Audit/Notes/QA panels currently rendered as a 340px column) remains visible below the new pane temporarily — it's deleted in Slice 6 when drawers replace it. The middle-state ugliness is accepted per planning.

Two components:

1. **`ConversationPane`** — flex column inside the layout shell's right slot. Composes:
   - `ConversationHeader` (new — see below)
   - Existing `PresenceCollisionBanner` when `presences.length > 0`
   - Existing `HistoryStatusStrip` with `Load older history` affordance
   - Thread bubbles (existing rendering) with `MessageAttachmentList` per bubble
   - Existing `ReplyAttemptPanel` (kept as-is) when `item.type !== "comment"`, OR existing `PublicCommentActionPanel` when `item.type === "comment"`

2. **`ConversationHeader`** — top section of the pane:
   - Eyebrow line: `{brand} · {platform} {kind} · {category label} · Routing {N}% — {routingExplanation}` (smallcaps tracking; routing explanation in italic normal case).
   - Sender name (font-title, 22px). Conditional `@handle` italic in 14px hp-muted next to the name **only when**:
     - `platformOf(sourceChannel) === "IG"` AND
     - `customerProfile?.username` is non-null.
   - For Facebook conversations, no `@handle` text renders, even if `username` is set (FB does not use public @ handles by convention).
   - Sub-line: `{Assigned to X | Unassigned} · {N}{unit} since last inbound · Reply window {state}`. Reply window state uses the existing `resolveReplyWindowState(item, now)` / `sendEligibilityLabel(item)` helpers — copy comes from the real helpers, not invented strings.
   - Right edge: five drawer chips — `Details`, `Audit`, `Notes`, `QA`, `Close →`. All click handlers are no-ops in this slice; ink-emphasized `Close →` chip styling matches the prototype but doesn't do anything yet.

`SocialInboxClient` is restructured: where it currently renders `SelectedItemDetail` + the 340px side rail, it now renders `ConversationPane`. The side rail continues to render below the pane (vertical stack) for now — Slice 6 removes it.

## Acceptance criteria

- [ ] `ConversationPane` renders inside the layout shell's right slot.
- [ ] `ConversationHeader` renders the eyebrow with brand, platform, kind, category label, routing percent, routing explanation (italic normal case).
- [ ] `@handle` renders for IG conversations with `username != null`; renders italic in hp-muted 14px next to the name.
- [ ] `@handle` does NOT render for FB conversations regardless of `username` value.
- [ ] `@handle` does NOT render when `customerProfile?.username` is null.
- [ ] Reply-window state inline in sub-line uses the existing `sendEligibilityLabel` output verbatim (e.g., `Closed — 2 weeks ago` / `Open`).
- [ ] Assignment label: `Assigned to {name}` when `assigned_user_id` is set, else `Unassigned`.
- [ ] Existing `PresenceCollisionBanner`, `HistoryStatusStrip`, thread + attachments, `ReplyAttemptPanel`, `PublicCommentActionPanel` all render inside the pane as before — no behavior change to those.
- [ ] `item.type === "comment"` swaps `ReplyAttemptPanel` for `PublicCommentActionPanel` (matches existing behavior).
- [ ] Five drawer chips render in the header right edge: `Details`, `Audit`, `Notes`, `QA`, `Close →`. All clicks are no-ops with no errors thrown.
- [ ] Old side-rail stack (Workflow / Audit / Notes / QA panels in the 340px column) still renders, now below the pane — accepted middle state until Slice 6.
- [ ] DESIGN.md compliance: square corners, hairline borders, no side-stripes, no glassmorphism.
- [ ] Tests for FB/IG handle rule:
  - [ ] IG conversation + `username: "emmaposes"` → `@emmaposes` appears in header.
  - [ ] FB conversation + `username: null` → no `@` text in header.
  - [ ] FB conversation + `username: "some.vanity"` → no `@` text in header (FB never shows `@` per rule).
  - [ ] IG conversation + `username: null` → no `@` text in header.
- [ ] Tests for header content:
  - [ ] Routing percent + explanation render correctly.
  - [ ] Reply-window state renders the `sendEligibilityLabel` output.
  - [ ] Assignment label switches between `Assigned to X` and `Unassigned`.
- [ ] Verification: rendered `/convert/inbox` has new conversation pane on the right; selecting a conversation updates the pane; existing reply / comment moderation still work.

## Blocked by

- #55 — layout shell + eyebrow + status sentence (uses the layout shell's right slot)
