---
github_issue: 57
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 4
---

# feat: filter disclosure + reset link; deprecate legacy filter chrome

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Move the remaining filters into the queue rail behind a `+ Filters` disclosure that's collapsed by default. Delete the legacy filter row above the queue. The rail now owns all filter UI.

Two changes:

1. **Add `+ Filters` disclosure to `QueueRail`** (from Slice 3). When toggled open, reveals four `FilterRow` controls:
   - Source channel — options from existing `META_INBOX_SOURCE_CHANNELS` (Facebook message / Instagram message / Facebook comment / Instagram comment / private reply from comment / ad referral / other)
   - Campaign umbrella — options computed from `useInboxFilters().attributionFilterOptions.campaignUmbrellas`
   - Type — All items / Messages / Comments
   - Status — All statuses / Unread / Needs reply

   Each is a labeled `<select>` (8px height, 11px text, hairline border). Plus a Reset action wired to `useInboxFilters().reset()`. Reset link uses `text-hp-pink underline` and only shows when `filtersDirty === true`.

2. **Delete the legacy filter chrome from `SocialInboxClient`** — the row of standalone `FilterSelect` components that currently sits above the queue. Including the Brand, Source, Ad, Creative filters (now reachable via the disclosure or out of scope per PRD). The Reset link at the end of the legacy chrome also goes.

After this slice, all filter UI lives in the rail; the page above the rail is just `InboxEyebrow` + `InboxStatusSentence`.

## Acceptance criteria

- [ ] `+ Filters` disclosure button renders in the queue category row of `QueueRail`. Active state visually distinct (ink fill) when open.
- [ ] Disclosure default state is collapsed.
- [ ] Open state reveals four `FilterRow` controls (Source / Campaign umbrella / Item type / Status) plus a Reset action.
- [ ] Each filter is wired to `useInboxFilters` from Slice 1.
- [ ] Reset action calls `useInboxFilters().reset()` and clears all filters including the search query.
- [ ] Reset link visible only when `filtersDirty === true`.
- [ ] Subheader `{N} conversations · Reset` swaps `Sorted by age` for `Reset` link when filters are dirty.
- [ ] Legacy filter chrome above the queue is removed from `SocialInboxClient`.
- [ ] No `FilterSelect` component renders above the queue.
- [ ] Empty state `No conversations match. Try resetting.` when filters narrow to zero.
- [ ] Tests for filter combos:
  - [ ] Each filter narrows independently.
  - [ ] Two or more filters intersect correctly.
  - [ ] Reset clears all filters and the query.
  - [ ] `filtersDirty` flips correctly as filters change.
- [ ] Tests for disclosure:
  - [ ] Default collapsed.
  - [ ] Toggle button opens/closes; selected filter values persist across toggles.
- [ ] Verification: rendered `/convert/inbox` has all filter UI inside the rail; the area above the rail is clean.

## Blocked by

- #56 — queue rail (this slice extends `QueueRail`)
