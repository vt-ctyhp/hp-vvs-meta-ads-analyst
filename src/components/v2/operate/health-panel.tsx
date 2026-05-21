import type { SystemHealthSnapshot } from "@/lib/system-health";

/**
 * Health tab — consolidated snapshot of:
 *   • Env fence: production vs staging, limited-access mode, module
 *     credential sources.
 *   • Meta token: granted permissions, ads-sync readiness, social inbox
 *     readiness, social reply readiness.
 *   • Configured ad accounts: which ones validated against the live token.
 *   • Latest sync run age.
 *
 * Server-rendered. The HealthPill in the shell polls every 90s, but this
 * page is point-in-time at request time so the operator can see the same
 * data the pill is summarizing.
 */

type Props = {
  snapshot: SystemHealthSnapshot;
};

export function HealthPanel({ snapshot }: Props) {
  const overallSeverity = severityColor(snapshot.status);
  return (
    <div className="space-y-6">
      <section
        aria-label="Overall health"
        className="rounded-xl border border-stone-200 bg-white p-4"
        style={{ borderLeft: `3px solid ${overallSeverity}` }}
      >
        <header className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-stone-900">
            Overall status:{" "}
            <span style={{ color: overallSeverity }}>{snapshot.status}</span>
          </h2>
          {snapshot.generatedAt ? (
            <span className="text-[11px] text-stone-500">
              Generated {new Date(snapshot.generatedAt).toLocaleString()}
            </span>
          ) : null}
        </header>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-4">
          <Stat
            label="Latest sync"
            value={
              snapshot.latestSync.at
                ? new Date(snapshot.latestSync.at).toLocaleString()
                : "—"
            }
          />
          <Stat label="Sync status" value={snapshot.latestSync.status ?? "—"} />
          <Stat
            label="Missing env"
            value={
              snapshot.missingEnv.length ? snapshot.missingEnv.length.toString() : "0"
            }
          />
          <Stat
            label="Open issues"
            value={String((snapshot.issues ?? []).length)}
          />
        </dl>
      </section>

      {snapshot.issues && snapshot.issues.length > 0 ? (
        <section
          aria-label="Open issues"
          className="overflow-hidden rounded-xl border border-stone-200 bg-white"
        >
          <header className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">
            Issues ({snapshot.issues.length})
          </header>
          <ul className="divide-y divide-stone-100">
            {snapshot.issues.map((issue, idx) => (
              <li
                key={`${issue.title}-${idx}`}
                className="flex flex-col gap-1 px-4 py-3"
                style={{ borderLeft: `3px solid ${severityColor(issue.level)}` }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-900">
                    {issue.title}
                  </span>
                  <span
                    className="rounded-full px-2 text-[10px] uppercase tracking-wider"
                    style={{
                      color: severityColor(issue.level),
                      border: `1px solid ${severityColor(issue.level)}`,
                    }}
                  >
                    {issue.level}
                  </span>
                </div>
                {issue.detail ? (
                  <p className="text-xs text-stone-700">{issue.detail}</p>
                ) : null}
                {issue.link ? (
                  <a
                    href={issue.link.href}
                    className="text-xs font-medium underline hover:no-underline"
                  >
                    {issue.link.label}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          No open issues. All checks reporting clean.
        </p>
      )}

      <section
        aria-label="Health detail JSON"
        className="overflow-hidden rounded-xl border border-stone-200 bg-white"
      >
        <header className="border-b border-stone-200 bg-stone-50 px-4 py-2 text-xs uppercase tracking-wider text-stone-600">
          Full snapshot
        </header>
        <pre className="max-h-96 overflow-auto bg-stone-50 px-4 py-3 text-[11px] text-stone-700">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-wider text-stone-500">
        {label}
      </dt>
      <dd className="text-stone-900 tabular-nums">{value}</dd>
    </>
  );
}

function severityColor(value: string): string {
  const v = (value || "").toLowerCase();
  if (v === "ok" || v === "healthy") return "#1F7A4D";
  if (v === "warning" || v === "warn") return "#7A4900";
  if (v === "critical" || v === "error" || v === "fail") return "#7A1A1A";
  return "#5A5346";
}
