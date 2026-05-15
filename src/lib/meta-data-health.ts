import {
  finalizedInsightCutoffDate,
  incrementalDatePreset,
  incrementalSyncDays,
  monthDateRange,
} from "./meta-backfill-utils";
import {
  fetchMetaAccountInsightTotalsForRange,
  type MetaAccountInsightTotals,
} from "./meta";
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

type MetricTotals = {
  rows: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  bookings: number;
  conversions: number;
};

type MonthlyDiagnostic = MetricTotals & {
  month: string;
  monthStart: string;
  monthEnd: string;
  lockStatus: "locked" | "settling" | "active";
  isLocked: boolean;
  previousSpend: number | null;
  spendDelta: number;
  spendDeltaPct: number | null;
};

type MonthlyUmbrellaDiagnostic = MetricTotals & {
  month: string;
  campaignUmbrella: string;
};

type SpendAlert = {
  month: string;
  campaignUmbrella: string;
  spend: number;
  previousSpend: number;
  spendDelta: number;
  spendDeltaPct: number;
};

export async function getMetaDataHealth(input: { compareMonth?: string | null } = {}) {
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
  const monthlyTotals = summarizeMonthlyTotals(insightRows, cutoff);
  const monthlyUmbrella = summarizeMonthlyUmbrella(insightRows);
  const spendAlerts = summarizeSpendAlerts(monthlyUmbrella, cutoff);
  const recentAuditWarnings = syncRuns.flatMap((run) => syncRunAuditWarnings(run)).slice(0, 12);
  const compareMonth = normalizeMonthInput(input.compareMonth);

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
    lastSync: mapLastSync(syncRuns[0]),
    monthlyTotals: monthlyTotals.slice(-36),
    lockedMonths: monthlyTotals.filter((month) => month.isLocked).slice(-24),
    monthlyUmbrella: monthlyUmbrella.slice(-120),
    spendAlerts,
    warnings: buildHealthWarnings({
      duplicateKeyCount: duplicateSummary.duplicateKeyCount,
      nullKeyRows: duplicateSummary.nullKeyRows,
      spendAlerts,
      recentAuditWarnings,
    }),
    recentSyncRuns: syncRuns,
    metaComparison: compareMonth
      ? await compareMetaAndSupabaseMonth(compareMonth, insightRows)
      : null,
    checks: {
      duplicateRowsOk: duplicateSummary.duplicateKeyCount === 0,
      nullKeysOk: duplicateSummary.nullKeyRows === 0,
      hasInsightRows: insightRows.length > 0,
      spendJumpsOk: spendAlerts.length === 0,
      recentSyncWarningsOk: recentAuditWarnings.length === 0,
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
    metrics: recordField(run.metrics),
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

function summarizeMonthlyTotals(insightRows: JsonRecord[], cutoff: string) {
  const byMonth = new Map<string, MonthlyDiagnostic>();

  insightRows.forEach((row) => {
    const date = stringField(row.date_start);
    if (!date) return;

    const month = date.slice(0, 7);
    const range = monthDateRange(month);
    if (!range) return;

    const current = byMonth.get(month) || {
      month,
      monthStart: range.start,
      monthEnd: range.end,
      lockStatus: lockStatusForMonth(month, cutoff),
      isLocked: lockStatusForMonth(month, cutoff) === "locked",
      previousSpend: null,
      spendDelta: 0,
      spendDeltaPct: null,
      ...emptyMetricTotals(),
    };
    addInsightRowToTotals(current, row);
    byMonth.set(month, current);
  });

  const sorted = Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month));
  return sorted.map((month, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    const spendDelta = roundCurrency(month.spend - (previous?.spend || 0));
    return {
      ...month,
      previousSpend: previous ? previous.spend : null,
      spendDelta,
      spendDeltaPct: previous && previous.spend > 0 ? spendDelta / previous.spend : null,
    };
  });
}

