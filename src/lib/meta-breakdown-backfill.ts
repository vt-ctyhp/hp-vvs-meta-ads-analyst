import {
  createAdsAnalystClient,
  withAdsAnalystEnvironmentRows,
} from "./ads-analyst-db.ts";
import { ConfigurationError, getOptionalEnv, isTruthyEnv } from "./env.ts";
import { safeErrorMessage as errorToMessage } from "./error-message.ts";
import {
  createMetaUsageCollector,
  fetchMetaInsightBreakdownDailyRows,
  getConfiguredAccounts,
  getMetaApiUsageWarnPercent,
  isMetaUsageOverThreshold,
  META_INSIGHT_BREAKDOWN_SETS,
  type MetaInsightBreakdownSet,
  validateMetaAdsSyncPermissions,
  withMetaUsageCollector,
} from "./meta.ts";
import {
  monthlyDateChunks,
  normalizeDateInput,
  todayString,
  type DateChunk,
} from "./meta-backfill-utils.ts";

type JsonRecord = Record<string, unknown>;
type BreakdownChunkStatus = "queued" | "running" | "success" | "failed" | "canceled";

type BreakdownChunk = {
  id: string;
  metaAccountId: string;
  brandCode: string;
  startDate: string;
  endDate: string;
  breakdownSet: MetaInsightBreakdownSet;
  status: BreakdownChunkStatus;
};

type SupabaseResult = { data: unknown; error: Error | null };
type SupabaseChain = PromiseLike<SupabaseResult> & {
  select: (...args: unknown[]) => SupabaseChain;
  upsert: (...args: unknown[]) => SupabaseChain;
  update: (...args: unknown[]) => SupabaseChain;
  eq: (...args: unknown[]) => SupabaseChain;
  in: (...args: unknown[]) => SupabaseChain;
};
type SupabaseAny = {
  from: (table: string) => SupabaseChain;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<SupabaseResult>;
};

