import { createAdsAnalystClient } from "./ads-analyst-db.ts";
import {
  finalizedInsightCutoffDate,
  monthDateRange,
  todayString,
} from "./meta-backfill-utils.ts";

type RollupRefreshClient = {
  rpc: (
    name: "refresh_meta_daily_insight_rollups",
    args: RefreshMetaInsightRollupsRpcArgs,
  ) => Promise<{ data: number | string | null; error: Error | null }>;
};

type RollupHealthClient = {
  rpc: (
    name: "meta_insight_rollup_health",
    args: MetaInsightRollupHealthRpcArgs,
  ) => Promise<{ data: unknown; error: Error | null }>;
};

export type RefreshMetaInsightRollupsInput = {
  start: string | null;
  end: string | null;
  metaAccountId?: string | null;
};

export type RefreshMetaInsightRollupsRpcArgs = {
  p_start: string | null;
  p_end: string | null;
  p_meta_account_id: string | null;
};

export type MetaInsightRollupHealthInput = {
  start?: string | null;
  end?: string | null;
  environment?: string | null;
};

export type MetaInsightRollupHealthRpcArgs = {
  p_start: string | null;
  p_end: string | null;
  p_environment: string | null;
};

export type MetaInsightRollupHealth = {
  rawRows: number;
  rollupRows: number;
  missingRollups: number;
  staleRollups: number;
  orphanRollups: number;
  newestRawUpdate: string | null;
  newestRollupUpdate: string | null;
  oldestProblemDate: string | null;
  repairMetaAccountId: string | null;
  repairMonth: string | null;
  ok: boolean;
};

export type RepairMetaInsightRollupChunkInput = {
  start: string;
  end: string;
  metaAccountId: string;
};

export type RepairNextMetaInsightRollupChunkResult =
  | {
      status: "healthy";
      health: MetaInsightRollupHealth;
      repair: null;
    }
  | {
      status: "repaired";
      health: MetaInsightRollupHealth;
      repair: {
        start: string;
        end: string;
        metaAccountId: string;
        month: string;
        refreshedRows: number;
      };
    };

export const MAX_ROLLUP_REPAIR_DAYS = 31;

export async function refreshMetaInsightRollups(
  input: RefreshMetaInsightRollupsInput,
  client: RollupRefreshClient = createAdsAnalystClient("worker") as unknown as RollupRefreshClient,
) {
  if (!input.start || !input.end) return 0;

  const { data, error } = await client.rpc(
    "refresh_meta_daily_insight_rollups",
    refreshMetaInsightRollupsRpcArgs(input),
  );

  if (error) throw error;

  const refreshedRows = Number(data ?? 0);
  return Number.isFinite(refreshedRows) ? refreshedRows : 0;
}

export async function getMetaInsightRollupHealth(
  input: MetaInsightRollupHealthInput = {},
  client: RollupHealthClient = createAdsAnalystClient("web") as unknown as RollupHealthClient,
): Promise<MetaInsightRollupHealth> {
  const { data, error } = await client.rpc(
    "meta_insight_rollup_health",
    metaInsightRollupHealthRpcArgs(input),
  );

  if (error) throw error;

  return mapMetaInsightRollupHealth(firstRow(data));
}

export async function getRecentMetaInsightRollupHealth(
  client?: RollupHealthClient,
  now = new Date(),
) {
  return getMetaInsightRollupHealth(recentRollupHealthInput(now), client);
}

export async function repairMetaInsightRollupChunk(
  input: RepairMetaInsightRollupChunkInput,
  client?: RollupRefreshClient,
) {
  assertBoundedRollupRepair(input);
  return refreshMetaInsightRollups(
    {
      start: input.start,
      end: input.end,
      metaAccountId: input.metaAccountId,
    },
    client,
  );
}

