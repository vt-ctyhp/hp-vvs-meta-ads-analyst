"use client";

import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

import type {
  MetaInboxManagerDashboard,
  MetaInboxManagerDashboardAttributionRow,
} from "@/lib/meta-inbox-manager-dashboard";

const fmtInt = (n: number) => n.toLocaleString("en-US");
const fmtMin = (n: number | null) => (n === null ? "—" : `${fmtInt(n)}m`);
const fmtScore = (n: number | null) => (n === null ? "—" : n.toFixed(1));
const fmtConf = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const pctOf = (count: number, total: number) =>
  total <= 0 ? 0 : Math.round((count / total) * 1000) / 10;

type Tab = "owners" | "attribution";
type Dimension = "campaign" | "ad" | "creative";

export function ManagerReview({
  dashboard,
  names,
}: {
  dashboard: MetaInboxManagerDashboard;
  names: Record<string, string>;
}) {
  const [tab, setTab] = useState<Tab>("owners");

  return (
    <div data-component="manager-review" className="space-y-5">
      <div className="flex items-baseline justify-between border-b border-hp-rule-soft px-1 pb-2 text-[10px] smallcaps text-hp-muted">
        <span>Convert · Inbox · Manager Review</span>
        <span>{dashboard.range.label}</span>
      </div>

      <div className="flex items-center gap-2 px-1">
        <TabChip label="Owners" active={tab === "owners"} onClick={() => setTab("owners")} />
        <TabChip
          label="Attribution"
          active={tab === "attribution"}
          onClick={() => setTab("attribution")}
        />
      </div>

      {tab === "owners" ? (
        <OwnersView dashboard={dashboard} names={names} />
      ) : (
        <AttributionView dashboard={dashboard} />
      )}
    </div>
  );
}

function TabChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`h-9 border px-3 text-[10px] smallcaps transition-colors ${
        active
          ? "border-hp-ink bg-hp-ink text-hp-foundation"
          : "border-hp-rule bg-hp-card text-hp-ink hover:border-hp-ink hover:bg-hp-inset"
      }`}
    >
      {label}
    </button>
  );
}

function AttributionThumb({ src, alt }: { src?: string | null; alt: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-hp-rule bg-hp-inset text-hp-muted">
        <ImageIcon size={14} aria-hidden />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- external Supabase/Meta CDN media; matches CreativeThumb in the customer ledger.
    <img
      alt={alt}
      src={src}
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 border border-hp-rule bg-hp-inset object-cover"
    />
  );
}

