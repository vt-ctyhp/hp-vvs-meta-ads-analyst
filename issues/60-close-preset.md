---
github_issue: 60
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 7
---

# feat: Close → chip wires Details drawer with close preset and validation banner

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Wire the `Close →` chip from Slice 5 to actually open the Details drawer with the close preset behavior. No new mutation handlers — uses the existing `onWorkflowUpdate` flow and the existing closing validation rules from `WorkflowStatePanel`. This slice is honest about the existing validation: the chip does not bypass any gate, it shortcuts the operator to the place where they fill the required fields.

Behavior:

1. **`Close →` chip click** → `useDrawerState.open("details", "close")`.

2. **`DetailsDrawerPanel` honors `preset === "close"`**:
   - Drawer header title changes from `Details · Customer + Status` to `Close conversation`.
   - A warning banner renders at the top of the drawer body, before the Customer section:
     - Tone: `border-signal-warning bg-signal-warning-bg`
     - Title: `Closing this conversation` (font-title 14px normal-case)
     - Body: `Status is pre-set to Closed. Save state requires Lead quality, ≥1 reason tag, and an Outcome filled in below.` (matches the existing validation rule from `WorkflowStatePanel`: "Close and lost updates require Lead Quality, at least one reason tag, Inbox Outcome, and Lost Reason when lost.")
   - The Status `<select>` field defaults to `closed` (instead of the conversation's current status).
   - The Status field gets a `border-signal-warning` warning border to make the pre-set visible.
   - All other fields render as today.

3. **Save state button** retains its existing validation: disabled until Lead quality + ≥1 reason tag + Outcome are filled (existing client-side check from `WorkflowStatePanel`). Clicking Save state when valid fires `onWorkflowUpdate` with the existing payload shape (status: "closed", plus the filled fields). No new endpoint, no new payload shape.

4. **Closing the drawer** (× / backdrop / Escape) calls `useDrawerState.close()` which resets `preset` to `null`. Re-opening Details without the preset shows the normal Details view.

## Acceptance criteria

- [ ] `Close →` chip in `ConversationHeader` is wired to `useDrawerState.open("details", "close")`.
- [ ] When drawer opens with `preset === "close"`:
  - [ ] Drawer header title reads `Close conversation`.
  - [ ] Warning banner renders at the top of drawer body with the exact validation copy.
  - [ ] Status field defaults to `closed`.
  - [ ] Status field has the warning border treatment.
- [ ] Without `preset === "close"`:
  - [ ] Drawer header title reads `Details · Customer + Status`.
  - [ ] No warning banner.
  - [ ] Status field defaults to the conversation's current status.
  - [ ] Status field has the default border (no warning).
- [ ] Save state validation is unchanged — the existing client-side check from `WorkflowStatePanel` still enforces Lead quality + reason tag + Outcome (+ Lost reason when status is `lost_lead`).
- [ ] Save state call uses the existing `onWorkflowUpdate` handler with the existing payload shape; no new endpoint or shape.
- [ ] Closing the drawer (× / backdrop) resets both `drawer` and `preset` to `null`.
- [ ] Re-opening Details via the `Details` chip after a Close → preset session shows the normal Details view (preset cleared).
- [ ] Integration test (React Testing Library):
  - [ ] Render `ConversationPane` with a fixture conversation in `needs_reply` state.
  - [ ] Click `Close →` chip.
  - [ ] Assert warning banner is visible and contains the strings `Lead quality`, `reason tag`, `Outcome`.
  - [ ] Assert Status field's selected value is `closed`.
  - [ ] Assert Save state button is disabled (because Lead quality / reason tag / Outcome are not yet filled).
  - [ ] Fill the required fields → assert Save state button becomes enabled.
  - [ ] Click Save state → assert `onWorkflowUpdate` is called with `{ conversationStatus: "closed", leadQuality, reasonTags: [...], inboxOutcome, changeReason }`.
- [ ] Integration test: opening Details via the `Details` chip first, then closing, then clicking `Close →` correctly switches the drawer into close-preset mode without stale state from the previous open.
- [ ] Verification: full Close → flow works end-to-end on `/convert/inbox` with a real conversation.

## Blocked by

- #59 — drawer overlay + Details drawer (must exist before preset can extend it)
