---
github_issue: 63
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 10
---

# refactor: split monolith into per-file components; delete prototype directory and dev-only variant branch

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Final cleanup pass. Split the (now-smaller) `social-inbox-client.tsx` monolith into per-file components under `src/components/v2/inbox/`. Delete the prototype directory and the dev-only `?variant=A` branch from `page.tsx`. No behavior change — pure file reorganization plus the prototype removal.

Three moves:

1. **Move child components into per-file under `src/components/v2/inbox/`**. Each existing function component currently nested inside `social-inbox-client.tsx` gets its own file with a named export. At minimum:
   - `inbox-layout-shell.tsx` (from Slice 2)
   - `inbox-eyebrow.tsx` (from Slice 2)
   - `inbox-status-sentence.tsx` (from Slice 2)
   - `inbox-health-row.tsx` (from Slice 9)
   - `queue-rail.tsx` (from Slice 3 / 4)
   - `queue-row.tsx` (from Slice 3)
   - `conversation-pane.tsx` (from Slice 5)
   - `conversation-header.tsx` (from Slice 5)
   - `drawer-overlay.tsx` (from Slice 6)
   - `details-drawer-panel.tsx` (from Slice 6)
   - `audit-drawer-panel.tsx` (from Slice 6)
   - `notes-drawer-panel.tsx` (from Slice 6)
   - `qa-drawer-panel.tsx` (from Slice 6)
   - `reply-composer.tsx` (from Slice 8)
   - Pre-existing helper components moved alongside: `message-attachment-list.tsx`, `presence-collision-banner.tsx`, `history-status-strip.tsx`, `public-comment-action-panel.tsx`, `manager-snapshot-panel.tsx` (if still rendered anywhere), `state-tile.tsx`, etc.

2. **`SocialInboxClient` becomes a thin orchestrator** — owns data fetching state (the `inboxData` setState from current code), mutation handlers (`handleSync`, `handleWorkflowUpdate`, `handleContactMethodMutation`, `handleSendAttemptCreate`, `handleSendAttemptRetry`, `handleCreateSavedReply`, `handleCreateNote`, `handleCreateQaScorecard`, `handleCreateCommentAction`, `handleRetryCommentAction`, `handleQueueCommentAction`, `handleQueueSendAttempt`, presence heartbeat), and renders the new layout shell. Target size: well under 1000 lines.

3. **Delete prototype + dev-only branch**:
   - Delete the directory `src/components/inbox-prototype/` entirely.
   - In `src/app/(workspace)/convert/inbox/page.tsx`, delete the `parseVariant` function, the `?variant=A` branch, and the `dispositionPreset` / `variant` references. Restore the page to its pre-prototype single rendering path: `<SocialInboxClient ... />` after the auth check.
   - Remove the `PrototypeSwitcher` import.
   - Remove the dev-only `if (variant && process.env.NODE_ENV !== "production")` block entirely.

After this slice, the only inbox UI surface is the new design. `/convert/inbox?variant=A` returns the same as `/convert/inbox` (the variant param is ignored). The prototype directory is gone.

## Acceptance criteria

- [ ] Every component listed above lives in its own file under `src/components/v2/inbox/` with a named export.
- [ ] `social-inbox-client.tsx` line count is significantly reduced (target: under 1000 lines; orchestrator only).
- [ ] No nested function components remain inside `social-inbox-client.tsx` that could reasonably be lifted to a sibling file.
- [ ] Imports are clean: each file imports only what it uses; no circular deps.
- [ ] `src/components/inbox-prototype/` directory is deleted (no `seed.ts`, no `variant-a.tsx`, no `prototype-switcher.tsx`).
- [ ] `src/app/(workspace)/convert/inbox/page.tsx`:
  - [ ] No imports from `@/components/inbox-prototype/*`.
  - [ ] No `parseVariant` function.
  - [ ] No `searchParams.variant` reference.
  - [ ] No `process.env.NODE_ENV !== "production"` branch.
  - [ ] Single rendering path: auth check → `<SocialInboxClient ... />`.
- [ ] Smoke test the full page end-to-end:
  - [ ] `/convert/inbox` (no query) renders the new design.
  - [ ] `/convert/inbox?variant=A` also renders the new design (param ignored).
  - [ ] Queue filtering works.
  - [ ] All four drawers open and close.
  - [ ] Close → preset flow works.
  - [ ] Reply composer two-tap send works.
  - [ ] Public comment moderation works.
  - [ ] Conditional health row appears when seeded with unhealthy status.
- [ ] Verification: `node --test --experimental-strip-types tests/*.test.ts` passes including all new tests from previous slices.
- [ ] Verification: `npm run lint` passes.
- [ ] Verification: `npx tsc --noEmit --pretty false` passes (known unrelated failure at `tests/meta-ads-e2e-truth.test.ts:286` should not regress).
- [ ] Verification: no console errors on `/convert/inbox` load.

## Blocked by

- #54 — extract deep modules
- #55 — layout shell + eyebrow + status sentence
- #56 — queue rail
- #57 — filter disclosure
- #58 — conversation pane
- #59 — drawer overlay
- #60 — close preset
- #61 — reply composer
- #62 — readiness consolidation

All previous slices must merge first.
