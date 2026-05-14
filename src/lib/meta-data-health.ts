import {
  finalizedInsightCutoffDate,
  incrementalDatePreset,
  incrementalSyncDays,
} from "./meta-backfill-utils";
import { createServiceClient } from "./supabase";

type JsonRecord = Record<string, unknown>;
type SupabaseSelectChain = PromiseLike<{ data: unknown; error: Error | null }> & {
  order: (...args: unknown[]) => SupabaseSelectChain;
  range: (from: number, to: number) => SupabaseSelectChain;
  limit: (count: number) => SupabaseSelectChain;
};
type SupabaseSelectClient = {
  from: (table: string) => {
    select: (columns: string) => SupabaseSelectChain;
  };
};

export async function getMetaDataHealth() {
  const cutoff = finalizedInsightCutoffDate();
  const [accounts, insightRows, syncRuns] = await Promise.all([
    fetchAll("meta_ad_accounts", "meta_account_id,name,last_synced_at,updated_at"),
    fetchAll(
      "meta_daily_insights",
      "meta_account_id,ad_id,date_start,spend,impressions,clicks,leads,bookings,conversions,campaign_umbrella,updated_at",
    ),
    fetchRecentSyncRuns(),
  ]);
  const duplicateSummary = summarizeDuplicateKeys(insightRows);
  const monthlyUmbrella = summarizeMonthlyUmbrella(insightRows);

  return {
    generatedAt: new Date().toISOString(),
    syncPolicy: {
      incrementalDatePreset: incrementalDatePreset(),
      incrementalRefreshDays: incrementalSyncDays(),
      finalizedCutoffDate: cutoff,
      finalizedRows: insightRows.filter((row) => String(row.date_start || "") < cutoff).length,
      refreshableRows: insightRows.filter((row) => String(row.date_start || "") >= cutoff).length,
    },
    accounts: accounts.map((account) => ({
      metaAccountId: stringField(account.meta_account_id),
      name: stringField(account.name),
      lastSyncedAt: stringField(account.last_synced_at),
      updatedAt: stringField(account.updated_at),
    })),
    insights: {
      totalRows: insightRows.length,
      uniqueAccountAdDateKeys: duplicateSummary.uniqueKeys,
      duplicateKeyCount: duplicateSummary.duplicateKeyCount,
      duplicateSamples: duplicateSummary.duplicateSamples,
      nullKeyRows: duplicateSummary.nullKeyRows,
      dateRange: dateRangeForRows(insightRows),
    },
    monthlyUmbrella: monthlyUmbrella.slice(-80),
    recentSyncRuns: syncRuns,
    checks: {
      duplicateRowsOk: duplicateSummary.duplicateKeyCount === 0,
      nullKeysOk: duplicateSummary.nullKeyRows === 0,
      hasInsightRows: insightRows.length > 0,
    },
  };
}

async function fetchRecentSyncRuns() {
  const supabase = createServiceClient() as unknown as SupabaseSelectClient;
  const response = await supabase
    .from("sync_runs")
    .select("id,trigger,status,started_at,completed_at,metrics,errors")
    .order("started_at", { ascending: false })
    .limit(12);

  if (response.error) throw response.error;

  return rows<JsonRecord>(response.data).map((run) => ({
    id: stringField(run.id),
    trigger: stringField(run.trigger),
    status: stringField(run.status),
    startedAt: stringField(run.started_at),
    completedAt: stringField(run.completed_at),
    metrics: run.metrics || {},
    errors: run.errors || [],
  }));
}

async function fetchAll(table: string, columns: string) {
  const supabase = createServiceClient() as unknown as SupabaseSelectClient;
  const output: JsonRecord[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const response = await supabase
      .from(table)
      .select(columns)
      .range(from, from + pageSize - 1);

    if (response.error) throw response.error;

    const page = rows<JsonRecord>(response.data);
    output.push(...page);
    if (page.length < pageSize) break;
  }

  return output;
}

function summarizeDuplicateKeys(insightRows: JsonRecord[]) {
  const byKey = new Map<string, { count: number; spend: number; rows: JsonRecord[] }>();
  let nullKeyRows = 0;

  insightRows.forEach((row) => {
    const account = stringField(row.meta_account_id);
    const adId = stringField(row.ad_id);
    const date = stringField(row.date_start);
    if (!account || !adId || !date) {
      nullKeyRows += 1;
      return;
    }

    const key = `${account}|${adId}|${date}`;
    const current = byKey.get(key) || { count: 0, spend: 0, rows: [] };
    current.count += 1;
    current.spend = roundCurrency(current.spend + numberField(row.spend));
    if (current.rows.length < 3) current.rows.push(row);
    byKey.set(key, current);
  });

  const duplicates = Array.from(byKey.entries()).filter(([, value]) => value.count > 1);

  return {
    uniqueKeys: byKey.size,
    duplicateKeyCount: duplicates.length,
    nullKeyRows,
    duplicateSamples: duplicates.slice(0, 10).map(([key, value]) => ({
      key,
      count: value.count,
      spend: value.spend,
      rows: value.rows,
    })),
  };
}

function summarizeMonthlyUmbrella(insightRows: JsonRecord[]) {
  const byKey = new Map<string, {
    month: string;
    campaignUmbrella: string;
    rows: number;
    spend: number;
    impressions: number;
    clicks: number;
    leads: number;
    bookings: number;
    conversions: number;
  }>();

  insightRows.forEach((row) => {
    const date = stringField(row.date_start);
    if (!date) return;

    const month = date.slice(0, 7);
    const campaignUmbrella = stringField(row.campaign_umbrella) || "Needs review";
    const key = `${month}|${campaignUmbrella}`;
    const current = byKey.get(key) || {
      month,
      campaignUmbrella,
      rows: 0,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      bookings: 0,
      conversions: 0,
    };
    current.rows += 1;
    current.spend = roundCurrency(current.spend + numberField(row.spend));
    current.impressions += Math.round(numberField(row.impressions));
    current.clicks += Math.round(numberField(row.clicks));
    current.leads += Math.round(numberField(row.leads));
    current.bookings += Math.round(numberField(row.bookings));
    current.conversions += Math.round(numberField(row.conversions));
    byKey.set(key, current);
  });

  return Array.from(byKey.values()).sort((a, b) =>
    `${a.month}|${a.campaignUmbrella}`.localeCompare(`${b.month}|${b.campaignUmbrella}`),
  );
}

function dateRangeForRows(inputRows: JsonRecord[]) {
  return inputRows.reduce<{ min: string | null; max: string | null }>(
    (range, row) => {
      const date = stringField(row.date_start);
      if (!date) return range;
      return {
        min: !range.min || date < range.min ? date : range.min,
        max: !range.max || date > range.max ? date : range.max,
      };
    },
    { min: null, max: null },
  );
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}

function numberField(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.length) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}
