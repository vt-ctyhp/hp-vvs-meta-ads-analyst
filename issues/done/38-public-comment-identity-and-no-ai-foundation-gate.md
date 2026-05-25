---
github_issue: 38
labels:
  - ready-for-agent
mode: AFK
status: open
---

# fix: public comment identity and no-AI foundation gate

## Parent

Parent issue: #29

## What to build

Keep public comment conversations coherent and enforce the no-AI foundation contract. Public comment replies should normalize under the root comment chain while preserving reply-level history/events. AI reply/summarization/label/routing endpoints should remain inactive in the foundation build.

## Acceptance criteria

- [ ] Root public comment plus replies normalize into one operational conversation.
- [ ] Reply-level comment IDs remain visible in ordered history or events without becoming separate operational conversations.
- [ ] Orphan replies with missing root context remain visible in a safe review/fallback state.
- [ ] Foundation-mode AI suggest-reply calls return a disabled response and do not call any AI provider.
- [ ] UI remains consistent with the no-AI foundation decision.
- [ ] Slice-specific tests cover root/reply normalization, orphan fallback, history ordering, and AI gate behavior.

## Dependency status

Original blocked-by issue #31 is already implemented on this branch per handoff history and committed inbox foundation work. Continue without waiting for user input.

## Verification notes

Known unrelated failures from handoff/current branch:

- `npx tsc --noEmit --pretty false` fails at `tests/meta-ads-e2e-truth.test.ts:286`.
- `npm test` fails at `tests/website-analytics.test.ts:140`.

Do not chase those failures unless this issue changes them.

## Ralph status - 2026-05-25

Completed. Public comment replies now normalize under the root comment conversation, orphan replies route to human review, and the suggest-reply route returns a disabled foundation response without importing or calling the AI provider.

Verification:

- `node --test --experimental-strip-types tests/meta-inbox-normalization.test.ts tests/meta-inbox-history.test.ts tests/social-reply-foundation-gate.test.ts tests/social-inbox-ui-contract.test.ts` passes.
- `npm run test` still fails at known unrelated `tests/website-analytics.test.ts:140`.
- `npm run typecheck` cannot run because `package.json` has no `typecheck` script.
- `npx tsc --noEmit --pretty false` still fails at known unrelated `tests/meta-ads-e2e-truth.test.ts:286`.
