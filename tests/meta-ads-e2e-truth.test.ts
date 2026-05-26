import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  mapAggregateRow,
  type MetaInsightAggregateRow,
  type MetaInsightDimension,
  type MetaInsightFilter,
} from "../src/lib/meta-insight-aggregates.ts";

type RawInsightRow = {
  environment: string | null;
  campaign_umbrella: string | null;
  date_start: string;
  spend: string | number | null;
  impressions: string | number | null;
  reach: string | number | null;
  clicks: string | number | null;
  actions: unknown;
};

type RawTotals = Pick<
  MetaInsightAggregateRow,
  | "spend"
  | "impressions"
  | "reach"
  | "clicks"
  | "leads"
  | "bookings"
  | "conversions"
  | "website_bookings"
  | "messaging_contacts"
  | "new_messaging_contacts"
  | "primary_results"
  | "secondary_results"
  | "ctr"
  | "cpm"
  | "cpc"
  | "cpl"
  | "frequency"
  | "source_rows"
>;

const hasLiveSupabaseEnv = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
);

const liveIt = hasLiveSupabaseEnv ? it : it.skip;
const TEST_ENVIRONMENT = "production";
const LIVE_DAYS = positiveInt(process.env.META_ADS_E2E_DAYS, 7);
const RPC_LIMIT = positiveInt(process.env.META_ADS_E2E_LIMIT, 10000);
const MONEY_TOLERANCE = 0.01;
const COUNT_TOLERANCE = 0.001;
const RATE_TOLERANCE = 0.01;

const INSIGHT_COLUMNS = [
  "environment",
  "campaign_umbrella",
  "date_start",
  "spend",
  "impressions",
  "reach",
  "clicks",
  "actions",
].join(",");

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

