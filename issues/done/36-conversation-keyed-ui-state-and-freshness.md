---
github_issue: 36
labels:
  - ready-for-agent
mode: AFK
status: open
---

# fix: conversation-keyed UI state and freshness

## Parent

Parent issue: #29

## What to build

Make inbox UI local state conversation-safe and fresh. Draft replies, comment action inputs, internal notes, QA forms, saved-reply state, presence responses, history refreshes, and reply-window labels should be keyed to the selected conversation and cannot leak into another customer thread after navigation or sync.

## Acceptance criteria

- [ ] Draft/action/note/QA/template state from conversation A cannot submit against conversation B after selection changes.
- [ ] Stale presence responses cannot overwrite the current selected conversation's presence state.
- [ ] Sync either reloads selected history or marks it stale until refreshed.
- [ ] Reply-window countdown and disabled send labels update over time.
- [ ] Long customer/source/ad labels remain readable and do not break the primary reply workflow.
- [ ] Slice-specific UI helper or contract tests cover conversation switching, stale presence, sync refresh, and time-based state.

## Dependency status

Original blocked-by issues #31 and #32 are already implemented on this branch per handoff history and committed inbox foundation/auth work. Continue without waiting for user input.

## Verification notes

Known unrelated failures from handoff/current branch:

- `npx tsc --noEmit --pretty false` fails at `tests/meta-ads-e2e-truth.test.ts:286`.
- `npm test` fails at `tests/website-analytics.test.ts:140`.

Do not chase those failures unless this issue changes them.

## Status - 2026-05-25

Completed in this Ralph run. Added conversation-keyed draft/guidance state, keyed action/note/QA/template panels to the selected conversation, refreshed selected history after sync, made reply-window labels tick over time, and tightened long-label wrapping around the primary reply workflow.

Verification:

- Focused UI freshness and UI contract tests pass.
- `npm run test` still fails at the known unrelated `tests/website-analytics.test.ts:140` pagination assertion.
- `npm run typecheck` cannot run because `package.json` has no `typecheck` script.
- `npx --no-install tsc --noEmit --pretty false` still fails at the known unrelated `tests/meta-ads-e2e-truth.test.ts:286` type assertion.