export async function runMetaInsightBreakdownBackfillBatch(input: { limit?: number } = {}) {
  if (!isTruthyEnv("META_BREAKDOWN_BACKFILL_ENABLED")) {
    return {
      enabled: false,
      processed: 0,
      results: [],
    };
  }

  await validateMetaAdsSyncPermissions();
  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseAny;
  await ensureMetaInsightBreakdownBackfillChunks();

  const claim = await supabase.rpc("claim_meta_insight_breakdown_backfill_chunks", {
    p_limit: input.limit || getBreakdownBackfillChunksPerRun(),
  });
  if (claim.error) throw claim.error;

  const claimed = rows<JsonRecord>(claim.data).map(mapBreakdownChunk);
  const results: Array<{
    chunkId: string;
    status: "success" | "failed" | "deferred";
    rows: number;
    error?: string;
  }> = [];

  for (const chunk of claimed) {
    const usageCollector = createMetaUsageCollector();

    try {
      const rowsToStore = await withMetaUsageCollector(usageCollector, () =>
        fetchMetaInsightBreakdownDailyRows({
          metaAccountId: chunk.metaAccountId,
          since: chunk.startDate,
          until: chunk.endDate,
          breakdownSet: chunk.breakdownSet,
        }),
      );
      const storedRows = await upsertBreakdownRows(rowsToStore);
      const metaUsage = usageCollector.summary();

      const update = await supabase
        .from("meta_insight_breakdown_backfill_chunks")
        .update({
          status: "success",
          row_count: storedRows,
          metrics: { metaUsage },
          error: null,
          completed_at: new Date().toISOString(),
        })
        .eq("id", chunk.id);
      if (update.error) throw update.error;

      results.push({ chunkId: chunk.id, status: "success", rows: storedRows });

      if (isMetaUsageOverThreshold(metaUsage)) {
        await deferQueuedBreakdownChunks(
          chunk.metaAccountId,
          `Meta usage crossed ${getMetaApiUsageWarnPercent()}% after breakdown chunk.`,
        );
        break;
      }
    } catch (error) {
      const message = errorToMessage(error);
      if (isMetaRateLimitError(message)) {
        await deferBreakdownChunk(chunk.id, chunk.metaAccountId, message);
        results.push({ chunkId: chunk.id, status: "deferred", rows: 0, error: message });
        break;
      }

      const update = await supabase
        .from("meta_insight_breakdown_backfill_chunks")
        .update({
          status: "failed",
          error: message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", chunk.id);
      if (update.error) throw update.error;
      results.push({ chunkId: chunk.id, status: "failed", rows: 0, error: message });
    }
  }

  return {
    enabled: true,
    processed: results.length,
    results,
  };
}

async function ensureMetaInsightBreakdownBackfillChunks() {
  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseAny;
  const accounts = getConfiguredAccounts();
  const { start, end } = resolveBreakdownBackfillRange();
  const monthChunks = monthlyDateChunks(start, end).reverse();
  const chunkRows = accounts.flatMap((account) =>
    monthChunks.flatMap((chunk) =>
      META_INSIGHT_BREAKDOWN_SETS.map((breakdownSet) =>
        breakdownChunkRow(account.brandCode, `act_${normalizeAccountId(account.accountId)}`, chunk, breakdownSet),
      ),
    ),
  );

  for (const chunk of chunks(chunkRows, 500)) {
    const insert = await supabase
      .from("meta_insight_breakdown_backfill_chunks")
      .upsert(withAdsAnalystEnvironmentRows(chunk), {
        onConflict: "environment,meta_account_id,start_date,end_date,breakdown_set",
        ignoreDuplicates: true,
      });
    if (insert.error) throw insert.error;
  }
}

async function upsertBreakdownRows(rowsToStore: JsonRecord[]) {
  const validRows = rowsToStore.filter((row) =>
    row.meta_account_id && row.date_start && row.level && row.breakdown_set && row.breakdown_key
  );
  if (!validRows.length) return 0;

  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseAny;
  let count = 0;

  for (const chunk of chunks(validRows, 500)) {
    const res = await supabase
      .from("meta_insight_breakdown_daily")
      .upsert(withAdsAnalystEnvironmentRows(chunk), {
        onConflict: "environment,meta_account_id,date_start,level,breakdown_set,breakdown_key",
      })
      .select("id");
    if (res.error) throw res.error;
    count += rows<JsonRecord>(res.data).length;
  }

  return count;
}

async function deferBreakdownChunk(chunkId: string, metaAccountId: string, message: string) {
  const retryAfter = new Date(Date.now() + getRateLimitRetryDelayMs()).toISOString();
  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseAny;
  const update = await supabase
    .from("meta_insight_breakdown_backfill_chunks")
    .update({
      status: "queued",
      error: message,
      locked_at: null,
      retry_after: retryAfter,
      completed_at: null,
    })
    .eq("id", chunkId);
  if (update.error) throw update.error;

  const accountBackoff = await supabase
    .from("meta_insight_breakdown_backfill_chunks")
    .update({ retry_after: retryAfter })
    .eq("meta_account_id", metaAccountId)
    .in("status", ["queued"]);
  if (accountBackoff.error) throw accountBackoff.error;
}

async function deferQueuedBreakdownChunks(metaAccountId: string, message: string) {
  const retryAfter = new Date(Date.now() + getRateLimitRetryDelayMs()).toISOString();
  const supabase = createAdsAnalystClient("worker") as unknown as SupabaseAny;
  const update = await supabase
    .from("meta_insight_breakdown_backfill_chunks")
    .update({ retry_after: retryAfter, error: message })
    .eq("meta_account_id", metaAccountId)
    .in("status", ["queued"]);
  if (update.error) throw update.error;
}

function resolveBreakdownBackfillRange() {
  let start = normalizeDateInput(getOptionalEnv("META_BREAKDOWN_BACKFILL_START_DATE", "")) ||
    normalizeDateInput(getOptionalEnv("META_BACKFILL_START_DATE", "")) ||
    "2007-01-01";
  let end = normalizeDateInput(getOptionalEnv("META_BREAKDOWN_BACKFILL_END_DATE", "")) ||
    todayString();
  if (start > end) [start, end] = [end, start];
  return { start, end };
}

function getBreakdownBackfillChunksPerRun() {
  const value = Number(process.env.META_ENRICHMENT_BACKFILL_CHUNKS_PER_RUN);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

function getRateLimitRetryDelayMs() {
  const minutes = Number(process.env.META_BACKFILL_RATE_LIMIT_RETRY_MINUTES);
  const retryMinutes = Number.isFinite(minutes) && minutes > 0 ? minutes : 60;
  return retryMinutes * 60 * 1000;
}

function isMetaRateLimitError(message: string) {
  return /rate[- ]?limit|too many calls|application request limit|business use case usage limit/i.test(message);
}

function breakdownChunkRow(
  brandCode: string,
  metaAccountId: string,
  chunk: DateChunk,
  breakdownSet: MetaInsightBreakdownSet,
) {
  return {
    meta_account_id: metaAccountId,
    brand_code: brandCode,
    start_date: chunk.start,
    end_date: chunk.end,
    breakdown_set: breakdownSet,
    status: "queued",
  };
}

function mapBreakdownChunk(row: JsonRecord): BreakdownChunk {
  const breakdownSet = stringField(row.breakdown_set);
  if (!isMetaInsightBreakdownSet(breakdownSet)) {
    throw new ConfigurationError(`Invalid Meta breakdown set: ${String(row.breakdown_set)}`);
  }

  return {
    id: String(row.id),
    metaAccountId: String(row.meta_account_id),
    brandCode: String(row.brand_code),
    startDate: String(row.start_date),
    endDate: String(row.end_date),
    breakdownSet,
    status: String(row.status) as BreakdownChunkStatus,
  };
}

function isMetaInsightBreakdownSet(value: string | null): value is MetaInsightBreakdownSet {
  return Boolean(value && (META_INSIGHT_BREAKDOWN_SETS as readonly string[]).includes(value));
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

function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

function stringField(value: unknown): string | null {
  if (typeof value === "string" && value.length) return value;
  if (typeof value === "number") return String(value);
  return null;
}
