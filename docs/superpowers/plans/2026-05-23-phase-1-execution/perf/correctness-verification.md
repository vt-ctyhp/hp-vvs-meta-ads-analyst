# Phase 1 correctness verification

_Run: 2026-05-23 23:15 PDT, after indexes applied to prod._

## Goal

Prove the index migration is a pure performance improvement with **zero correctness side effects**. The user asked: "Are we certain that this RPC functions as intended and will not mutate data over multiple states or in any way misstate the true data?"

## Method — 4 layers of evidence

### 1. Row-count parity (zero data mutation)

Every relevant table's row count after the migration matches the pre-migration baseline exactly:

| Table | Pre-index | Post-index | Verdict |
|---|---|---|---|
| brands | 3 | 3 | ✅ |
| meta_ad_accounts | 2 | 2 | ✅ |
| meta_campaigns | 238 | 238 | ✅ |
| meta_ad_sets | 1026 | 1026 | ✅ |
| meta_ads | 2000 | 2000 | ✅ |
| meta_creatives | 1652 | 1652 | ✅ |
| meta_daily_insights | 120962 | 120962 | ✅ |

Indexes are read-side structures; they cannot mutate data. Confirmed by direct count.

### 2. Sample-value parity (byte-identical RPC output)

For a known window (April 2025), every metric reported by the RPC matches the pre-index baseline exactly:

| Metric | Pre-index | Post-index | Verdict |
|---|---|---|---|
| spend | $12928.84 | $12928.84 | ✅ |
| impressions | 2067262 | 2067262 | ✅ |
| source_rows | 2461 | 2461 | ✅ |
| leads | 198 | 198 | ✅ |
| messaging_contacts | 5121 | 5121 | ✅ |

### 3. Hierarchy invariant (cross-dimension consistency)

For April 2025: `sum(spend) when grouped by campaign` equals `spend when ungrouped`:
- Sum of per-campaign spend: $12928.84
- Month total spend: $12928.84
- Delta: $0.00 ✅

This invariant could be violated by a join bug or a grouping bug. It holds.

### 4. Full reconciliation matrix (11 runs)

Running `reconcile-meta-ads-data.mjs` across the full audit matrix:

| Window | Dimensions | Pre-index status | Post-index status |
|---|---|---|---|
| Last 30 days | (default) | PASS | ✅ PASS |
| Last 30 days | campaign | PASS | ✅ PASS |
| Last 30 days | creative | PASS | ✅ PASS |
| 2026 Q1 | campaign | PASS (after audit-tool fix) | ✅ PASS |
| 2024 (full year) | campaign_umbrella | PASS (after audit-tool fix) | ✅ PASS |
| 2025 (full year) | month | TIMEOUT (cold) | ✅ PASS (warm — 3/3 attempts) |
| 2025 (full year) | campaign | TIMEOUT (cold) | ✅ PASS (warm — 3/3 attempts) |
| 2025 Q1 | month | (not previously tested) | ✅ PASS |
| 2025 Q2 | month | (not previously tested) | ✅ PASS |
| 2025 Q3 | month | (not previously tested) | ✅ PASS |
| 2025 Q4 | month | (not previously tested) | ✅ PASS |

**11 of 11 reconciliations PASS.** The 2 windows that initially timed out (year-month, year-campaign) passed all 3 retry attempts each once the indexes warmed up. The cold-vs-warm difference is consistent with a brand-new index needing its buffer pool to populate.

### 5. Existing test suite (regression check)

```bash
npm test
```
**Result: 401 tests, 401 PASS, 0 FAIL, 0 cancelled, 0 skipped, 0 todo.**

Any regression caused by the index migration would surface here — none did.

## Conclusion

**The aggregate_meta_daily_insights RPC behaves identically pre- and post-index.** The indexes change *how* PostgreSQL retrieves rows for joins; they do not change *which* rows are returned or *what values* the RPC computes. Every layer of evidence above confirms this:

- No data mutated
- No values changed
- Every reconciliation that previously passed still passes
- Every test in the suite still passes

The Phase 1 deliverable is safe to keep in production.
