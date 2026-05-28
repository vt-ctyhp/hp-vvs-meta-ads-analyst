"use client";

import Link from "next/link";

import type { Period, TeamRow } from "../../../lib/inbox-metrics.ts";

function mins(sec: number | null): string {
  return sec === null ? "—" : `${Math.round(sec / 60)}m`;
}
function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}
function lastActive(at: Date | null): string {
  if (!at) return "—";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(at);
}

const COLUMNS = [
  "Name", "Open", "Needs reply", "At risk", "Avg first", "On time",
  "Replies", "Claims", "Oldest", "Last active", "",
];

export function TeamMetricsTable({
  rows,
  period,
  onSelectUser,
}: {
  rows: TeamRow[];
  period: Period;
  onSelectUser?: (userId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div
        data-component="team-metrics-table-empty"
        className="border border-hp-rule bg-hp-card px-4 py-10 text-center"
      >
        <p className="font-title text-[18px] text-hp-ink">No team members yet</p>
        <p className="mt-2 text-[11px] smallcaps text-hp-muted">
          Add members to a team in meta_inbox_team_members to see per-user metrics here.
        </p>
      </div>
    );
  }

  return (
    <table data-component="team-metrics-table" data-period={period} className="w-full border-collapse text-[13px]">
      <thead>
        <tr className="border-b border-hp-rule text-[10px] smallcaps text-hp-muted">
          {COLUMNS.map((c, i) => (
            <th key={c || `c${i}`} className="px-2 py-2 text-left font-normal">{c}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr
            key={r.userId}
            data-row-user={r.userId}
            onClick={onSelectUser ? () => onSelectUser(r.userId) : undefined}
            className="border-b border-hp-rule-soft hover:bg-hp-inset"
          >
            <td className="px-2 py-2 text-hp-ink">
              {r.name} <span className="text-[10px] smallcaps text-hp-muted">{r.role}</span>
            </td>
            <td className="px-2 py-2 lining-nums">{r.assigned}</td>
            <td className="px-2 py-2 lining-nums">{r.needsReply}</td>
            <td className="px-2 py-2 lining-nums text-signal-warning">{r.atRisk}</td>
            <td className="px-2 py-2 lining-nums">{mins(r.avgResponseSec)}</td>
            <td className="px-2 py-2 lining-nums">{pct(r.onTimeRate)}</td>
            <td className="px-2 py-2 lining-nums">{r.repliesSent}</td>
            <td className="px-2 py-2 lining-nums">{r.teamClaims}</td>
            <td className="px-2 py-2 lining-nums">{mins(r.oldestUnansweredSec)}</td>
            <td className="px-2 py-2 text-[11px] text-hp-muted">{lastActive(r.lastActiveAt)}</td>
            <td className="px-2 py-2">
              <Link
                href={`/m/inbox/team/${r.userId}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[11px] smallcaps text-hp-ink underline-offset-2 hover:underline"
              >
                Full report
              </Link>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
