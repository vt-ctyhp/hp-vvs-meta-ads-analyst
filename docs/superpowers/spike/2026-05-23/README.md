# Rebuild-decision spike — 2026-05-23

Spec: [../../specs/2026-05-23-rebuild-decision-spike-design.md](../../specs/2026-05-23-rebuild-decision-spike-design.md)
Plan: [../../plans/2026-05-23-rebuild-decision-spike.md](../../plans/2026-05-23-rebuild-decision-spike.md)

## Status

| Track | Status | Owner | Output |
|---|---|---|---|
| 0 — Setup | in_progress | Claude | this README + stubs |
| 1 — Data correctness | pending | Claude + user | track-1-reconciliation.md, track-1-rotten-rpcs.md |
| 2 — Performance | pending | Claude (may need user for browser access) | track-2-perf-audit.md |
| 3 — Stack risk | pending | Claude | track-3-stack-risk.md |
| Synthesis | pending | Claude + user review | recommendation.md |

## Hard rules

- Read-only DB. Every SELECT logged to `queries.sql`. No `INSERT/UPDATE/DELETE/TRUNCATE/ALTER/DROP/CREATE/GRANT/REVOKE`.
- No commits without user approval (per project AGENTS.md).
- No code changes — findings only.
- Stop and check in if any track is >50% over budget.

## Artifact map

- `README.md` — this file
- `queries.sql` — append-only log of every SQL query run
- `track-1-reconciliation.md` — Track 1 reconciliation tables per dashboard
- `track-1-rotten-rpcs.md` — Track 1 ranked list of suspect RPCs/views/tables
- `track-2-perf-audit.md` — Track 2 load measurements + slow-query analysis
- `track-3-stack-risk.md` — Track 3 commit classification + stack stability tax
- `recommendation.md` — Synthesis A/B/C/D recommendation
- `perf/` — performance screenshots
- `sources/` — external system exports (Meta Ads Manager CSVs, Acuity exports, etc.)
