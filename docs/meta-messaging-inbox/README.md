# Meta Messaging Inbox Docs

| Artifact | Path | Status | Purpose |
| --- | --- | --- | --- |
| PRD | `docs/meta-messaging-inbox/prd.md` | Draft | Defines what we are building, who it serves, and how success is measured. |
| Technical Design / RFC | `docs/meta-messaging-inbox/rfc.md` | Draft | Defines how the system should work after PRD scope is accepted. |
| ADR | `docs/adr/0001-meta-messaging-inbox-data-model.md` | Proposed | Records the accepted data-model decision after RFC review. |
| Implementation Plan | `docs/plans/2026-05-23-001-meta-messaging-inbox-implementation-plan.md` | Draft | Breaks accepted PRD/RFC decisions into sequenced implementation units. |
| Test Plan | `docs/meta-messaging-inbox/test-plan.md` | Draft | Defines verification for product behavior, data integrity, permissions, and reporting. |

## Workflow

1. Draft and review the PRD.
2. Draft the RFC from accepted PRD scope.
3. Convert accepted RFC decisions into ADRs.
4. Write the implementation plan from accepted PRD, RFC, and ADRs.
5. Write the test plan against PRD requirements and RFC risks.

## Organization

Feature-specific product and QA docs live in this folder so the inbox build has one durable hub. Cross-project engineering artifacts keep their standard homes: implementation plans in `docs/plans/`, and architecture decision records in `docs/adr/`.
