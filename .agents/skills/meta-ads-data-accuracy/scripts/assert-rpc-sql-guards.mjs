#!/usr/bin/env node

import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const HELP = `Usage:
  node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs [--root .] [--sql path] [--out path]
  node .agents/skills/meta-ads-data-accuracy/scripts/assert-rpc-sql-guards.mjs --self-test

Checks the latest aggregate_meta_daily_insights SQL for guards that prevent
environment join overmultiplication and action-alias overcounting.
`;

const CHECKS = [
  {
    id: "insights_environment_filter",
    description: "Filters meta_daily_insights by runtime environment",
    test: (sql) => /where\s+i\.environment\s*=\s*r\.environment/i.test(sql),
  },
  {
    id: "brands_environment_join",
    description: "Brands join includes environment predicate",
    test: (sql) =>
      /left\s+join\s+public\.brands\s+b[\s\S]{0,300}b\.environment\s*=\s*r\.environment/i.test(sql),
  },
  {
    id: "campaigns_environment_join",
    description: "Campaign join includes environment predicate",
    test: (sql) =>
      /left\s+join\s+public\.meta_campaigns\s+c[\s\S]{0,450}c\.environment\s*=\s*r\.environment/i.test(sql),
  },
  {
    id: "ad_sets_environment_join",
    description: "Ad-set join includes environment predicate",
    test: (sql) =>
      /left\s+join\s+public\.meta_ad_sets\s+s[\s\S]{0,450}s\.environment\s*=\s*r\.environment/i.test(sql),
  },
  {
    id: "ads_environment_join",
    description: "Ad join includes environment predicate",
    test: (sql) =>
      /left\s+join\s+public\.meta_ads\s+a[\s\S]{0,450}a\.environment\s*=\s*r\.environment/i.test(sql),
  },
  {
    id: "booking_alias_priority",
    description: "Booking action aliases use coalesce priority",
    test: (sql) => /coalesce\([\s\S]{0,3500}\)\s+as\s+website_bookings_raw/i.test(sql),
  },
  {
    id: "messaging_alias_priority",
    description: "Messaging action aliases use coalesce priority",
    test: (sql) => /coalesce\([\s\S]{0,2500}\)\s+as\s+messaging_contacts_raw/i.test(sql),
  },
  {
    id: "lead_alias_priority",
    description: "Lead action aliases use coalesce priority",
    test: (sql) => /coalesce\([\s\S]{0,3500}\)\s+as\s+leads_raw/i.test(sql),
  },
  {
    id: "source_rows_exposed",
    description: "RPC exposes source_rows for reconciliation",
    test: (sql) => /\bsource_rows\s+bigint\b/i.test(sql) && /count\(\*\)::bigint\s+as\s+source_rows/i.test(sql),
  },
  {
    id: "monthly_budget_uses_end_month",
    description: "monthly_budget monthlyizes with days in the p_end month",
    test: (sql) => /date_trunc\('month',\s*p_end\)/i.test(sql),
  },
  {
    id: "monthly_budget_counts_budget_entity_once",
    description: "monthly_budget ranks each budget entity once per result group, not once per calendar month",
    test: (sql) =>
      /partition\s+by[\s\S]{0,900}(?:\w+\.)?meta_account_id,\s*(?:(?:\w+\.)?ad_set_id|(?:\w+\.)?daily_budget_entity_key)\s+order\s+by\s+case\s+when\s+(?:\w+\.)?delivery_status\s*=\s*'live'\s+then\s+0\s+else\s+1\s+end,\s*(?:\w+\.)?date_start\s+asc/i.test(sql),
  },
  {
    id: "monthly_budget_live_only",
    description: "monthly_budget counts only live ad sets",
    test: (sql) =>
      /case\s+when\s+(?:\w+\.)?(?:budget_rank|monthly_budget_rank)\s*=\s*1\s+and\s+(?:\w+\.)?delivery_status\s*=\s*'live'\s+and\s+(?:\w+\.)?daily_budget\s*>\s*0[\s\S]{0,180}(?:\w+\.)?daily_budget\s*\*\s*(?:\w+\.)?days_in_month/i.test(sql),
  },
];

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.selfTest) {
    runSelfTest();
    return;
  }

  const sqlPath = args.sql || (await findLatestAggregateSql(args.root));
  const sql = await readFile(sqlPath, "utf8");
  const result = runChecks(sql, sqlPath);
  const report = renderReport(result);

  if (args.out) {
    await writeFile(args.out, report);
  }

  process.stdout.write(report);
  if (result.failures.length) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = { root: process.cwd(), sql: "", out: "", help: false, selfTest: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const [key, inlineValue] = arg.split("=", 2);
    const nextValue = () => inlineValue ?? argv[++index];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (key === "--root") args.root = nextValue();
    else if (key === "--sql") args.sql = nextValue();
    else if (key === "--out") args.out = nextValue();
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function findLatestAggregateSql(root) {
  const migrationsDir = join(root, "supabase", "migrations");
  const entries = await readdir(migrationsDir);
  const sqlFiles = entries.filter((entry) => entry.endsWith(".sql")).sort();
  const matches = [];

  for (const file of sqlFiles) {
    const fullPath = join(migrationsDir, file);
    const fileStat = await stat(fullPath);
    if (!fileStat.isFile()) continue;
    const text = await readFile(fullPath, "utf8");
    if (/create\s+or\s+replace\s+function\s+public\.aggregate_meta_daily_insights/i.test(text)) {
      matches.push(fullPath);
    }
  }

  if (!matches.length) {
    throw new Error(`No aggregate_meta_daily_insights migration found under ${migrationsDir}`);
  }

  return matches.at(-1);
}

function runChecks(sql, sqlPath = "<inline>") {
  const checks = CHECKS.map((check) => ({
    id: check.id,
    description: check.description,
    ok: Boolean(check.test(sql)),
  }));

  return {
    sqlPath,
    checks,
    failures: checks.filter((check) => !check.ok),
  };
}

function renderReport(result) {
  const lines = [
    "# RPC SQL Guard Report",
    "",
    `SQL: ${result.sqlPath}`,
    `Status: ${result.failures.length ? "FAIL" : "PASS"}`,
    "",
    "## Checks",
    "",
  ];

  for (const check of result.checks) {
    lines.push(`- ${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.description}`);
  }

  if (result.failures.length) {
    lines.push("", "## Failures", "");
    for (const failure of result.failures) {
      lines.push(`- ${failure.id}: ${failure.description}`);
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function runSelfTest() {
  const goodSql = `
    create or replace function public.aggregate_meta_daily_insights()
    returns table (source_rows bigint)
    as $$
      select count(*)::bigint as source_rows
      from public.meta_daily_insights i
      cross join runtime r
      left join public.brands b on b.environment = r.environment and b.id = i.brand_id
      left join public.meta_campaigns c on c.environment = r.environment and c.campaign_id = i.campaign_id
      left join public.meta_ad_sets s on s.environment = r.environment and s.ad_set_id = i.ad_set_id
      left join public.meta_ads a on a.environment = r.environment and a.ad_id = i.ad_id
      where i.environment = r.environment;
      select coalesce((select 1), (select 2), 0) as website_bookings_raw;
      select coalesce((select 1), (select 2), 0) as messaging_contacts_raw;
      select coalesce((select 1), (select 2), 0) as leads_raw;
      select extract(day from (date_trunc('month', p_end)::date + interval '1 month - 1 day'))::numeric as days_in_month;
      select row_number() over (partition by f.meta_account_id, f.daily_budget_entity_key order by case when f.delivery_status = 'live' then 0 else 1 end, f.date_start asc) as monthly_budget_rank;
      select round(sum(case when r.monthly_budget_rank = 1 and r.delivery_status = 'live' and r.daily_budget > 0 then r.daily_budget * r.days_in_month else 0 end), 2) as monthly_budget;
    $$ language sql;
  `;
  const badSql = goodSql.replace("where i.environment = r.environment", "where true");
  assertEqual(runChecks(goodSql).failures.length, 0, "good SQL should pass");
  assertEqual(
    runChecks(badSql).failures.some((failure) => failure.id === "insights_environment_filter"),
    true,
    "bad SQL should fail environment filter check",
  );
  process.stdout.write("assert-rpc-sql-guards self-test PASS\n");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
