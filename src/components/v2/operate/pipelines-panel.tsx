import { RunSyncButton } from "@/components/v2/optimize/sync-button";
import { formatCaliforniaDateTime } from "@/lib/california-time";
import type { MetaAdsBackfillChunk, MetaAdsBackfillJob } from "@/lib/meta-backfill";
import { incrementalSyncDays } from "@/lib/meta-backfill-utils";

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
  const syncDays = incrementalSyncDays();

  return (
    <div className="space-y-6">
      {canRunSync ? (
        <section className="flex flex-col items-start gap-3 border border-hp-rule bg-hp-card p-5">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-title)] text-xl text-hp-ink">Manual Meta sync</h2>
            </div>
            <div className="flex flex-col items-end gap-2 sm:flex-row">
              <RunSyncButton size="sm" />
              <RunSyncButton
                size="sm"
                mode="catalog"
                label="Refresh catalog"
                runningLabel="Refreshing…"
                variant="secondary"
              />
            </div>
          </div>
          <div className="grid w-full gap-3 border-t border-hp-rule-soft pt-4 text-xs text-hp-body sm:grid-cols-2">
            <div className="border-l-2 border-hp-pink pl-3">
              <h3 className="font-[family-name:var(--font-title)] text-base text-hp-ink">Run Meta sync now</h3>
              <p className="mt-1">
                Use this most of the time. It updates the dashboard numbers for the last{" "}
                {syncDays} California days and is the faster, lighter sync.
              </p>
            </div>
            <div className="border-l-2 border-hp-rule pl-3">
              <h3 className="font-[family-name:var(--font-title)] text-base text-hp-ink">Refresh catalog</h3>
              <p className="mt-1">
                Use this only when an ad, creative, thumbnail, or preview looks missing
                or wrong. It reloads the full Meta ad and creative list, so it can take longer.
              </p>
            </div>
          </div>
          <p className="text-xs font-medium text-hp-body">
            If you are not sure, choose Run Meta sync now.
          </p>
        </section>
      ) : null}

      <section
        aria-label="Recent sync runs"
        className="overflow-hidden border border-hp-rule bg-hp-card"
      >
        <header className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <span>Recent sync runs</span>
          <span>{syncRuns.length}</span>
        </header>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            <tr className="border-b border-hp-rule">
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
                <td colSpan={6} className="px-4 py-4 text-center text-hp-muted">
                  No sync runs yet.
                </td>
              </tr>
            ) : (
              syncRuns.map((run) => (
                <tr key={run.id} className="border-b border-hp-rule-soft">
                  <Td>
                    <div className="flex flex-col">
                      {run.startedAt ? (
                        <time dateTime={run.startedAt}>{formatCaliforniaDateTime(run.startedAt)}</time>
                      ) : (
                        <span>—</span>
                      )}
                      <span className="text-[10px] text-hp-muted">
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
                    <code className="text-[11px] text-hp-body">{summarizeMetrics(run.metrics)}</code>
                  </Td>
                  <Td>
                    {Array.isArray(run.errors) && run.errors.length > 0 ? (
                      <span className="text-signal-danger">
                        {(run.errors as string[]).slice(0, 2).join("; ")}
                        {(run.errors as string[]).length > 2 ? "…" : ""}
                      </span>
                    ) : (
                      <span className="text-hp-muted">—</span>
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
        className="overflow-hidden border border-hp-rule bg-hp-card"
      >
        <header className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          <span>Backfill jobs</span>
          <span>{backfillJobs.length}</span>
        </header>
        {backfillJobs.length === 0 ? (
          <div className="px-4 py-4 text-center text-sm text-hp-muted">
            No backfill jobs in this environment. Historical history loads via Operate → New job
            in a future build.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              <tr className="border-b border-hp-rule">
                <Th>Range</Th>
                <Th>Status</Th>
                <Th>Chunks</Th>
                <Th>Started</Th>
                <Th>Completed</Th>
              </tr>
            </thead>
            <tbody>
              {backfillJobs.map((job) => (
                <tr key={job.id} className="border-b border-hp-rule-soft">
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
                        <span className="ml-1 text-signal-danger">
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
          className="overflow-hidden border border-hp-rule bg-hp-card"
        >
          <header className="flex items-center justify-between border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            <span>Recent backfill chunks</span>
            <span>{backfillChunks.length}</span>
          </header>
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
              <tr className="border-b border-hp-rule">
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
                <tr key={chunk.id} className="border-b border-hp-rule-soft">
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
                      <span className="text-signal-danger">{chunk.error.slice(0, 80)}</span>
                    ) : (
                      <span className="text-hp-muted">—</span>
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
    <td className={`px-3 py-2 align-middle text-hp-body ${className ?? ""}`}>
      {children}
    </td>
  );
}

function StatusChip({ status }: { status: string | null | undefined }) {
  const value = status ?? "—";
  const color = statusColor(value);
  return (
    <span
      className="inline-flex h-[22px] items-center border px-2 text-[10px] font-bold uppercase tracking-[0.14em]"
      style={{ borderColor: color, color, backgroundColor: statusBg(value) }}
    >
      {value}
    </span>
  );
}

function statusColor(value: string): string {
  const v = value.toLowerCase();
  if (v === "success" || v === "completed" || v === "done") return "var(--positive)";
  if (v === "running" || v === "in_progress") return "var(--info)";
  if (v === "queued" || v === "pending" || v === "partial") return "var(--warning)";
  if (v === "failed" || v === "error") return "var(--danger)";
  return "var(--ink-muted)";
}

function statusBg(value: string): string {
  const v = value.toLowerCase();
  if (v === "success" || v === "completed" || v === "done") return "var(--positive-bg)";
  if (v === "running" || v === "in_progress") return "var(--info-bg)";
  if (v === "queued" || v === "pending" || v === "partial") return "var(--warning-bg)";
  if (v === "failed" || v === "error") return "var(--danger-bg)";
  return "transparent";
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
