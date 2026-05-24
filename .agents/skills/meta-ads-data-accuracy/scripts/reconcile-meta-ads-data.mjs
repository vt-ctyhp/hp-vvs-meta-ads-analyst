#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const HELP = `Usage:
  node .agents/skills/meta-ads-data-accuracy/scripts/reconcile-meta-ads-data.mjs --start YYYY-MM-DD --end YYYY-MM-DD [options]

Options:
  --dimensions list       Comma list: date,week,month,quarter,brand,campaign_umbrella,campaign,ad_set,ad,creative
  --filter field:op=value Repeatable. op is equals or contains. Example: --filter campaign_umbrella:equals="Cash for Gold US"
  --environment value     Defaults to ADS_ANALYST_ENVIRONMENT or production
  --out path              Defaults to .codex/meta-ads-accuracy/latest
  --limit number          RPC limit. Defaults to 10000
  --tolerance number      Absolute numeric tolerance. Defaults to 0.01
  --self-test             Run offline formula tests

Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for live mode.
`;

const VALID_DIMENSIONS = new Set([
  "date",
  "week",
  "month",
  "quarter",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
]);

const VALID_FILTER_FIELDS = new Set([
  "search",
  "brand",
  "campaign_umbrella",
  "campaign",
  "ad_set",
  "ad",
  "creative",
  "delivery_status",
]);

const METRICS_TO_COMPARE = [
  "spend",
  "impressions",
  "reach",
  "clicks",
  "leads",
  "bookings",
  "conversions",
  "website_bookings",
  "messaging_contacts",
  "new_messaging_contacts",
  "primary_results",
  "secondary_results",
  "ctr",
  "cpm",
  "cpc",
  "cpl",
  "frequency",
  "source_rows",
];

const BOOKING_ACTION_TYPES = [
  "offsite_conversion.fb_pixel_custom",
  "schedule",
  "submit_application",
  "booking",
  "appointment",
];

const MESSAGING_ACTION_TYPES = [
  "onsite_conversion.messaging_conversation_started_7d",
  "onsite_conversion.total_messaging_connection",
  "onsite_conversion.messaging_first_reply",
];

const LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead",
  "onsite_conversion.lead_grouped",
  "onsite_web_lead",
  "offsite_conversion.fb_pixel_lead",
  "offsite_complete_registration_add_meta_leads",
];

const PURCHASE_ACTION_TYPES = [
  "omni_purchase",
  "purchase",
  "onsite_conversion.purchase",
  "onsite_app_purchase",
  "onsite_web_purchase",
  "onsite_web_app_purchase",
  "offsite_conversion.fb_pixel_purchase",
];

const REGISTRATION_ACTION_TYPES = [
  "complete_registration",
  "offsite_conversion.fb_pixel_complete_registration",
  "offsite_complete_registration_add_meta_leads",
];

const PRODUCT_UMBRELLAS = new Set(["Facebook US Product", "Facebook VN Product"]);

const INSIGHT_COLUMNS = [
  "environment",
  "brand_id",
  "meta_account_id",
  "campaign_id",
  "campaign_name",
  "ad_set_id",
  "ad_set_name",
  "ad_id",
  "ad_name",
  "creative_id",
  "campaign_umbrella",
  "date_start",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "actions",
].join(",");

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

  validateDate(args.start, "--start");
  validateDate(args.end, "--end");
  if (args.start > args.end) throw new Error("--start must be before or equal to --end");

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  await mkdir(args.out, { recursive: true });

  const maps = await fetchLookupMaps(supabase, args.environment);
  const rawRows = await fetchTableRows(
    supabase,
    "meta_daily_insights",
    INSIGHT_COLUMNS,
    (query) =>
      query
        .eq("environment", args.environment)
        .gte("date_start", args.start)
        .lte("date_start", args.end),
  );

  const enrichedRows = rawRows.map((row) => enrichInsightRow(row, maps));
  const filteredRows = enrichedRows.filter((row) => matchesFilters(row, args.filters));
  const rawGroups = aggregateRawRows(filteredRows, args.dimensions);
  const rawTotals = aggregateRawRows(filteredRows, [])[0] || emptyGroup("__total__", {});
  const rpcRows = await fetchRpcRows(supabase, args);
  const comparison = compareRows(rawGroups, rpcRows, args.dimensions, args.tolerance);

  const files = {
    report: join(args.out, "audit-report.md"),
    csv: join(args.out, "reconciliation.csv"),
    failures: join(args.out, "failures.json"),
    rawSummary: join(args.out, "raw-summary.json"),
    rpcRows: join(args.out, "rpc-rows.json"),
  };

  await writeFile(files.report, renderReport(args, rawRows.length, filteredRows.length, comparison, files));
  await writeFile(files.csv, renderCsv(comparison.rows));
  await writeFile(files.failures, `${JSON.stringify(comparison.failures, null, 2)}\n`);
  await writeFile(
    files.rawSummary,
    `${JSON.stringify(
      {
        source: "supabase.meta_daily_insights",
        environment: args.environment,
        start: args.start,
        end: args.end,
        filters: args.filters,
        dimensions: args.dimensions,
        sourceRowCount: rawRows.length,
        filteredRowCount: filteredRows.length,
        metrics: rawTotals.metrics,
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(files.rpcRows, `${JSON.stringify(rpcRows, null, 2)}\n`);

  process.stdout.write(`Wrote ${files.report}\n`);
  process.stdout.write(`Wrote ${files.csv}\n`);
  process.stdout.write(`Status: ${comparison.failures.length ? "FAIL" : "PASS"}\n`);
  if (comparison.failures.length) process.exitCode = 1;
}

function parseArgs(argv) {
  const args = {
    start: "",
    end: "",
    dimensions: ["campaign_umbrella"],
    filters: [],
    environment: process.env.ADS_ANALYST_ENVIRONMENT || "production",
    out: ".codex/meta-ads-accuracy/latest",
    limit: 10000,
    tolerance: 0.01,
    help: false,
    selfTest: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const { key, value: inlineValue } = splitArg(arg);
    const nextValue = () => inlineValue ?? argv[++index];

    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--self-test") args.selfTest = true;
    else if (key === "--start") args.start = nextValue();
    else if (key === "--end") args.end = nextValue();
    else if (key === "--dimensions") args.dimensions = parseDimensions(nextValue());
    else if (key === "--filter") args.filters.push(parseFilter(nextValue()));
    else if (key === "--environment") args.environment = nextValue();
    else if (key === "--out") args.out = nextValue();
    else if (key === "--limit") args.limit = parsePositiveInteger(nextValue(), "--limit");
    else if (key === "--tolerance") args.tolerance = parseNonNegativeNumber(nextValue(), "--tolerance");
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.help && (!args.start || !args.end)) {
    throw new Error("Both --start and --end are required");
  }

  return args;
}

function splitArg(arg) {
  const index = arg.indexOf("=");
  if (index === -1) return { key: arg, value: undefined };
  return { key: arg.slice(0, index), value: arg.slice(index + 1) };
}

function parseDimensions(value) {
  const dimensions = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  for (const dimension of dimensions) {
    if (!VALID_DIMENSIONS.has(dimension)) throw new Error(`Unsupported dimension: ${dimension}`);
  }
  return dimensions;
}

function parseFilter(value) {
  const raw = String(value || "");
  const equalsIndex = raw.indexOf("=");
  if (equalsIndex === -1) throw new Error(`Invalid filter "${raw}". Expected field:operator=value`);
  const left = raw.slice(0, equalsIndex);
  const filterValue = raw.slice(equalsIndex + 1);
  const [field, operator = "contains"] = left.split(":");

  if (!VALID_FILTER_FIELDS.has(field)) throw new Error(`Unsupported filter field: ${field}`);
  if (!["equals", "contains"].includes(operator)) throw new Error(`Unsupported filter operator: ${operator}`);
  return { field, operator, value: filterValue };
}

function parsePositiveInteger(value, label) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer`);
  return parsed;
}

function parseNonNegativeNumber(value, label) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be a non-negative number`);
  return parsed;
}

function validateDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) {
    throw new Error(`${label} must be YYYY-MM-DD`);
  }
}

async function fetchLookupMaps(supabase, environment) {
  const [brands, campaigns, adSets, ads] = await Promise.all([
    fetchTableRows(supabase, "brands", "id,code,environment", (query) => query.eq("environment", environment)),
    fetchTableRows(
      supabase,
      "meta_campaigns",
      "meta_account_id,campaign_id,status,effective_status,environment",
      (query) => query.eq("environment", environment),
    ),
    fetchTableRows(
      supabase,
      "meta_ad_sets",
      "meta_account_id,ad_set_id,status,effective_status,environment",
      (query) => query.eq("environment", environment),
    ),
    fetchTableRows(
      supabase,
      "meta_ads",
      "meta_account_id,ad_id,status,effective_status,environment",
      (query) => query.eq("environment", environment),
    ),
  ]);

  return {
    brands: mapBy(brands, (row) => row.id),
    campaigns: mapBy(campaigns, (row) => `${row.meta_account_id}|${row.campaign_id}`),
    adSets: mapBy(adSets, (row) => `${row.meta_account_id}|${row.ad_set_id}`),
    ads: mapBy(ads, (row) => `${row.meta_account_id}|${row.ad_id}`),
  };
}

async function fetchTableRows(supabase, table, columns, apply, pageSize = 1000) {
  const rows = [];
  let from = 0;

  // A stable ORDER BY is required for paginated reads. Without one, PostgreSQL
  // does not guarantee row order across separate queries, so .range() can
  // return overlapping pages (double-counting) or gaps (under-counting).
  // For meta_daily_insights, ordering by date_start uses the existing
  // (date_start desc) index, and adding id as tiebreaker makes the order strict.
  // For the small metadata tables (brands, meta_campaigns, etc.), ordering by
  // id alone is cheap and sufficient.
  const orderingForTable = (q) =>
    table === "meta_daily_insights"
      ? q.order("date_start", { ascending: true }).order("id", { ascending: true })
      : q.order("id", { ascending: true });

  while (true) {
    let query = orderingForTable(supabase.from(table).select(columns)).range(from, from + pageSize - 1);
    query = apply(query);
    const { data, error } = await query;
    if (error) throw new Error(`${table} query failed: ${error.message}`);

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchRpcRows(supabase, args) {
  const { data, error } = await supabase.rpc("aggregate_meta_daily_insights", {
    p_start: args.start,
    p_end: args.end,
    p_dimensions: args.dimensions,
    p_filters: args.filters,
    p_sort_field: "spend",
    p_sort_direction: "desc",
    p_limit: args.limit,
  });

  if (error) throw new Error(`aggregate_meta_daily_insights RPC failed: ${error.message}`);
  return Array.isArray(data) ? data : [];
}

function enrichInsightRow(row, maps) {
  const campaign = maps.campaigns.get(`${row.meta_account_id}|${row.campaign_id}`) || {};
  const adSet = maps.adSets.get(`${row.meta_account_id}|${row.ad_set_id}`) || {};
  const ad = maps.ads.get(`${row.meta_account_id}|${row.ad_id}`) || {};
  const brand = maps.brands.get(row.brand_id) || {};
  const status = firstNonEmpty(ad.effective_status, ad.status, adSet.effective_status, adSet.status, campaign.effective_status, campaign.status);

  return {
    ...row,
    brand_code: brand.code || "Unassigned",
    delivery_status: normalizeDeliveryStatus(status),
  };
}

function mapBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (key && !map.has(key)) map.set(key, row);
  }
  return map;
}

