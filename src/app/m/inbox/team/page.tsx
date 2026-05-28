import { notFound } from "next/navigation";

import { TeamMetricsTable } from "@/components/v2/inbox/team-metrics-table";
import { getServerAccessProfile } from "@/lib/server-route-auth";
import { resolvePeriodParam } from "@/lib/inbox-metrics";
import { getTeamRollup } from "@/lib/inbox-metrics-db";

export const dynamic = "force-dynamic";

export default async function TeamMetricsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const profile = await getServerAccessProfile();
  if (!profile?.teamLead) notFound();

  const period = resolvePeriodParam((await searchParams).period);
  const rollup = await getTeamRollup(
    {
      appUserId: profile.appUserId,
      roles: profile.roles,
      permissions: profile.permissions,
      teamLead: profile.teamLead,
      teamIds: profile.teamIds,
      teamUserIds: profile.teamUserIds,
    },
    period,
    new Date(),
  );

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <section className="mx-auto max-w-7xl">
        <header className="flex items-baseline justify-between border-b border-hp-rule px-1 pb-4 pt-4">
          <h1 className="font-title text-[26px] leading-tight text-hp-ink">{rollup.teamName}</h1>
          <PeriodSelector period={period} />
        </header>
        <TeamMetricsTable rows={rollup.rows} period={period} />
      </section>
    </main>
  );
}

function PeriodSelector({ period }: { period: string }) {
  const options: { key: string; label: string }[] = [
    { key: "today", label: "Today" },
    { key: "yesterday", label: "Yesterday" },
    { key: "7d", label: "Last 7 days" },
    { key: "30d", label: "Last 30 days" },
  ];
  return (
    <nav className="flex items-center gap-3 text-[11px] smallcaps">
      {options.map((o) => (
        <a
          key={o.key}
          href={`/m/inbox/team?period=${o.key}`}
          data-active={period === o.key}
          className={
            period === o.key
              ? "text-hp-ink underline underline-offset-4"
              : "text-hp-muted hover:text-hp-ink"
          }
        >
          {o.label}
        </a>
      ))}
    </nav>
  );
}
