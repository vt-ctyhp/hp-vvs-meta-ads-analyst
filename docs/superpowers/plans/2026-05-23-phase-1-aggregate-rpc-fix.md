# Phase 1 — Fix `aggregate_meta_daily_insights` RPC implementation plan

> **⚠️ OBSOLETED 2026-05-23 22:00 PDT.** This plan's premise (the RPC was broken and needed fixing) turned out to be wrong. Task 1 (diagnostic) showed that the apparent reconciliation failures were a bug in the audit tool itself (`reconcile-meta-ads-data.mjs` paginated without ORDER BY), not in the RPC or the data. The audit tool was fixed in commit `5988ccc`; all previously-failing reconciliations now PASS. See [2026-05-23-phase-1-execution/01-diagnostic.md](2026-05-23-phase-1-execution/01-diagnostic.md) for the full diagnostic, and [`../spike/2026-05-23/recommendation.md`](../spike/2026-05-23/recommendation.md) v3 for the corrected scope.
>
> The successor plan is [2026-05-23-v3-scope.md](2026-05-23-v3-scope.md), which covers the actually-real defects from the spike (perf indexes, /convert loader, Ask AI 4 layers, ingestion NULLs, plus optional dead-code cleanup and schema reconstruction).
>
> Leaving this file in place as historical record of what was investigated and why the plan changed shape.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `reconcile-meta-ads-data.mjs` PASS for all year windows from 2024 through 2026 (currently FAILS for any window older than ~30 days with 75-178 mismatches per window), without regressing the last-30-day PASS result.