function firstNonEmpty(...values) {
  return values.find((value) => typeof value === "string" && value.trim()) || "";
}

function normalizeDeliveryStatus(value) {
  const normalized = String(value || "").toUpperCase();
  if (normalized === "ACTIVE") return "live";
  if (normalized === "PAUSED") return "paused";
  return "off";
}

function matchesFilters(row, filters) {
  return filters.every((filter) => {
    if (!filter.value) return true;
    const haystack = filterText(row, filter.field).toLowerCase();
    const needle = filter.value.toLowerCase();
    return filter.operator === "equals" ? haystack === needle : haystack.includes(needle);
  });
}

function filterText(row, field) {
  switch (field) {
    case "brand":
      return row.brand_code || "";
    case "campaign_umbrella":
      return row.campaign_umbrella || "";
    case "campaign":
      return [row.campaign_name, row.campaign_id].filter(Boolean).join(" ");
    case "ad_set":
      return [row.ad_set_name, row.ad_set_id].filter(Boolean).join(" ");
    case "ad":
      return [row.ad_name, row.ad_id].filter(Boolean).join(" ");
    case "creative":
      return row.creative_id || "";
    case "delivery_status":
      return row.delivery_status || "";
    case "search":
    default:
      return [
        row.brand_code,
        row.campaign_umbrella,
        row.campaign_name,
        row.campaign_id,
        row.ad_set_name,
        row.ad_set_id,
        row.ad_name,
        row.ad_id,
        row.creative_id,
      ]
        .filter(Boolean)
        .join(" ");
  }
}

