---
github_issue: 66
parent_prd: 53
labels:
  - ready-for-agent
  - bug
mode: AFK
status: ready
---

# fix: queue rows with "Unread" status are missing pink needs-attention treatment

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`. Follow-up bug after slice #56 (`QueueRow`) and slice #63 (cleanup) merged.

## What to build

The queue builder emits three possible row statuses (see `src/lib/meta-inbox-queue-view.ts` lines 172-176):

- `"Needs reply"` — workflow-flagged (conversation.needs_reply === true)
- `"Unread"` — new inbound messages exist but conversation hasn't been workflow-flagged yet (rawThread.unread_count > 0)
- `"Synced"` — read and handled

The `QueueRow` pink needs-attention treatment (pink "Needs reply" label + 6% warm-pink row tint) currently fires only for the first bucket. It should fire for both `"Needs reply"` AND `"Unread"`, because both represent un-replied conversations that need the operator's attention — and the page's status sentence at the top (`inboxHighlights` in `src/components/v2/inbox/inbox-highlights.ts`) already treats both as warning-toned highlights (`{N} unread · {N} needing reply`).

The row treatment must mirror the status-sentence treatment so the same conversations that contribute to the warning highlight at the top also get the warning row treatment below.

The fix lives in `src/components/v2/inbox/queue-row.tsx`. The `isNeedsReply()` helper currently checks:

```ts
function isNeedsReply(item) {
  return item.conversationStatus === "needs_reply" || item.status === "Needs reply";
}
```

It needs to also return true when `item.status === "Unread"`. The label that renders for an Unread row should read `Needs reply` (matches the existing visual vocabulary — operators don't think in terms of "Unread vs Needs reply", they think "this row needs a response"). The row tint and the `data-label-tone="pink"` data attribute should apply identically to Unread rows.

The over-SLA precedence rule stays: when a row is both Unread / Needs reply AND over SLA, the amber `↑ Over SLA` label wins over the pink `Needs reply` label, but the row tint still applies. No change to that precedence.

## Acceptance criteria

- [ ] In `src/components/v2/inbox/queue-row.tsx`, `isNeedsReply(item)` returns true when ANY of:
  - `item.conversationStatus === "needs_reply"`
  - `item.status === "Needs reply"`
  - `item.status === "Unread"`
- [ ] Rows with `status === "Unread"` render:
  - `data-visual-mode="needs-reply"`
  - `data-label-tone="pink"` (unless over SLA, then `"warning"`)
  - The 6% warm-pink row background tint (`bg-hp-pink/[0.06]`) when not active
  - The text `Needs reply` in pink (`text-hp-pink`) on the right side, unless over SLA
- [ ] Over-SLA precedence is unchanged: when a row is both Unread / Needs reply AND over SLA, the amber `↑ Over SLA` label wins.
- [ ] Active (selected) rows keep the ink fill (`bg-hp-ink text-hp-foundation`) regardless of Unread / Needs reply / over SLA state.
- [ ] `tests/inbox-queue-rail.test.ts` gains coverage for the Unread case:
  - [ ] An `Unread` non-over-SLA row asserts `data-visual-mode="needs-reply"` AND `data-label-tone="pink"` AND the rendered label text contains `Needs reply`.
  - [ ] An `Unread` over-SLA row asserts `data-visual-mode="needs-reply"` AND `data-label-tone="warning"` AND the rendered label text contains `Over SLA`.
  - [ ] An `Unread` active row asserts `data-visual-mode="active"` regardless of the underlying status.
- [ ] The existing `"Needs reply"` and `"Resolved"` row tests still pass without modification.
- [ ] No other component or behavior changes — this is a one-predicate fix plus test coverage.

## Dependency status

PRD #53 and all 10 slices (#54-#63) are already implemented and merged on this branch. This fix builds on top of the shipped redesign. No blockers.

## Verification notes

- Run `node --test --experimental-strip-types tests/inbox-queue-rail.test.ts` — must pass including the new Unread cases.
- Run the full test suite `npm test` — must not introduce any new failures. Known unrelated failure at `tests/website-analytics.test.ts:140` may persist.
- Manual browser verification: load `/convert/inbox` with seeded data containing at least one Unread conversation (new inbound message, no workflow flag). Confirm the row shows pink `Needs reply` label and warm-pink background tint.
- DESIGN.md compliance: no new side-stripe borders, pink stays ≤10% of any rendered surface, no `#000`/`#fff` introduced.
