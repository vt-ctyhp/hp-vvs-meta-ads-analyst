import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extname, join, relative } from "node:path";
import { describe, it } from "node:test";

import {
  adsAnalystOnConflict,
  getAdsAnalystEnvironment,
  withAdsAnalystEnvironment,
  withAdsAnalystEnvironmentRows,
  usesEnvironmentScopedAdsAnalystUpserts,
  usesLimitedAdsAnalystDbAccess,
} from "../src/lib/ads-analyst-db.ts";
import { getMissingRequiredEnv } from "../src/lib/env.ts";
import { getDataBoundaryRuntimeStatus } from "../src/lib/runtime-guardrails.ts";
import {
  ADS_ANALYST_ENVIRONMENTS,
  ANALYST_ENVIRONMENT_SCOPED_TABLES,
  ANALYST_OWNED_TABLES,
  DEFAULT_ADS_ANALYST_ENVIRONMENT,
  SALES_ERP_CORE_TABLES,
  SHARED_REFERENCE_TABLES,
} from "../src/lib/data-boundaries.ts";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const SOURCE_ROOT = join(REPO_ROOT, "src");
const PHASE_2_MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260519090000_ads_analyst_data_boundary.sql",
);
const PHASE_3_MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260519093000_ads_analyst_environment_scope.sql",
);
const PHASE_4_MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260519100000_ads_analyst_environment_aware_runtime.sql",
);
const PHASE_5_MIGRATION = join(
  REPO_ROOT,
  "supabase/migrations/20260519103000_ads_analyst_environment_scoped_unique_keys.sql",
);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx"]);
const SKIPPED_SOURCE_FILES = new Set(["src/lib/database.types.ts"]);
const MUTATION_METHOD_PATTERN = String.raw`\.(?:insert|upsert|update|delete)\s*\(`;

describe("data boundary registry", () => {
  it("does not assign any table to multiple ownership groups", () => {
    const groups = [
      ["Sales/ERP Core", SALES_ERP_CORE_TABLES],
      ["Ads Analyst", ANALYST_OWNED_TABLES],
      ["Shared Reference", SHARED_REFERENCE_TABLES],
    ] as const;
    const ownersByTable = new Map<string, string[]>();

    for (const [owner, tables] of groups) {
      for (const table of tables) {
        ownersByTable.set(table, [...(ownersByTable.get(table) || []), owner]);
      }
    }

    const overlaps = [...ownersByTable.entries()]
      .filter(([, owners]) => owners.length > 1)
      .map(([table, owners]) => `${table}: ${owners.join(", ")}`);

    assert.deepEqual(overlaps, []);
  });

  it("scopes every analyst-owned table by deployment environment", () => {
    assert.deepEqual(ADS_ANALYST_ENVIRONMENTS, ["production", "staging"]);
    assert.equal(DEFAULT_ADS_ANALYST_ENVIRONMENT, "production");
    assert.deepEqual(ANALYST_ENVIRONMENT_SCOPED_TABLES, ANALYST_OWNED_TABLES);
  });
});

