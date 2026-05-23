# Rebuild-decision spike — 2026-05-23

Spec: [../../specs/2026-05-23-rebuild-decision-spike-design.md](../../specs/2026-05-23-rebuild-decision-spike-design.md)
Plan: [../../plans/2026-05-23-rebuild-decision-spike.md](../../plans/2026-05-23-rebuild-decision-spike.md)

## Status

| Track | Status | Owner | Output |
|---|---|---|---|
| 0 — Setup | complete | Claude | this README + stubs |
| 1 — Data correctness | in progress — /analyst major finding | Claude + user | track-1-reconciliation.md, track-1-rotten-rpcs.md |
| 2 — Performance | pending — needs Vercel URL + browser access | Claude (blocked on user) | track-2-perf-audit.md |
| 3 — Stack risk | **complete** — stack exonerated | Claude | track-3-stack-risk.md |
| Synthesis | pending | Claude + user review | recommendation.md |

## Headline so far

- **/analyst data layer is internally consistent for the last ~30 days but systematically wrong for any historical window (Q1 2026, 2025, 2024 all FAIL reconciliation).** Mismatches go in BOTH directions, 3-50%+ depending on entity. Hypothesis: env-scope predicates added in May 2026 silently drop/multiply historical rows whose joined metadata lacks consistent `environment` values. See [track-1-rotten-rpcs.md](track-1-rotten-rpcs.md) finding #1. **Fixable in place — does NOT require a full rebuild.**
- **Stack stability tax = 0%.** Of 39 recent fix commits, ZERO trace to Next 16 / React 19 / Tailwind v4. Firefighting is 79% APP-LOGIC (attribution/funnel domain), 13% SUPABASE (mostly the env-scope issue above), 8% EXTERNAL-API (Meta CDN thumbnail expiry). **The bleeding-edge stack is exonerated — a rewrite that swaps frameworks would carry the same fire forward.** See [track-3-stack-risk.md](track-3-stack-risk.md).
- **Schema-as-code is 30% broken.** 28 of 92 migrations are empty placeholder stubs because schema changes were made directly against the Supabase project and never round-tripped. Any rebuild scope larger than D would need to first reconstruct the live schema from prod.

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
