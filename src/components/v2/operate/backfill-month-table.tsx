import { formatCaliforniaDateTime } from "@/lib/california-time";
import type {
  BackfillMonthLoadStatus,
  BackfillMonthLockStatus,
  BackfillMonthSyncStatus,
  MetaAdsBackfillMonthRow,
} from "@/lib/meta-backfill-months";

type Props = {
  rows: MetaAdsBackfillMonthRow[];
  rangeStart: string;
  rangeEnd: string;
};

export function BackfillMonthTable({ rows, rangeStart, rangeEnd }: Props) {
  const newestFirst = rows.slice().reverse();
  const syncedCount = rows.filter((row) => row.syncStatus === "synced").length;
  const loadedCount = rows.filter(
    (row) => row.loadStatus === "loaded" || row.loadStatus === "loaded_no_data",
  ).length;
  const lockedCount = rows.filter((row) => row.lockStatus === "locked").length;

  if (rows.length === 0) {
    return (
      <div className="border border-dashed border-hp-rule bg-hp-card/60 p-8 text-center text-sm text-hp-muted">
        No backfill months are available for this environment.
      </div>
    );
  }

  return (
    <section className="overflow-hidden border border-hp-rule bg-hp-card">
      <header className="flex flex-col gap-2 border-b border-hp-rule bg-hp-inset px-5 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-title)] text-xl text-hp-ink">Backfill month status</h2>
          <p className="mt-1 text-xs text-hp-body">
            Historical backfill only. Normal incremental syncs do not mark a month synced.
          </p>
        </div>
        <div className="text-left text-xs text-hp-body sm:text-right">
          <div className="tabular-nums">
            {rangeStart} to {rangeEnd}
          </div>
          <div className="mt-1">
            {syncedCount}/{rows.length} synced · {loadedCount}/{rows.length} loaded ·{" "}
            {lockedCount} locked
          </div>
        </div>
      </header>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
            <tr className="border-b border-hp-rule">
              <Th>Month</Th>
              <Th>Synced</Th>
              <Th>Supabase Loaded</Th>
              <Th>Locked</Th>
              <Th>Accounts Complete</Th>
              <Th>Insight Rows</Th>
              <Th>Latest Backfill/Resync</Th>
              <Th>Notes</Th>
            </tr>
          </thead>
          <tbody>
            {newestFirst.map((row) => (
              <tr key={row.month} className="border-b border-hp-rule-soft">
                <Td>
                  <div className="flex flex-col">
                    <span className="font-[family-name:var(--font-title)] text-base text-hp-ink">{row.month}</span>
                    <span className="text-[10px] text-hp-muted tabular-nums">
                      {row.monthStart} to {row.monthEnd}
                    </span>
                  </div>
                </Td>
                <Td>
                  <SyncPill status={row.syncStatus} />
                </Td>
                <Td>
                  <LoadPill status={row.loadStatus} />
                </Td>
                <Td>
                  <LockPill status={row.lockStatus} />
                </Td>
                <Td className="tabular-nums">
                  {row.completeAccounts}/{row.accountCount}
                </Td>
                <Td className="tabular-nums">{row.insightRows.toLocaleString()}</Td>
                <Td>
                  {row.latestBackfillOrResyncAt ? (
                    <time dateTime={row.latestBackfillOrResyncAt}>
                      {formatCaliforniaDateTime(row.latestBackfillOrResyncAt)}
                    </time>
                  ) : (
                    <span className="text-hp-muted">-</span>
                  )}
                </Td>
                <Td>
                  {row.notes.length > 0 ? (
                    <span className="text-xs text-hp-body">{row.notes.join(" ")}</span>
                  ) : (
                    <span className="text-hp-muted">-</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

function SyncPill({ status }: { status: BackfillMonthSyncStatus }) {
  const labels: Record<BackfillMonthSyncStatus, string> = {
    synced: "Synced",
    partial: "Partial",
    missing: "Missing",
  };
  return <StatusPill label={labels[status]} tone={statusTone(status)} />;
}

function LoadPill({ status }: { status: BackfillMonthLoadStatus }) {
  const labels: Record<BackfillMonthLoadStatus, string> = {
    loaded: "Loaded",
    loaded_no_data: "Loaded, no data",
    partial: "Partial",
    missing: "Missing",
  };
  return <StatusPill label={labels[status]} tone={statusTone(status)} />;
}

function LockPill({ status }: { status: BackfillMonthLockStatus }) {
  const labels: Record<BackfillMonthLockStatus, string> = {
    locked: "Locked",
    settling: "Settling",
    active: "Active",
  };
  return <StatusPill label={labels[status]} tone={statusTone(status)} />;
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "good" | "warn" | "bad" | "neutral" | "info";
}) {
  const className = {
    good: "border-signal-positive bg-signal-positive-bg text-signal-positive",
    warn: "border-signal-warning bg-signal-warning-bg text-signal-warning",
    bad: "border-signal-danger bg-signal-danger-bg text-signal-danger",
    neutral: "border-hp-rule bg-hp-card text-hp-muted",
    info: "border-signal-info bg-signal-info-bg text-signal-info",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-[22px] items-center whitespace-nowrap border px-2 text-[10px] font-bold uppercase tracking-[0.14em] ${className}`}
    >
      {label}
    </span>
  );
}

function statusTone(
  status: BackfillMonthSyncStatus | BackfillMonthLoadStatus | BackfillMonthLockStatus,
) {
  if (status === "synced" || status === "loaded" || status === "locked") return "good";
  if (status === "loaded_no_data" || status === "settling" || status === "partial")
    return "warn";
  if (status === "missing") return "bad";
  return "info";
}