describe("Ads Analyst environment helpers", () => {
  it("keeps legacy payloads unchanged until environment-scoped access is enabled", () => {
    withEnv(
      {
        ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS: undefined,
        ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS: undefined,
      },
      () => {
        assert.equal(usesLimitedAdsAnalystDbAccess(), false);
        assert.equal(usesEnvironmentScopedAdsAnalystUpserts(), false);
        assert.deepEqual(withAdsAnalystEnvironment({ code: "HP" }), { code: "HP" });
      },
    );
  });

  it("adds deployment environment to limited-mode write payloads", () => {
    withEnv(
      {
        ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS: "true",
        ADS_ANALYST_ENVIRONMENT: "staging",
      },
      () => {
        assert.equal(usesLimitedAdsAnalystDbAccess(), true);
        assert.equal(getAdsAnalystEnvironment(), "staging");
        assert.deepEqual(withAdsAnalystEnvironment({ code: "HP" }), {
          code: "HP",
          environment: "staging",
        });
        assert.deepEqual(withAdsAnalystEnvironmentRows([{ code: "HP" }, { code: "VVS" }]), [
          { code: "HP", environment: "staging" },
          { code: "VVS", environment: "staging" },
        ]);
      },
    );
  });

  it("adds deployment environment when environment-scoped upserts are enabled", () => {
    withEnv(
      {
        ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS: undefined,
        ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS: "true",
        ADS_ANALYST_ENVIRONMENT: "staging",
      },
      () => {
        assert.equal(usesLimitedAdsAnalystDbAccess(), false);
        assert.equal(usesEnvironmentScopedAdsAnalystUpserts(), true);
        assert.deepEqual(withAdsAnalystEnvironment({ code: "HP" }), {
          code: "HP",
          environment: "staging",
        });
      },
    );
  });

  it("keeps legacy conflict keys until environment-scoped unique constraints are active", () => {
    withEnv({ ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS: undefined }, () => {
      assert.equal(adsAnalystOnConflict("meta_account_id,ad_id"), "meta_account_id,ad_id");
    });

    withEnv({ ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS: "true" }, () => {
      assert.equal(
        adsAnalystOnConflict("meta_account_id,ad_id"),
        "environment,meta_account_id,ad_id",
      );
    });
  });

  it("accepts role-scoped Supabase secret keys instead of manually minted JWTs", () => {
    withEnv(
      {
        ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS: "true",
        ADS_ANALYST_ENVIRONMENT: "staging",
        SUPABASE_ADS_ANALYST_WEB_KEY: "sb_secret_web",
        SUPABASE_ADS_ANALYST_WORKER_KEY: "sb_secret_worker",
        SUPABASE_ADS_ANALYST_INGEST_KEY: "sb_secret_ingest",
        SUPABASE_ADS_ANALYST_WEB_JWT: undefined,
        SUPABASE_ADS_ANALYST_WORKER_JWT: undefined,
        SUPABASE_ADS_ANALYST_INGEST_JWT: undefined,
        SUPABASE_SERVICE_ROLE_KEY: undefined,
      },
      () => {
        assert.deepEqual(
          getMissingRequiredEnv([
            "SUPABASE_ADS_ANALYST_WEB_KEY",
            "SUPABASE_ADS_ANALYST_WORKER_KEY",
            "SUPABASE_ADS_ANALYST_INGEST_KEY",
            "SUPABASE_ADS_ANALYST_WEB_JWT",
            "SUPABASE_ADS_ANALYST_WORKER_JWT",
            "SUPABASE_ADS_ANALYST_INGEST_JWT",
          ]),
          [],
        );

        const status = getDataBoundaryRuntimeStatus();
        assert.equal(status.ok, true);
        assert.equal(status.mode, "limited_module_role");
        assert.deepEqual(status.moduleCredentialsConfigured, {
          web: true,
          worker: true,
          ingest: true,
        });
        assert.deepEqual(status.moduleCredentialSources, {
          web: "key",
          worker: "key",
          ingest: "key",
        });
      },
    );
  });
});

describe("Ads Analyst source data boundary", () => {
  it("does not mutate Sales/ERP Core tables", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(SOURCE_ROOT)) {
      const rel = relative(REPO_ROOT, file);
      if (SKIPPED_SOURCE_FILES.has(rel)) continue;

      const source = readFileSync(file, "utf8");
      for (const table of SALES_ERP_CORE_TABLES) {
        const pattern = new RegExp(
          String.raw`\.from\s*\(\s*["'\`]${escapeRegExp(table)}["'\`]\s*\)[\s\S]{0,500}${MUTATION_METHOD_PATTERN}`,
          "m",
        );
        if (pattern.test(source)) {
          violations.push(`${rel} mutates Sales/ERP Core table "${table}"`);
        }
      }
    }

    assert.deepEqual(violations, []);
  });
});