function summarizeMonthlyUmbrella(insightRows: JsonRecord[]) {
  const byKey = new Map<string, MonthlyUmbrellaDiagnostic>();

  insightRows.forEach((row) => {
    const date = stringField(row.date_start);
    if (!date) return;

    const month = date.slice(0, 7);
    const campaignUmbrella = stringField(row.campaign_umbrella) || "Needs review";
    const key = `${month}|${campaignUmbrella}`;
    const current = byKey.get(key) || {
      month,
      campaignUmbrella,
      ...emptyMetricTotals(),
    };
    addInsightRowToTotals(current, row);
    byKey.set(key, current);
  });

  return Array.from(byKey.values()).sort((a, b) =>
    `${a.month}|${a.campaignUmbrella}`.localeCompare(`${b.month}|${b.campaignUmbrella}`),
  );
}

function summarizeSpendAlerts(monthlyUmbrella: MonthlyUmbrellaDiagnostic[], cutoff: string) {
  const byUmbrella = new Map<string, MonthlyUmbrellaDiagnostic[]>();
  monthlyUmbrella.forEach((row) => {
    byUmbrella.set(row.campaignUmbrella, [...(byUmbrella.get(row.campaignUmbrella) || []), row]);
  });

  const alerts: SpendAlert[] = [];
  byUmbrella.forEach((rowsForUmbrella, campaignUmbrella) => {
    const sorted = [...rowsForUmbrella].sort((a, b) => a.month.localeCompare(b.month));
    sorted.forEach((row, index) => {
      const previous = index > 0 ? sorted[index - 1] : null;
      if (lockStatusForMonth(row.month, cutoff) === "active") return;
      if (!previous || previous.spend <= 0) return;

      const spendDelta = roundCurrency(row.spend - previous.spend);
      const spendDeltaPct = spendDelta / previous.spend;
      if (Math.abs(spendDelta) < 300 || Math.abs(spendDeltaPct) < 0.5) return;

      alerts.push({
        month: row.month,
        campaignUmbrella,
        spend: row.spend,
        previousSpend: previous.spend,
        spendDelta,
        spendDeltaPct,
      });
    });
  });

  return alerts
    .sort((a, b) => Math.abs(b.spendDelta) - Math.abs(a.spendDelta))
    .slice(0, 12);
}

async function compareMetaAndSupabaseMonth(month: string, insightRows: JsonRecord[]) {
  const range = monthDateRange(month);
  if (!range) return null;

  try {
    const metaTotals = await fetchMetaAccountInsightTotalsForRange({
      since: range.start,
      until: range.end,
    });
    const supabaseByAccount = summarizeAccountTotalsForRange(insightRows, range);
    const accounts = metaTotals.map((meta) => {
      const supabase = supabaseByAccount.get(meta.metaAccountId) || emptyMetricTotals();
      const delta = diffMetricTotals(supabase, meta);
      return {
        brandCode: meta.brandCode,
        metaAccountId: meta.metaAccountId,
        supabase,
        meta,
        delta,
        spendDeltaPct: meta.spend > 0 ? delta.spend / meta.spend : null,
      };
    });
    const totals = accounts.reduce(
      (acc, account) => ({
        supabase: addTotals(acc.supabase, account.supabase),
        meta: addTotals(acc.meta, account.meta),
      }),
      { supabase: emptyMetricTotals(), meta: emptyMetricTotals() },
    );

    return {
      month,
      start: range.start,
      end: range.end,
      comparedAt: new Date().toISOString(),
      accounts,
      totals: {
        ...totals,
        delta: diffMetricTotals(totals.supabase, totals.meta),
        spendDeltaPct:
          totals.meta.spend > 0
            ? diffMetricTotals(totals.supabase, totals.meta).spend / totals.meta.spend
            : null,
      },
      error: null,
    };
  } catch (error) {
    return {
      month,
      start: range.start,
      end: range.end,
      comparedAt: new Date().toISOString(),
      accounts: [],
      totals: null,
      error: errorToMessage(error),
    };
  }
}