const RAW_VS_RPC_METRICS: (keyof RawTotals)[] = [
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

const ADDITIVE_HIERARCHY_METRICS: (keyof RawTotals)[] = [
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
  "source_rows",
];

describe("Meta Ads live end-to-end truth", () => {
  liveIt("matches raw meta_daily_insights to aggregate_meta_daily_insights for latest synced 7-day window", async () => {
    const supabase = createSupabaseClient();
    const latest = await latestInsightDate(supabase);
    const start = addDays(latest, -(LIVE_DAYS - 1));
    const rawRows = await fetchRawInsightRows(supabase, start, latest);
    assert.ok(
      rawRows.length > 0,
      `Expected live raw rows for ${TEST_ENVIRONMENT} ${start}..${latest}`,
    );

    const rawTotals = summarizeRawRows(rawRows);
    const rpcTotals = await fetchRpcTotal(supabase, {
      start,
      end: latest,
      filters: [],
    });
    assertTotalsClose(rawTotals, rpcTotals, `all campaigns ${start}..${latest}`);

    const umbrella = topNonNullUmbrella(rawRows);
    assert.ok(umbrella, "Expected at least one non-null campaign umbrella in live data");

    const umbrellaRawTotals = summarizeRawRows(
      rawRows.filter((row) => row.campaign_umbrella === umbrella),
    );
    const umbrellaRpcTotals = await fetchRpcTotal(supabase, {
      start,
      end: latest,
      filters: [{ field: "campaign_umbrella", operator: "equals", value: umbrella }],
    });
    assertTotalsClose(
      umbrellaRawTotals,
      umbrellaRpcTotals,
      `${umbrella} campaign_umbrella filter ${start}..${latest}`,
    );
  });

  liveIt("keeps campaign, ad-set, and creative rollups additive for the same date/filter scope", async () => {
    const supabase = createSupabaseClient();
    const latest = await latestInsightDate(supabase);
    const start = addDays(latest, -(LIVE_DAYS - 1));

    const [campaignRows, adSetRows, creativeRows] = await Promise.all([
      fetchRpcRows(supabase, {
        start,
        end: latest,
        dimensions: ["campaign"],
        filters: [],
        sortField: "spend",
        sortDirection: "desc",
        limit: RPC_LIMIT,
      }),
      fetchRpcRows(supabase, {
        start,
        end: latest,
        dimensions: ["campaign", "ad_set"],
        filters: [],
        sortField: "spend",
        sortDirection: "desc",
        limit: RPC_LIMIT,
      }),
      fetchRpcRows(supabase, {
        start,
        end: latest,
        dimensions: ["campaign", "ad_set", "creative"],
        filters: [],
        sortField: "spend",
        sortDirection: "desc",
        limit: RPC_LIMIT,
      }),
    ]);

    assert.ok(campaignRows.length > 0, "Expected campaign rows from live RPC");
    assert.ok(adSetRows.length > 0, "Expected ad-set rows from live RPC");
    assert.ok(creativeRows.length > 0, "Expected creative rows from live RPC");
    assertNotLimited("campaign", campaignRows);
    assertNotLimited("campaign/ad-set", adSetRows);
    assertNotLimited("campaign/ad-set/creative", creativeRows);

    assertHierarchyRollup({
      parentName: "campaign",
      childName: "ad-set",
      parents: campaignRows,
      children: adSetRows,
      keyForParent: campaignKey,
      keyForChild: campaignKey,
    });

    assertHierarchyRollup({
      parentName: "ad-set",
      childName: "creative",
      parents: adSetRows,
      children: creativeRows,
      keyForParent: adSetKey,
      keyForChild: adSetKey,
    });
  });
});

function createSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  assert.ok(url, "Missing NEXT_PUBLIC_SUPABASE_URL");
  assert.ok(key, "Missing SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function latestInsightDate(supabase: SupabaseClient) {
  const response = await supabase
    .from("meta_daily_insights")
    .select("date_start")
    .eq("environment", TEST_ENVIRONMENT)
    .order("date_start", { ascending: false })
    .limit(1)
    .single();

  if (response.error) throw response.error;
  return String(response.data.date_start);
}

async function fetchRawInsightRows(
  supabase: SupabaseClient,
  start: string,
  end: string,
): Promise<RawInsightRow[]> {
  const rows: RawInsightRow[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const response = await supabase
      .from("meta_daily_insights")
      .select(INSIGHT_COLUMNS)
      .eq("environment", TEST_ENVIRONMENT)
      .gte("date_start", start)
      .lte("date_start", end)
      .range(from, from + pageSize - 1);

    if (response.error) throw response.error;
    const page = (response.data || []) as unknown as RawInsightRow[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function fetchRpcTotal(
  supabase: SupabaseClient,
  input: {
    start: string;
    end: string;
    filters: MetaInsightFilter[];
  },
) {
  const rows = await fetchRpcRows(supabase, {
    ...input,
    dimensions: [],
    sortField: "spend",
    sortDirection: "desc",
    limit: 1,
  });
  assert.equal(rows.length, 1, "Expected one aggregate total row");
  return rows[0];
}

async function fetchRpcRows(
  supabase: SupabaseClient,
  input: {
    start: string;
    end: string;
    dimensions: MetaInsightDimension[];
    filters: MetaInsightFilter[];
    sortField: string;
    sortDirection: "asc" | "desc";
    limit: number;
  },
) {
  const response = await supabase.rpc("aggregate_meta_daily_insights", {
    p_start: input.start,
    p_end: input.end,
    p_dimensions: input.dimensions,
    p_filters: input.filters,
    p_sort_field: input.sortField,
    p_sort_direction: input.sortDirection,
    p_limit: input.limit,
  });

  if (response.error) throw response.error;
  return ((response.data || []) as Record<string, unknown>[]).map(mapAggregateRow);
}

function summarizeRawRows(rows: RawInsightRow[]): RawTotals {
  const totals = {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    leads: 0,
    website_bookings: 0,
    messaging_contacts: 0,
    new_messaging_contacts: 0,
    conversions: 0,
    primary_results: 0,
    secondary_results: 0,
  };

  for (const row of rows) {
    const actions = normalizeActions(row.actions);
    const websiteBookings = firstActionFamilyValue(actions, BOOKING_ACTION_TYPES);
    const messagingContacts = firstActionFamilyValue(actions, MESSAGING_ACTION_TYPES);
    const newMessagingContacts = firstActionFamilyValue(actions, [
      "onsite_conversion.messaging_first_reply",
    ]);
    const leads = firstActionFamilyValue(actions, LEAD_ACTION_TYPES);
    const conversions =
      firstActionFamilyValue(actions, PURCHASE_ACTION_TYPES) +
      firstActionFamilyValue(actions, REGISTRATION_ACTION_TYPES);
    const umbrella = row.campaign_umbrella || "Needs review";

    totals.spend += numberValue(row.spend);
    totals.impressions += numberValue(row.impressions);
    totals.reach += numberValue(row.reach);
    totals.clicks += numberValue(row.clicks);
    totals.leads += leads;
    totals.website_bookings += websiteBookings;
    totals.messaging_contacts += messagingContacts;
    totals.new_messaging_contacts += newMessagingContacts;
    totals.conversions += conversions;
    totals.primary_results += umbrella === "Book Appts US" ? websiteBookings : messagingContacts;
    totals.secondary_results += PRODUCT_UMBRELLAS.has(umbrella) ? newMessagingContacts : 0;
  }

  const spend = round(totals.spend, 2);
  const impressions = round(totals.impressions, 0);
  const reach = round(totals.reach, 0);
  const clicks = round(totals.clicks, 0);
  const leads = round(totals.leads, 0);
  const websiteBookings = round(totals.website_bookings, 2);
  const messagingContacts = round(totals.messaging_contacts, 2);
  const newMessagingContacts = round(totals.new_messaging_contacts, 2);
  const primaryResults = round(totals.primary_results, 2);
  const secondaryResults = round(totals.secondary_results, 2);

  return {
    spend,
    impressions,
    reach,
    clicks,
    leads,
    bookings: round(totals.website_bookings, 0),
    conversions: round(totals.conversions, 0),
    website_bookings: websiteBookings,
    messaging_contacts: messagingContacts,
    new_messaging_contacts: newMessagingContacts,
    primary_results: primaryResults,
    secondary_results: secondaryResults,
    ctr: impressions > 0 ? round((clicks / impressions) * 100, 2) : 0,
    cpm: impressions > 0 ? round((spend / impressions) * 1000, 2) : 0,
    cpc: clicks > 0 ? round(spend / clicks, 2) : 0,
    cpl: leads > 0 ? round(spend / leads, 2) : null,
    frequency: reach > 0 ? round(impressions / reach, 2) : 0,
    source_rows: rows.length,
  };
}

function firstActionFamilyValue(actions: ActionRow[], actionTypes: string[]) {
  for (const actionType of actionTypes) {
    let found = false;
    let total = 0;
    for (const action of actions) {
      if (action.action_type !== actionType) continue;
      found = true;
      total += numberValue(action.value);
    }
    if (found) return total;
  }
  return 0;
}

type ActionRow = {
  action_type?: unknown;
  value?: unknown;
};

function normalizeActions(value: unknown): ActionRow[] {
  if (Array.isArray(value)) return value as ActionRow[];
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as ActionRow[]) : [];
  } catch {
    return [];
  }
}

function topNonNullUmbrella(rows: RawInsightRow[]) {
  const byUmbrella = new Map<string, number>();
  for (const row of rows) {
    if (!row.campaign_umbrella) continue;
    byUmbrella.set(
      row.campaign_umbrella,
      (byUmbrella.get(row.campaign_umbrella) || 0) + numberValue(row.spend),
    );
  }

  return [...byUmbrella.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

function assertTotalsClose(raw: RawTotals, rpc: MetaInsightAggregateRow, scope: string) {
  for (const metric of RAW_VS_RPC_METRICS) {
    assertMetricClose(raw[metric], rpc[metric], metric, scope);
  }
}

function assertHierarchyRollup({
  parentName,
  childName,
  parents,
  children,
  keyForParent,
  keyForChild,
}: {
  parentName: string;
  childName: string;
  parents: MetaInsightAggregateRow[];
  children: MetaInsightAggregateRow[];
  keyForParent: (row: MetaInsightAggregateRow) => string;
  keyForChild: (row: MetaInsightAggregateRow) => string;
}) {
  const childTotals = rollupRows(children, keyForChild);
  const missingChildren: string[] = [];

  for (const parent of parents) {
    const key = keyForParent(parent);
    const child = childTotals.get(key);
    if (!child) {
      missingChildren.push(key);
      continue;
    }
    for (const metric of ADDITIVE_HIERARCHY_METRICS) {
      assertMetricClose(parent[metric], child[metric], metric, `${parentName} ${key} vs ${childName}`);
    }
  }

  assert.deepEqual(
    missingChildren,
    [],
    `${parentName} rows missing ${childName} rollups for same date/filter scope`,
  );
}

function rollupRows(
  rows: MetaInsightAggregateRow[],
  keyForRow: (row: MetaInsightAggregateRow) => string,
) {
  const totals = new Map<string, RawTotals>();
  for (const row of rows) {
    const key = keyForRow(row);
    const total = totals.get(key) || emptyTotals();
    for (const metric of ADDITIVE_HIERARCHY_METRICS) {
      total[metric] = numberValue(total[metric]) + numberValue(row[metric]);
    }
    totals.set(key, total);
  }
  return totals;
}

function emptyTotals(): RawTotals {
  return {
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
  };
}

function campaignKey(row: MetaInsightAggregateRow) {
  return row.campaign_id || "unknown";
}

function adSetKey(row: MetaInsightAggregateRow) {
  return `${row.campaign_id || "unknown"}|${row.ad_set_id || "unknown"}`;
}

function assertMetricClose(
  actual: number | null,
  expected: number | null,
  metric: keyof RawTotals,
  scope: string,
) {
  const tolerance = toleranceForMetric(metric);
  if (actual === null || expected === null) {
    assert.equal(actual, expected, `${scope} ${metric}`);
    return;
  }

  const delta = Math.abs(actual - expected);
  assert.ok(
    delta <= tolerance,
    `${scope} ${metric}: expected ${expected}, got ${actual}, delta ${delta}`,
  );
}

function toleranceForMetric(metric: keyof RawTotals) {
  if (metric === "spend" || metric === "cpm" || metric === "cpc" || metric === "cpl") {
    return MONEY_TOLERANCE;
  }
  if (metric === "ctr" || metric === "frequency") return RATE_TOLERANCE;
  return COUNT_TOLERANCE;
}

function assertNotLimited(label: string, rows: unknown[]) {
  assert.ok(
    rows.length < RPC_LIMIT,
    `${label} RPC rows hit limit ${RPC_LIMIT}; hierarchy truth test is incomplete`,
  );
}

function addDays(date: string, amount: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + amount);
  return next.toISOString().slice(0, 10);
}

function numberValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round(value: number, precision: number) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