describe("Phase 2 data-boundary migration", () => {
  const migration = readFileSync(PHASE_2_MIGRATION, "utf8");

  it("creates constrained Ads Analyst module roles and grants them to authenticator", () => {
    for (const role of ["ads_analyst_web", "ads_analyst_worker", "ads_analyst_ingest"]) {
      assert.match(migration, new RegExp(`create role ${role} nologin noinherit nobypassrls`));
      assert.match(migration, new RegExp(`grant ${role} to authenticator`));
    }
  });

  it("does not grant Sales/ERP Core table write privileges to Ads Analyst roles", () => {
    const violations: string[] = [];

    for (const table of SALES_ERP_CORE_TABLES) {
      const pattern = new RegExp(
        String.raw`grant\s+[^;]*(?:insert|update|delete)[^;]*on\s+table\s+[^;]*public\.${escapeRegExp(
          table,
        )}[^;]*to\s+[^;]*ads_analyst_`,
        "i",
      );
      if (pattern.test(migration)) {
        violations.push(`migration grants Sales/ERP write access on "${table}"`);
      }
    }

    assert.deepEqual(violations, []);
  });

  it("explicitly revokes Ads Analyst privileges from each Sales/ERP Core table", () => {
    const missing = SALES_ERP_CORE_TABLES.filter((table) => !migration.includes(`'${table}'`));
    assert.deepEqual(missing, []);
  });

  it("exposes only narrow read-only views for Sales appointments and identity", () => {
    const appointmentView = migration.slice(
      migration.indexOf("create view analytics.sales_appointment_conversions_v1"),
      migration.indexOf("comment on view analytics.sales_appointment_conversions_v1"),
    );

    assert.match(migration, /create schema if not exists analytics/);
    assert.match(migration, /create view analytics\.sales_appointment_conversions_v1/);
    assert.match(migration, /create view analytics\.ads_analyst_identity_profiles_v1/);
    assert.doesNotMatch(appointmentView, /raw_payload\s+as/i);
    assert.doesNotMatch(appointmentView, /\bcustomer_(?:name|email|phone)\b/i);
    assert.doesNotMatch(appointmentView, /\bpayment_/i);
  });
});

describe("Phase 3 environment-boundary migration", () => {
  const migration = readFileSync(PHASE_3_MIGRATION, "utf8");

  it("adds environment scope to every analyst-owned table", () => {
    assert.match(migration, /create or replace function analytics\.current_ads_analyst_environment\(\)/);
    assert.match(migration, /create or replace function analytics\.ads_analyst_environment_matches/);
    assert.match(migration, /add column if not exists environment text not null default/);

    const missing = ANALYST_ENVIRONMENT_SCOPED_TABLES.filter(
      (table) => !migration.includes(`'${table}'`),
    );
    assert.deepEqual(missing, []);
  });

  it("keeps Phase 3 schema-only with no application data mutation", () => {
    assert.doesNotMatch(migration, /\binsert\s+into\b/i);
    assert.doesNotMatch(migration, /\bupdate\s+public\./i);
    assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
    assert.doesNotMatch(migration, /\btruncate\s+table\b/i);
    assert.doesNotMatch(migration, /\bdrop\s+table\b/i);
  });

  it("does not swap legacy unique constraints before application upserts are environment-aware", () => {
    assert.doesNotMatch(migration, /\bdrop\s+constraint\b/i);
    assert.doesNotMatch(migration, /\bdrop\s+index\b/i);
    assert.match(migration, /does not replace legacy natural-key unique constraints/i);
  });

  it("replaces broad module RLS checks with environment-matching checks", () => {
    assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)/i);
    assert.doesNotMatch(migration, /with\s+check\s*\(\s*true\s*\)/i);
    assert.match(migration, /using \(analytics\.ads_analyst_environment_matches\(environment\)\)/);
    assert.match(migration, /with check \(analytics\.ads_analyst_environment_matches\(environment\)\)/);
  });

  it("does not introduce Sales/ERP Core table references", () => {
    const referencedSalesTables = SALES_ERP_CORE_TABLES.filter((table) =>
      migration.includes(`'${table}'`),
    );
    assert.deepEqual(referencedSalesTables, []);
  });
});

describe("Phase 4 environment-aware runtime migration", () => {
  const migration = readFileSync(PHASE_4_MIGRATION, "utf8");

  it("keeps security-definer backfill claims inside the caller environment", () => {
    const claimFunction = migration.slice(
      migration.indexOf("create or replace function public.claim_meta_ads_backfill_chunks"),
      migration.indexOf("comment on function public.claim_meta_ads_backfill_chunks"),
    );

    assert.match(claimFunction, /security definer/i);
    assert.match(claimFunction, /analytics\.current_ads_analyst_environment\(\)/);
    assert.match(claimFunction, /c\.environment = current_environment/);
    assert.match(claimFunction, /j\.environment = current_environment/);
  });

  it("makes history coverage environment-aware", () => {
    const coverageFunction = migration.slice(
      migration.indexOf("create or replace function public.meta_ads_history_coverage"),
      migration.indexOf("comment on function public.meta_ads_history_coverage"),
    );

    assert.match(coverageFunction, /analytics\.current_ads_analyst_environment\(\)/);
    assert.match(coverageFunction, /a\.environment = r\.environment/);
    assert.match(coverageFunction, /i\.environment = r\.environment/);
  });

  it("does not alter Sales/ERP Core tables or directly rewrite application data", () => {
    assert.doesNotMatch(migration, /\binsert\s+into\b/i);
    assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
    assert.doesNotMatch(migration, /\btruncate\s+table\b/i);
    assert.doesNotMatch(migration, /\bdrop\s+table\b/i);

    const referencedSalesTables = SALES_ERP_CORE_TABLES.filter((table) =>
      migration.includes(`'${table}'`),
    );
    assert.deepEqual(referencedSalesTables, []);
  });
});

