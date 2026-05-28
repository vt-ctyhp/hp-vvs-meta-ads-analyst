import { RefreshCw } from "lucide-react";

import { SYNC } from "../../../lib/glossary.ts";
import type { PersonalHeaderMetrics } from "../../../lib/inbox-metrics.ts";
import type { SocialInboxSyncRun } from "../../../lib/social-inbox.ts";
import { formatLastSyncLabel } from "./inbox-eyebrow.tsx";

function minutes(sec: number | null): string {
  return sec === null ? "—" : `${Math.round(sec / 60)}m`;
}

export function InboxMetricsHeaderStrip({
  metrics,
  onSync,
  isSyncing,
  syncDisabled,
  syncRun,
  now,
}: {
  metrics: PersonalHeaderMetrics;
  onSync: () => void;
  isSyncing: boolean;
  syncDisabled: boolean;
  syncRun: SocialInboxSyncRun | null;
  now?: Date | number;
}) {
  const onTime =
    metrics.today.onTimeRate === null ? "—" : `${Math.round(metrics.today.onTimeRate * 100)}%`;
  const showClaimed = metrics.team.todayUnassignedDenominator > 0;

  return (
    <div
      data-component="inbox-metrics-header-strip"
      className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-hp-rule-soft px-1 py-2 text-[10px] text-hp-muted smallcaps"
    >
      <dl className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Stat label="On time" value={onTime} />
        <Stat label="Sent" value={String(metrics.today.repliesSent)} />
        {metrics.pipeline.atRisk > 0 ? (
          <Stat label="At risk" value={String(metrics.pipeline.atRisk)} tone="warning" />
        ) : null}
        <Stat label="Team Q" value={`${metrics.team.unassigned} waiting`} />
        {showClaimed ? (
          <Stat
            label="You claimed"
            value={`${metrics.team.claimedByMe} of ${metrics.team.todayUnassignedDenominator}`}
          />
        ) : null}
        <Stat label="Oldest in queue" value={minutes(metrics.team.oldestUnassignedSec)} />
      </dl>

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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt>{label}</dt>
      <dd
        data-tone={tone || "ink"}
        className={`font-title text-[15px] leading-none normal-case tracking-normal lining-nums ${
          tone === "warning" ? "text-signal-warning" : "text-hp-ink"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