function OwnersView({
  dashboard,
  names,
}: {
  dashboard: MetaInboxManagerDashboard;
  names: Record<string, string>;
}) {
  const m = dashboard.metrics;
  const bucketTotal = dashboard.responseAgeBuckets.reduce((s, b) => s + b.count, 0);
  const queueBacklog = [...dashboard.byQueue]
    .sort((a, b) => b.needsReply - a.needsReply)
    .slice(0, 6);
  const ownerName = (assigneeUserId: string | null, fallback: string) =>
    assigneeUserId ? names[assigneeUserId] ?? fallback : fallback;

  return (
    <div data-view="owners" className="space-y-5">
      <h1 className="px-1 font-title text-[24px] leading-tight text-hp-ink oldstyle-nums">
        {fmtInt(m.needsReply)} awaiting reply across {dashboard.byAssignee.length} owners,{" "}
        <span className="text-signal-warning">{fmtInt(m.unassigned)} unassigned</span>.
      </h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="px-1">
          {dashboard.byAssignee.length === 0 ? (
            <p className="border border-hp-rule bg-hp-card px-4 py-10 text-center text-sm text-hp-muted">
              No assigned conversations in this window.
            </p>
          ) : (
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-hp-rule text-[10px] smallcaps text-hp-muted">
                  <th className="py-2 text-left font-normal">Owner</th>
                  <th className="py-2 text-right font-normal">Open</th>
                  <th className="py-2 text-right font-normal">Needs reply</th>
                  <th className="py-2 text-right font-normal">Missed</th>
                  <th className="py-2 text-right font-normal">Failed</th>
                  <th className="py-2 text-right font-normal">Avg first</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.byAssignee.map((a) => {
                  const unassigned = a.assigneeUserId === null;
                  return (
                    <tr
                      key={a.assigneeUserId ?? "unassigned"}
                      className={`border-b border-hp-rule-soft ${unassigned ? "bg-hp-inset" : ""}`}
                    >
                      <td className="py-3 text-hp-ink">
                        {ownerName(a.assigneeUserId, a.label)}
                        {unassigned ? (
                          <span className="ml-2 text-[10px] smallcaps text-signal-warning">
                            needs routing
                          </span>
                        ) : null}
                      </td>
                      <td className="py-3 text-right lining-nums text-hp-body">
                        {fmtInt(a.totalConversations)}
                      </td>
                      <td className="py-3 text-right">
                        <span
                          className={`font-title text-[20px] leading-none lining-nums ${
                            a.needsReply > 0 ? "text-signal-warning" : "text-hp-muted"
                          }`}
                        >
                          {fmtInt(a.needsReply)}
                        </span>
                      </td>
                      <td className="py-3 text-right lining-nums text-hp-body">
                        {fmtInt(a.missedFollowUps)}
                      </td>
                      <td
                        className={`py-3 text-right lining-nums ${
                          a.failedSends > 0 ? "text-signal-danger" : "text-hp-body"
                        }`}
                      >
                        {fmtInt(a.failedSends)}
                      </td>
                      <td className="py-3 text-right lining-nums text-hp-body">
                        {fmtMin(a.averageFirstResponseMinutes)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>

        <aside className="space-y-6 border-t border-hp-rule pt-5 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
          <div>
            <h2 className="mb-3 text-[10px] smallcaps text-hp-muted">Awaiting reply by age</h2>
            <ul className="space-y-2">
              {dashboard.responseAgeBuckets.map((b) => (
                <li key={b.key} className="space-y-1">
                  <div className="flex items-baseline justify-between text-[12px]">
                    <span className={b.key === "over_24h" ? "text-signal-warning" : "text-hp-body"}>
                      {b.label}
                    </span>
                    <span className="lining-nums text-hp-muted">{fmtInt(b.count)}</span>
                  </div>
                  <div className="h-1.5 w-full bg-hp-inset">
                    <div
                      style={{ width: `${pctOf(b.count, bucketTotal)}%` }}
                      className={`h-full ${b.key === "over_24h" ? "bg-signal-warning" : "bg-hp-ink"}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h2 className="mb-2 text-[10px] smallcaps text-hp-muted">Backlog by queue</h2>
            <ul className="divide-y divide-hp-rule-soft">
              {queueBacklog.map((q) => (
                <li
                  key={q.queueCategoryKey}
                  className="flex items-baseline justify-between py-2 text-[12px]"
                >
                  <span className="text-hp-body">{q.label}</span>
                  <span className="lining-nums text-hp-ink">{fmtInt(q.needsReply)}</span>
                </li>
              ))}
            </ul>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-hp-rule-soft pt-4">
            {[
              ["Median first", fmtMin(m.medianFirstResponseMinutes)],
              ["Stale", fmtInt(m.staleConversations)],
              ["Failed sends", fmtInt(m.failedSends)],
              ["QA avg", fmtScore(m.averageQaScore)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[10px] smallcaps text-hp-muted">{label}</dt>
                <dd className="mt-0.5 font-title text-[18px] leading-none lining-nums text-hp-ink">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </aside>
      </div>
    </div>
  );
}

const OUTCOME_BAR: Record<string, string> = {
  sold: "bg-signal-positive",
  booked: "bg-signal-positive/70",
  showed_up: "bg-signal-positive/40",
  browsed: "bg-hp-ink",
  no_show: "bg-signal-warning",
  lost: "bg-signal-danger",
  no_outcome_yet: "bg-hp-rule",
};

// The manager-dashboard builder clamps the window to 1–31 days.
const ATTRIBUTION_RANGES: { label: string; days: number }[] = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
];

function AttributionView({ dashboard: initial }: { dashboard: MetaInboxManagerDashboard }) {
  const [dimension, setDimension] = useState<Dimension>("campaign");
  const [days, setDays] = useState(initial.range.days);
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (days === initial.range.days) {
      setData(initial);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch(`/api/social-inbox/manager-dashboard?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
      .then((next: MetaInboxManagerDashboard) => {
        if (alive) setData(next);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [days, initial]);

  const dashboard = data;
  const m = dashboard.metrics;
  const outcomeTotal = dashboard.byOutcome.reduce((s, o) => s + o.count, 0);
  const rows: MetaInboxManagerDashboardAttributionRow[] =
    dimension === "ad"
      ? dashboard.byAd
      : dimension === "creative"
        ? dashboard.byCreative
        : dashboard.byCampaignUmbrella;
  const booked = dashboard.byOutcome.find((o) => o.outcomeKey === "booked")?.count ?? 0;
  const sold = dashboard.byOutcome.find((o) => o.outcomeKey === "sold")?.count ?? 0;

  return (
    <div data-view="attribution" className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
        <h1 className="font-title text-[24px] leading-tight text-hp-ink oldstyle-nums">
          {fmtInt(booked)} booked, {fmtInt(sold)} sold from {fmtInt(m.totalConversations)}{" "}
          conversations.
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] smallcaps text-hp-muted">
            {loading ? "Updating…" : dashboard.range.label}
          </span>
          {ATTRIBUTION_RANGES.map((r) => (
            <TabChip
              key={r.days}
              label={r.label}
              active={days === r.days}
              onClick={() => setDays(r.days)}
            />
          ))}
        </div>
      </div>

      <section className="px-1">
        <h2 className="mb-3 text-[10px] smallcaps text-hp-muted">
          Outcome ledger · {fmtInt(outcomeTotal)} conversations
        </h2>
        {outcomeTotal === 0 ? (
          <p className="text-sm text-hp-muted">No outcomes recorded in this window.</p>
        ) : (
          <>
            <div className="flex h-4 w-full overflow-hidden border border-hp-rule">
              {dashboard.byOutcome.map((o, i) => (
                <div
                  key={o.outcomeKey}
                  style={{ width: `${pctOf(o.count, outcomeTotal)}%` }}
                  className={`${i > 0 ? "border-l border-hp-card" : ""} ${
                    OUTCOME_BAR[o.outcomeKey] ?? "bg-hp-rule"
                  }`}
                  title={`${o.label}: ${o.count}`}
                />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[11px] text-hp-muted oldstyle-nums">
              {dashboard.byOutcome.map((o) => (
                <span key={o.outcomeKey}>
                  {o.label} {fmtInt(o.count)} · {pctOf(o.count, outcomeTotal)}%
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="px-1">
        <div className="mb-3 flex items-center gap-2">
          {(
            [
              ["campaign", "Campaign umbrella"],
              ["ad", "Ad"],
              ["creative", "Creative"],
            ] as const
          ).map(([key, label]) => (
            <TabChip
              key={key}
              label={label}
              active={dimension === key}
              onClick={() => setDimension(key)}
            />
          ))}
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-hp-muted">No attributed conversations for this dimension.</p>
        ) : (
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-hp-rule text-[10px] smallcaps text-hp-muted">
                <th className="py-2 text-left font-normal">Source</th>
                <th className="py-2 text-right font-normal">Conversations</th>
                <th className="py-2 text-right font-normal">Needs reply</th>
                <th className="py-2 text-right font-normal">Failed</th>
                <th className="py-2 text-right font-normal">Avg first</th>
                <th className="py-2 text-right font-normal">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="border-b border-hp-rule-soft">
                  <td className="py-2 text-hp-ink">
                    <div className="flex items-center gap-3">
                      {dimension !== "campaign" ? (
                        <AttributionThumb
                          src={row.thumbnailUrl || row.imageUrl}
                          alt={`${row.label} preview`}
                        />
                      ) : null}
                      <span className="min-w-0">
                        {row.label}
                        {row.key === "unattributed" ? (
                          <span className="ml-2 text-[10px] smallcaps text-hp-muted">
                            no first touch
                          </span>
                        ) : null}
                      </span>
                    </div>
                  </td>
                  <td className="py-2 text-right lining-nums text-hp-body">
                    {fmtInt(row.totalConversations)}
                  </td>
                  <td className="py-2 text-right lining-nums text-signal-warning">
                    {fmtInt(row.needsReply)}
                  </td>
                  <td
                    className={`py-2 text-right lining-nums ${
                      row.failedSends > 0 ? "text-signal-danger" : "text-hp-body"
                    }`}
                  >
                    {fmtInt(row.failedSends)}
                  </td>
                  <td className="py-2 text-right lining-nums text-hp-body">
                    {fmtMin(row.averageFirstResponseMinutes)}
                  </td>
                  <td className="py-2 text-right lining-nums text-hp-body">
                    {fmtConf(row.averageAttributionConfidence)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
