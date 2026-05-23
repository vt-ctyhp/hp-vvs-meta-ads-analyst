# Track 3 — Stack and architecture risk

_Completed: 2026-05-23 16:15 PDT_

## Last 100 commits — fix classification

Of the last 100 commits, **39** carry `fix(...)`, `Fix `, or `Address ... review` prefixes (the latter being review-feedback rework — counted because the original change shipped buggy). Reverts: 0. Hotfix-tag commits: 0.

Each commit was assigned a single primary root-cause category after reading subject + body + stat (and the diff when ambiguous).

| Category | Count | % of fixes | % of all 100 | Example SHAs |
|---|---|---|---|---|
| APP-LOGIC | 31 | 79% | 31% | `e0268fc` (funnel attribution rule), `c1b0b81` (CTR units bug), `90c750e` (KPI aggregation bug), `52f32ce` (column overflow) |
| SUPABASE | 5 | 13% | 5% | `9920f98` (env-scope migration to stop spend duplication), `e0d9246` (KPI action resolution in same migration), `c93ccb7` (RLS rollout for visitor geo), `3724f11` (statement_timeout / fan-out control), `758244a` (1000-row default cap hiding events + env-scope reads) |
| EXTERNAL-API | 3 | 8% | 3% | `56d3ec2` (Meta CDN thumbnail URL expiry), `d28a766` (durable thumbnail caching of Meta images), `199a2e1` (combined thumbnail + label fix) |
| NEXT16 | 0 | 0% | 0% | — |
| REACT19 | 0 | 0% | 0% | — |
| TAILWIND4 | 0 | 0% | 0% | — |
| BUILD/INFRA | 0 | 0% | 0% | (the one stack-touching commit, `18e32f6` "widen turbopack root", is a chore, not a fix; it would have been NEXT16) |
| AMBIGUOUS | 0 | 0% | 0% | — |

Notes on borderline calls:
- `3b7049a` "Fix top navigation hook order" looks like it could be a React-19 strict-mode artifact but is a textbook Rules-of-Hooks violation (early `return null` before `useEffect`). The rule has existed since React 16.8; this is APP-LOGIC.
- `1fdfd6b` "show loading state during navigation" adds a Next App-Router `loading.tsx`. It's a missing-feature add, not a regression caused by Next 16. APP-LOGIC.
- The 5 Ask-AI / dashboard timeout & concurrency fixes (`3724f11`, `c2719a2`, `87119f4`, `a369458`) all stem from Supabase statement_timeout pressure and OpenAI response shaping, not the framework version.

## Stack stability tax

Stack tax = (NEXT16 + REACT19 + TAILWIND4) / total fixes = **0 / 39 = 0%**.

Interpretation: **the bleeding-edge stack is not what's burning the team.** Zero of 39 recent fixes are attributable to Next 16, React 19, or Tailwind v4 specifics. The firefighting is concentrated in (1) attribution/funnel domain logic and (2) Supabase environment scoping & query limits. A rewrite that swaps frameworks would carry the same fire forward.

## Downgrade cost estimate

### Next 16 → Next 15 (stable)
- API surface differences hit:
  - Async `searchParams` / `params` / `cookies()` — used in 11 places (e.g. `src/app/(workspace)/analyst/page.tsx:16`, `src/app/(workspace)/convert/page.tsx:52`, `src/lib/server-route-auth.ts:18`). All would need to be unwrapped back to sync, except these patterns are also supported in 15 (introduced in 15, made required in 16). Mostly a no-op.
  - Turbopack: `next.config.ts` has `turbopack: { root: ... }` (`next.config.ts:24`) added because turbopack is the 16 default. Reverting to webpack just means deleting that block — 5 minutes.
  - `revalidateTag(tag, { expire: 0 })` form used in `src/app/api/sync/route.ts:27`. Need to confirm 15 signature.
  - No use of `unstable_after`, partial prerendering, or other 16-only APIs found.
- No server actions (`grep -rln "'use server'" src/` returns 0), no React 19-only hooks. So no Next-15-incompatible runtime patterns.
- Migration cost: **trivial**.
- Estimated work: **0.5–1 person-day** including a CI re-green pass.

### React 19 → React 18
- `grep -rn "useFormState\|useFormStatus\|useOptimistic\|useActionState"` returns **0**.
- `grep` for `use(` (the new `use` hook) — none in app code.
- No server actions (no `'use server'`) → no `useActionState` story.
- 40 `"use client"` files; nothing 19-specific in the ones inspected.
- The single "hook order" fix (`3b7049a`) is pre-19 in nature.
- Migration cost: **trivial**.
- Estimated work: **0.5 person-day** (bump `react`/`react-dom`/`@types/react` to 18.3.x, retest).

### Tailwind v4 → Tailwind v3
- v4-specific syntax in `src/app/globals.css`: `@import "tailwindcss";` and `@theme inline { ... }` block (~22 design tokens). No `@apply` usage anywhere in the file. No v4 plugins.
- PostCSS uses the v4 plugin `@tailwindcss/postcss`. No `tailwind.config.{ts,js}` exists — config is purely in CSS via `@theme`.
- Downgrade requires: (a) re-add `tailwind.config.ts` translating `@theme` tokens to `theme.extend.colors`/`fontFamily`; (b) switch PostCSS back to `tailwindcss` + `autoprefixer`; (c) change `@import "tailwindcss";` to the v3 `@tailwind base/components/utilities;` triplet. ~22 tokens to port — mechanical.
- Migration cost: **moderate** (mostly because every component uses the `hp-*` color classes derived from `@theme`).
- Estimated work: **1–2 person-days**.

