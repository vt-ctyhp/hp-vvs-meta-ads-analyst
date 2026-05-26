---
github_issue: 62
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 9
---

# feat: consolidate readiness banners into a conditional health row

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Collapse three top-of-page readiness components into one conditional component. When inbox health is fully green, the consolidated component renders nothing — the eyebrow's `Last sync · X · status` indicator (from Slice 2) is the only health signal. When something is unhealthy, a single conditional row renders with the warning copy.

One new component, three deleted:

1. **`InboxHealthRow`** (new) — conditional component. Renders only when any of the following are unhealthy (derived from the existing `status` prop):
   - `status.readiness.socialInbox === false` (inbox can't read Meta messages)
   - `status.readiness.socialReply === false` (replies blocked by permission gaps)
   - `status.missingEnv.length > 0` (missing Meta env vars)
   - `status.permissions?.forbiddenGranted.length > 0` (forbidden permissions granted)
   - `data.syncRuns[0]?.status === "failed"` (last sync run failed)

   When unhealthy, renders a single warning row with:
   - Headline (matches existing `InboxReadinessBanner` copy): `Inbox can't read Meta messages` / `Inbox connection issue` / `{N} permission(s) missing for replies` depending on the failure mode.
   - Status pills for `Inbox read` and `Replies` (matches existing `StatusPill` rendering).
   - `Show details` toggle that reveals the existing `MetaReadinessPanel` body (permission cards, missing env vars, social-reply warnings) plus the existing `SyncRunPanel` body (last run status, completion timestamp, metrics, first error).

   When all green: `InboxHealthRow` returns `null`. Page top is just `InboxEyebrow` + `InboxStatusSentence`.

2. **Delete** the existing `InboxReadinessBanner`, `MetaReadinessPanel`, and `SyncRunPanel` from `SocialInboxClient`'s top-of-page rendering. Their content is now subsumed by `InboxHealthRow`.

The healthy-state signal in the eyebrow (Slice 2 already implements `Last sync · {N} min ago · {status}`) is the only health indicator when everything is green.

## Acceptance criteria

- [ ] `InboxHealthRow` component exists; rendered between `InboxEyebrow` and `InboxStatusSentence` (or as the first child of `InboxLayoutShell` — pick the placement matching DESIGN.md spacing rhythm).
- [ ] All-green state: `InboxHealthRow` returns `null`; page top has no readiness chrome.
- [ ] Unhealthy state: `InboxHealthRow` renders the warning row with correct headline + status pills.
- [ ] `Show details` toggle expands to show MetaReadiness panel content (permission cards / env vars / warnings) + SyncRun panel content (last run status / completion / metrics / first error).
- [ ] Toggle button text swaps between `Show details` and `Hide details`.
- [ ] Legacy `InboxReadinessBanner`, `MetaReadinessPanel`, `SyncRunPanel` no longer render above the queue in `SocialInboxClient`.
- [ ] Eyebrow's `Last sync · {N} min ago · {status}` is the only sync indicator when health is all green.
- [ ] Tests for `InboxHealthRow`:
  - [ ] All-green inputs → renders nothing.
  - [ ] `status.readiness.socialInbox = false` → renders with headline `Inbox can't read Meta messages`.
  - [ ] `status.readiness.socialReply = false` → renders with permission-related headline.
  - [ ] `status.missingEnv = ["META_ACCESS_TOKEN"]` → renders with the appropriate headline.
  - [ ] `data.syncRuns[0].status = "failed"` → renders with the sync-failed signal.
  - [ ] Toggle button reveals detail body when clicked.
- [ ] Verification: when seeded with healthy data, `/convert/inbox` has clean top chrome; when seeded with a missing env var, the consolidated warning row appears with details collapsed by default.

## Blocked by

- #55 — layout shell + eyebrow + status sentence (eyebrow's `Last sync` indicator carries the healthy-state signal)