function aggregateRawRows(rows, dimensions) {
  const groups = new Map();

  for (const row of rows) {
    const dims = Object.fromEntries(dimensions.map((dimension) => [dimension, rawDimensionValue(row, dimension)]));
    const key = groupKey(dims, dimensions);
    const group = groups.get(key) || emptyGroup(key, dims);
    const actions = actionArray(row.actions);
    const websiteBookings = actionFamilyValue(actions, BOOKING_ACTION_TYPES);
    const messagingContacts = actionFamilyValue(actions, MESSAGING_ACTION_TYPES);
    const newMessagingContacts = actionFamilyValue(actions, ["onsite_conversion.messaging_first_reply"]);
    const leads = actionFamilyValue(actions, LEAD_ACTION_TYPES);
    const conversions =
      actionFamilyValue(actions, PURCHASE_ACTION_TYPES) + actionFamilyValue(actions, REGISTRATION_ACTION_TYPES);
    const umbrella = row.campaign_umbrella || "Needs review";

    group.metrics.spend += numberValue(row.spend);
    group.metrics.impressions += numberValue(row.impressions);
    group.metrics.reach += numberValue(row.reach);
    group.metrics.clicks += numberValue(row.clicks);
    group.metrics.leads += leads;
    group.metrics.bookings += websiteBookings;
    group.metrics.conversions += conversions;
    group.metrics.website_bookings += websiteBookings;
    group.metrics.messaging_contacts += messagingContacts;
    group.metrics.new_messaging_contacts += newMessagingContacts;
    group.metrics.primary_results += umbrella === "Book Appts US" ? websiteBookings : messagingContacts;
    group.metrics.secondary_results += PRODUCT_UMBRELLAS.has(umbrella) ? newMessagingContacts : 0;
    group.metrics.source_rows += 1;
    groups.set(key, group);
  }

  return Array.from(groups.values()).map(finalizeGroup);
}

function emptyGroup(key, dimensions) {
  return {
    key,
    dimensions,
    metrics: {
      spend: 0,
      impressions: 0,
      reach: 0,
      clicks: 0,
      leads: 0,
      bookings: 0,
      conversions: 0,
      website_bookings: 0,
      messaging_contacts: 0,
      new_messaging_contacts: 0,
      primary_results: 0,
      secondary_results: 0,
      ctr: 0,
      cpm: 0,
      cpc: 0,
      cpl: null,
      frequency: 0,
      source_rows: 0,
    },
  };
}

function finalizeGroup(group) {
  const metrics = group.metrics;
  metrics.spend = round(metrics.spend);
  metrics.website_bookings = round(metrics.website_bookings);
  metrics.messaging_contacts = round(metrics.messaging_contacts);
  metrics.new_messaging_contacts = round(metrics.new_messaging_contacts);
  metrics.primary_results = round(metrics.primary_results);
  metrics.secondary_results = round(metrics.secondary_results);
  metrics.ctr = metrics.impressions > 0 ? round((metrics.clicks / metrics.impressions) * 100) : 0;
  metrics.cpm = metrics.impressions > 0 ? round((metrics.spend / metrics.impressions) * 1000) : 0;
  metrics.cpc = metrics.clicks > 0 ? round(metrics.spend / metrics.clicks) : 0;
  metrics.cpl = metrics.leads > 0 ? round(metrics.spend / metrics.leads) : null;
  metrics.frequency = metrics.reach > 0 ? round(metrics.impressions / metrics.reach) : 0;
  return group;
}