**Architecture:** The fix happens in three layers: (1) a precise diagnostic to identify the exact failure mechanism (no NULL env values exist, no duplicate metadata keys per env — the spike's original "backfill" hypothesis was wrong), (2) either a data-side correction or a new RPC migration with corrected join/aggregation semantics, (3) an automated CI-friendly reconciliation test gate so the bug can't silently return. Path selection between data-fix and SQL-fix is user-gated on Task 1's evidence.

**Tech Stack:** PostgreSQL (Supabase), SQL migrations under `supabase/migrations/`, Node test runner (`node --test --experimental-strip-types tests/*.test.ts`) for the automated reconciliation gate. The existing reconciliation script at `.agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs` is the source of truth for correctness.

**Companion documents:**
- Recommendation (the spec): [../spike/2026-05-23/recommendation.md](../spike/2026-05-23/recommendation.md) §Phase 1
- Track 1 evidence: [../spike/2026-05-23/track-1-rotten-rpcs.md](../spike/2026-05-23/track-1-rotten-rpcs.md) finding #1
- Existing RPC: `supabase/migrations/20260522120000_aggregate_meta_insights_environment_scope.sql`
- Static guards: `.agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs`
- Live reconciliation: `.agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs`
- Accuracy contract: `.agents/skills/meta-ads-data-accuracy/references/accuracy-contract.md`

**Hard rules for the executing engineer:**
1. **NO destructive DB writes during diagnostics.** SELECT only. Log every query to a per-task journal.
2. **Any DB-mutating migration (Tasks 5A, 5B) must be applied to a staging branch or local DB first**, never directly to production. The user explicitly applies to production at Task 9 after gating.
3. **No commits without user approval** (per project AGENTS.md). Each task ends with a "ready to commit?" prompt; if user declines, accumulate changes and ask again later.
4. **TDD discipline:** the automated reconciliation test (Task 3) is RED before the fix and GREEN after. If you can't get the test to RED first, stop — that means you don't understand the bug yet.
5. **If Task 1 surfaces something that invalidates this plan's premise** (e.g., the bug is in the reconciliation script itself, not the RPC), STOP and report. Do not force the fix.
6. **No code changes outside `supabase/migrations/`, `tests/`, `.agents/skills/meta-ads-data-accuracy/`, `package.json`, and the per-task journal under `docs/superpowers/plans/2026-05-23-phase-1-execution/`.** The app code in `src/` should not need to change.

---

## File Structure

**Files this plan will create:**
- `docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md` — diagnostic journal
- `docs/superpowers/plans/2026-05-23-phase-1-execution/02-path-decision.md` — Path A vs B decision record
- `docs/superpowers/plans/2026-05-23-phase-1-execution/03-rollout.md` — staging→prod rollout journal
- `tests/aggregate-meta-insights-reconciliation.test.ts` — automated reconciliation test gate
- ONE of these depending on the chosen path:
  - `supabase/migrations/<timestamp>_aggregate_meta_insights_data_repair.sql` (Path A)
  - `supabase/migrations/<timestamp>_aggregate_meta_insights_join_rewrite.sql` (Path B)

**Files this plan will modify:**
- `package.json` (add `reconcile:meta` script if not present)
- `.agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs` (only if Path B is chosen — adjust the env-predicate-presence assertions to match the new RPC shape)

**Files this plan will NOT modify:**
- Anything under `src/` (the application layer is correct; the RPC contract is unchanged)
- Other existing migration files (we add new migrations, never edit old ones)
- The reconciliation script itself

---

## Task 1: Precise diagnostic of the reconciliation failure mechanism

**Why:** The spike's original "NULL env values" hypothesis was disproven during plan-writing (every metadata row has `environment='production'` or `'staging'`; zero NULLs). Before we can fix the RPC or the data, we need to know the actual mechanism. Several possibilities remain:
- The reconciliation script and the RPC compute the same metric *differently* in some edge case
- Historical insights reference campaign/ad-set/ad IDs that no longer exist in the env-scoped metadata (LEFT JOIN behavior subtly differs from the script's raw aggregation)
- The script's `actions` JSON coalesce uses a different priority order than the RPC's `coalesce(...)` chains
- Action-family aliases changed over time in Meta's API; older insights may have aliases the priority chain didn't cover at write time but does now (or vice versa)
- The `runtime` env defaulting in the RPC silently picks `'production'` for the service-role caller but the reconciliation script's raw read uses a different env value somewhere

**Files:**
- Create: `docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md`
- Create temporarily: `scripts/spike-phase1-diag.ts` (delete at end of task)

- [ ] **Step 1: Create the diagnostic journal stub**

```bash
mkdir -p "docs/superpowers/plans/2026-05-23-phase-1-execution"
```

Write `docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md`:
```markdown
# Phase 1 Task 1 — Diagnostic journal

_Started: <YYYY-MM-DD HH:MM>_

## Goal
Identify the exact mechanism that makes `reconcile-meta-ads-data.mjs` FAIL for windows older than ~30 days, when:
- No metadata table has NULL `environment` values
- No metadata table has duplicate `(env, key)` tuples
- Both the reconciliation script and the RPC env-filter to 'production'

## Queries run
<append each SQL query and result here as you go>

## Hypotheses tested
<one section per hypothesis, with PASS/FAIL based on evidence>

## Root cause (filled in at end of task)
<one paragraph: the mechanism, with citation to the query that confirmed it>

## Recommended path
<A | B | both | other — with one-paragraph reasoning>
```

- [ ] **Step 2: Run a small, focused failing window with extra dimensions to isolate the divergence**

A short window with full hierarchy reveals where the row-count delta lives. Pick April 2025 (the failure with the biggest spend delta from the spike).

Create `scripts/spike-phase1-diag.ts` (temporary — delete in Step 7):
```typescript
// Run via: node --experimental-strip-types --env-file=.env.local scripts/spike-phase1-diag.ts
import { createServiceClient } from "../src/lib/supabase.ts";

const s = createServiceClient();
const START = "2025-04-01";
const END = "2025-04-30";

// 1. Raw insight count for the window in prod env
const { count: rawCount } = await s
  .from("meta_daily_insights")
  .select("*", { count: "exact", head: true })
  .eq("environment", "production")
  .gte("date_start", START)
  .lte("date_start", END);
console.log("RAW meta_daily_insights for April 2025 prod:", rawCount);

// 2. Call the RPC for the same window, total dims, and see what source_rows it returns
const { data: rpcData, error: rpcErr } = await s.rpc("aggregate_meta_daily_insights", {
  p_start: START,
  p_end: END,
  p_dimensions: [],
  p_filters: [],
  p_sort_field: "spend",
  p_sort_direction: "desc",
  p_limit: 10000,
});
if (rpcErr) {
  console.log("RPC ERROR:", rpcErr.message);
} else {
  console.log("RPC total row source_rows:", rpcData[0]?.source_rows);
  console.log("RPC total row spend:", rpcData[0]?.spend);
  console.log("RPC total row impressions:", rpcData[0]?.impressions);
}

// 3. Raw spend/impressions for the window
const { data: raw } = await s
  .from("meta_daily_insights")
  .select("spend,impressions,brand_id,campaign_id,ad_set_id,ad_id,actions")
  .eq("environment", "production")
  .gte("date_start", START)
  .lte("date_start", END);
const rawSpend = (raw ?? []).reduce((a, r) => a + Number((r as any).spend ?? 0), 0);
const rawImpr = (raw ?? []).reduce((a, r) => a + Number((r as any).impressions ?? 0), 0);
console.log("RAW summed spend:", rawSpend);
console.log("RAW summed impressions:", rawImpr);

// 4. Coverage check: how many insight rows reference a brand_id / campaign_id / ad_set_id / ad_id
//    that does NOT exist in the env-scoped metadata table?
const distinctBrandIds = new Set((raw ?? []).map((r) => (r as any).brand_id).filter(Boolean));
const distinctCampaignKeys = new Set((raw ?? []).map((r) => `${(r as any).meta_account_id ?? ""}|${(r as any).campaign_id ?? ""}`));
const { data: prodBrands } = await s.from("brands").select("id").eq("environment", "production");
const prodBrandIds = new Set((prodBrands ?? []).map((b) => (b as any).id));
const orphanBrandIds = [...distinctBrandIds].filter((id) => !prodBrandIds.has(id));
console.log("Distinct insight brand_ids:", distinctBrandIds.size);
console.log("Orphan brand_ids (not in prod brands):", orphanBrandIds.length, orphanBrandIds.slice(0, 5));

// 5. Action priority spot check: for 5 random insight rows, compute the website_bookings
//    via the reconcile script's logic and via a naive sum to see if they differ
const sample = (raw ?? []).slice(0, 5);
for (const row of sample) {
  const actions = ((row as any).actions ?? []) as Array<{ action_type: string; value: string }>;
  if (!actions.length) continue;
  const types = actions.map((a) => `${a.action_type}=${a.value}`);
  console.log("Sample actions:", types.slice(0, 10));
}
```

- [ ] **Step 3: Run the diagnostic and capture results**

```bash
node --experimental-strip-types --env-file=.env.local scripts/spike-phase1-diag.ts
```

Paste output into the journal under "## Queries run".

- [ ] **Step 4: Interpret the results to identify the mechanism**

Compare:
- RAW count vs RPC source_rows for the window — if RPC > RAW, joins are multiplying somehow. If RPC < RAW, joins are excluding. If equal, the discrepancy is in metric computation, not row counts.
- RAW summed spend vs RPC spend — pin down whether spend differs at the row-set level or the aggregation level.
- Orphan brand_ids — historical insights pointing to brand records that no longer exist in env-scoped metadata are a likely silent-exclusion source.
- Sample action types — verify the priority order in the RPC matches what's actually in the data.

Write the mechanism in the journal's "## Root cause" section. Cite specific numbers.

- [ ] **Step 5: Add at least 2 confirmation queries**

For each hypothesis you considered in Step 4, add a query that confirms or rejects it. Examples:
- If orphan IDs are suspected: count exactly how many insight rows reference orphan brand/campaign/ad_set/ad IDs, and sum their spend. If that sum matches the historical delta, you've identified the mechanism.
- If action-priority drift is suspected: re-aggregate one campaign's metrics using both the RPC priority and the raw-script priority and compare.

Append all queries and results to the journal.

- [ ] **Step 6: Write the "Recommended path" section**

Based on the evidence, recommend ONE of:
- **A — Data repair migration**: insert/update metadata rows so the joins always succeed (e.g., for orphan IDs, either backfill metadata stubs or change insight-side env values). Lower-risk if the gap is small.
- **B — RPC rewrite**: change the join semantics so they don't require matching env-scoped metadata to preserve the row. Higher-leverage, fixes the entire class.
- **Other**: if the diagnostic surfaces something unexpected (e.g., the reconciliation script itself has a bug, the priority orders disagree, the env defaulting is wrong), describe the actual fix shape.

Phrase as a 1-2 paragraph recommendation. Include "what would change my mind" so the user can challenge it.

- [ ] **Step 7: Clean up and prompt user**

```bash
rm scripts/spike-phase1-diag.ts
```

Verify clean:
```bash
git status --short scripts/
```
Expected: no `scripts/spike-phase1-diag.ts` line.

Ask user: "Diagnostic complete. Journal at `docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md`. Path recommendation: [A/B/Other]. OK to commit the journal and proceed to Task 2 (path selection)?"

If approved:
```bash
git add docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md
git commit -m "docs(phase-1): diagnostic of aggregate_meta_daily_insights failure"
```

---

## Task 2: Path selection (user-gated decision point)

**Why:** Task 1's evidence determines whether Path A (data repair) or Path B (RPC rewrite) is correct. The user must explicitly choose before any implementation begins.

**Files:**
- Create: `docs/superpowers/plans/2026-05-23-phase-1-execution/02-path-decision.md`

- [ ] **Step 1: Summarize Task 1 for the user in plain language**

Send the user a message containing:
- 2-3 sentence summary of the diagnostic finding
- The recommended path and one-paragraph reasoning
- The alternative path and why it's worse
- An explicit "Approve path X?" prompt

- [ ] **Step 2: Wait for user decision**

Do not proceed until the user explicitly chooses. If they ask for more diagnostic work, return to Task 1 with new queries.

- [ ] **Step 3: Record the decision**

Write `docs/superpowers/plans/2026-05-23-phase-1-execution/02-path-decision.md`:
```markdown
# Phase 1 Task 2 — Path decision

_Decided: <YYYY-MM-DD HH:MM>_

## Chosen path
<A | B | Other>

## User's stated reasoning
<verbatim if they explained; otherwise "approved without comment">

## Implementation will follow
<reference to Task 4A or Task 4B below>

## Things to revisit if this turns out wrong
<2-3 bullet points: known risks the user accepted>
```

- [ ] **Step 4: Commit (with user approval)**

```bash
git add docs/superpowers/plans/2026-05-23-phase-1-execution/02-path-decision.md
git commit -m "docs(phase-1): path decision recorded"
```

---

## Task 3: Write the failing automated reconciliation test (TDD red phase)

**Why:** Currently, reconciliation runs are manual. We need an automated test that runs the reconciliation script for a representative set of historical windows and asserts PASS. Before the fix, this test MUST fail — that proves it actually tests the right thing.

**Files:**
- Create: `tests/aggregate-meta-insights-reconciliation.test.ts`
- Modify: `package.json` (add `reconcile:meta` script if not present)

- [ ] **Step 1: Add the npm script to package.json**

Read the current scripts section. If `reconcile:meta` is already there, skip. Otherwise add it:
```json
{
  "scripts": {
    "reconcile:meta": "node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs"
  }
}
```

Use the Edit tool. Show before/after to user before committing.

- [ ] **Step 2: Write the test file**

Create `tests/aggregate-meta-insights-reconciliation.test.ts`:
```typescript
// Reconciliation gate for aggregate_meta_daily_insights.
// Runs the existing reconcile script for representative windows and asserts PASS.
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY at test time;
// skips with a clear message otherwise so local dev without env vars doesn't fail.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const SCRIPT = ".agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs";

const WINDOWS: Array<{ name: string; start: string; end: string; dims: string }> = [
  { name: "last-30d-total", start: "2026-04-23", end: "2026-05-22", dims: "" },
  { name: "last-30d-by-campaign", start: "2026-04-23", end: "2026-05-22", dims: "campaign" },
  { name: "2026-q1-by-campaign", start: "2026-01-01", end: "2026-03-31", dims: "campaign" },
  { name: "2025-by-month", start: "2025-01-01", end: "2025-12-31", dims: "month" },
  { name: "2024-by-umbrella", start: "2024-01-01", end: "2024-12-31", dims: "campaign_umbrella" },
];

const hasEnv = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);

for (const w of WINDOWS) {
  test(`reconcile ${w.name} (${w.start}..${w.end}, dims=${w.dims || "default"})`, { skip: !hasEnv && "SUPABASE env vars not set" }, () => {
    const out = mkdtempSync(join(tmpdir(), `recon-${w.name}-`));
    try {
      const args = ["--start", w.start, "--end", w.end, "--out", out];
      if (w.dims) args.push("--dimensions", w.dims);
      const result = spawnSync("node", [SCRIPT, ...args], { encoding: "utf8" });
      assert.equal(result.status, 0, `script exited non-zero: ${result.stderr || result.stdout}`);
      const report = readFileSync(join(out, "audit-report.md"), "utf8");
      assert.match(
        report,
        /Status:\s*PASS/,
        `reconciliation FAILED for ${w.name}. See ${out}/audit-report.md\n${report.split("\n").slice(0, 30).join("\n")}`
      );
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
}
```

- [ ] **Step 3: Run the test to verify it FAILS**

```bash
set -a && source .env.local && set +a && npm test -- --test-name-pattern=reconcile 2>&1 | tail -40
```

Expected: tests `reconcile last-30d-*` PASS (those windows are clean today), tests `reconcile 2026-q1-*`, `reconcile 2025-by-month`, `reconcile 2024-by-umbrella` FAIL with `Status: FAIL` in the assertion message.

If all tests PASS already, STOP — that means the bug is no longer reproducible and you need to re-validate Task 1's diagnostic.

If all tests FAIL including the last-30d windows, STOP — likely an env/setup issue, not the bug. Check `.env.local` exists and contains the required keys.

- [ ] **Step 4: Commit the failing test (with user approval)**

```bash
git add tests/aggregate-meta-insights-reconciliation.test.ts package.json
git commit -m "test(reconcile): add gate for aggregate_meta_daily_insights historical windows"
```

The test must be checked in BEFORE the fix so CI history shows the test failing → passing.

---

## Task 4A: Implement Path A — data repair migration

**Skip this task if user chose Path B in Task 2.**

**Why:** If Task 1 showed the cause is data-side (e.g., orphan IDs, mistyped env values, missing rows), the fix is a one-shot data correction migration. The RPC SQL stays unchanged.

**Files:**
- Create: `supabase/migrations/<timestamp>_aggregate_meta_insights_data_repair.sql`

- [ ] **Step 1: Decide the migration timestamp**

```bash
date -u +"%Y%m%d%H%M%S"
```
Use the printed value as the migration filename prefix (e.g., `20260524100000_aggregate_meta_insights_data_repair.sql`).

- [ ] **Step 2: Write the migration**

The exact SQL depends on what Task 1 found. Below is a TEMPLATE for the most likely case (orphan brand_id values on historical insights):

```sql
-- aggregate_meta_daily_insights data repair
--
-- Background: see docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md
-- This migration <one-line summary of what it does>.
--
-- Idempotent. Safe to re-run.

begin;

-- Example 1: backfill any meta_campaigns rows missing for historical insight references
-- (replace with the actual repair shape from Task 1's diagnostic — DO NOT run this template as-is)
insert into public.meta_campaigns (
  environment,
  meta_account_id,
  campaign_id,
  campaign_name,
  status,
  effective_status,
  created_at,
  updated_at
)
select distinct
  i.environment,
  i.meta_account_id,
  i.campaign_id,
  coalesce(i.campaign_name, 'Historical placeholder'),
  'UNKNOWN',
  'UNKNOWN',
  now(),
  now()
from public.meta_daily_insights i
left join public.meta_campaigns c
  on c.environment = i.environment
 and c.meta_account_id = i.meta_account_id
 and c.campaign_id = i.campaign_id
where i.environment = 'production'
  and c.campaign_id is null
  and i.campaign_id is not null
on conflict do nothing;

-- Repeat the pattern for meta_ad_sets, meta_ads, meta_creatives as needed
-- (only the joins the diagnostic identified as the gap source)

commit;
```

**REPLACE THE TEMPLATE WITH THE ACTUAL REPAIR FROM TASK 1.** The diagnostic must have produced specific numbers (e.g., "237 historical insight rows reference 14 orphan brand_ids; backfill those 14 brand rows"). The migration must address those specifics, not the template's example.

- [ ] **Step 3: Dry-run the migration via local Supabase (or staging)**

If using a local Supabase project:
```bash
npx supabase@latest db reset --linked  # only if you're willing to wipe local
# OR use a fresh local db only
```

If using a remote staging Supabase project, set its env vars and run the migration via SQL editor or `supabase db push --linked`.

NEVER apply directly to production at this stage.

Verify locally:
```bash
set -a && source .env.local && set +a && npm test -- --test-name-pattern=reconcile 2>&1 | tail -40
```
(Pointing at the staging DB env vars, not prod.)

Expected: all 5 tests PASS.

If any still fail, the data repair was incomplete — return to Task 1 with new evidence.

- [ ] **Step 4: Commit the migration (with user approval)**

```bash
git add supabase/migrations/<timestamp>_aggregate_meta_insights_data_repair.sql
git commit -m "fix(rpc): repair aggregate_meta_daily_insights historical data"
```

---

## Task 4B: Implement Path B — RPC rewrite migration

**Skip this task if user chose Path A in Task 2.**

**Why:** If Task 1 showed the cause is query semantics (the joins exclude or multiply rows for reasons that aren't fixable by data repair), the fix is a new RPC version that handles the join semantics differently. The existing RPC stays in place as historical record; the new migration `create or replace`s it.

**Files:**
- Create: `supabase/migrations/<timestamp>_aggregate_meta_insights_join_rewrite.sql`
- Modify: `.agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs` (update assertions to match the new shape)

- [ ] **Step 1: Decide the migration timestamp**

```bash
date -u +"%Y%m%d%H%M%S"
```

- [ ] **Step 2: Write the new RPC migration**

Strategy: keep `i.environment = r.environment` as the source filter. Drop the env predicates from joined metadata. Replace LEFT JOIN with a subquery that explicitly picks ONE metadata row per (meta_account_id, key) tuple, preferring the row from the runtime env when available, falling back to any row otherwise. This way:
- Historical insights without env-matching metadata still resolve to *some* metadata (so brand_code etc. aren't NULL)
- Multi-env duplicates can't multiply because the subquery returns at most one row

Template (REPLACE the action-coalesce blocks with the actual ones from `20260522120000_aggregate_meta_insights_environment_scope.sql` — those are correct and must stay identical):

```sql
-- aggregate_meta_daily_insights — rewrite to make historical-window joins lossless
--
-- Background: see docs/superpowers/plans/2026-05-23-phase-1-execution/01-diagnostic.md
-- Prior version: 20260522120000_aggregate_meta_insights_environment_scope.sql
--
-- Change: join to env-preferred metadata via DISTINCT ON subqueries instead of
-- env-predicated LEFT JOINs. Insights are still env-filtered at the source. The
-- env-multiplication prevention guard remains effective because each subquery
-- emits at most one metadata row per (key) tuple, prefer-runtime-env.
--
-- Action-family coalesce chains are unchanged from the prior version.

create or replace function public.aggregate_meta_daily_insights(
  p_start date,
  p_end date,
  p_dimensions text[] default '{}'::text[],
  p_filters jsonb default '[]'::jsonb,
  p_sort_field text default 'spend',
  p_sort_direction text default 'desc',
  p_limit integer default 100
)
returns table (
  -- (return shape unchanged from prior migration; copy verbatim)
)
language sql
stable
set search_path = public
as $$
  with runtime_claims as (
    -- (unchanged from prior migration)
  ),
  runtime_input as (
    -- (unchanged)
  ),
  runtime as (
    -- (unchanged)
  ),
  -- NEW: per-key, env-preferred metadata projections
  preferred_brands as (
    select distinct on (id) id, code, environment
    from public.brands
    order by id, case when environment = (select environment from runtime) then 0 else 1 end
  ),
  preferred_campaigns as (
    select distinct on (meta_account_id, campaign_id)
      meta_account_id, campaign_id, campaign_name, status, effective_status, environment
    from public.meta_campaigns
    order by meta_account_id, campaign_id,
             case when environment = (select environment from runtime) then 0 else 1 end
  ),
  preferred_ad_sets as (
    select distinct on (meta_account_id, ad_set_id)
      meta_account_id, ad_set_id, ad_set_name, status, effective_status, daily_budget, environment
    from public.meta_ad_sets
    order by meta_account_id, ad_set_id,
             case when environment = (select environment from runtime) then 0 else 1 end
  ),
  preferred_ads as (
    select distinct on (meta_account_id, ad_id)
      meta_account_id, ad_id, ad_name, status, effective_status, environment
    from public.meta_ads
    order by meta_account_id, ad_id,
             case when environment = (select environment from runtime) then 0 else 1 end
  ),
  enriched as (
    select
      i.*,
      coalesce(b.code, 'Unassigned') as brand_code,
      coalesce(s.daily_budget, 0) as ad_set_daily_budget,
      case
        when upper(coalesce(a.effective_status, a.status, s.effective_status, s.status, c.effective_status, c.status, '')) = 'ACTIVE'
          then 'live'
        when upper(coalesce(a.effective_status, a.status, s.effective_status, s.status, c.effective_status, c.status, '')) = 'PAUSED'
          then 'paused'
        else 'off'
      end as delivery_status
    from public.meta_daily_insights i
    cross join runtime r
    left join preferred_brands b on b.id = i.brand_id
    left join preferred_campaigns c
      on c.meta_account_id = i.meta_account_id
     and c.campaign_id = i.campaign_id
    left join preferred_ad_sets s
      on s.meta_account_id = i.meta_account_id
     and s.ad_set_id = i.ad_set_id
    left join preferred_ads a
      on a.meta_account_id = i.meta_account_id
     and a.ad_id = i.ad_id
    where i.environment = r.environment
      and i.date_start >= p_start
      and i.date_start <= p_end
  ),
  filtered as (
    -- (copy verbatim from the prior migration: filter exclusion logic + action coalesce blocks)
  ),
  ranked as (
    -- (copy verbatim from prior migration)
  ),
  grouped as (
    -- (copy verbatim from prior migration)
  ),
  shaped as (
    -- (copy verbatim from prior migration)
  )
  select *
  from shaped
  order by
    -- (copy verbatim — the sort cascade)
  limit least(greatest(coalesce(p_limit, 100), 1), 10000);
$$;

grant execute on function public.aggregate_meta_daily_insights(
  date,
  date,
  text[],
  jsonb,
  text,
  text,
  integer
) to ads_analyst_web, ads_analyst_worker, ads_analyst_ingest, authenticated, service_role;
```

When writing the actual migration, COPY the verbatim CTEs (`runtime_claims`, `runtime_input`, `runtime`, `filtered`, `ranked`, `grouped`, `shaped`, the sort cascade) from `20260522120000_aggregate_meta_insights_environment_scope.sql`. Only the `preferred_*` CTEs and the `enriched` join shape are new.

- [ ] **Step 3: Update the static guard script**

The current guards assert `b.environment = r.environment` etc. are present on joins. With the rewrite, those predicates move out of the joins and into the `preferred_*` CTEs. Update assertions:

```javascript
// Modify .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs

const CHECKS = [
  {
    id: "insights_environment_filter",
    description: "Filters meta_daily_insights by runtime environment",
    test: (sql) => /where\s+i\.environment\s*=\s*r\.environment/i.test(sql),
  },
  {
    id: "brands_env_prefer",
    description: "Brands projection prefers runtime environment to prevent multi-env multiplication",
    test: (sql) =>
      /preferred_brands[\s\S]{0,500}distinct\s+on[\s\S]{0,200}case\s+when\s+environment\s*=\s*\(select\s+environment\s+from\s+runtime\)/i.test(sql),
  },
  {
    id: "campaigns_env_prefer",
    description: "Campaigns projection prefers runtime environment",
    test: (sql) =>
      /preferred_campaigns[\s\S]{0,500}distinct\s+on\s*\(meta_account_id,\s*campaign_id\)[\s\S]{0,300}case\s+when\s+environment\s*=\s*\(select\s+environment\s+from\s+runtime\)/i.test(sql),
  },
  {
    id: "ad_sets_env_prefer",
    description: "Ad-sets projection prefers runtime environment",
    test: (sql) =>
      /preferred_ad_sets[\s\S]{0,500}distinct\s+on\s*\(meta_account_id,\s*ad_set_id\)[\s\S]{0,300}case\s+when\s+environment\s*=\s*\(select\s+environment\s+from\s+runtime\)/i.test(sql),
  },
  {
    id: "ads_env_prefer",
    description: "Ads projection prefers runtime environment",
    test: (sql) =>
      /preferred_ads[\s\S]{0,500}distinct\s+on\s*\(meta_account_id,\s*ad_id\)[\s\S]{0,300}case\s+when\s+environment\s*=\s*\(select\s+environment\s+from\s+runtime\)/i.test(sql),
  },
  // Keep booking_alias_priority, messaging_alias_priority, leads_alias_priority,
  // purchase_alias_priority checks unchanged — those are still in the RPC.
];
```

Use Edit on the file, replacing the brands/campaigns/ad_sets/ads_environment_join entries with the new env_prefer entries. Keep all the alias-priority checks unchanged.

- [ ] **Step 4: Run the static guard to confirm it still asserts protection**

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs
```
Expected: all checks PASS against the new migration file. If any FAIL, fix the migration OR the regex (whichever is wrong) — the new shape must still demonstrably prevent multi-env multiplication.

- [ ] **Step 5: Apply to staging and run the test suite**

Same as Task 4A Step 3 — apply to a non-production DB and run:
```bash
set -a && source .env.local && set +a && npm test -- --test-name-pattern=reconcile 2>&1 | tail -40
```

Expected: all 5 reconciliation tests PASS.

If failures persist, the join rewrite didn't address the root cause. Re-examine Task 1's diagnostic — there may be a third mechanism (e.g., action-priority drift) that needs its own fix.

- [ ] **Step 6: Commit the rewrite (with user approval)**

```bash
git add supabase/migrations/<timestamp>_aggregate_meta_insights_join_rewrite.sql .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs
git commit -m "fix(rpc): rewrite aggregate_meta_daily_insights joins to preserve historical rows"
```

---

## Task 5: Full verification matrix

**Why:** After either fix, validate against more windows than the 5 in the automated test, to catch edge cases the test doesn't cover.

**Files:**
- Modify: `docs/superpowers/plans/2026-05-23-phase-1-execution/03-rollout.md`

- [ ] **Step 1: Create the rollout journal**

```markdown
# Phase 1 Task 5 — Rollout journal

_Started: <YYYY-MM-DD HH:MM>_
_Chosen path: A | B (per 02-path-decision.md)_

## Verification matrix
| Window | Dimensions | Status before fix | Status after fix |
|---|---|---|---|
| (filled in below) | | | |
```

- [ ] **Step 2: Run an expanded reconciliation matrix on the fixed staging DB**

```bash
set -a && source .env.local && set +a
for dims in "" "brand" "campaign_umbrella" "campaign" "ad_set" "ad" "creative"; do
  label="${dims:-total}"
  for win in "2024-01-01:2024-12-31:2024" "2025-01-01:2025-12-31:2025" "2026-01-01:2026-03-31:2026q1" "2026-04-23:2026-05-22:recent"; do
    IFS=':' read -r start end name <<< "$win"
    out_dir="docs/superpowers/plans/2026-05-23-phase-1-execution/verification/${name}-${label}"
    mkdir -p "$out_dir"
    args=(--start "$start" --end "$end" --out "$out_dir")
    [ -n "$dims" ] && args+=(--dimensions "$dims")
    result=$(node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs "${args[@]}" 2>&1 | tail -1)
    echo "$name dims=$label → $result"
  done
done
```

Append every result to the journal's verification matrix table.

- [ ] **Step 3: All matrix entries must say PASS**

If any FAIL, STOP. Inspect the failure, return to Task 1 or 4 as needed.

- [ ] **Step 4: Commit the rollout journal**

```bash
git add docs/superpowers/plans/2026-05-23-phase-1-execution/03-rollout.md docs/superpowers/plans/2026-05-23-phase-1-execution/verification/
git commit -m "test(reconcile): expanded verification matrix all PASS post-fix"
```

---

## Task 6: Re-run the automated test suite and confirm GREEN

**Why:** Close the TDD loop. Task 3 made the test RED; Task 4 made the test (and the world) GREEN. Confirm it's still GREEN end-to-end.

**Files:** none new.

- [ ] **Step 1: Run the full test suite**

```bash
set -a && source .env.local && set +a && npm test 2>&1 | tail -40
```

Expected: all tests PASS, including the 5 new reconciliation tests and the existing 45 test files.

If any pre-existing test BROKE because of our changes (unlikely since we didn't touch `src/`), investigate.

- [ ] **Step 2: Run the static guards**

```bash
node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs
```
Expected: all checks PASS.

---

## Task 7: Production rollout plan and gating

**Why:** Applying the migration to production needs care. We document the rollout shape and gates here; the actual `supabase db push --linked` is user-executed at Step 4.

**Files:**
- Modify: `docs/superpowers/plans/2026-05-23-phase-1-execution/03-rollout.md`

- [ ] **Step 1: Write the production rollout plan**

Append to the rollout journal:

```markdown
## Production rollout plan

### Pre-checks (run against PROD service-role)
1. Snapshot the failing reconciliation outputs for last-30d, 2025-by-month, and 2024-by-umbrella — save under `docs/superpowers/plans/2026-05-23-phase-1-execution/verification/prod-before-fix/`. These are the BEFORE record.
2. Backup the prod DB via Supabase dashboard's Backup feature. Note the backup ID in this journal.
3. Confirm the new migration is the only schema-changing migration pending: `npx supabase@latest db diff --linked`.

### Apply
1. `npx supabase@latest db push --linked` (with user explicit approval)
2. Immediately re-run the reconciliation script for the same windows from Pre-checks step 1. Save AFTER outputs under `verification/prod-after-fix/`.
3. Compare BEFORE vs AFTER — every failing window must now PASS.

### Rollback plan (if AFTER reconciliation FAILS or worse than BEFORE)
1. Path A (data repair): identify which UPDATE/INSERT to reverse. The migration was written to be idempotent and small; reversal can be a one-off SQL written ad-hoc against the snapshot.
2. Path B (RPC rewrite): create a new migration that `create or replace`s the function back to the prior version's text. The prior file `20260522120000_aggregate_meta_insights_environment_scope.sql` has the original SQL.

### Smoke test post-rollout (manual)
1. Load `/analyst` with last-30d default → numbers should match BEFORE (no regression for the working window)
2. Load `/analyst` with a year-window picker → numbers should differ from BEFORE (this is the fix) and should match the reconciliation script's RPC output
3. Load `/analysis` (Ask AI), run one historical query → should not time out and should return numbers consistent with raw aggregates
```

- [ ] **Step 2: Ask user for production rollout approval**

Ask: "Phase 1 implementation complete. All tests GREEN locally. Plan to apply to production is documented in 03-rollout.md. Proceed with `supabase db push --linked` against prod? (Y / wait)"

If wait: stop here, leave the migration committed locally, do not push to prod. Return to user when they're ready.

If Y: continue to Step 3.

- [ ] **Step 3: Snapshot prod BEFORE state**

```bash
mkdir -p docs/superpowers/plans/2026-05-23-phase-1-execution/verification/prod-before-fix
set -a && source .env.local && set +a
for win in "2024-01-01:2024-12-31:2024-umbrella:campaign_umbrella" "2025-01-01:2025-12-31:2025-month:month" "2026-04-23:2026-05-22:recent-default:"; do
  IFS=':' read -r start end name dims <<< "$win"
  args=(--start "$start" --end "$end" --out "docs/superpowers/plans/2026-05-23-phase-1-execution/verification/prod-before-fix/$name")
  [ -n "$dims" ] && args+=(--dimensions "$dims")
  node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs "${args[@]}" 2>&1 | tail -1
done
```

Verify the output directories contain `audit-report.md`. Recent should show PASS, historical should show FAIL.

- [ ] **Step 4: Apply migration to production**

```bash
npx supabase@latest db push --linked
```

Read the output carefully. Should report the new migration applied with no errors. If it errors, STOP, do not retry — investigate the error and report to user.

- [ ] **Step 5: Snapshot prod AFTER state**

Same loop as Step 3 but to `verification/prod-after-fix/`. Expected: all 3 PASS.

- [ ] **Step 6: Manual smoke test**

```bash
npm run dev
```
Open `http://localhost:3000/analyst` in a browser. Verify:
- Last 30 days default view: numbers visually similar to pre-fix (recent window was already correct)
- Switch to a "last year" picker if available: numbers should now load (not time out) and match what the reconciliation script reports

Open `/analysis` (Ask AI). Run a query like "Show 2025 ad spend trends by quarter". Verify it does not time out and returns coherent numbers.

If any smoke test fails, run the Rollback plan from Step 1 immediately.

- [ ] **Step 7: Commit the prod verification artifacts**

```bash
git add docs/superpowers/plans/2026-05-23-phase-1-execution/verification/prod-before-fix/ docs/superpowers/plans/2026-05-23-phase-1-execution/verification/prod-after-fix/ docs/superpowers/plans/2026-05-23-phase-1-execution/03-rollout.md
git commit -m "docs(phase-1): production rollout verified, all historical windows now PASS"
```

- [ ] **Step 8: Push the branch and ask user about PR**

```bash
git push
```
Ask user: "Phase 1 done and verified in production. Want to open a PR for code review, merge to main, or both?"

---

## Hand-off

After Phase 1 ships and verification passes, the next plan is **Phase 2** per the recommendation:
- 2A: Invert /convert loader (visitor-keyed) — see [track-4a](../spike/2026-05-23/track-4a-convert-visitor-bug.md)
- 2B: Fix Ask AI 5-layer breakage — see [track-4b](../spike/2026-05-23/track-4b-ask-ai-quality.md)
- 2C: Fix website_conversions + appointment_events ingestion NULLs
- 2D: Re-run Phase 1's reconciliation matrix after Phase 2A-C to confirm no regression

Each 2A/2B/2C/2D gets its own spec + plan + execution cycle.