function summarizeAccountTotalsForRange(insightRows: JsonRecord[], range: { start: string; end: string }) {
  const byAccount = new Map<string, MetricTotals>();
  insightRows.forEach((row) => {
    const date = stringField(row.date_start);
    const metaAccountId = stringField(row.meta_account_id);
    if (!date || !metaAccountId || date < range.start || date > range.end) return;

    const current = byAccount.get(metaAccountId) || emptyMetricTotals();
    addInsightRowToTotals(current, row);
    byAccount.set(metaAccountId, current);
  });
  return byAccount;
}

function buildHealthWarnings(input: {
  duplicateKeyCount: number;
  nullKeyRows: number;
  spendAlerts: SpendAlert[];
  recentAuditWarnings: string[];
}) {
  const warnings: string[] = [];
  if (input.duplicateKeyCount) {
    warnings.push(`${input.duplicateKeyCount} duplicate account/ad/date key(s) were found.`);
  }
  if (input.nullKeyRows) {
    warnings.push(`${input.nullKeyRows} insight row(s) are missing account, ad, or date keys.`);
  }
  input.spendAlerts.slice(0, 6).forEach((alert) => {
    warnings.push(
      `${alert.month} ${alert.campaignUmbrella} spend moved ${formatPct(alert.spendDeltaPct)} vs prior month.`,
    );
  });
  warnings.push(...input.recentAuditWarnings.slice(0, 6));
  return warnings;
}

function mapLastSync(run: Awaited<ReturnType<typeof fetchRecentSyncRuns>>[number] | undefined) {
  if (!run) return null;
  return {
    id: run.id,
    trigger: run.trigger,
    status: run.status,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    warnings: syncRunAuditWarnings(run),
    errors: run.errors,
  };
}

function syncRunAuditWarnings(run: { metrics: JsonRecord }) {
  const audit = recordField(run.metrics.audit);
  return Array.isArray(audit.warnings) ? audit.warnings.map(String) : [];
}

function lockStatusForMonth(month: string, cutoff: string): "locked" | "settling" | "active" {
  const range = monthDateRange(month);
  if (!range) return "active";
  if (range.end < cutoff) return "locked";
  if (range.start < cutoff) return "settling";
  return "active";
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

function normalizeMonthInput(value: string | null | undefined) {
  return monthDateRange(value) && value ? value : null;
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function recordField(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as JsonRecord) : {};
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

function emptyMetricTotals(): MetricTotals {
  return {
    rows: 0,
    spend: 0,
    impressions: 0,
    clicks: 0,
    leads: 0,
    bookings: 0,
    conversions: 0,
  };
}

function addInsightRowToTotals<T extends MetricTotals>(totals: T, row: JsonRecord) {
  totals.rows += 1;
  totals.spend = roundCurrency(totals.spend + numberField(row.spend));
  totals.impressions += Math.round(numberField(row.impressions));
  totals.clicks += Math.round(numberField(row.clicks));
  totals.leads += Math.round(numberField(row.leads));
  totals.bookings += Math.round(numberField(row.bookings));
  totals.conversions += Math.round(numberField(row.conversions));
  return totals;
}

function addTotals<T extends MetricTotals>(left: T, right: MetricTotals) {
  return {
    rows: left.rows + right.rows,
    spend: roundCurrency(left.spend + right.spend),
    impressions: left.impressions + right.impressions,
    clicks: left.clicks + right.clicks,
    leads: left.leads + right.leads,
    bookings: left.bookings + right.bookings,
    conversions: left.conversions + right.conversions,
  };
}

function diffMetricTotals(supabase: MetricTotals, meta: MetricTotals | MetaAccountInsightTotals) {
  return {
    rows: supabase.rows - meta.rows,
    spend: roundCurrency(supabase.spend - meta.spend),
    impressions: supabase.impressions - meta.impressions,
    clicks: supabase.clicks - meta.clicks,
    leads: supabase.leads - meta.leads,
    bookings: supabase.bookings - meta.bookings,
    conversions: supabase.conversions - meta.conversions,
  };
}

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function formatPct(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(value);
}

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
