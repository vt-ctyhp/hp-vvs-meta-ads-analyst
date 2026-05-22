import type { SystemHealthSnapshot } from "@/lib/system-health";
import { severityBg, severityColor } from "@/lib/severity-color";

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
        className="border border-hp-rule bg-hp-card p-5"
        style={{ borderLeftWidth: 3, borderLeftColor: overallSeverity, borderLeftStyle: "solid" }}
      >
        <header className="flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-title)] text-xl text-hp-ink">
            Overall status:{" "}
            <span style={{ color: overallSeverity }}>{snapshot.status}</span>
          </h2>
          {snapshot.generatedAt ? (
            <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Generated {new Date(snapshot.generatedAt).toLocaleString()}
            </span>
          ) : null}
        </header>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-hp-rule-soft pt-4 text-xs md:grid-cols-5">
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
            label="Website reconcile"
            value={
              snapshot.latestWebsiteReconciliation.at
                ? new Date(snapshot.latestWebsiteReconciliation.at).toLocaleString()
                : "—"
            }
          />
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
          className="overflow-hidden border border-hp-rule bg-hp-card"
        >
          <header className="border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            Issues ({snapshot.issues.length})
          </header>
          <ul className="divide-y divide-hp-rule-soft">
            {snapshot.issues.map((issue, idx) => (
              <li
                key={`${issue.title}-${idx}`}
                className="flex flex-col gap-1 px-5 py-4"
                style={{
                  borderLeftWidth: 3,
                  borderLeftColor: severityColor(issue.level),
                  borderLeftStyle: "solid",
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-[family-name:var(--font-title)] text-base text-hp-ink">
                    {issue.title}
                  </span>
                  <span
                    className="inline-flex h-[22px] items-center gap-1 border px-2 text-[10px] font-bold uppercase tracking-[0.14em]"
                    style={{
                      color: severityColor(issue.level),
                      borderColor: severityColor(issue.level),
                      backgroundColor: severityBg(issue.level),
                    }}
                  >
                    {issue.level}
                  </span>
                </div>
                {issue.detail ? (
                  <p className="text-[13px] leading-relaxed text-hp-body">{issue.detail}</p>
                ) : null}
                {issue.link ? (
                  <a
                    href={issue.link.href}
                    className="mt-1 inline-flex items-center gap-1 border-b border-hp-ink pb-[1px] text-[11px] uppercase tracking-[0.14em] text-hp-ink hover:border-hp-pink hover:text-hp-pink"
                  >
                    {issue.link.label}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <p className="border border-signal-positive bg-signal-positive-bg px-5 py-4 text-sm text-signal-positive">
          <span className="mr-2 font-bold uppercase tracking-[0.14em]">All clean</span>
          <span className="text-hp-ink">No open issues. All checks reporting clean.</span>
        </p>
      )}

      <section
        aria-label="Health detail JSON"
        className="overflow-hidden border border-hp-rule bg-hp-card"
      >
        <header className="border-b border-hp-rule bg-hp-inset px-5 py-3 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          Full snapshot
        </header>
        <pre className="max-h-80 overflow-auto bg-hp-card px-5 py-4 font-mono text-[11px] leading-relaxed text-hp-ink">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[10px] uppercase tracking-[0.14em] text-hp-muted">
        {label}
      </dt>
      <dd className="font-[family-name:var(--font-title)] text-[17px] tabular-nums text-hp-ink">{value}</dd>
    </>
  );
}
