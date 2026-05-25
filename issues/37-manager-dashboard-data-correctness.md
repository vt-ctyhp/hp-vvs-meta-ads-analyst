---
github_issue: 37
labels:
  - ready-for-agent
mode: AFK
status: open
---

# fix: manager dashboard data correctness

## Parent

Parent issue: #29

## What to build

Make manager dashboard metrics trustworthy for management review. Metrics should be computed from complete date-range data, use true first-response time, respect queue/team/user/source/campaign/ad/creative filters, and avoid leaking inaccessible rows.

## Acceptance criteria

- [ ] Dashboard default range remains last seven days.
- [ ] Counts are correct above the UI list cap.
- [ ] First-response time uses earliest outbound reply after first inbound, not latest outbound.
- [ ] Unresponded, failed-send backlog, retry, workload, and label-completeness metrics use complete scoped data.
- [ ] Filters by user, team, queue, source channel, campaign umbrella, ad, creative, and message context compose safely.
- [ ] Dashboard access respects allowed queues and manager scope.
- [ ] Slice-specific dashboard tests cover capped-volume fixtures, first-response math, and access-safe filters.

## Dependency status

Original blocked-by issues #31 and #35 are already implemented on this branch per handoff history and committed environment isolation work. Continue without waiting for user input.

## Verification notes

Known unrelated failures from handoff/current branch:

- `npx tsc --noEmit --pretty false` fails at `tests/meta-ads-e2e-truth.test.ts:286`.
- `npm test` fails at `tests/website-analytics.test.ts:140`.

Do not chase those failures unless this issue changes them.