function rawDimensionValue(row, dimension) {
  switch (dimension) {
    case "date":
      return row.date_start || null;
    case "week":
      return weekStart(row.date_start);
    case "month":
      return String(row.date_start || "").slice(0, 7) || null;
    case "quarter":
      return quarter(row.date_start);
    case "brand":
      return row.brand_code || "Unassigned";
    case "campaign_umbrella":
      return row.campaign_umbrella || "Needs review";
    case "campaign":
      return firstNonEmpty(row.campaign_id, row.campaign_name, "unknown");
    case "ad_set":
      return firstNonEmpty(row.ad_set_id, row.ad_set_name, "unknown");
    case "ad":
      return firstNonEmpty(row.ad_id, row.ad_name, "unknown");
    case "creative":
      return firstNonEmpty(row.creative_id, "unknown");
    default:
      return null;
  }
}

function rpcDimensionValue(row, dimension) {
  switch (dimension) {
    case "campaign":
      return firstNonEmpty(row.campaign_id, row.campaign, "unknown");
    case "ad_set":
      return firstNonEmpty(row.ad_set_id, row.ad_set, "unknown");
    case "ad":
      return firstNonEmpty(row.ad_id, row.ad, "unknown");
    case "creative":
      return firstNonEmpty(row.creative_id, row.creative, "unknown");
    default:
      return row[dimension] ?? null;
  }
}

function weekStart(date) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDay();
  const offset = (day + 6) % 7;
  parsed.setUTCDate(parsed.getUTCDate() - offset);
  return parsed.toISOString().slice(0, 10);
}

function quarter(date) {
  if (!date) return null;
  const year = date.slice(0, 4);
  const month = Number(date.slice(5, 7));
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}

function groupKey(dimensions, order) {
  if (!order.length) return "__total__";
  return order.map((dimension) => `${dimension}=${dimensions[dimension] ?? ""}`).join("|");
}

function actionArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => item && typeof item === "object" && !Array.isArray(item))
    .map((item) => ({
      action_type: typeof item.action_type === "string" ? item.action_type : "",
      value: item.value,
    }));
}

function actionFamilyValue(actions, actionTypes) {
  for (const actionType of actionTypes) {
    const exact = exactActionSum(actions, actionType);
    if (exact !== null) return exact;
  }
  return 0;
}

function exactActionSum(actions, actionType) {
  let found = false;
  let sum = 0;
  for (const action of actions) {
    if (action.action_type !== actionType) continue;
    found = true;
    sum += numberValue(action.value);
  }
  return found ? sum : null;
}

function compareRows(rawGroups, rpcRows, dimensions, tolerance) {
  const rpcByKey = new Map();
  for (const row of rpcRows) {
    const dims = Object.fromEntries(dimensions.map((dimension) => [dimension, rpcDimensionValue(row, dimension)]));
    rpcByKey.set(groupKey(dims, dimensions), { key: groupKey(dims, dimensions), dimensions: dims, metrics: normalizeRpcMetrics(row) });
  }

  const rawByKey = new Map(rawGroups.map((group) => [group.key, group]));
  const keys = new Set([...rawByKey.keys(), ...rpcByKey.keys()]);
  const rows = [];
  const failures = [];

  for (const key of [...keys].sort()) {
    const raw = rawByKey.get(key);
    const rpc = rpcByKey.get(key);
    const output = { key, dimensions: raw?.dimensions || rpc?.dimensions || {} };

    if (!raw || !rpc) {
      failures.push({ key, metric: "__row__", raw: Boolean(raw), rpc: Boolean(rpc), delta: null, tolerance });
    }

    for (const metric of METRICS_TO_COMPARE) {
      const rawValue = raw?.metrics?.[metric] ?? null;
      const rpcValue = rpc?.metrics?.[metric] ?? null;
      const delta = rawValue === null || rpcValue === null ? null : round(numberValue(rpcValue) - numberValue(rawValue));
      const ok =
        rawValue === null && rpcValue === null
          ? true
          : rawValue !== null && rpcValue !== null && Math.abs(delta) <= tolerance;
      output[`raw_${metric}`] = rawValue;
      output[`rpc_${metric}`] = rpcValue;
      output[`delta_${metric}`] = delta;
      if (!ok) failures.push({ key, metric, raw: rawValue, rpc: rpcValue, delta, tolerance });
    }

    rows.push(output);
  }

  return { rows, failures };
}

