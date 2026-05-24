# Phase 1 Task 1 — Diagnostic journal

_Started: 2026-05-23 20:30 PDT_
_Concluded: 2026-05-23 21:30 PDT_

## Goal
Identify the exact mechanism that makes `reconcile-meta-ads-data.mjs` FAIL for windows older than ~30 days, when:
- No metadata table has NULL `environment` values (verified during plan writing)
- No metadata table has duplicate `(env, key)` tuples (verified during plan writing)
- Both the reconciliation script and the RPC env-filter to 'production'

## Pre-known facts (from plan-writing diagnostic)

| Table | Total | NULL env | Production | Staging |
|---|---|---|---|---|
| brands | 3 | 0 | 2 | 1 |
| meta_ad_accounts | 2 | 0 | 1 | 1 |
| meta_campaigns | 238 | 0 | 119 | 119 |
| meta_ad_sets | 1026 | 0 | 513 | 513 |
| meta_ads | 2000 | 0 | 1000 | 1000 |
| meta_creatives | 1652 | 0 | 826 | 826 |
| meta_daily_insights | 120962 | 0 | 120914 | 48 |

Metadata is **exactly duplicated** between prod and staging (1:1). Insights are 99.96% production. No NULL env values anywhere. No duplicate keys per env.

---

## TL;DR — The spike's premise was wrong

**The `aggregate_meta_daily_insights` RPC is correct. The /analyst dashboard's historical data has been correct all along. The "429 mismatches across 3 historical windows" finding in Track 1 of the spike was a false positive caused by a pagination bug in `reconcile-meta-ads-data.mjs` itself.**

The script's `fetchTableRows` function paginates with `.range(from, to)` and NO `.order(...)` clause. PostgreSQL does not guarantee stable row ordering between separate queries without ORDER BY. For windows that span multiple pages (≥3 pages, i.e. ≥3000 rows), the same row can appear in overlapping pages (overcount) or fall through gaps (undercount), and the per-month aggregation drifts in different directions in different runs.

The recent-30-day windows passed reconciliation because they fit in 2 pages, where the instability happens to be small enough to slip under the 0.01 tolerance. The full-year windows have 28-29 pages and the instability is large.

---

## Hypotheses tested

### H1 — Environment-scope joins drop or multiply historical rows
**Status: REJECTED.** All env values are 'production' or 'staging' with no NULLs, no duplicate per-env keys. The env-scoped LEFT JOINs in the RPC return at most one metadata row per insight, and preserve insights even when metadata is missing. Verified by query [Q1, Q2 below].

### H2 — Historical insights reference orphan IDs that joins now drop
**Status: PARTIAL — true but not causal.** For April 2025 prod, 77 of 120 distinct ad keys are "orphan" (no matching production `meta_ads` row). However the joins are LEFT JOINs, so orphan rows are preserved with NULL metadata. The RPC's grouping uses `coalesce(i.campaign_id, i.campaign_name, 'unknown')` from the insight row itself, not from joined metadata. Orphans don't cause the deltas. Verified by query [Q3].

### H3 — The reconcile script and the RPC compute the same metric *differently* in some edge case
**Status: REJECTED for metric-formula reasons.** When the reconcile script is run with `--start 2025-04-01 --end 2025-04-30 --dimensions month` (single-month window), raw=$12,928.84 and rpc=$12,928.84 — EXACT MATCH. Same data, same metric, same formula. Verified by [Q5 below].

### H4 — Pagination instability in the reconcile script (no ORDER BY)
**Status: CONFIRMED. ROOT CAUSE.** The script's `fetchTableRows` (`.agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs:330-347`) paginates without ORDER BY. PostgreSQL doesn't guarantee stable ordering across queries without ORDER BY, so successive `.range(0,999)`, `.range(1000,1999)`, ... requests can overlap (some rows in both pages) or gap (some rows in neither). When the same row appears in multiple pages, the script's `aggregateRawRows` counts it multiple times, inflating that group's metrics. When rows fall in gaps, they're undercounted.

Why recent windows pass: they fit in 2 pages where instability is small. Why historical fails: 29 pages → meaningful drift.

Verified by:
- [Q4] My replica of `fetchTableRows` returns 28891 rows / $136,577.44 spend / 2461 April rows / $12,928.84 April spend — SAME EACH RUN.
- [Q5] Running reconcile script for `--start 2025-04-01 --end 2025-04-30` (3 pages): raw=$12,928.84, rpc=$12,928.84, PASS.
- [Q6] Running reconcile script for `--start 2025-01-01 --end 2025-12-31 --dimensions month` (29 pages): April raw_spend = $21,729 (old run) or $18,567 (fresh re-run), rpc consistent at $12,928. **Different raw numbers between runs of the same query = nondeterminism = pagination instability.**

---

## Queries run

### Q1 — Environment NULL check (no nulls anywhere)
```sql
SELECT count(*) FROM brands WHERE environment IS NULL;             -- 0
SELECT count(*) FROM meta_campaigns WHERE environment IS NULL;     -- 0
SELECT count(*) FROM meta_ad_sets WHERE environment IS NULL;       -- 0
SELECT count(*) FROM meta_ads WHERE environment IS NULL;           -- 0
SELECT count(*) FROM meta_daily_insights WHERE environment IS NULL;-- 0
```

### Q2 — Duplicate-key check per env (no duplicates)
For meta_campaigns: 119 prod rows, 119 distinct `(meta_account_id, campaign_id)` keys → no duplicates. Same pattern for meta_ad_sets (513:513), meta_ads (1000:1000), brands (2:2).

### Q3 — Orphan-ID check (orphans exist but are not the cause)
For April 2025 prod, 77 of 120 distinct insight ad keys have no matching prod `meta_ads` row. LEFT JOIN preserves the rows; grouping uses insight-side columns. Orphans don't shift per-group totals.

