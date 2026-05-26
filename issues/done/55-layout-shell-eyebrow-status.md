---
github_issue: 55
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 2
---

# feat: inbox layout shell + eyebrow metric strip + status sentence

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Build the new top chrome of `/convert/inbox`: two-pane layout shell, slim metric eyebrow, and lead status sentence. The queue and conversation panes inside the shell still render the existing components from `SocialInboxClient` (those are replaced in later slices). This slice is layout-only on top of unchanged content.

Three components:

1. **`InboxLayoutShell`** — top-level wrapper. Two-pane grid (~400px queue rail + flexible conversation pane), border + card background per DESIGN.md. Hosts a slot for the drawer overlay (drawer functionality wired in Slice 6).

2. **`InboxEyebrow`** — slim strip above the status sentence. Renders exactly five `MetaInboxManagerDashboardMetric` fields:
   - `Needs reply` ← `metrics.needsReply` (ink tone)
   - `Unassigned` ← `metrics.unassigned` (ink tone)
   - `Stale` ← `metrics.staleConversations` (warning tone when > 0, else ink)
   - `Median first` ← `metrics.medianFirstResponseMinutes` formatted as `{n}m` or `—` if null
   - `QA avg` ← `metrics.averageQaScore` to 1 decimal, or `—` if null (positive tone)

   Right side: `Last sync · {N} min ago · {status}` derived from `data.syncRuns[0]` (most recent), and the existing `Sync Inbox` button wired to the existing `handleSync()`. No `View team →` link (no destination exists in the codebase; out of scope per PRD).

3. **`InboxStatusSentence`** — lead headline using `computeInboxHighlights(queue)` from Slice 1. Title typography (Cormorant Garamond, ~26px), highlights separated by ` · `, tone-mapped colors (warning amber, signal positive forest, ink). Hairline `border-b border-hp-rule` below.

`SocialInboxClient` is restructured so its return JSX renders these three components at the top, then the existing queue/filter chrome and conversation rail below. No queue or conversation behavior changes.

## Acceptance criteria

- [ ] `InboxLayoutShell` exists as its own component, accepts children for queue and conversation slots.
- [ ] `InboxEyebrow` renders five real metric fields with correct tone mapping; falsy/null metrics render as `—`.
- [ ] `InboxEyebrow` right-side `Last sync` reflects `data.syncRuns[0].status` and time-since `completed_at`.
- [ ] `InboxEyebrow` `Sync Inbox` button is wired to the existing sync handler; loading state matches the existing button.
- [ ] `InboxStatusSentence` consumes `computeInboxHighlights` from Slice 1 and renders highlights with hairline divider below.
- [ ] No invented eyebrow metrics: `SLA breach`, `Advisors X/Y`, and `View team →` are NOT present.
- [ ] DESIGN.md compliance: square corners, hairline borders, no `#000`/`#fff`, smallcaps labels with 0.14em tracking, oldstyle figures in prose / lining-tabular in the metric values.
- [ ] Tests for `InboxEyebrow`:
  - [ ] All five metrics render with given values.
  - [ ] `staleConversations: 0` renders ink tone; `> 0` renders warning tone.
  - [ ] `medianFirstResponseMinutes: null` and `averageQaScore: null` render as `—`.
  - [ ] Sync Inbox button click invokes the injected sync handler.
- [ ] Tests for `InboxStatusSentence`:
  - [ ] Each `computeInboxHighlights` shape from Slice 1 renders the expected text and tone.
- [ ] Tests for `InboxLayoutShell`:
  - [ ] Renders queue and conversation slots in the correct grid columns.
- [ ] Verification: rendered `/convert/inbox` has new eyebrow + status sentence above the existing queue/conversation content.
- [ ] Verification: existing queue filtering, conversation selection, and reply flow all still work unchanged.

## Blocked by

- #54 — extract deep modules (uses `computeInboxHighlights`)