function normalizeRpcMetrics(row) {
  const result = {};
  for (const metric of METRICS_TO_COMPARE) {
    result[metric] = row[metric] === null || row[metric] === undefined ? null : round(numberValue(row[metric]));
  }
  return result;
}

function renderCsv(rows) {
  const columns = [
    "key",
    ...METRICS_TO_COMPARE.flatMap((metric) => [`raw_${metric}`, `rpc_${metric}`, `delta_${metric}`]),
  ];
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function renderReport(args, sourceRowCount, filteredRowCount, comparison, files) {
  const lines = [
    "# Meta Ads Data Reconciliation",
    "",
    `Status: ${comparison.failures.length ? "FAIL" : "PASS"}`,
    `Environment: ${args.environment}`,
    `Date range: ${args.start} to ${args.end} inclusive`,
    `Dimensions: ${args.dimensions.length ? args.dimensions.join(", ") : "(total)"}`,
    `Filters: ${args.filters.length ? args.filters.map(formatFilter).join("; ") : "(none)"}`,
    `Source rows fetched: ${sourceRowCount}`,
    `Source rows after filters: ${filteredRowCount}`,
    "",
    "## Artifacts",
    "",
    `- Reconciliation CSV: ${files.csv}`,
    `- Failures JSON: ${files.failures}`,
    `- Raw summary JSON: ${files.rawSummary}`,
    `- RPC rows JSON: ${files.rpcRows}`,
    "",
    "## Result",
    "",
  ];

  if (!comparison.failures.length) {
    lines.push("Raw Supabase totals match aggregate_meta_daily_insights for checked metrics.");
  } else {
    lines.push(`${comparison.failures.length} mismatch(es) found.`);
    lines.push("");
    for (const failure of comparison.failures.slice(0, 50)) {
      lines.push(
        `- ${failure.key} ${failure.metric}: raw=${failure.raw} rpc=${failure.rpc} delta=${failure.delta}`,
      );
    }
    if (comparison.failures.length > 50) lines.push(`- ${comparison.failures.length - 50} more failures omitted.`);
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatFilter(filter) {
  return `${filter.field}:${filter.operator}=${filter.value}`;
}

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function numberValue(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round(value, precision = 2) {
  if (value === null || value === undefined) return null;
  const factor = 10 ** precision;
  return Math.round(Number(value) * factor) / factor;
}

function runSelfTest() {
  const rows = [
    {
      brand_code: "HP",
      date_start: "2026-05-03",
      campaign_umbrella: "Book Appts US",
      campaign_id: "c1",
      campaign_name: "Campaign 1",
      spend: "100",
      impressions: 1000,
      reach: 500,
      clicks: 20,
      actions: [
        { action_type: "offsite_conversion.fb_pixel_custom", value: "4" },
        { action_type: "schedule", value: "9" },
        { action_type: "onsite_conversion.total_messaging_connection", value: "10" },
      ],
    },
    {
      brand_code: "HP",
      date_start: "2026-05-04",
      campaign_umbrella: "Book Appts US",
      campaign_id: "c1",
      campaign_name: "Campaign 1",
      spend: 50,
      impressions: 500,
      reach: 250,
      clicks: 5,
      actions: [
        { action_type: "schedule", value: "2" },
        { action_type: "lead", value: "3" },
      ],
    },
  ];
  const groups = aggregateRawRows(rows, ["campaign_umbrella", "campaign"]);
  assertEqual(groups.length, 1, "expected one group");
  const metrics = groups[0].metrics;
  assertEqual(metrics.spend, 150, "spend");
  assertEqual(metrics.website_bookings, 6, "booking aliases coalesce by priority per row");
  assertEqual(metrics.primary_results, 6, "primary results for booking umbrella");
  assertEqual(metrics.ctr, 1.67, "ctr derives from summed clicks and impressions");
  assertEqual(weekStart("2026-05-03"), "2026-04-27", "week starts Monday");
  assertEqual(quarter("2026-05-03"), "2026-Q2", "quarter");
  process.stdout.write("reconcile-meta-ads-data self-test PASS\n");
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
