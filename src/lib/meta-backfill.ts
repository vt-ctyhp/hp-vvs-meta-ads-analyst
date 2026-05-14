import { ConfigurationError, getOptionalEnv } from "./env";
import { getConfiguredAccounts, syncMetaAdsAccountRange, validateMetaAdsSyncPermissions } from "./meta";
import {
  monthlyDateChunks,
  normalizeDateInput,
  todayString,
  type DateChunk,
} from "./meta-backfill-utils";
import { createServiceClient } from "./supabase";

type JsonRecord = Record<string, unknown>;
type BackfillStatus = "pending" | "running" | "paused" | "success" | "partial" | "failed" | "canceled";
type ChunkStatus = "queued" | "running" | "success" | "failed" | "canceled";

export type MetaAdsBackfillJob = {
  id: string;
  status: BackfillStatus;
  requestedStart: string;
  requestedEnd: string;
  accounts: Array<{ brandCode: string; metaAccountId: string }>;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  runningChunks: number;
  metrics: unknown;
  errors: unknown;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MetaAdsBackfillChunk = {
  id: string;
  jobId: string;
  metaAccountId: string;
  brandCode: string;
  startDate: string;
  endDate: string;
  status: ChunkStatus;
  attempts: number;
  insightRows: number;
  error: string | null;
  lockedAt: string | null;
  retryAfter: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MetaAdsHistoryCoverage = {
  metaAccountId: string;
  accountName: string | null;
  month: string;
  insightRows: number;
  firstDate: string | null;
  lastDate: string | null;
};

type SupabaseResult = { data: unknown; error: Error | null };
type SupabaseChain = PromiseLike<SupabaseResult> & {
  select: (...args: unknown[]) => SupabaseChain;
  order: (...args: unknown[]) => SupabaseChain;
  limit: (...args: unknown[]) => SupabaseChain;
  insert: (...args: unknown[]) => SupabaseChain;
  update: (...args: unknown[]) => SupabaseChain;
  eq: (...args: unknown[]) => SupabaseChain;
  in: (...args: unknown[]) => SupabaseChain;
  single: (...args: unknown[]) => SupabaseChain;
};
type SupabaseAny = {
  from: (table: string) => SupabaseChain;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
};

export async function getMetaAdsBackfillState(input: {
  startDate?: string | null;
  endDate?: string | null;
} = {}) {
  const supabase = createServiceClient() as unknown as SupabaseAny;
  const coverageStart = normalizeDateInput(input.startDate) || getBackfillStartDate();
  const coverageEnd = normalizeDateInput(input.endDate) || todayString();
  const [jobsRes, chunksRes, coverageRes] = await Promise.all([
    supabase
      .from("meta_ads_backfill_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("meta_ads_backfill_chunks")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(250),
    supabase.rpc("meta_ads_history_coverage", {
      p_start: coverageStart,
      p_end: coverageEnd,
    }),
  ]);

  const firstError = [jobsRes, chunksRes, coverageRes].find((res) => res.error)?.error;
  if (firstError) throw firstError;

  return {
    coverageRange: { start: coverageStart, end: coverageEnd },
    jobs: rows<JsonRecord>(jobsRes.data).map(mapJob),
    chunks: rows<JsonRecord>(chunksRes.data).map(mapChunk),
    coverage: rows<JsonRecord>(coverageRes.data).map(mapCoverage),
  };
}

export async function createMetaAdsBackfillJob(input: {
  startDate?: string | null;
  endDate?: string | null;
} = {}) {
  const supabase = createServiceClient() as unknown as SupabaseAny;
  const accounts = getConfiguredAccounts().map((account) => ({
    brandCode: account.brandCode,
    brandName: account.brandName,
    accountId: account.accountId,
    metaAccountId: `act_${normalizeAccountId(account.accountId)}`,
  }));
  const { start, end } = resolveBackfillRange(input.startDate, input.endDate);
  const monthChunks = monthlyDateChunks(start, end);
  const chunkRows = accounts.flatMap((account) =>
    monthChunks.map((chunk) => chunkRow(account.brandCode, account.metaAccountId, chunk)),
  );

  const jobInsert = await supabase
    .from("meta_ads_backfill_jobs")
    .insert({
      status: "pending",
      requested_start: start,
      requested_end: end,
      accounts: accounts.map((account) => ({
        brandCode: account.brandCode,
        metaAccountId: account.metaAccountId,
      })),
      total_chunks: chunkRows.length,
      metrics: { insightRows: 0 },
    })
    .select("*")
    .single();

  if (jobInsert.error) throw jobInsert.error;
  const job = jobInsert.data as JsonRecord;
  const jobId = String(job.id);

  for (const chunk of chunks(chunkRows, 500)) {
    const insert = await supabase
      .from("meta_ads_backfill_chunks")
      .insert(chunk.map((row) => ({ ...row, job_id: jobId })));
    if (insert.error) throw insert.error;
  }

  return refreshBackfillJobRollup(jobId);
}

export async function updateMetaAdsBackfillJob(input: {
  jobId: string;
  action: "pause" | "resume" | "cancel" | "retry_failed";
}) {
  const supabase = createServiceClient() as unknown as SupabaseAny;

  if (input.action === "pause") {
    const { error } = await supabase
      .from("meta_ads_backfill_jobs")
      .update({ status: "paused" })
      .eq("id", input.jobId);
    if (error) throw error;
  }

  if (input.action === "resume") {
    const { error } = await supabase
      .from("meta_ads_backfill_jobs")
      .update({ status: "pending", completed_at: null })
      .eq("id", input.jobId)
      .in("status", ["paused", "partial", "failed"]);
    if (error) throw error;
  }

  if (input.action === "cancel") {
    const [jobUpdate, chunkUpdate] = await Promise.all([
      supabase
        .from("meta_ads_backfill_jobs")
        .update({ status: "canceled", completed_at: new Date().toISOString() })
        .eq("id", input.jobId),
      supabase
        .from("meta_ads_backfill_chunks")
        .update({ status: "canceled", completed_at: new Date().toISOString() })
        .eq("job_id", input.jobId)
        .in("status", ["queued", "failed"]),
    ]);
    if (jobUpdate.error) throw jobUpdate.error;
    if (chunkUpdate.error) throw chunkUpdate.error;
  }

  if (input.action === "retry_failed") {
    const [jobUpdate, chunkUpdate] = await Promise.all([
      supabase
        .from("meta_ads_backfill_jobs")
        .update({ status: "pending", completed_at: null })
        .eq("id", input.jobId)
        .in("status", ["partial", "failed", "running", "pending"]),
      supabase
        .from("meta_ads_backfill_chunks")
        .update({ status: "queued", error: null, locked_at: null, completed_at: null })
        .eq("job_id", input.jobId)
        .eq("status", "failed"),
    ]);
    if (jobUpdate.error) throw jobUpdate.error;
    if (chunkUpdate.error) throw chunkUpdate.error;
  }

  return refreshBackfillJobRollup(input.jobId);
}

export async function runMetaAdsBackfillBatch(input: { limit?: number } = {}) {
  await validateMetaAdsSyncPermissions();

  const supabase = createServiceClient() as unknown as SupabaseAny;
  const limit = input.limit || getBackfillChunksPerRun();
  const claim = await supabase.rpc("claim_meta_ads_backfill_chunks", {
    p_limit: limit,
  });
  if (claim.error) throw claim.error;

  const claimed = rows<JsonRecord>(claim.data).map(mapChunk);
  const results: Array<{
    chunkId: string;
    status: "success" | "failed" | "deferred";
    insightRows: number;
    error?: string;
  }> = [];

  for (const chunk of claimed) {
    try {
      const account = accountConfigForChunk(chunk);
      const result = await syncMetaAdsAccountRange({
        account,
        since: chunk.startDate,
        until: chunk.endDate,
      });
      const update = await supabase
        .from("meta_ads_backfill_chunks")
        .update({
          status: "success",
          insight_rows: result.insightRows,
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", chunk.id);
      if (update.error) throw update.error;
      results.push({ chunkId: chunk.id, status: "success", insightRows: result.insightRows });
    } catch (error) {
      const message = errorToMessage(error);
      if (isMetaRateLimitError(message)) {
        const retryAfter = new Date(Date.now() + getRateLimitRetryDelayMs()).toISOString();
        const update = await supabase
          .from("meta_ads_backfill_chunks")
          .update({
            status: "queued",
            error: message,
            locked_at: null,
            retry_after: retryAfter,
            completed_at: null,
          })
          .eq("id", chunk.id);
        if (update.error) throw update.error;
        const accountBackoffUpdate = await supabase
          .from("meta_ads_backfill_chunks")
          .update({ retry_after: retryAfter })
          .eq("meta_account_id", chunk.metaAccountId)
          .in("status", ["queued"]);
        if (accountBackoffUpdate.error) throw accountBackoffUpdate.error;
        results.push({ chunkId: chunk.id, status: "deferred", insightRows: 0, error: message });
        break;
      }

      const update = await supabase
        .from("meta_ads_backfill_chunks")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", chunk.id);
      if (update.error) throw update.error;
      results.push({ chunkId: chunk.id, status: "failed", insightRows: 0, error: message });
    }
  }

  for (const jobId of Array.from(new Set(claimed.map((chunk) => chunk.jobId)))) {
    await refreshBackfillJobRollup(jobId);
  }

  return {
    processed: results.length,
    results,
  };
}

async function refreshBackfillJobRollup(jobId: string) {
  const supabase = createServiceClient() as unknown as SupabaseAny;
  const [jobRes, chunksRes] = await Promise.all([
    supabase.from("meta_ads_backfill_jobs").select("*").eq("id", jobId).single(),
    supabase.from("meta_ads_backfill_chunks").select("status,insight_rows,error").eq("job_id", jobId),
  ]);
  if (jobRes.error) throw jobRes.error;
  if (chunksRes.error) throw chunksRes.error;

  const job = jobRes.data as JsonRecord;
  const chunkRows = rows<JsonRecord>(chunksRes.data);
  const counts = chunkRows.reduce<{
    completed: number;
    failed: number;
    running: number;
    canceled: number;
    insightRows: number;
    errors: string[];
  }>(
    (acc, chunk) => {
      const status = String(chunk.status);
      if (status === "success") acc.completed += 1;
      if (status === "failed") acc.failed += 1;
      if (status === "running") acc.running += 1;
      if (status === "canceled") acc.canceled += 1;
      acc.insightRows += numberField(chunk.insight_rows);
      const error = stringField(chunk.error);
      if (error) acc.errors.push(error);
      return acc;
    },
    { completed: 0, failed: 0, running: 0, canceled: 0, insightRows: 0, errors: [] as string[] },
  );
  const total = numberField(job.total_chunks) || chunkRows.length;
  const priorStatus = String(job.status) as BackfillStatus;
  const terminalChunks = counts.completed + counts.failed + counts.canceled;
  const nextStatus: BackfillStatus =
    priorStatus === "paused" || priorStatus === "canceled"
      ? priorStatus
      : counts.running > 0
        ? "running"
        : total > 0 && counts.completed === total
          ? "success"
          : total > 0 && terminalChunks === total && counts.failed > 0
            ? "partial"
            : counts.failed > 0 && terminalChunks === total
              ? "failed"
              : "pending";

  const update = await supabase
    .from("meta_ads_backfill_jobs")
    .update({
      status: nextStatus,
      completed_chunks: counts.completed,
      failed_chunks: counts.failed,
      running_chunks: counts.running,
      metrics: { insightRows: counts.insightRows },
      errors: counts.errors.slice(0, 50),
      completed_at:
        nextStatus === "success" || nextStatus === "partial" || nextStatus === "failed" || nextStatus === "canceled"
          ? new Date().toISOString()
          : null,
    })
    .eq("id", jobId)
    .select("*")
    .single();

  if (update.error) throw update.error;
  return mapJob(update.data as JsonRecord);
}

function resolveBackfillRange(startDate: string | null | undefined, endDate: string | null | undefined) {
  let start = normalizeDateInput(startDate) || getBackfillStartDate();
  let end = normalizeDateInput(endDate) || todayString();
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

function getBackfillStartDate() {
  return normalizeDateInput(getOptionalEnv("META_BACKFILL_START_DATE", "")) || "2007-01-01";
}

function getBackfillChunksPerRun() {
  const value = Number(process.env.META_BACKFILL_CHUNKS_PER_RUN);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function getRateLimitRetryDelayMs() {
  const minutes = Number(process.env.META_BACKFILL_RATE_LIMIT_RETRY_MINUTES);
  const retryMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  return retryMinutes * 60 * 1000;
}

function isMetaRateLimitError(message: string) {
  return /rate[- ]?limit|too many calls|application request limit/i.test(message);
}

function chunkRow(brandCode: string, metaAccountId: string, chunk: DateChunk) {
  return {
    meta_account_id: metaAccountId,
    brand_code: brandCode,
    start_date: chunk.start,
    end_date: chunk.end,
    status: "queued",
  };
}

function accountConfigForChunk(chunk: MetaAdsBackfillChunk) {
  const account = getConfiguredAccounts().find(
    (candidate) => `act_${normalizeAccountId(candidate.accountId)}` === chunk.metaAccountId,
  );
  if (!account) {
    throw new ConfigurationError(`No configured Meta account matches ${chunk.metaAccountId}.`);
  }
  return account;
}

function normalizeAccountId(accountId: string) {
  return accountId.trim().replace(/^act_/, "");
}

function chunks<T>(items: T[], size: number) {
  const output: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    output.push(items.slice(index, index + size));
  }
  return output;
}

function mapJob(row: JsonRecord): MetaAdsBackfillJob {
  return {
    id: String(row.id),
    status: statusValue(row.status),
    requestedStart: String(row.requested_start),
    requestedEnd: String(row.requested_end),
    accounts: Array.isArray(row.accounts)
      ? (row.accounts as Array<{ brandCode: string; metaAccountId: string }>)
      : [],
    totalChunks: numberField(row.total_chunks),
    completedChunks: numberField(row.completed_chunks),
    failedChunks: numberField(row.failed_chunks),
    runningChunks: numberField(row.running_chunks),
    metrics: row.metrics || {},
    errors: row.errors || [],
    startedAt: stringField(row.started_at),
    completedAt: stringField(row.completed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapChunk(row: JsonRecord): MetaAdsBackfillChunk {
  return {
    id: String(row.id),
    jobId: String(row.job_id),
    metaAccountId: String(row.meta_account_id),
    brandCode: String(row.brand_code),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    status: chunkStatusValue(row.status),
    attempts: numberField(row.attempts),
    insightRows: numberField(row.insight_rows),
    error: stringField(row.error),
    lockedAt: stringField(row.locked_at),
    retryAfter: stringField(row.retry_after),
    completedAt: stringField(row.completed_at),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapCoverage(row: JsonRecord): MetaAdsHistoryCoverage {
  return {
    metaAccountId: String(row.meta_account_id),
    accountName: stringField(row.account_name),
    month: String(row.month),
    insightRows: numberField(row.insight_rows),
    firstDate: stringField(row.first_date),
    lastDate: stringField(row.last_date),
  };
}

function statusValue(value: unknown): BackfillStatus {
  const status = String(value);
  if (
    status === "pending" ||
    status === "running" ||
    status === "paused" ||
    status === "success" ||
    status === "partial" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }
  return "pending";
}

function chunkStatusValue(value: unknown): ChunkStatus {
  const status = String(value);
  if (
    status === "queued" ||
    status === "running" ||
    status === "success" ||
    status === "failed" ||
    status === "canceled"
  ) {
    return status;
  }
  return "queued";
}

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
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

function errorToMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
