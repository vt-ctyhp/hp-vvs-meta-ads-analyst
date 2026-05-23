# Rebuild-decision spike — 2026-05-23

Spec: [../../specs/2026-05-23-rebuild-decision-spike-design.md](../../specs/2026-05-23-rebuild-decision-spike-design.md)
Plan: [../../plans/2026-05-23-rebuild-decision-spike.md](../../plans/2026-05-23-rebuild-decision-spike.md)

## Status

| Track | Status | Owner | Output |
|---|---|---|---|
| 0 — Setup | complete | Claude | this README + stubs |
| 1 — Data correctness | **complete** — major finding on /analyst, integrity bugs on /convert | Claude (+ user follow-up optional) | track-1-reconciliation.md, track-1-rotten-rpcs.md |
| 2 — Performance | **complete (query-side)** — browser timings deferred | Claude | track-2-perf-audit.md |
| 3 — Stack risk | **complete** — stack exonerated | Claude | track-3-stack-risk.md |
| 4 — UX + AI + dead code (v2) | **complete** — three parallel subagent investigations | Claude | track-4a, track-4b, track-4c |
| Synthesis v2 | **complete — pending user review** | Claude + user | [recommendation.md](recommendation.md) |

## 🎯 Recommendation (v2)

**C — targeted data-layer + UI fixes + Ask AI fixes + dead-code cleanup. ~5-8 weeks. NOT a full rebuild.**

After user pushback, deepened the investigation across UX (/convert visitor bug), Ask AI quality, and code hygiene. All three confirm: every problem has a concrete, bounded fix. The dead code is genuinely separable (the `lib/data-boundaries.ts` partition is a real type-checked firewall). Scope expanded from ~3-5 to ~5-8 weeks, but rebuild option still strongly contraindicated.

See [recommendation.md](recommendation.md) for the full v2 reasoning.

## Headlines (v2)

- **/analyst data layer is internally consistent for the last ~30 days but systematically wrong for any historical window (Q1 2026, 2025, 2024 all FAIL reconciliation).** Mismatches go in BOTH directions, 3-50%+ depending on entity. Hypothesis: env-scope predicates added in May 2026 silently drop/multiply historical rows whose joined metadata lacks consistent `environment` values. See [track-1-rotten-rpcs.md](track-1-rotten-rpcs.md) finding #1. **Fixable in place — does NOT require a full rebuild.**
- **Stack stability tax = 0%.** Of 39 recent fix commits, ZERO trace to Next 16 / React 19 / Tailwind v4. Firefighting is 79% APP-LOGIC (attribution/funnel domain), 13% SUPABASE (mostly the env-scope issue above), 8% EXTERNAL-API (Meta CDN thumbnail expiry). **The bleeding-edge stack is exonerated — a rewrite that swaps frameworks would carry the same fire forward.** See [track-3-stack-risk.md](track-3-stack-risk.md).
- **Schema-as-code is 30% broken.** 28 of 92 migrations are empty placeholder stubs because schema changes were made directly against the Supabase project and never round-tripped. Any rebuild scope larger than D would need to first reconstruct the live schema from prod.
- **/convert is structurally broken, not cosmetic.** Loader is appointment-keyed; a visitor who browsed without booking is unreachable. 584 visitors / 112 active in 30d → only ~2 surface in the UI; the rest are em-dash appointment shells. Fix is 1-2 days (loader inversion). See [track-4a](track-4a-convert-visitor-bug.md).
- **Ask AI is broken at 5 independent layers** — data inheritance (the same RPC), spec planner (hallucinated filter values + silent date override), router (two parallel duplicate backends), render (4k tokens into one `<p>` tag), persistence (diagnostic data dropped). ~1 week of fixes + shared RPC. See [track-4b](track-4b-ask-ai-quality.md).
- **~10K dead LOC (~20% of 51K hand-written) is cleanly separable.** `lib/data-boundaries.ts` is a real type-checked firewall. CRM tables aren't queried from `src/`. Cleanup is delete-by-grep with confidence, 1-2 sprints. **This was the strongest pro-rebuild argument and it didn't hold up.** See [track-4c](track-4c-dead-code.md).

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
