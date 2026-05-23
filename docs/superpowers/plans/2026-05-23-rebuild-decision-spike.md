# Rebuild-decision spike — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a decision-ready report in ≤5 working days that tells the user whether to do A (full rebuild + new DB), B (full app rebuild, keep DB), C (targeted data-layer + dashboards rebuild), or D (stabilize in place) — backed by reconciliation evidence, perf measurements, and stack-stability analysis.

**Architecture:** Three parallel investigation tracks (data correctness, performance, stack risk) feeding a synthesis report. No production code changes. Read-only Supabase access via the existing `createServiceClient()` helper. Outputs are markdown artifacts under `docs/superpowers/spike/2026-05-23/`. Commits and PRs are explicit user-gated steps — never run unilaterally.

**Tech Stack:** Existing Next.js 16 + Supabase + Vercel app. Investigation tools: `psql` or the Supabase JS client via `node --experimental-strip-types`, browser DevTools / Lighthouse for perf, `git log` + `git show` for commit classification.

**Companion documents:**
- Spec: [docs/superpowers/specs/2026-05-23-rebuild-decision-spike-design.md](../specs/2026-05-23-rebuild-decision-spike-design.md)
- Existing skill to reuse: [.agents/skills/meta-ads-data-accuracy/SKILL.md](../../../.agents/skills/meta-ads-data-accuracy/SKILL.md)

**Hard rules for the executing engineer:**
1. NO `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, `ALTER`, `DROP`, `CREATE`, `GRANT`, `REVOKE` against the database. Every query is `SELECT`-only. Log every query to `docs/superpowers/spike/2026-05-23/queries.sql` as you go.
2. NO commits, pushes, branches, or PRs without explicit user approval (per project AGENTS.md). At each commit step, ask the user first; if they decline, proceed without committing.
3. NO code changes to fix anything you find during the spike. Findings get logged; fixes get scheduled in a follow-up plan.
4. If a track exceeds its budget by >50%, STOP and check in with the user before continuing.

---

## File Structure

**Files this plan will create** (all under `docs/superpowers/spike/2026-05-23/`):
- `README.md` — index of all spike artifacts and current status
- `queries.sql` — append-only log of every SQL query run during the spike, with timestamp and purpose
- `track-1-reconciliation.md` — Track 1 main output: reconciliation tables for all 4 dashboards
- `track-1-rotten-rpcs.md` — Track 1 ranked list of suspected-broken RPCs/views/tables
- `track-2-perf-audit.md` — Track 2 output: load measurements, slow-query analysis, improvement projections
- `track-3-stack-risk.md` — Track 3 output: commit classification table, stack stability tax, downgrade cost
- `recommendation.md` — Synthesis output: the final A/B/C/D recommendation with reasoning

**Files this plan will NOT modify:** anything under `src/`, `supabase/migrations/`, `tests/`, or any production config.

---

## Track 0 — Setup (~30 minutes)

### Task 0.1: Create spike output directory and stub files

**Files:**
- Create: `docs/superpowers/spike/2026-05-23/README.md`
- Create: `docs/superpowers/spike/2026-05-23/queries.sql`
- Create: `docs/superpowers/spike/2026-05-23/track-1-reconciliation.md`
- Create: `docs/superpowers/spike/2026-05-23/track-1-rotten-rpcs.md`
- Create: `docs/superpowers/spike/2026-05-23/track-2-perf-audit.md`
- Create: `docs/superpowers/spike/2026-05-23/track-3-stack-risk.md`
- Create: `docs/superpowers/spike/2026-05-23/recommendation.md`

- [ ] **Step 1: Create the directory**

Run:
```bash
mkdir -p "docs/superpowers/spike/2026-05-23"
```

- [ ] **Step 2: Write `README.md` as the spike index**

Content:
```markdown
# Rebuild-decision spike — 2026-05-23

Spec: [../../specs/2026-05-23-rebuild-decision-spike-design.md](../../specs/2026-05-23-rebuild-decision-spike-design.md)
Plan: [../../plans/2026-05-23-rebuild-decision-spike.md](../../plans/2026-05-23-rebuild-decision-spike.md)

## Status

| Track | Status | Owner | Output |
|---|---|---|---|
| 0 — Setup | pending | Claude | this README + stubs |
| 1 — Data correctness | pending | Claude + user | track-1-reconciliation.md, track-1-rotten-rpcs.md |
| 2 — Performance | pending | Claude | track-2-perf-audit.md |
| 3 — Stack risk | pending | Claude | track-3-stack-risk.md |
| Synthesis | pending | Claude + user review | recommendation.md |

## Hard rules

