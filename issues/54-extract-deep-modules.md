---
github_issue: 54
parent_prd: 53
labels:
  - ready-for-agent
mode: AFK
status: ready
slice: 1
---

# refactor: extract deep modules from SocialInboxClient (useInboxFilters, search haystack, highlights, drawer state)

## Parent

PRD #53 — Local file: `issues/53-convert-inbox-replier-redesign.md`

## What to build

Pure-logic extraction pass with no UI change. Lift four pieces of logic out of the 4413-line `social-inbox-client.tsx` into named, testable modules. The existing client continues to work identically — these modules are wired back in so the rendered output is byte-for-byte the same. Comprehensive tests on each module are the deliverable.

The four modules:

1. **`useInboxFilters` hook** — owns the filter combo state (`queueCategoryFilter`, `sourceChannelFilter`, `campaignUmbrellaFilter`, `itemTypeFilter`, `statusFilter`, `brandFilter`, `sourceFilter`, `adFilter`, `creativeFilter`, `query`) plus the derived `filteredQueue`. Exposes setters, a `reset()` action, a `filtersDirty` boolean, and `attributionFilterOptions` computed from the queue. The filter predicate is lifted verbatim from the current `filteredQueue` useMemo — no behavior change.

2. **`computeConversationSearchHaystack(conversation)`** — pure function returning the concatenated, lower-cased searchable string. Lifts the inline search-field list (currently inside the `filteredQueue` useMemo at `social-inbox-client.tsx` lines ~400-414) into a named, snapshot-testable function. Includes: brand, channel, type, status, sender, preview, routing explanation, campaign umbrella ID, campaign ID, adset ID, ad ID, creative ID, ref, queue category label, source channel label.

3. **`computeInboxHighlights(queue)`** — pure function lifted from the `inboxHighlights` useMemo at lines 356-376. Returns the array of `{ text, tone }` objects driving the lead status sentence.

4. **`useDrawerState` hook** — small state machine. Owns `drawer: "details" | "audit" | "notes" | "qa" | null` and `dispositionPreset: "close" | null`. Exposes `open(drawer, preset?)` and `close()`. Snippet from the prototype that encodes the behavior:

```ts
type DrawerKey = "details" | "audit" | "notes" | "qa" | null;
type DispositionPreset = "close" | null;

// open(k, p?): sets drawer = k, preset = p ?? null
// close(): sets both to null
// Selecting a new conversation also calls close()
```

`SocialInboxClient` is updated to consume the extracted modules. No visible behavior change — every existing filter, search, and rendered output stays identical.

## Acceptance criteria

- [ ] `useInboxFilters` hook exists in its own file, fully typed, exporting the hook and its return type.
- [ ] `computeConversationSearchHaystack` exists as a pure function in its own file.
- [ ] `computeInboxHighlights` exists as a pure function in its own file.
- [ ] `useDrawerState` hook exists in its own file, fully typed.
- [ ] `SocialInboxClient` consumes all four; the existing `filteredQueue` / `inboxHighlights` useMemos are replaced with calls into the new modules.
- [ ] `useInboxFilters` test coverage:
  - [ ] returns full queue when all filters at defaults
  - [ ] narrows by each filter individually (queue category, source channel, campaign umbrella, ad, creative, item type, status, brand, source)
  - [ ] combines two or more filters and returns intersection
  - [ ] search narrows by every haystack field (sender, handle, preview, routing explanation, each firstTouch attribution field)
  - [ ] `reset()` clears all filters and query
  - [ ] `filtersDirty` reports false at defaults, true on any change
  - [ ] `attributionFilterOptions` returns deduplicated umbrella/ad/creative options derived from the input queue
- [ ] `computeConversationSearchHaystack` test coverage:
  - [ ] returns concatenated lower-cased string for a complete conversation fixture
  - [ ] handles null/undefined fields without throwing
  - [ ] snapshot test locks the field set so adding a searchable field requires intentional update
- [ ] `computeInboxHighlights` test coverage:
  - [ ] empty queue → `Inbox is empty for the current connection` (neutral tone)
  - [ ] `5 unread, 0 needs-reply` → `5 unread` (warning)
  - [ ] `0 unread, 7 needs-reply` → `7 needing reply` (warning)
  - [ ] `3 unread, 5 needs-reply` → both, separated
  - [ ] `0 unread, 0 needs-reply, 10 items` → `10 threads, all caught up` (positive)
- [ ] `useDrawerState` test coverage:
  - [ ] initial state is `{ drawer: null, preset: null }`
  - [ ] `open("audit")` sets `{ drawer: "audit", preset: null }`
  - [ ] `open("details", "close")` sets `{ drawer: "details", preset: "close" }`
  - [ ] `close()` resets both to null
  - [ ] opening a different drawer while one is open replaces drawer and resets preset
- [ ] Verification: `node --test --experimental-strip-types tests/*.test.ts` passes including the new tests.
- [ ] Verification: rendered `/convert/inbox` output is unchanged (smoke test the page; filters, search, status sentence, drawer open/close all behave as before).

## Blocked by

None — can start immediately.