**Combined full-downgrade estimate: ~3–4 person-days.** This is small enough that "stay bleeding-edge" is not a defensible reason to fear a downgrade — but the data shows there's also no firefighting reason _to_ downgrade.

## Architectural smells (beyond stack version)

### 1. Schema-as-code status — partially broken
- `supabase/migrations/` contains **92 files; 28 are `*_remote_schema_history_placeholder.sql`** stub files (numbered `0107` through `0134`).
- Content of each placeholder, in full: `-- Placeholder for a migration version already marked as applied in the linked Supabase project before this worktree was created.`
- Translation: **30% of the migration history is empty stubs because real schema changes were made directly against the Supabase project and never round-tripped into source.** The CLI now requires these no-op files just to satisfy version ordering. Anything between `0106` and `0135` is unrecoverable from this repo — you'd need to dump from the live DB.
- This is a meaningful smell. Any rebuild would need to first reconstruct the actual schema from prod, not from `migrations/`.

### 2. RPC concentration — heavy on imports, light on aggregation
Unique function definitions across `supabase/migrations/*.sql`: **41** (the "61" count in the brief reflects duplicate `create or replace` statements as functions evolved; 4 functions are redefined 3–4 times each, mostly `aggregate_meta_daily_insights`, `claim_meta_ads_backfill_chunks`, `anonymize_expired_website_attribution`).

| Category | Count | Examples |
|---|---|---|
| Mutation / read-model import | 19 | `apply_{appointment,customer,diamond,payment}_read_model_import`, `preview_*_import`, `repair_customer_read_model_owner_assignments`, `enqueue_task_gen`, `anonymize_expired_website_attribution`, `execute_test_customer_purge` |
| Auth / access | 9 | `can_read_root`, `can_write_root`, `current_user_has_role`, `current_user_is_admin`, `custom_access_token_hook` |
| Lookup / utility / trigger glue | 8 | `next_customer_code`, `next_doc_number`, `set_updated_at`, `bump_updated_at_and_version`, `prevent_update_delete`, 3 `pg_temp` DDL helpers |
| Aggregation | 5 | `aggregate_meta_daily_insights`, `meta_ads_history_coverage`, `claim_meta_ads_backfill_chunks`, `analytics.ads_analyst_environment_matches`, `analytics.current_ads_analyst_environment` |

The app only calls **3 RPCs** directly (`grep -rEn '\.rpc\(' src/`): `aggregate_meta_daily_insights`, `claim_meta_ads_backfill_chunks`, `meta_ads_history_coverage`. The other 38 functions execute via triggers, RLS policies, or the read-model import flow.

Aggregation does **not** dominate (5/41 = 12%) — but the single function `aggregate_meta_daily_insights` is the load-bearing one. `supabase/migrations/20260522120000_aggregate_meta_insights_environment_scope.sql` is **471 lines of PL/pgSQL** redefining it, and that file has been re-issued at least twice in the last week (`9920f98`, `e0d9246`). That's the rotten core that Track 1 should isolate — most of the SUPABASE-tagged fix commits orbit this one function or its environment-scoping bug.

The read-model import surface (19 functions for appointment/customer/diamond/payment CSV ingest) is large for an "AI ads analyst" — it's CRM/POS infrastructure leaking in. Worth checking whether any of it is still used or is dead code from a prior product direction.

### 3. Mixed server-action vs API-route patterns — coherent, by absence
- `'use server'` files: **0**
- `src/app/api/**/route.ts` files: **32**

There is no mixing. Every mutation goes through an API route. Server actions are not used at all, despite being a Next 14+ feature. This is actually a **strength** for a downgrade path (the React 19 / Next 16 form-action story is the part most likely to break on downgrade) but is also a smell of its own: the team is leaving the App Router's primary mutation primitive on the table, which means more client-side `fetch` plumbing than necessary (`grep -rE "fetch\(['\"]\\/api\\/" src/` = 26 hits).

Route shape is consistent: every route I sampled (`/api/sync`, `/api/analysis`) starts with `requirePermissionFromRequest`, exports `runtime = "nodejs"`, `dynamic = "force-dynamic"`, and an explicit `maxDuration`. That convention is being followed everywhere I checked.

### 4. (Bonus) Worktree friction baked into the build
`next.config.ts:8–23` contains a `findWorkspaceRoot` walker added in `18e32f6` because turbopack rejects symlinks escaping its root and worktrees don't have their own `node_modules`. The team is patching framework defaults to make their git-worktree workflow survive. Minor — but indicative of dev-loop friction.

## Verdict

Stack stability tax: **0% → the bleeding-edge stack is exonerated.** No fix in the last 100 commits traces to Next 16, React 19, or Tailwind v4 specifics.

Downgrade recommendation: **stay on the current stack.** A full downgrade is cheap (~3–4 person-days) but would buy nothing — the fires are in domain logic and Supabase scoping, not in the framework. If anything, the codebase is conservatively using the stack: no server actions, no `use()`, no v4 plugin gymnastics — it would survive a downgrade easily but doesn't need one.

Top non-stack smell: **the schema is being edited outside the migration system** (28 of 92 migrations are empty placeholders for changes made directly against the live Supabase project). Any rebuild must start by reconstructing the real schema from production, not from this repo. The second-biggest smell is the 471-line `aggregate_meta_daily_insights` PL/pgSQL function that has been re-issued multiple times in the last week and is the source of most SUPABASE-tagged fix commits — that's the load-bearing rotten beam Track 1 should target.
