---
github_issue: 56
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 3
---

# feat: queue rail with category dropdown, per-row category tag, pink needs-reply treatment

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Build the new left-side queue rail and per-row treatment. Replaces the current queue list inside the layout shell from Slice 2. The old filter chrome above the queue (the row of `FilterSelect` components) stays in place until Slice 4 — operators can still use it, just in its existing location.

Two components:

1. **`QueueRail`** — flex column inside the left grid slot. Sections, top to bottom:
   - Search input (broadened across the haystack fields from Slice 1).
   - Queue category dropdown defaulting to `"all"`, with eight category options from the existing `META_INBOX_QUEUE_CATEGORIES` constant (Cash for gold / Book appointment / US Product / VN Product / Custom jewelry / Repair service / General inquiry / Needs review). Honors team-queue access via the existing `visibleQueueCategories(data)` helper.
   - List of `QueueRow` items consuming `useInboxFilters().filteredQueue` from Slice 1.
   - Subheader line: `{N} conversations · Sorted by age` (or `Reset` link when filters are dirty — Reset wiring fully exposed in Slice 4).

2. **`QueueRow`** — single conversation row. Layout:
   - Left: 7×7 avatar with initials + smallcaps `{platform} {kind}` (e.g., `IG Msg`, `FB Cmt`).
   - Center: sender display name (font-title, 15px), 2-line preview, per-row category tag (`{brand} · {category label}` smallcaps in a hairline-bordered chip).
   - Right: timestamp (tabular-nums, warning amber when over SLA), and one of: `↑ Over SLA` (amber), `Needs reply` (pink), or nothing (resolved / waiting on customer).
   - **Pink needs-reply treatment** (replaces side-stripe pattern, which DESIGN.md absolutely bans):
     - When `conv.workflowStatus === "needs_reply"` AND `!conv.overSla`: `text-hp-pink` on the `Needs reply` label.
     - When `conv.workflowStatus === "needs_reply"` AND row is not active: `bg-hp-pink/[0.06]` warm-pink row tint.
     - Over-SLA rows keep amber label as the more urgent signal, but the row tint still applies if they're also needs-reply.
     - Active (selected) row: `bg-hp-ink text-hp-foundation` regardless.

`useInboxFilters` from Slice 1 owns the queue-category and search state; `QueueRail` wires `setQueueCategory` and `setQuery` to the existing setters. Other filters (source channel, campaign umbrella, ad, creative, item type, status, brand) still live in the old chrome above the queue — Slice 4 moves them into the rail.

## Acceptance criteria

- [ ] `QueueRail` renders inside the layout shell's left slot.
- [ ] Search input updates `useInboxFilters().query`; results narrow in real time.
- [ ] Queue category dropdown defaults to `All categories` and includes the 8 categories from `META_INBOX_QUEUE_CATEGORIES`, filtered through `visibleQueueCategories(data)` for team-queue access.
- [ ] `QueueRow` shows the per-row `{brand} · {category label}` tag on every row including the "All categories" view.
- [ ] `QueueRow` pink `Needs reply` label renders only when `workflowStatus === "needs_reply"` AND `!overSla`.
- [ ] `QueueRow` warm-pink row tint (`bg-hp-pink/[0.06]`) renders only when `workflowStatus === "needs_reply"` AND row is not active.
- [ ] `QueueRow` amber `↑ Over SLA` label renders when `overSla === true` and takes precedence over the pink label.
- [ ] Active row inverts to ink fill regardless of needs-reply / over-SLA state.
- [ ] No side-stripe borders anywhere — verified in code review.
- [ ] DESIGN.md compliance: square corners, hairline 1px borders, smallcaps eyebrows, oldstyle figures in prose / lining-tabular in age.
- [ ] Empty state: `No conversations match.` when filtered queue is empty (Reset link comes in Slice 4).
- [ ] Tests for `QueueRow` visual states (using fixtures or test IDs, not CSS classes):
  - [ ] Needs-reply non-over-SLA row marks itself as needs-reply mode AND pink-label mode.
  - [ ] Over-SLA row marks itself as needs-reply mode AND over-sla mode (amber label).
  - [ ] Selected row marks itself as active mode regardless of needs-reply / over-SLA.
  - [ ] Resolved / waiting row marks itself with no label and no tint.
- [ ] Tests for queue category dropdown:
  - [ ] All 8 categories appear when `data.queueAccess.mode` is admin.
  - [ ] Only allowed categories appear when team-queue mode.
  - [ ] Changing selection updates `useInboxFilters` and narrows the rendered queue.
- [ ] Verification: rendered `/convert/inbox` shows new rail with category tags; selecting a category from the new dropdown filters correctly.

## Blocked by

- #55 — layout shell + eyebrow + status sentence (uses the layout shell's queue slot)
