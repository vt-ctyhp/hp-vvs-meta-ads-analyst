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
      <div className="rounded-xl border border-dashed border-stone-300 bg-white/60 p-8 text-center text-sm text-stone-600">
        No backfill months are available for this environment.
      </div>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <header className="flex flex-col gap-2 border-b border-stone-200 bg-stone-50 px-4 py-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-stone-900">Backfill month status</h2>
          <p className="mt-1 text-xs text-stone-600">
            Historical backfill only. Normal incremental syncs do not mark a month synced.
          </p>
        </div>
        <div className="text-left text-xs text-stone-600 sm:text-right">
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
          <thead className="text-[10px] uppercase tracking-wider text-stone-500">
            <tr className="border-b border-stone-200">
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
              <tr key={row.month} className="border-b border-stone-100">
                <Td>
                  <div className="flex flex-col">
                    <span className="font-medium text-stone-900">{row.month}</span>
                    <span className="text-[10px] text-stone-500 tabular-nums">
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
                    <span className="text-stone-400">-</span>
                  )}
                </Td>
                <Td>
                  {row.notes.length > 0 ? (
                    <span className="text-xs text-stone-700">{row.notes.join(" ")}</span>
                  ) : (
                    <span className="text-stone-400">-</span>
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
    <td className={`px-3 py-2 align-middle text-stone-800 ${className ?? ""}`}>
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
    good: "border-emerald-700 text-emerald-700",
    warn: "border-amber-700 text-amber-700",
    bad: "border-rose-700 text-rose-700",
    neutral: "border-stone-400 text-stone-600",
    info: "border-sky-700 text-sky-700",
  }[tone];

  return (
    <span
      className={`inline-flex min-h-5 items-center whitespace-nowrap rounded-full border px-2 text-[10px] font-medium ${className}`}
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
