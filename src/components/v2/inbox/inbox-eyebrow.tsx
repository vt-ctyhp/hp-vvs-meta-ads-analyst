import { RefreshCw } from "lucide-react";

import { SYNC } from "../../../lib/glossary.ts";
import type { MetaInboxManagerDashboard } from "../../../lib/meta-inbox-manager-dashboard.ts";
import type { SocialInboxSyncRun } from "../../../lib/social-inbox.ts";

type EyebrowDashboard = Pick<MetaInboxManagerDashboard, "metrics" | "range">;

type EyebrowMetric = {
  key: string;
  label: string;
  value: string;
  tone: "ink" | "warning" | "positive";
};

export function InboxEyebrow({
  dashboard,
  syncRun,
  onSync,
  isSyncing,
  syncDisabled,
  now,
}: {
  dashboard: EyebrowDashboard;
  syncRun: SocialInboxSyncRun | null;
  onSync: () => void;
  isSyncing: boolean;
  syncDisabled: boolean;
  now?: Date | number;
}) {
  const metrics = managerMetrics(dashboard);

  return (
    <div
      data-component="inbox-eyebrow"
      className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-hp-rule-soft px-1 py-2 text-[10px] text-hp-muted smallcaps"
    >
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <span
          data-window-label
          className="border-r border-hp-rule-soft pr-5 text-hp-ink"
        >
          {dashboard.range.label}
        </span>
        <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
          {metrics.map((metric) => (
            <div key={metric.key} className="flex items-baseline gap-1.5">
              <dt>{metric.label}</dt>
              <dd
                data-metric={metric.key}
                data-tone={metric.tone}
                className={`font-title text-[15px] leading-none normal-case tracking-normal lining-nums ${metricToneClass(metric.tone)}`}
              >
                {metric.value}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span>{formatLastSyncLabel(syncRun, now)}</span>
        <button
          type="button"
          disabled={syncDisabled || isSyncing}
          onClick={onSync}
          className="inline-flex h-7 items-center gap-2 border border-hp-rule px-2 text-hp-ink transition-colors hover:border-hp-ink hover:bg-hp-inset disabled:text-hp-muted"
        >
          <RefreshCw size={13} className={isSyncing ? "animate-spin" : ""} />
          {isSyncing ? SYNC.inProgress : `${SYNC.action} Inbox`}
        </button>
      </div>
    </div>
  );
}

export function formatLastSyncLabel(
  syncRun: SocialInboxSyncRun | null,
  now: Date | number = Date.now(),
) {
  if (!syncRun) return "Last sync · unavailable";
  const completedAt = syncRun.completed_at || syncRun.started_at;
  const age = completedAt ? formatAge(completedAt, now) : "unavailable";
  return `Last sync · ${age} · ${syncRun.status}`;
}

function managerMetrics(dashboard: EyebrowDashboard): EyebrowMetric[] {
  const metrics = dashboard.metrics;

  return [
    {
      key: "needs-reply",
      label: "Needs reply",
      value: String(metrics.needsReply),
      tone: "ink",
    },
    {
      key: "unassigned",
      label: "Unassigned",
      value: String(metrics.unassigned),
      tone: "ink",
    },
    {
      key: "stale",
      label: "Stale",
      value: String(metrics.staleConversations),
      tone: metrics.staleConversations > 0 ? "warning" : "ink",
    },
    {
      key: "median-first",
      label: "Median first",
      value:
        metrics.medianFirstResponseMinutes === null
          ? "—"
          : `${metrics.medianFirstResponseMinutes}m`,
      tone: "ink",
    },
    {
      key: "qa-avg",
      label: "QA avg",
      value: metrics.averageQaScore === null ? "—" : metrics.averageQaScore.toFixed(1),
      tone: "positive",
    },
  ];
}

function metricToneClass(tone: EyebrowMetric["tone"]) {
  if (tone === "warning") return "text-signal-warning";
  if (tone === "positive") return "text-signal-positive";
  return "text-hp-ink";
}

function formatAge(value: string, now: Date | number) {
  const thenMs = Date.parse(value);
  const nowMs = typeof now === "number" ? now : now.getTime();
  if (!Number.isFinite(thenMs) || !Number.isFinite(nowMs)) return "unavailable";

  const minutes = Math.max(0, Math.round((nowMs - thenMs) / 60000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.round(hours / 24)}d ago`;
}
