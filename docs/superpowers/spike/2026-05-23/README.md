# Rebuild-decision spike — 2026-05-23

> **⚠️ Update 2026-05-23 21:30 PDT:** Phase 1 diagnostic invalidated Track 1's primary finding. The `aggregate_meta_daily_insights` RPC is correct; the spike's reported "429 mismatches across historical windows" was a false positive caused by a pagination bug in the audit tool (`reconcile-meta-ads-data.mjs` paginated without ORDER BY). Audit tool fixed in commit `5988ccc`; all previously-failing windows now PASS. See [`recommendation.md`](recommendation.md) for the v3 recommendation reflecting the corrected scope, and [`../../plans/2026-05-23-phase-1-execution/01-diagnostic.md`](../../plans/2026-05-23-phase-1-execution/01-diagnostic.md) for the full diagnostic.

Spec: [../../specs/2026-05-23-rebuild-decision-spike-design.md](../../specs/2026-05-23-rebuild-decision-spike-design.md)
Plan: [../../plans/2026-05-23-rebuild-decision-spike.md](../../plans/2026-05-23-rebuild-decision-spike.md)

## Status

| Track | Status | Owner | Output |
|---|---|---|---|
| 0 — Setup | complete | Claude | this README + stubs |
| 1 — Data correctness | **complete (PRIMARY FINDING INVALIDATED)** — RPC + dashboard historical numbers are correct; the apparent mismatches were a bug in the audit tool itself. Integrity bugs on /convert + ingestion NULLs remain valid. | Claude | track-1-reconciliation.md, track-1-rotten-rpcs.md |
| 2 — Performance | **complete (query-side)** — browser timings deferred | Claude | track-2-perf-audit.md |
| 3 — Stack risk | **complete** — stack exonerated | Claude | track-3-stack-risk.md |
| 4 — UX + AI + dead code (v2) | **complete** — three parallel subagent investigations | Claude | track-4a, track-4b, track-4c |
| Synthesis v2 | **complete — pending user review** | Claude + user | [recommendation.md](recommendation.md) |

## 🎯 Recommendation (v3 — superseded v1 and v2 after Phase 1 diagnostic)

**Tightest D-scope / loose C-scope: ~2-4 weeks of targeted fixes. NOT a full rebuild. NOT even a full data-layer rebuild.**

The Phase 1 diagnostic invalidated the spike's primary finding (broken RPC). The remaining real issues are concrete and small in aggregate: add a few indexes to fix the historical-window timeout, invert /convert's loader, fix 4 layers of Ask AI breakage, fix ingestion NULLs, and (optionally) clean up dead code + reconstruct schema-as-code.

See [recommendation.md](recommendation.md) for the full v3 reasoning.

## Headlines (v3 — after Phase 1 diagnostic)

- 🟢 ~~**/analyst data layer is internally consistent for the last ~30 days but systematically wrong for any historical window**~~ **INVALIDATED.** The /analyst RPC is correct for every window tested (recent through 2024). The apparent discrepancies were a pagination bug in the audit tool (`reconcile-meta-ads-data.mjs` lacked ORDER BY → unstable row order across paged queries → some rows double-counted, others gapped). Fixed in `5988ccc`. After the fix, all previously-FAILing windows PASS deterministically. See [track-1-reconciliation.md](track-1-reconciliation.md) §Invalidation banner.
- 🟢 **Stack stability tax = 0%.** Of 39 recent fix commits, ZERO trace to Next 16 / React 19 / Tailwind v4. Firefighting is 79% APP-LOGIC, 13% SUPABASE (mostly correctness-related fixes that turn out to have been correct already), 8% EXTERNAL-API. **The bleeding-edge stack is exonerated.** See [track-3-stack-risk.md](track-3-stack-risk.md).
- 🟡 **Schema-as-code is 30% broken.** 28 of 92 migrations are empty placeholder stubs. Worth fixing but not urgent.
- 🔴 **/convert is structurally broken (loader inverted).** Real bug. Visitor without appointment unreachable. ~1-2 days. See [track-4a](track-4a-convert-visitor-bug.md).
- 🔴 **Ask AI is broken at 4 layers** (down from 5 — layer 1 "inherits broken RPC" is now invalidated). Planner, router, render, persistence bugs remain. ~4-5 days. See [track-4b](track-4b-ask-ai-quality.md).
- 🔴 **50% of `website_conversions` rows have NULL `visitor_id`; 5.6% of `appointment_events` have NULL `visit_date_time`.** Ingestion bugs. ~3-5 days each.
- 🟡 **Full-year /analyst queries hit RPC statement timeout** (~10s vs 5s default). Real perf issue, fixable with `meta_daily_insights` indexes. ~1-2 days.
- 🟡 **~10K dead LOC (~20% of 51K hand-written) is cleanly separable.** `lib/data-boundaries.ts` is a real type-checked firewall. Optional cleanup, 1-2 sprints.

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
