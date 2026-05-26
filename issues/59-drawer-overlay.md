---
github_issue: 59
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 6
---

# feat: drawer overlay + four drawer panels (Details / Audit / Notes / QA); delete legacy side rail

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Wire the four drawer chips from Slice 5 to actual right-side overlay drawers. Build the consolidated Details drawer (Customer + Workflow merged from three existing panels). Wrap the existing Audit / Notes / QA panels for the drawer container. Delete the legacy side rail.

Five components:

1. **`DrawerOverlay`** — fixed right-side slide-in container. ~480px wide, full viewport height, ambient warm shadow `0 8px 24px rgba(42, 39, 37, 0.18)`. Backdrop layer (`bg-hp-ink/30`) catches clicks-outside to close. Header with conversation name + brand + drawer title + `Close ×` button. Hosts whichever drawer panel is active via the `useDrawerState` hook from Slice 1.

2. **`DetailsDrawerPanel`** — merges three existing panels into one drawer:
   - **Customer section** (from `ConversationSourcePanel` + `ContactMethodsPanel`):
     - Display name + IG-only `@handle` (same rule as Slice 5: only when `platformOf(sourceChannel) === "IG"` AND `username != null`)
     - Platform link: `Open on Instagram →` / `Open on Facebook →` via the existing `profile_url` field. When neither platform nor URL is available: muted `No profile link available` note.
     - Contact methods list (type / value / source) with the existing add / edit / delete flow calling `onContactMethodMutation` with the existing payload shape.
     - First-touch attribution dl (Umbrella / Campaign / Ad set / Ad / Creative) + `Open source post →` link via `firstTouch.source_permalink`.
   - **Workflow section** (from `WorkflowStatePanel`):
     - Queue / Status / Lead Quality / Inbox Outcome dropdowns
     - Reason Tags chip grid (multi-select)
     - Follow-Up datetime input
     - Change Note textarea
     - `Claim self`, `Team queue`, `Save state` buttons calling existing `onWorkflowUpdate` with the existing assignment-mode payload
   - No new mutations; all writes go through existing handlers.
   - Permission gating: `canManageInboxState` controls contact-method and workflow mutations as today.

3. **`AuditDrawerPanel`** — wraps the existing `AuditTrailPanel` rendering (last 6 events, vertical hairline timeline) for the drawer container. Adds the footer note `Raw Meta payload stays hidden by design.` (copy from existing UI).

4. **`NotesDrawerPanel`** — wraps the existing `NotesCoachingPanel`. Renders up to 5 notes reverse-chronologically + add note form with type dropdown (`internal_note` / `manager_coaching` gated on `canCreateManagerCoaching`) + 4000-char body field + `onCreateNote` call.

5. **`QaDrawerPanel`** — wraps the existing `QaScorecardPanel`. Renders up to 4 scorecards + add scorecard form (six 1-5 dimension scores + coaching note + target selector) gated on `canCreateManagerCoaching` + `canManageInboxState`. Calls `onCreateQaScorecard` with existing payload shape.

Wire the chips from Slice 5 (`Details`, `Audit`, `Notes`, `QA`) to `useDrawerState.open(...)`. `Close →` remains a no-op until Slice 7. Selecting a different conversation calls `useDrawerState.close()`.

**Delete the legacy side rail** — the 340px column rendering `WorkflowStatePanel`, `AuditTrailPanel`, `NotesCoachingPanel`, `QaScorecardPanel` stacked vertically. Those panels now live only inside drawers.

## Acceptance criteria

- [ ] `DrawerOverlay` slides in from the right with the ambient warm shadow.
- [ ] Backdrop dim layer catches clicks-outside-drawer and closes via `useDrawerState.close()`.
- [ ] `Close ×` button closes the drawer.
- [ ] Drawer header shows `{conversation.sender} · {brand}` + drawer title.
- [ ] `Details` chip opens `DetailsDrawerPanel` with title `Details · Customer + Status`.
- [ ] `Audit` chip opens `AuditDrawerPanel` with title `Audit trail`.
- [ ] `Notes` chip opens `NotesDrawerPanel` with title `Notes & coaching`.
- [ ] `QA` chip opens `QaDrawerPanel` with title `QA scorecards`.
- [ ] `DetailsDrawerPanel` Customer section: IG with handle → `@username` + `Open on Instagram →`. FB → `Open on Facebook →` only. No handle + no URL → muted `No profile link available`.
- [ ] `DetailsDrawerPanel` Workflow section: all existing fields render (Queue / Status / Lead Quality / Outcome / Reason Tags / Follow-Up / Change Note), all writes go through existing `onWorkflowUpdate`.
- [ ] `DetailsDrawerPanel` contact-methods add / edit / delete go through existing `onContactMethodMutation` with the existing payload.
- [ ] `AuditDrawerPanel` renders up to 6 events with actor, age, label, summary + footer note.
- [ ] `NotesDrawerPanel` renders up to 5 notes; add form gated on `canManageInboxState`; manager-coaching option gated on `canCreateManagerCoaching`.
- [ ] `QaDrawerPanel` renders up to 4 scorecards; add form gated on `canCreateManagerCoaching` + `canManageInboxState`.
- [ ] Legacy 340px side rail with stacked panels is deleted from `SocialInboxClient`.
- [ ] Selecting a different conversation closes any open drawer.
- [ ] Tests for drawer state machine integration:
  - [ ] Click Audit chip → audit drawer renders.
  - [ ] Click Close × → drawer closes.
  - [ ] Click backdrop → drawer closes.
  - [ ] Click Notes chip while Audit is open → notes drawer replaces audit drawer.
- [ ] Tests for `DetailsDrawerPanel` permission gating:
  - [ ] Without `canManageInboxState`: contact-method controls read-only, workflow Save state disabled with hint.
  - [ ] With permission: controls enabled.
- [ ] Tests for `NotesDrawerPanel` permission gating:
  - [ ] Without `canManageInboxState`: form hidden, hint visible.
  - [ ] Without `canCreateManagerCoaching`: type dropdown does not include `manager_coaching`.
- [ ] Tests for `QaDrawerPanel` permission gating:
  - [ ] Without `canCreateManagerCoaching`: form hidden, history read-only.
- [ ] Tests for FB/IG handle rule in `DetailsDrawerPanel` Customer section (mirrors Slice 5 tests).
- [ ] Verification: all four drawers open from chips, close from × and backdrop, render correct content, and existing mutation handlers fire correctly.

## Blocked by

- #58 — conversation pane + header (drawer chips live in the header)
