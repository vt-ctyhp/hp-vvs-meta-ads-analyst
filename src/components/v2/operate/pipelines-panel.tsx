import { RunSyncButton } from "@/components/v2/optimize/sync-button";
import { formatCaliforniaDateTime } from "@/lib/california-time";
import { tokens } from "@/lib/design-tokens";
import type { MetaAdsBackfillChunk, MetaAdsBackfillJob } from "@/lib/meta-backfill";

export type SyncRunRow = {
  id: string;
  trigger: string | null;
  status: string | null;
  startedAt: string | null;
  completedAt: string | null;
  metrics: unknown;
  errors: unknown;
};

type Props = {
  canRunSync: boolean;
  syncRuns: SyncRunRow[];
  backfillJobs: MetaAdsBackfillJob[];
  backfillChunks: MetaAdsBackfillChunk[];
};

/**
 * Pipelines tab — sync runs ledger, backfill jobs, recent backfill chunks,
 * and the operator action to trigger a manual sync.
 *
 * Server-rendered. Lists are bounded (last 25 sync runs, 10 backfill jobs,
 * 25 most recent chunks) to keep the page snappy.
 */

const RELATIVE = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function PipelinesPanel({
  canRunSync,
  syncRuns,
  backfillJobs,
  backfillChunks,
}: Props) {
  return (
    <div className="space-y-6">
      {canRunSync ? (
        <section className="flex flex-col items-start gap-3 rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex w-full items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-stone-900">Manual Meta sync</h2>
              <p className="text-xs text-stone-600">
                Refreshes the recent insight window from Meta without walking the full ad
                and creative catalog. Writes land as{" "}
                <code className="rounded bg-stone-100 px-1">environment=staging</code> in
                this build.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2 sm:flex-row">
              <RunSyncButton size="sm" />
              <RunSyncButton
                size="sm"
                mode="catalog"
                label="Refresh catalog"
                runningLabel="Refreshing…"
                variant="secondary"
                confirmMessage="Refresh the full Meta ad and creative catalog? Use this only when ads or creatives are missing; it can take several minutes."
              />
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Recent sync runs"
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">
          <span>Recent sync runs</span>
          <span>{syncRuns.length}</span>
        </header>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-wider text-stone-500">
            <tr className="border-b border-stone-200">
              <Th>Started</Th>
              <Th>Trigger</Th>
              <Th>Status</Th>
              <Th>Duration</Th>
              <Th>Counts</Th>
              <Th>Errors</Th>
            </tr>
          </thead>
          <tbody>
            {syncRuns.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-4 text-center text-stone-500">
                  No sync runs yet.
                </td>
              </tr>
            ) : (
              syncRuns.map((run) => (
                <tr key={run.id} className="border-b border-stone-100">
                  <Td>
                    <div className="flex flex-col">
                      {run.startedAt ? (
                        <time dateTime={run.startedAt}>{formatCaliforniaDateTime(run.startedAt)}</time>
                      ) : (
                        <span>—</span>
                      )}
                      <span className="text-[10px] text-stone-500">
                        {run.startedAt ? relativeTime(run.startedAt) : ""}
                      </span>
                    </div>
                  </Td>
                  <Td>{run.trigger ?? "—"}</Td>
                  <Td>
                    <StatusChip status={run.status} />
                  </Td>
                  <Td>{formatDuration(run.startedAt, run.completedAt)}</Td>
                  <Td>
                    <code className="text-[11px] text-stone-700">{summarizeMetrics(run.metrics)}</code>
                  </Td>
                  <Td>
                    {Array.isArray(run.errors) && run.errors.length > 0 ? (
                      <span className="text-rose-700">
                        {(run.errors as string[]).slice(0, 2).join("; ")}
                        {(run.errors as string[]).length > 2 ? "…" : ""}
                      </span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section
        aria-label="Backfill jobs"
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">
          <span>Backfill jobs</span>
          <span>{backfillJobs.length}</span>
        </header>
        {backfillJobs.length === 0 ? (
          <div className="px-4 py-4 text-center text-sm text-stone-500">
            No backfill jobs in this environment. Historical history loads via Operate → New job
            in a future build.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-200">
                <Th>Range</Th>
                <Th>Status</Th>
                <Th>Chunks</Th>
                <Th>Started</Th>
                <Th>Completed</Th>
              </tr>
            </thead>
            <tbody>
              {backfillJobs.map((job) => (
                <tr key={job.id} className="border-b border-stone-100">
                  <Td>
                    <span className="tabular-nums">
                      {job.requestedStart} → {job.requestedEnd}
                    </span>
                  </Td>
                  <Td>
                    <StatusChip status={job.status} />
                  </Td>
                  <Td>
                    <span className="tabular-nums">
                      {job.completedChunks}/{job.totalChunks}
                      {job.failedChunks > 0 ? (
                        <span className="ml-1 text-rose-700">
                          ({job.failedChunks} failed)
                        </span>
                      ) : null}
                    </span>
                  </Td>
                  <Td>
                    {job.startedAt ? (
                      <time dateTime={job.startedAt}>
                        {formatCaliforniaDateTime(job.startedAt)}
                      </time>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    {job.completedAt ? (
                      <time dateTime={job.completedAt}>
                        {formatCaliforniaDateTime(job.completedAt)}
                      </time>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {backfillChunks.length > 0 ? (
        <section
          aria-label="Recent backfill chunks"
          className="overflow-hidden rounded-xl border border-stone-200 bg-white"
        >
          <header className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">
            <span>Recent backfill chunks</span>
            <span>{backfillChunks.length}</span>
          </header>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-wider text-stone-500">
              <tr className="border-b border-stone-200">
                <Th>Account</Th>
                <Th>Range</Th>
                <Th>Status</Th>
                <Th>Attempts</Th>
                <Th>Insights</Th>
                <Th>Error</Th>
              </tr>
            </thead>
            <tbody>
              {backfillChunks.slice(0, 25).map((chunk) => (
                <tr key={chunk.id} className="border-b border-stone-100">
                  <Td>{chunk.brandCode}</Td>
                  <Td className="tabular-nums">
                    {chunk.startDate} → {chunk.endDate}
                  </Td>
                  <Td>
                    <StatusChip status={chunk.status} />
                  </Td>
                  <Td className="tabular-nums">{chunk.attempts}</Td>
                  <Td className="tabular-nums">{chunk.insightRows}</Td>
                  <Td>
                    {chunk.error ? (
                      <span className="text-rose-700">{chunk.error.slice(0, 80)}</span>
                    ) : (
                      <span className="text-stone-400">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left font-semibold">{children}</th>;
}

function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 align-middle text-stone-800 ${className ?? ""}`}>
      {children}
    </td>
  );
}

function StatusChip({ status }: { status: string | null | undefined }) {
  const value = status ?? "—";
  const color = statusColor(value);
  return (
    <span
      className="inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-medium capitalize"
      style={{ borderColor: color, color }}
    >
      {value}
    </span>
  );
}

function statusColor(value: string): string {
  const v = value.toLowerCase();
  if (v === "success" || v === "completed" || v === "done")
    return tokens.color.status.done;
  if (v === "running" || v === "in_progress") return tokens.color.status.running;
  if (v === "queued" || v === "pending") return tokens.color.status.queued;
  if (v === "failed" || v === "error") return tokens.color.status.failed;
  if (v === "partial") return tokens.color.status.snoozed;
  return tokens.color.light.textMuted;
}

function summarizeMetrics(metrics: unknown): string {
  if (!metrics || typeof metrics !== "object") return "—";
  const m = metrics as Record<string, unknown>;
  const parts: string[] = [];
  const fields: Array<[string, string]> = [
    ["campaigns", "c"],
    ["ads", "a"],
    ["creatives", "cr"],
    ["insightRows", "i"],
  ];
  for (const [key, short] of fields) {
    const v = m[key];
    if (typeof v === "number") parts.push(`${short}=${v}`);
  }
  return parts.join(" · ") || "—";
}

function relativeTime(iso: string): string {
  const diffMs = Date.parse(iso) - Date.now();
  const diffMin = Math.round(diffMs / 60000);
  if (Math.abs(diffMin) >= 1440) return RELATIVE.format(Math.round(diffMin / 1440), "day");
  if (Math.abs(diffMin) >= 60) return RELATIVE.format(Math.round(diffMin / 60), "hour");
  return RELATIVE.format(diffMin, "minute");
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m ${rem}s`;
}