- Read-only DB. Every query logged to `queries.sql`.
- No commits without user approval.
- No code changes — findings only.
- Stop and check in if any track is >50% over budget.
```

- [ ] **Step 3: Write `queries.sql` header**

Content:
```sql
-- Spike query log — 2026-05-23
-- Every SELECT run against production Supabase during the spike is appended here.
-- Format per query:
--   -- [YYYY-MM-DD HH:MM] [track] [purpose]
--   SELECT ...;
-- NO writes, schema changes, or DDL. If you find yourself wanting to write, stop.
```

- [ ] **Step 4: Write empty headers in each track output file**

Each of the 5 track/recommendation files gets a minimal header (e.g. `# Track 1 — Reconciliation\n\n_In progress._`) so the README's links don't 404.

- [ ] **Step 5: User approval to commit Track 0 setup**

Ask user: "Track 0 setup complete — 7 stub files under `docs/superpowers/spike/2026-05-23/`. OK to commit as a single chore commit, or leave uncommitted?"

If approved, commit:
```bash
git add docs/superpowers/spike/2026-05-23/
git commit -m "chore(spike): scaffold rebuild-decision spike outputs"
```

### Task 0.2: Verify read-only DB access works

**Files:**
- Create: `scripts/spike-db-check.ts` (temporary; deleted in Task 0.3)

- [ ] **Step 1: Confirm required env vars are set locally**

Run:
```bash
grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=" .env.local 2>/dev/null | sed 's/=.*/=<set>/'
```
Expected: both lines present, both showing `<set>`. If either is missing, stop and ask user to populate `.env.local`.

- [ ] **Step 2: Write a one-shot connectivity probe**

Create `scripts/spike-db-check.ts` (this file is temporary — deleted in Step 4):
```typescript
import { createServiceClient } from "../src/lib/supabase.ts";

const supabase = createServiceClient();
const { data, error, count } = await supabase
  .from("aggregate_meta_insights")
  .select("*", { count: "exact", head: true });

if (error) {
  console.error("DB probe FAILED:", error.message);
  process.exit(1);
}
console.log("DB probe OK. aggregate_meta_insights row count:", count);
```

- [ ] **Step 3: Run the probe**

Run:
```bash
node --experimental-strip-types scripts/spike-db-check.ts
```
Expected: `DB probe OK. aggregate_meta_insights row count: <some number>`. If table name doesn't exist, replace with one that does (check `supabase/migrations/20260514010000_meta_ads_ai_analyst.sql` for the canonical table name created in that migration).

- [ ] **Step 4: Log the probe query and delete the script**

Append to `docs/superpowers/spike/2026-05-23/queries.sql`:
```sql
-- [2026-05-23 setup] track-0 connectivity probe
SELECT count(*) FROM aggregate_meta_insights;
```

Then delete the temp script:
```bash
rm scripts/spike-db-check.ts
```

(Do NOT commit the temp script. If you want a reusable runner, ask the user first.)

---

## Track 1 — Data correctness audit (~2 days)

This track is **collaborative**. User input is required at multiple points to define source-of-truth and to provide external system exports.

