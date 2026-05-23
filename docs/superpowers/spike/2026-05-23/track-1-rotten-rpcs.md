# Track 1 — Rotten data-layer artifacts (ranked by impact)

_Updated: 2026-05-23 (Task 1.3 head start)_

Impact = (number of red metric-mismatches caused) × (severity of those mismatches) × (reach across dashboards).

---

## 1. `aggregate_meta_daily_insights` RPC — historical windows broken

- **Location:** `supabase/migrations/20260522120000_aggregate_meta_insights_environment_scope.sql:12-115` (latest definition)
- **Called from:** `src/lib/meta-insight-aggregates.ts:132` via `aggregateMetaInsights()` wrapper
- **Drives:** /analyst (the canonical performance dashboard) and likely /analysis (Ask AI dashboards)
- **Mismatch count:** **429 metric-mismatches** across 3 historical windows tested (178 in Q1 2026, 176 in 2025, 75 in 2024)
- **Magnitude:** 3% to 50%+ error in spend/impressions/clicks/leads/conversions, in BOTH directions depending on the entity
- **Recency boundary:** Last ~30 days pass; everything older fails
- **Root cause (high confidence):** environment-scope predicates on metadata joins (`brands`, `meta_campaigns`, `meta_ad_sets`, `meta_ads`) drop historical rows where joined metadata has NULL or mismatched `environment`, and multiply rows where multiple env-scoped metadata candidates exist
- **Suggested fix shape (two options):**
  1. **Backfill:** populate `environment = 'production'` on every existing `brands`/`meta_campaigns`/`meta_ad_sets`/`meta_ads` row that lacks it. One-shot UPDATE per table, then re-run reconciliation. Low risk if the env value is missing rather than wrong.
  2. **RPC rewrite:** treat `meta_daily_insights.environment` as authoritative. Don't require joined metadata to also have matching env — leave that as a sync-time invariant. Simpler join, faster query, retroactively correct.
- **Confidence:** **high** (deterministic reproduction via existing reconciliation script; pattern of both undercount and overcount mechanically consistent with the join hypothesis)
- **Severity for rebuild decision:** historical analysis (year-over-year, Q-over-Q, "compare to last quarter") is silently wrong on the dashboard the user spends the most time on. AI reports/chat that pull historical windows inherit the same wrong numbers. **This is THE finding.**
- **Is a full rebuild required?** **No.** This is fixable in place with a backfill or RPC rewrite. C-scope (data-layer rebuild) at most; arguably D-scope (targeted fix).

### Reproduction
```bash
cd "/Users/viv/Meta Ads AI Analysis/.claude/worktrees/focused-brahmagupta-caa1af"
set -a && source .env.local && set +a
# PASS — recent window
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs \
  --start 2026-04-23 --end 2026-05-22 \
  --dimensions campaign \
  --out /tmp/recon-recent
# FAIL — historical window
node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs \
  --start 2025-01-01 --end 2025-12-31 \
  --dimensions month \
  --out /tmp/recon-2025
```

---

## Pending entries

- `/convert` customer-journey-ledger consistency (Task 1.4) — needs bespoke check
- `/website-funnel` event-aggregation consistency (Task 1.4) — needs bespoke check
- `/analyst/creative-analysis` per-ad aggregation in 1162-line TS loader (Task 1.4) — needs bespoke check

Other RPCs not yet implicated (audit lower-priority): the ~58 RPCs that do not serve the 4 distrusted dashboards.