### Q4 — My fetchTableRows clone (year window, stable across runs)
```ts
// Replicating reconcile-meta-ads-data.mjs:330-347 in scripts/spike-phase1-diag4.ts (deleted after task)
// Pull year 2025 prod, aggregate by month exactly as script does
```
Run 1: 28891 rows / $136,577.44 / April $12,928.84 / 2461 rows
Run 2: 28891 rows / $136,577.44 / April $12,928.84 / 2461 rows
**Stable.** Matches RPC exactly.

### Q5 — Reconcile script for April-only (passes)
```bash
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs \
  --start 2025-04-01 --end 2025-04-30 --dimensions month --out /tmp/recon-apr
```
Result: raw_spend = $12,928.84, rpc_spend = $12,928.84, delta = 0, **Status: PASS**

### Q6 — Reconcile script for year-by-month (fails, with different results each run)
```bash
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs \
  --start 2025-01-01 --end 2025-12-31 --dimensions month --out /tmp/recon-2025-fresh
```
| Month | RPC spend (consistent) | Raw spend (spike run) | Raw spend (fresh run) |
|---|---|---|---|
| Jan 2025 | $12,408.03 | $15,536.20 | $14,459.02 |
| Feb 2025 | $9,382.05 | $11,599.95 | $13,341.85 |
| Mar 2025 | $12,214.73 | $11,854.75 | $18,747.54 |
| Apr 2025 | $12,928.84 | $21,729.40 | $18,566.84 |
| ... | (stable) | (drift) | (drift) |

**RPC is identical between runs (deterministic). Script's raw aggregation is different between runs (nondeterministic). Confirms pagination instability.**

### Q7 — Script's pagination code (no ORDER BY)
```javascript
// .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs:330-347
async function fetchTableRows(supabase, table, columns, apply, pageSize = 1000) {
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);  // <-- no .order()
    query = apply(query);
    const { data, error } = await query;
    ...
  }
}
```

### Q8 — Confirmed my year pull matches RPC sum exactly
My year pull total: $136,577.44
Sum of RPC per-month spends: $136,577.44
**Identity match.**

---

## Root cause

**The reconcile script (`.agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs`) paginates without ORDER BY at line 335. PostgreSQL does not guarantee stable row ordering across separate queries without ORDER BY. For multi-page pulls, the same row can be returned by multiple pages (overcount) or skipped between pages (undercount). The script's `aggregateRawRows` then sums duplicated rows multiple times and misses gapped rows entirely. This produces nondeterministic raw aggregates that don't match the (deterministic, correct) RPC output.**

Confidence: **HIGH**. Mechanism is consistent with PostgreSQL semantics, reproducible (different raw numbers between runs of the same script), and the RPC's output matches a properly-ordered direct query.

## Recommended path

**Path Z (new): Fix the reconcile script's pagination, then re-evaluate the entire spike's Track 1 conclusions.**

Original Path A (data repair) and Path B (RPC rewrite) are both **NOT NEEDED**. The RPC is correct. The data is correct. The /analyst dashboard's historical numbers are correct. The Track 1 spike finding was a false positive.

The actual fix is a ~5-line change to `.agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs:335`:
```javascript
// Before
let query = supabase.from(table).select(columns).range(from, from + pageSize - 1);
// After
let query = supabase
  .from(table)
  .select(columns)
  .order("id", { ascending: true })  // stable cursor for paginated reads
  .range(from, from + pageSize - 1);
```
(or `order` on whatever the primary key is for the table — `id` for most tables, possibly `(meta_account_id, ad_id, date_start)` composite for `meta_daily_insights` if no surrogate `id` exists.)

After the fix:
1. Re-run the full reconciliation matrix (2024, 2025, 2026 Q1, recent 30d) and observe ALL PASS.
2. If ANY reconciliation still fails, return to diagnostic — there's a different bug.
3. If all PASS, the spike's Track 1 conclusion is invalidated; update [track-1-reconciliation.md](../../../spike/2026-05-23/track-1-reconciliation.md), [track-1-rotten-rpcs.md](../../../spike/2026-05-23/track-1-rotten-rpcs.md), and [recommendation.md](../../../spike/2026-05-23/recommendation.md) accordingly.

### What this means for the broader rebuild recommendation

- **/analyst data correctness** was the highest-severity finding in the spike's v2 recommendation and a major driver of the C-scope decision. It is now **invalidated**.
- **Performance issue stands** — full-year RPC calls do still time out at 8-10s. That's real, and fixable independently (likely indexes on `meta_daily_insights (environment, date_start, ...)`).
- **/convert visitor bug stands** (Track 4a) — unchanged.
- **Ask AI 5-layer breakage stands** (Track 4b) — note: layer 1 of that finding was "inherits broken aggregate RPC." With the data confirmed correct, layer 1 of the Ask AI complaint is also invalidated; the other 4 layers remain.
- **Dead code findings stand** (Track 4c) — unchanged.

The rebuild scope shrinks. The C recommendation might collapse to D (small targeted fixes + cleanup). The user should re-decide based on the corrected picture.

### What would change my mind on this conclusion

- If adding ORDER BY to the script does NOT make the reconciliation pass for all windows, the bug is more than just pagination instability — return to Q&A.
- If the script's pre-existing test suite (likely under `.agents/skills/meta-ads-data-accuracy/`) demonstrates that ORDER BY was already supposed to be there and got dropped — the fix is still correct but the regression is more interesting.
- If the user has external evidence (e.g., Meta Ads Manager export) that the dashboard's recent numbers are wrong, that's a different bug not addressed by this diagnostic.