### Task 1.1: Locate the RPCs and queries feeding each dashboard

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-1-reconciliation.md` (append a "Data sources" section)

- [ ] **Step 1: Map each dashboard to its data-loading code**

For each of the 4 dashboards, identify the page file, the loader file, and the RPC(s)/table(s) it touches.

Run these greps:
```bash
# /analyst
echo "=== /analyst ==="
ls src/app/\(workspace\)/analyst/page.tsx
grep -l "analyst" src/lib/*.ts | head -10

# /analyst/creative-analysis
echo "=== /analyst/creative-analysis ==="
ls src/app/\(workspace\)/analyst/creative-analysis/page.tsx
grep -l "creative-analysis\|creative_score" src/lib/*.ts | head -10

# /website-funnel
echo "=== /website-funnel ==="
ls src/app/website-funnel/page.tsx 2>/dev/null || find src/app -path "*website-funnel*" -name "page.tsx"

# /convert
echo "=== /convert ==="
ls src/app/\(workspace\)/convert/page.tsx
grep -l "convert\|customer.ledger\|customer.journey" src/lib/*.ts | head -10
```

- [ ] **Step 2: Read each page file and trace the data flow**

Use the `Read` tool on each page's `page.tsx`, follow imports, and document in `track-1-reconciliation.md`:
```markdown
## Data sources

### /analyst
- Page: `src/app/(workspace)/analyst/page.tsx`
- Loader(s): <list lib files>
- RPC(s)/view(s) hit: <list, with file:line where the call is made>
- Key tables read: <list>

### /analyst/creative-analysis
- (same shape)

### /website-funnel
- (same shape)

### /convert
- (same shape)
```

- [ ] **Step 3: Cross-reference with the existing audit skill**

Read `.agents/skills/meta-ads-data-accuracy/SKILL.md` end to end. If it already documents source-of-truth conventions for any dashboard, copy them into the reconciliation doc with a citation (`per meta-ads-data-accuracy skill §X`). Reuse, don't re-derive.

### Task 1.2: User session — define source-of-truth per dashboard

This is a **synchronous session with the user**, not a Claude-only task. Block on user availability.

- [ ] **Step 1: Ask user, one dashboard at a time**

For each of the 4 dashboards, ask the user (use `AskUserQuestion` with 1 question per call):

```
For /<dashboard>, which external system is the source of truth for these metrics, and what's the 3-5 most important metric on this dashboard for your decision-making?

Options I'd guess:
  /analyst → Meta Ads Manager export (CSV)
  /analyst/creative-analysis → Meta Ads Manager ad-level CSV + internal score formula
  /website-funnel → Shopify Analytics export OR raw `website_events` table
  /convert → Acuity CSV (bookings) + Shopify orders (purchases) + Supabase `customer` table (counts)
```

Record the user's answers in `track-1-reconciliation.md` under a "Source of truth" section per dashboard.

- [ ] **Step 2: Pick the reconciliation window**

Default: last 30 complete days (e.g. 2026-04-23 → 2026-05-22 inclusive). Confirm with user — if they want a different window (e.g. last month, or a specific week with known bad data), use that instead. Record the chosen window in the doc.

- [ ] **Step 3: Get the external exports**

Ask the user to provide:
- Meta Ads Manager CSV export for the window (account-level + ad-level columns: spend, impressions, reach, clicks, link_clicks, ctr)
- Acuity bookings CSV for the window (if /convert is being audited)
- Shopify orders/analytics CSV for the window (if /website-funnel or /convert is being audited)

User uploads to `docs/superpowers/spike/2026-05-23/sources/<dashboard>/<filename>.csv`. Add filenames to `track-1-reconciliation.md`.

If the user can't get an export quickly for a given dashboard, fall back to the "internal consistency check" path (Task 1.4 Step 2).

### Task 1.3: Build reconciliation table — /analyst

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-1-reconciliation.md`
- Modify: `docs/superpowers/spike/2026-05-23/queries.sql`

- [ ] **Step 1: Parse the Meta Ads Manager CSV**

For the 3-5 metrics the user named, extract totals for the reconciliation window:
- Spend
- Impressions
- Reach (if available)
- Link clicks
- CTR (computed: link_clicks / impressions)

Use a one-shot Node script in `/tmp/` (not committed) or paste numbers directly into the reconciliation doc. Show the source-of-truth values.

- [ ] **Step 2: Pull the same metrics from our DB using the same RPC the page uses**

Identify the RPC from Task 1.1 (likely something like `get_ads_analyst_overview` or a query against `aggregate_meta_insights`). Run it directly via a temp script in the project's `scripts/` directory (so relative imports resolve), and delete the script when done:

```typescript
// File: scripts/spike-analyst-recon.ts (temporary — delete after use, do NOT commit)
// Run via: node --experimental-strip-types scripts/spike-analyst-recon.ts
import { createServiceClient } from "../src/lib/supabase.ts";
const supabase = createServiceClient();
const { data, error } = await supabase.rpc("<rpc_name>", {
  // params matching the dashboard for the window
  start_date: "2026-04-23",
  end_date: "2026-05-22",
  // ...other filters as the page sends them
});
if (error) throw error;
console.log(JSON.stringify(data, null, 2));
```

Log the call in `queries.sql`:
```sql
-- [2026-05-23 ts] track-1 /analyst overview rpc
-- Equivalent to: SELECT * FROM <rpc_name>('2026-04-23'::date, '2026-05-22'::date, ...);
SELECT * FROM aggregate_meta_insights WHERE date BETWEEN '2026-04-23' AND '2026-05-22';
```

After capturing output, delete the script:
```bash
rm scripts/spike-analyst-recon.ts
```

- [ ] **Step 3: Build the per-metric reconciliation table in the doc**

Append to `track-1-reconciliation.md`:
```markdown
## /analyst

Window: 2026-04-23 → 2026-05-22
Source of truth: Meta Ads Manager export (`sources/analyst/meta-export-2026-05-22.csv`)
RPC: `<rpc_name>` (called from `src/lib/<file>.ts:<line>`)

| Metric | Dashboard value | Source-of-truth value | Delta | Delta % | Status | Suspected cause |
|---|---|---|---|---|---|---|
| Spend | $X | $Y | $Z | N% | 🟢/🟡/🔴 | <blank or initial guess> |
| Impressions | ... | ... | ... | ... | ... | ... |
| ... | ... | ... | ... | ... | ... | ... |
```

Status thresholds:
- 🟢 green: |delta| ≤ 2%
- 🟡 yellow: 2% < |delta| ≤ 10%
- 🔴 red: |delta| > 10%

- [ ] **Step 4: For every yellow or red row, trace the SQL**

For each non-green metric, read the RPC's SQL definition (find via `grep -l "CREATE OR REPLACE FUNCTION <rpc_name>" supabase/migrations/*.sql`). Read the full function. Look for:
- Stale denormalized rollup table being queried instead of source rows
- Join semantics that double-count (e.g. joining ads × insights × actions without dedup)
- Missing filter (e.g. environment_scope, deleted_at, paused status)
- Timezone bucket mismatch (UTC vs California time — note this codebase has `src/lib/california-time.ts`)
- De-dup that drops rows it shouldn't

Add the suspected cause + confidence (high/medium/low) to the "Suspected cause" column.

- [ ] **Step 5: Mark Task 1.3 complete and update README status**

Update the status row for Track 1 in `README.md` to say `in_progress (1/4 dashboards done)`.

### Task 1.4: Build reconciliation tables — /convert, /website-funnel, /analyst/creative-analysis

Repeat Task 1.3 for each remaining dashboard.

- [ ] **Step 1: /convert reconciliation**

Same structure as Task 1.3 but with Acuity bookings + Shopify orders + Supabase customer counts as source-of-truth. Append a `## /convert` section to `track-1-reconciliation.md`.

Key metrics likely: total bookings, confirmed bookings, time-to-book, attributed bookings by source. Note that recent commits (`1d0a630 fix(convert): count bookings from Acuity appointments`, `e0268fc fix(convert): map funnel to confirmed booking attribution`) suggest this is an actively-evolving area — check if recent fixes correlate with the metrics that look wrong.

- [ ] **Step 2: /website-funnel reconciliation**

Same structure. If user can't get a Shopify export, fall back to an internal consistency check: query `website_events` and `website_sessions` directly to compute totals, then compare against what the dashboard shows. A delta between "what raw events say" and "what the dashboard says" still indicates dashboard-side bugs.

- [ ] **Step 3: /analyst/creative-analysis reconciliation**

Same structure for spend/impressions per ad. Also audit the Internal Creative Diagnostic Score formula itself: read `src/lib/creative-score.ts` and document what it computes, whether the inputs match the values feeding it, and whether the formula matches the intent the user describes when asked.

### Task 1.5: Categorize root causes and produce rotten-RPCs ranking

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-1-rotten-rpcs.md`

- [ ] **Step 1: Aggregate causes across all 4 dashboards**

Scan every yellow/red row in `track-1-reconciliation.md`. Count occurrences of each root-cause category:
- Stale rollup tables
- Wrong join semantics
- Environment scope leakage
- Timezone / date-bucket mismatches
- Missing or wrong filters
- Source-of-truth itself is wrong (our value is correct, external system is the off one)
- Internal formula incorrect (e.g. creative score)

- [ ] **Step 2: Write the ranked list**

In `track-1-rotten-rpcs.md`:
```markdown
# Rotten data-layer artifacts — ranked by impact

Impact = (number of red rows it caused) × (severity of those rows). Tiebreak by reach across dashboards.

1. **`<rpc_or_view_or_table_name>`** — caused N red discrepancies across <dashboards>.
   - Location: `supabase/migrations/<file>.sql:<line>` (function body)
   - Called from: `src/lib/<file>.ts:<line>`
   - Root cause: <one sentence>
   - Suggested fix shape: <e.g. "replace RPC with typed query in lib/" or "materialized view needs refresh job" or "wrong join — needs DISTINCT ON">
   - Confidence: high/medium/low
2. ...
```

- [ ] **Step 3: Update README status**

Mark Track 1 complete. Add a one-line summary: "Track 1 complete. Found N red, M yellow, P green discrepancies across 12+ metrics. Top rotten artifact: `<name>`."

- [ ] **Step 4: User approval to commit Track 1 artifacts**

Ask user: "Track 1 complete. OK to commit `track-1-reconciliation.md`, `track-1-rotten-rpcs.md`, and the `queries.sql` appends as a single commit, or leave uncommitted?"

If approved:
```bash
git add docs/superpowers/spike/2026-05-23/track-1-reconciliation.md docs/superpowers/spike/2026-05-23/track-1-rotten-rpcs.md docs/superpowers/spike/2026-05-23/queries.sql docs/superpowers/spike/2026-05-23/README.md
git commit -m "docs(spike): track 1 data correctness reconciliation"
```

---

## Track 2 — Performance audit (~1 day)

**Mode:** Claude-autonomous. No user input required mid-track unless something is blocked.

### Task 2.1: Baseline load measurements

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-2-perf-audit.md`

- [ ] **Step 1: Identify the Vercel deployment URL**

Ask user once: "What's the production URL for the app? (e.g. `https://hp-vvs-meta-ads-analyst.vercel.app` or a custom domain)"

Record it in the doc.

- [ ] **Step 2: Cold-load measurement**

For each of the 4 dashboards, in this order — wait ≥10 minutes between dashboards to let Vercel scale to zero:

1. Open a Chrome incognito window
2. Open DevTools → Network tab → "Disable cache" checked
3. Navigate to the URL
4. Record from the DevTools timing waterfall:
   - DOMContentLoaded
   - Load event
   - First Contentful Paint (FCP)
   - Largest Contentful Paint (LCP) — use Performance tab if not in Network
   - TTFB for the page request
   - Total transferred bytes
   - Number of network requests
5. Take a screenshot of the Network waterfall and save to `docs/superpowers/spike/2026-05-23/perf/cold-<dashboard>.png`

- [ ] **Step 3: Warm-load measurement**

Immediately after the cold load (same tab), reload the same dashboard 2x. Record the 2nd reload (avoid first-reload Vercel edge-cache warming):
- DOMContentLoaded, FCP, LCP, TTFB, total bytes

- [ ] **Step 4: Write the baseline table**

Append to `track-2-perf-audit.md`:
```markdown
## Baseline load measurements

Measured: 2026-05-23, production URL `<url>`, Chrome incognito + DevTools, no extensions.

| Dashboard | Cold TTFB | Cold LCP | Cold bytes | Warm TTFB | Warm LCP | Cold→warm gap |
|---|---|---|---|---|---|---|
| /analyst | ... | ... | ... | ... | ... | ... |
| /analyst/creative-analysis | ... | ... | ... | ... | ... | ... |
| /website-funnel | ... | ... | ... | ... | ... | ... |
| /convert | ... | ... | ... | ... | ... | ... |

### Read

- Large cold→warm gap (>2x) = Vercel cold-start tax dominates → fixable by warming/edge caching
- Small cold→warm gap = the work itself (DB + computation) is the bottleneck → needs query/code fixes
```

### Task 2.2: Identify the 5 slowest queries

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-2-perf-audit.md`
- Modify: `docs/superpowers/spike/2026-05-23/queries.sql`

- [ ] **Step 1: Pull slow-query stats from Supabase**

In the Supabase dashboard → SQL Editor (or via `psql` if you have the connection string), run:

```sql
-- Top 20 slowest queries by total time
SELECT
  substring(query, 1, 200) AS query_preview,
  calls,
  round(total_exec_time::numeric, 2) AS total_ms,
  round(mean_exec_time::numeric, 2) AS mean_ms,
  round(max_exec_time::numeric, 2) AS max_ms,
  rows
FROM pg_stat_statements
WHERE query NOT LIKE '%pg_stat_statements%'
  AND query NOT LIKE '%information_schema%'
ORDER BY total_exec_time DESC
LIMIT 20;
```

Log to `queries.sql`. Paste full output into `track-2-perf-audit.md` under a "Slow query snapshot" section.

If `pg_stat_statements` is not enabled, ask the user to enable it via the Supabase dashboard, or fall back to the Supabase "Query Performance" UI and screenshot the top entries.

- [ ] **Step 2: Pick the 5 with the highest mean_ms that map to user-facing requests**

Exclude background jobs (sync, backfill, cron). Focus on queries that run on dashboard page loads.

- [ ] **Step 3: EXPLAIN ANALYZE each of the 5**

For each, run (log all to `queries.sql`):
```sql
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
<the actual query, with realistic parameter values>;
```

If the query is parameterized via an RPC, manually inline the SQL from the function definition (find via `grep -A 100 "FUNCTION <name>" supabase/migrations/*.sql`).

- [ ] **Step 4: Diagnose each plan**

For each EXPLAIN, identify in the doc:
- Sequential scans on large tables? (rows > 10k = problem)
- Hash joins spilling to disk? (look for `Buckets:` with large `Memory Usage:`)
- Missing index opportunities? (filters without index support)
- Sort operations on large result sets?

Per query, estimate: "adding `CREATE INDEX ON <table> (<cols>)` would change this from `~Xms` to `~Yms`" — base the Y on whether the missing scan can become an index scan.

- [ ] **Step 5: Write the slow-queries section**

Append:
```markdown
## Top 5 slow queries

### Q1: <one-line description>
- Mean: Xms, Calls: N, Total: Y
- Plan summary: <2-3 lines>
- Root cause: <missing index / bad join / fundamentally expensive>
- Fix shape: <concrete action>
- Realistic improvement: Xms → Yms

### Q2 ... Q5
```

### Task 2.3: Find N+1 patterns

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-2-perf-audit.md`

- [ ] **Step 1: Compare requests per page**

From Task 2.1's network waterfalls, count API/RSC requests per dashboard. >10 distinct payload requests is a smell.

- [ ] **Step 2: Inspect the worst offender's server components**

For the dashboard with the most requests, read its `page.tsx` and any server components it uses. Look for:
- `for/map` loops that `await` per iteration
- Multiple `supabase.from(...).select()` calls that could be a single `.in()` query
- Multiple RPC calls that could be one RPC

- [ ] **Step 3: Document findings**

Append:
```markdown
## N+1 findings

- <dashboard>: <count> requests per page load. Suspected N+1 at `<file>:<line>`: <description>. Fix shape: <consolidate to single query>.
- ...
```

If no N+1 found, write "No N+1 patterns identified in this audit."

### Task 2.4: Improvement projection and Track 2 summary

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-2-perf-audit.md`
- Modify: `docs/superpowers/spike/2026-05-23/README.md`

- [ ] **Step 1: Write the projection**

Append:
```markdown
## If we fix the top 5 + N+1s

Estimated impact on dashboard loads:

| Dashboard | Current cold LCP | Projected cold LCP | Current warm LCP | Projected warm LCP |
|---|---|---|---|---|
| /analyst | ... | ... | ... | ... |
| ...| ... | ... | ... | ... |

Caveat: projections assume only the top 5 + N+1s are fixed. Other queries continue at current speed.

## Verdict

<one paragraph: is the perf problem fixable in place, or does it require rebuild?>
```

- [ ] **Step 2: Update README**

Mark Track 2 complete. One-line summary in README: e.g., "Track 2 complete. Avg cold LCP 4.2s, projected fixable to 1.8s. Bottleneck = missing indexes + 1 N+1. No rebuild required for perf."

- [ ] **Step 3: User approval to commit**

Ask user: "Track 2 complete. OK to commit `track-2-perf-audit.md` + screenshots + queries.sql appends?"

If approved:
```bash
git add docs/superpowers/spike/2026-05-23/track-2-perf-audit.md docs/superpowers/spike/2026-05-23/perf/ docs/superpowers/spike/2026-05-23/queries.sql docs/superpowers/spike/2026-05-23/README.md
git commit -m "docs(spike): track 2 perf audit"
```

---

## Track 3 — Stack & architecture risk (~1 day)

**Mode:** Claude-autonomous.

### Task 3.1: Classify last 100 commits by root cause

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-3-stack-risk.md`

- [ ] **Step 1: Get the last 100 commit list with summaries**

Run:
```bash
git log --oneline -100 > /tmp/spike-commits.txt
```

- [ ] **Step 2: Identify the fix/hotfix subset**

Run:
```bash
git log --oneline -100 | grep -iE "^[a-f0-9]+ (fix|hotfix|revert|chore.*fix)" > /tmp/spike-fixes.txt
wc -l /tmp/spike-fixes.txt
```
Confirms the ~41 count from the initial audit.

- [ ] **Step 3: For each fix commit, classify root cause**

Build the classification by reading each commit. For each, run:
```bash
git show --stat <sha> | head -30
```

Categorize into ONE of:
- **NEXT16**: caused by Next 16 API/behavior (turbopack, async APIs, etc.)
- **REACT19**: caused by React 19 (server actions, use(), suspense behaviors)
- **TAILWIND4**: caused by Tailwind v4 (config, plugin, syntax)
- **SUPABASE**: caused by RPC bug, schema issue, RLS, migration
- **APP-LOGIC**: caused by app-side bug unrelated to stack
- **EXTERNAL-API**: caused by Meta/Acuity/OpenAI/Shopify change
- **BUILD/INFRA**: caused by Vercel, env, build pipeline
- **AMBIGUOUS**: cannot determine from commit alone

Use grep on the changed files + commit message to make the call. When ambiguous after a 30-second read, mark AMBIGUOUS — don't over-investigate.

- [ ] **Step 4: Write the classification table**

Append to `track-3-stack-risk.md`:
```markdown
## Last 100 commits — fix classification

Total fix commits: N (out of 100)

| Category | Count | % of fixes | % of all commits | Example shas |
|---|---|---|---|---|
| NEXT16 | ... | ... | ... | abc123, def456 |
| REACT19 | ... | ... | ... | ... |
| TAILWIND4 | ... | ... | ... | ... |
| SUPABASE | ... | ... | ... | ... |
| APP-LOGIC | ... | ... | ... | ... |
| EXTERNAL-API | ... | ... | ... | ... |
| BUILD/INFRA | ... | ... | ... | ... |
| AMBIGUOUS | ... | ... | ... | ... |

## Stack stability tax

Stack tax = (NEXT16 + REACT19 + TAILWIND4) / total fixes = X%

- <25% : not the main problem
- 25-50% : meaningful drag — downgrade is worth costing out
- \>50% : stack is the dominant source of breakage — downgrade strongly indicated
```

### Task 3.2: Estimate downgrade cost

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-3-stack-risk.md`

- [ ] **Step 1: Catalog stack-version-specific patterns**

Run these greps and append findings (file paths, not counts):

```bash
# React 19 / Next 16 server actions
grep -rn "'use server'" src/ | head -20

# Async params / async cookies (Next 15+)
grep -rn "await cookies\|await params\|await searchParams" src/ | head -20

# Tailwind v4 specific syntax
grep -rn "@theme\|@apply" src/app/globals.css 2>/dev/null
```

- [ ] **Step 2: Score migration cost per stack component**

In the doc:
```markdown
## Downgrade cost estimate

### Next 16 → Next 15 (stable)
- API surface differences hit: <list, e.g. "async cookies() — 12 callsites">
- Migration cost: trivial / moderate / heavy / requires-rewrite
- Estimated work: X person-days

### React 19 → React 18
- Features used that don't exist in 18: <list>
- Migration cost: ...
- Estimated work: ...

### Tailwind v4 → Tailwind v3
- v4-specific syntax used: <list>
- Migration cost: ...
- Estimated work: ...
```

### Task 3.3: Architectural smells beyond stack

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-3-stack-risk.md`

- [ ] **Step 1: Investigate the 28 placeholder migrations**

Run:
```bash
head -20 supabase/migrations/20260514050000_remote_schema_history_placeholder.sql
```

If these are auto-generated by `supabase db pull` capturing remote drift, that means the prod DB has been edited outside the migration files. Document this clearly — it's a significant smell because it means migrations aren't the single source of truth.

- [ ] **Step 2: RPC inventory**

Run:
```bash
grep -h "create or replace function\|CREATE OR REPLACE FUNCTION\|create function\|CREATE FUNCTION" supabase/migrations/*.sql | sort -u > /tmp/spike-rpcs.txt
wc -l /tmp/spike-rpcs.txt
```

Briefly classify each RPC into:
- **Aggregation** (rollup, sum, count over windows)
- **Lookup** (find-by-id, simple selects)
- **Mutation** (insert/update wrappers — relevant to write paths even though we're not auditing them)
- **Auth/access** (RLS helpers)

If aggregation RPCs dominate, it confirms business logic concentration in PL/pgSQL — a primary suspect for the "data is wrong" complaint and a key argument for the C rebuild scope.

- [ ] **Step 3: Mixed-pattern check**

Run:
```bash
echo "=== server actions ==="; grep -rln "'use server'" src/app src/lib | wc -l
echo "=== API routes ==="; find src/app/api -name "route.ts" | wc -l
```

If both patterns are heavily used for the same kind of work, document the inconsistency — it's a contributor factor for "things break when I add features."

- [ ] **Step 4: Document all smells**

Append to `track-3-stack-risk.md`:
```markdown
## Architectural smells (beyond stack version)

1. **Schema-as-code is broken.** 28 placeholder migrations indicate prod DB edits outside the migration system. Implication: rebuild scopes B and C must include a step to make migrations authoritative again.
2. **Business logic concentrated in SQL.** N of 61 RPCs are aggregation logic that could equivalently live in TypeScript. Implication: <...>
3. **Mixed server-action / API-route patterns.** <findings>
4. ...
```

### Task 3.4: Track 3 verdict and commit

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/track-3-stack-risk.md`
- Modify: `docs/superpowers/spike/2026-05-23/README.md`

- [ ] **Step 1: Write the verdict**

```markdown
## Verdict

Stack stability tax: X% → <interpretation>
Downgrade recommendation: <stay bleeding-edge | downgrade selectively | downgrade fully>
Top non-stack smell: <one sentence>
```

- [ ] **Step 2: Update README**

Mark Track 3 complete with a one-line summary.

- [ ] **Step 3: User approval to commit**

Same pattern as Track 1/2.

---

## Synthesis (~1 day)

### Task S.1: Build the decision matrix

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/recommendation.md`

- [ ] **Step 1: Re-read all three track outputs**

Use Read tool on `track-1-reconciliation.md`, `track-1-rotten-rpcs.md`, `track-2-perf-audit.md`, `track-3-stack-risk.md`. Note the headline numbers from each.

- [ ] **Step 2: Write the matrix**

In `recommendation.md`:
```markdown
# Rebuild recommendation

Spike outputs:
- [Track 1 reconciliation](track-1-reconciliation.md)
- [Track 1 rotten RPCs](track-1-rotten-rpcs.md)
- [Track 2 perf audit](track-2-perf-audit.md)
- [Track 3 stack risk](track-3-stack-risk.md)

## Decision matrix

| Concern | Finding | Implication |
|---|---|---|
| Data accuracy | N red, M yellow, P green discrepancies across 12+ metrics | <...> |
| Performance | Cold LCP avg X, fixable to Y by addressing top 5 queries | <...> |
| Stack stability | Stack tax = Z%. Downgrade cost = D | <...> |
| Schema-as-code | <broken/fine> | <...> |
| Logic in SQL | N aggregation RPCs | <...> |
```

### Task S.2: Apply decision rules and write the recommendation

**Files:**
- Modify: `docs/superpowers/spike/2026-05-23/recommendation.md`

- [ ] **Step 1: Apply rules from spec §Synthesis**

Per the spec:
- If Track 1 finds ≥1 red discrepancy caused by "wrong schema or fundamentally broken model" → B or A
- If Track 1 reds all caused by RPCs/rollup logic, not schema → C
- If Track 1 only green/yellow AND Track 2 shows perf is fixable → D
- Track 3's stack tax modifies any answer (if >25%, include stack downgrade in scope)

Pick A, B, C, or D.

**Confirmation-bias guard (per spec):** if Track 1 returns all-green and Track 2 shows perf is fixable, you MUST recommend D regardless of user's prior leaning toward rebuild. Write the reasoning even if it contradicts the user's gut.

- [ ] **Step 2: Write the recommendation**

```markdown
## Recommendation: <A | B | C | D>

### Reasoning
<3-5 sentences, citing specific findings>

### Estimated cost
<weeks of work>

### Scope (specific)
<if C: which RPCs/dashboards/components to rebuild, in what order>
<if B: what to rebuild, what to keep from the existing app>
<if A: high-level only — will need its own brainstorming session>
<if D: which 3-5 specific fixes to do first>

### Known risks
- <...>

### What would change my answer
- If <X> turned out to be <Y>, the recommendation would shift to <Z>
```

- [ ] **Step 3: Mark synthesis complete in README**

```markdown
| Synthesis | complete | Claude + user review | recommendation.md |
```

Add a one-line tldr: "RECOMMENDATION: <option>. <one sentence why>."

### Task S.3: User review of the recommendation

- [ ] **Step 1: Present the recommendation to the user**

Send a message summarizing:
- The recommendation (A/B/C/D)
- The top 3 findings that drove it
- The estimated cost
- Link to the full report

Ask: "Does this match your read? Anything in the data that should shift the recommendation? Anything to dig into deeper before we move forward?"

- [ ] **Step 2: If user requests changes**

- If they want a different recommendation, work through which evidence they're weighting differently and either update the report or document the disagreement as an explicit "user chose <option> over recommended <option> because <reason>" section.
- If they want more investigation in a specific area, scope it as a follow-up mini-spike — don't blow the budget extending this one.

- [ ] **Step 3: User approval to commit**

Ask: "Spike complete. OK to commit `recommendation.md` + the final `README.md` update?"

If approved, commit. If the user is ready to also open this as a PR for review, ask explicitly before running `gh pr create`.

---

## Hand-off

After synthesis is approved by the user, the next step depends on the recommendation:

| Recommendation | Next skill | Next plan path |
|---|---|---|
| D — stabilize | `superpowers:writing-plans` | `docs/superpowers/plans/2026-05-XX-stabilization.md` |
| C — targeted rebuild | `superpowers:writing-plans` | `docs/superpowers/plans/2026-05-XX-data-layer-rebuild.md` |
| B — full app rebuild | `superpowers:brainstorming` first (it's a much bigger spec) | n/a until brainstorm complete |
| A — full + new DB | `superpowers:brainstorming` first (stack selection, migration, cutover need their own design) | n/a until brainstorm complete |

The spike's outputs (`track-1-rotten-rpcs.md` especially) feed directly into the next plan as input.