export async function repairNextMetaInsightRollupChunk(
  input: MetaInsightRollupHealthInput = {},
  clients: {
    health?: RollupHealthClient;
    refresh?: RollupRefreshClient;
  } = {},
): Promise<RepairNextMetaInsightRollupChunkResult> {
  const health = await getMetaInsightRollupHealth(input, clients.health);
  if (health.ok || !health.repairMetaAccountId || !health.repairMonth) {
    return { status: "healthy", health, repair: null };
  }

  const monthRange = monthDateRange(health.repairMonth);
  if (!monthRange) {
    return { status: "healthy", health, repair: null };
  }

  const start = maxDate(monthRange.start, input.start ?? null);
  const end = minDate(monthRange.end, input.end ?? null);
  const refreshedRows = await repairMetaInsightRollupChunk(
    {
      start,
      end,
      metaAccountId: health.repairMetaAccountId,
    },
    clients.refresh,
  );

  return {
    status: "repaired",
    health,
    repair: {
      start,
      end,
      metaAccountId: health.repairMetaAccountId,
      month: health.repairMonth,
      refreshedRows,
    },
  };
}

export function refreshMetaInsightRollupsRpcArgs(
  input: RefreshMetaInsightRollupsInput,
): RefreshMetaInsightRollupsRpcArgs {
  return {
    p_start: input.start,
    p_end: input.end,
    p_meta_account_id: input.metaAccountId ?? null,
  };
}

export function metaInsightRollupHealthRpcArgs(
  input: MetaInsightRollupHealthInput,
): MetaInsightRollupHealthRpcArgs {
  return {
    p_start: input.start ?? null,
    p_end: input.end ?? null,
    p_environment: input.environment ?? null,
  };
}

export function recentRollupHealthInput(now = new Date()): MetaInsightRollupHealthInput {
  return {
    start: finalizedInsightCutoffDate(process.env, now),
    end: todayString(now),
  };
}

export function formatMetaInsightRollupHealth(health: MetaInsightRollupHealth) {
  return `raw rows: ${health.rawRows}, rollup rows: ${health.rollupRows}, missing: ${health.missingRollups}, stale: ${health.staleRollups}`;
}

export function assertBoundedRollupRepair(input: RepairMetaInsightRollupChunkInput) {
  if (!input.metaAccountId) {
    throw new Error("Rollup repairs must be scoped to one Meta account.");
  }

  const days = inclusiveDateSpanDays(input.start, input.end);
  if (days === null || days < 1) {
    throw new Error("Rollup repair dates must be a valid YYYY-MM-DD range.");
  }
  if (days > MAX_ROLLUP_REPAIR_DAYS) {
    throw new Error(`Rollup repairs are limited to ${MAX_ROLLUP_REPAIR_DAYS} days.`);
  }
}

function mapMetaInsightRollupHealth(row: Record<string, unknown>): MetaInsightRollupHealth {
  return {
    rawRows: numberValue(row.raw_rows),
    rollupRows: numberValue(row.rollup_rows),
    missingRollups: numberValue(row.missing_rollups),
    staleRollups: numberValue(row.stale_rollups),
    orphanRollups: numberValue(row.orphan_rollups),
    newestRawUpdate: stringOrNull(row.newest_raw_update),
    newestRollupUpdate: stringOrNull(row.newest_rollup_update),
    oldestProblemDate: stringOrNull(row.oldest_problem_date),
    repairMetaAccountId: stringOrNull(row.repair_meta_account_id),
    repairMonth: stringOrNull(row.repair_month),
    ok: Boolean(row.ok),
  };
}

function firstRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return (data[0] || {}) as Record<string, unknown>;
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function stringOrNull(value: unknown) {
  if (typeof value === "string" && value.length) return value;
  return null;
}

function inclusiveDateSpanDays(start: string, end: string) {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate || startDate > endDate) return null;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1;
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

function maxDate(a: string, b: string | null) {
  return b && b > a ? b : a;
}

function minDate(a: string, b: string | null) {
  return b && b < a ? b : a;
}
