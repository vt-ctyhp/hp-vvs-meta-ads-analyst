import { monthDateRange, monthlyDateChunks } from "./meta-backfill-utils.ts";

export type BackfillMonthAccount = {
  metaAccountId: string;
  accountName?: string | null;
};

export type BackfillMonthChunk = {
  metaAccountId: string;
  startDate: string;
  endDate: string;
  status: string;
  insightRows: number;
  completedAt: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type BackfillMonthCoverage = {
  metaAccountId: string;
  month: string;
  insightRows: number;
  firstDate: string | null;
  lastDate: string | null;
};

export type BackfillMonthSyncRun = {
  trigger: string | null;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metrics: unknown;
};

export type BackfillMonthSyncStatus = "synced" | "partial" | "missing";
export type BackfillMonthLoadStatus = "loaded" | "loaded_no_data" | "partial" | "missing";
export type BackfillMonthLockStatus = "locked" | "settling" | "active";

export type MetaAdsBackfillMonthRow = {
  month: string;
  monthStart: string;
  monthEnd: string;
  syncStatus: BackfillMonthSyncStatus;
  loadStatus: BackfillMonthLoadStatus;
  lockStatus: BackfillMonthLockStatus;
  accountCount: number;
  syncedAccounts: number;
  loadedAccounts: number;
  completeAccounts: number;
  insightRows: number;
  latestBackfillOrResyncAt: string | null;
  notes: string[];
};

export function buildMetaAdsBackfillMonthRows(input: {
  startDate: string;
  endDate: string;
  finalizedCutoffDate: string;
  accounts: BackfillMonthAccount[];
  chunks: BackfillMonthChunk[];
  coverage: BackfillMonthCoverage[];
  syncRuns?: BackfillMonthSyncRun[];
}): MetaAdsBackfillMonthRow[] {
  const accounts = dedupeAccounts(input.accounts);
  const monthChunks = monthlyDateChunks(input.startDate, input.endDate);
  const chunkLookup = successfulChunkLookup(input.chunks);
  const coverageLookup = coverageByAccountMonth(input.coverage);
  const resyncLookup = manualMonthResyncLookup(input.syncRuns || [], accounts.length);

  return monthChunks.map((chunk) => {
    const month = chunk.start.slice(0, 7);
    const syncedAccounts = new Set<string>();
    const loadedAccounts = new Set<string>();
    let insightRows = 0;
    let latestBackfillOrResyncAt: string | null = null;

    for (const account of accounts) {
      const key = accountMonthKey(account.metaAccountId, month);
      const coverage = coverageLookup.get(key);
      const successfulChunk = chunkLookup.get(key);
      const rows = coverage?.insightRows ?? successfulChunk?.insightRows ?? 0;

      insightRows += rows;

      if (successfulChunk) {
        syncedAccounts.add(account.metaAccountId);
        latestBackfillOrResyncAt = latestTimestamp(
          latestBackfillOrResyncAt,
          timestampForChunk(successfulChunk),
        );
      }

      if (rows > 0 || successfulChunk) {
        loadedAccounts.add(account.metaAccountId);
      }
    }

    const resync = resyncLookup.get(month);
    const resyncSyncedAccounts = Math.max(syncedAccounts.size, resync?.accountCount ?? 0);
    const resyncLoadedAccounts = resync
      ? Math.max(loadedAccounts.size, resync.accountCount)
      : loadedAccounts.size;
    if (resync) {
      insightRows = Math.max(insightRows, resync.insightRows);
    }

    latestBackfillOrResyncAt = latestTimestamp(
      latestBackfillOrResyncAt,
      resync?.completedAt || resync?.startedAt || null,
    );

    const syncedCount = clampCount(resyncSyncedAccounts, accounts.length);
    const loadedCount = clampCount(resyncLoadedAccounts, accounts.length);
    const syncStatus = completionStatus(syncedCount, accounts.length);
    const loadStatus = loadStatusFor({
      loadedCount,
      accountCount: accounts.length,
      insightRows,
    });
    const monthRange = monthDateRange(month);
    const monthStart = chunk.start || monthRange?.start || `${month}-01`;
    const monthEnd = chunk.end || monthRange?.end || monthStart;

    return {
      month,
      monthStart,
      monthEnd,
      syncStatus,
      loadStatus,
      lockStatus: lockStatusForRange(monthStart, monthEnd, input.finalizedCutoffDate),
      accountCount: accounts.length,
      syncedAccounts: syncedCount,
      loadedAccounts: loadedCount,
      completeAccounts: Math.min(syncedCount, loadedCount),
      insightRows,
      latestBackfillOrResyncAt,
      notes: notesForMonth({
        syncStatus,
        loadStatus,
        accountCount: accounts.length,
        syncedAccounts: syncedCount,
        loadedAccounts: loadedCount,
      }),
    };
  });
}

function dedupeAccounts(accounts: BackfillMonthAccount[]) {
  const byId = new Map<string, BackfillMonthAccount>();
  for (const account of accounts) {
    if (account.metaAccountId) byId.set(account.metaAccountId, account);
  }
  return Array.from(byId.values()).sort((a, b) => a.metaAccountId.localeCompare(b.metaAccountId));
}

function successfulChunkLookup(chunks: BackfillMonthChunk[]) {
  const lookup = new Map<string, BackfillMonthChunk>();

  for (const chunk of chunks) {
    if (chunk.status !== "success") continue;
    const month = chunk.startDate.slice(0, 7);
    const key = accountMonthKey(chunk.metaAccountId, month);
    const current = lookup.get(key);
    if (!current || timestampForChunk(chunk) > timestampForChunk(current)) {
      lookup.set(key, chunk);
    }
  }

  return lookup;
}

function coverageByAccountMonth(coverage: BackfillMonthCoverage[]) {
  const lookup = new Map<string, BackfillMonthCoverage>();

  for (const row of coverage) {
    lookup.set(accountMonthKey(row.metaAccountId, row.month), row);
  }

  return lookup;
}

function manualMonthResyncLookup(syncRuns: BackfillMonthSyncRun[], accountCount: number) {
  const lookup = new Map<
    string,
    { accountCount: number; insightRows: number; startedAt: string | null; completedAt: string | null }
  >();

  for (const run of syncRuns) {
    if (run.trigger !== "manual_month_resync") continue;
    if (run.status !== "success" && run.status !== "partial") continue;

    const metrics = recordField(run.metrics);
    const month = stringField(metrics.month);
    if (!month) continue;

    const runAccountCount =
      run.status === "success"
        ? accountCount
        : clampCount(numberField(metrics.accounts), accountCount);
    const current = lookup.get(month);
    const candidate = {
      accountCount: runAccountCount,
      insightRows: numberField(metrics.insightRows),
      startedAt: run.startedAt,
      completedAt: run.completedAt,
    };
    const candidateTimestamp = candidate.completedAt || candidate.startedAt || "";
    const currentTimestamp = current?.completedAt || current?.startedAt || "";

    if (!current || candidateTimestamp > currentTimestamp) {
      lookup.set(month, candidate);
    }
  }

  return lookup;
}

function accountMonthKey(metaAccountId: string, month: string) {
  return `${metaAccountId}::${month}`;
}

function completionStatus(completed: number, total: number): BackfillMonthSyncStatus {
  if (total > 0 && completed >= total) return "synced";
  if (completed > 0) return "partial";
  return "missing";
}

function loadStatusFor(input: {
  loadedCount: number;
  accountCount: number;
  insightRows: number;
}): BackfillMonthLoadStatus {
  if (input.accountCount > 0 && input.loadedCount >= input.accountCount) {
    return input.insightRows > 0 ? "loaded" : "loaded_no_data";
  }
  if (input.loadedCount > 0) return "partial";
  return "missing";
}

function lockStatusForRange(
  monthStart: string,
  monthEnd: string,
  cutoffDate: string,
): BackfillMonthLockStatus {
  if (monthEnd < cutoffDate) return "locked";
  if (monthStart < cutoffDate) return "settling";
  return "active";
}

function notesForMonth(input: {
  syncStatus: BackfillMonthSyncStatus;
  loadStatus: BackfillMonthLoadStatus;
  accountCount: number;
  syncedAccounts: number;
  loadedAccounts: number;
}) {
  const notes: string[] = [];

  if (input.accountCount === 0) {
    notes.push("No configured Meta accounts.");
    return notes;
  }

  if (input.syncStatus !== "synced") {
    notes.push(`${input.syncedAccounts}/${input.accountCount} accounts synced.`);
  }

  if (input.loadStatus === "loaded_no_data") {
    notes.push("Loaded successfully with no insight rows.");
  } else if (input.loadStatus !== "loaded") {
    notes.push(`${input.loadedAccounts}/${input.accountCount} accounts loaded.`);
  }

  return notes;
}

function timestampForChunk(chunk: BackfillMonthChunk) {
  return chunk.completedAt || chunk.updatedAt || chunk.createdAt || "";
}

function latestTimestamp(left: string | null, right: string | null | undefined) {
  if (!right) return left;
  if (!left || right > left) return right;
  return left;
}

function clampCount(value: number, max: number) {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), max);
}

function recordField(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberField(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function stringField(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}