describe("Phase 5 environment-scoped unique-key migration", () => {
  const migration = readFileSync(PHASE_5_MIGRATION, "utf8");

  const environmentScopedKeys = [
    ["public.brands", ["environment", "code"]],
    ["public.meta_ad_accounts", ["environment", "meta_account_id"]],
    ["public.meta_campaigns", ["environment", "meta_account_id", "campaign_id"]],
    ["public.meta_ad_sets", ["environment", "meta_account_id", "ad_set_id"]],
    ["public.meta_creatives", ["environment", "meta_account_id", "creative_id"]],
    ["public.meta_ads", ["environment", "meta_account_id", "ad_id"]],
    ["public.meta_daily_insights", ["environment", "meta_account_id", "ad_id", "date_start"]],
    [
      "public.campaign_umbrella_overrides",
      ["environment", "meta_account_id", "entity_type", "entity_id"],
    ],
    ["public.meta_social_pages", ["environment", "page_id"]],
    ["public.meta_social_threads", ["environment", "platform", "thread_id"]],
    ["public.meta_social_messages", ["environment", "platform", "message_id"]],
    ["public.meta_social_comments", ["environment", "platform", "comment_id"]],
    ["public.social_thread_summaries", ["environment", "platform", "thread_id"]],
    ["public.brand_voice_guidelines", ["environment", "brand", "language", "version"]],
    ["public.website_sessions", ["environment", "session_id"]],
    ["public.website_events", ["environment", "event_id"]],
  ] as const;

  it("adds environment to every natural-key uniqueness scope that blocks staging duplicates", () => {
    for (const [table, columns] of environmentScopedKeys) {
      assert.match(migration, new RegExp(`'${escapeRegExp(table)}'::regclass`));
      assert.match(migration, new RegExp(`array\\[${columns.map((column) => `'${column}'`).join(", ")}\\]`));
    }

    assert.match(migration, /brand_voice_guidelines_environment_active_idx/);
    assert.match(migration, /environment, brand, language/);
  });

  it("drops old natural-key constraints only after defining environment-scoped replacements", () => {
    const firstAdd = migration.indexOf("add_unique_constraint_if_missing");
    const firstDrop = migration.indexOf("drop_unique_constraints_by_columns");

    assert.notEqual(firstAdd, -1);
    assert.notEqual(firstDrop, -1);
    assert.ok(firstAdd < firstDrop);
    assert.match(migration, /drop index if exists public\.brand_voice_guidelines_active_idx/i);
  });

  it("does not directly rewrite application data or touch Sales/ERP Core tables", () => {
    assert.doesNotMatch(migration, /\binsert\s+into\b/i);
    assert.doesNotMatch(migration, /\bupdate\s+public\./i);
    assert.doesNotMatch(migration, /\bdelete\s+from\b/i);
    assert.doesNotMatch(migration, /\btruncate\s+table\b/i);
    assert.doesNotMatch(migration, /\bdrop\s+table\b/i);

    const referencedSalesTables = SALES_ERP_CORE_TABLES.filter((table) =>
      migration.includes(`'${table}'`),
    );
    assert.deepEqual(referencedSalesTables, []);
  });
});

function sourceFiles(dir: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }

    if (SOURCE_EXTENSIONS.has(extname(path))) files.push(path);
  }

  return files;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function withEnv(overrides: Record<string, string | undefined>, callback: () => void) {
  const original = new Map(Object.keys(overrides).map((key) => [key, process.env[key]]));

  try {
    for (const [key, value] of Object.entries(overrides)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    callback();
  } finally {
    for (const [key, value] of original) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
