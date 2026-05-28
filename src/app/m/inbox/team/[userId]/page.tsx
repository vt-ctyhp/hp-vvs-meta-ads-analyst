import { notFound } from "next/navigation";

import { TeamTrendChart } from "@/components/v2/inbox/team-trend-chart";
import { getServerAccessProfile } from "@/lib/server-route-auth";
import { canLeadViewUser } from "@/lib/inbox-team-peek";
import { resolvePeriodParam } from "@/lib/inbox-metrics";
import { getTeamRollup, getUserDailyHistory } from "@/lib/inbox-metrics-db";

export const dynamic = "force-dynamic";

export default async function TeamMemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const profile = await getServerAccessProfile();
  const { userId } = await params;
  if (
    !profile?.teamLead ||
    !canLeadViewUser(
      { teamLead: Boolean(profile.teamLead), teamUserIds: profile.teamUserIds || [] },
      userId,
    )
  ) {
    notFound();
  }

  const period = resolvePeriodParam((await searchParams).period);
  const headerProfile = {
    appUserId: profile.appUserId,
    roles: profile.roles,
    permissions: profile.permissions,
    teamLead: profile.teamLead,
    teamIds: profile.teamIds,
    teamUserIds: profile.teamUserIds,
  };
  const rollup = await getTeamRollup(headerProfile, period, new Date());
  const row = rollup.rows.find((r) => r.userId === userId) || null;
  const history = await getUserDailyHistory(userId, period);

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-6 text-hp-body md:px-8">
      <section className="mx-auto max-w-5xl">
        <header className="border-b border-hp-rule px-1 pb-4 pt-4">
          <h1 className="font-title text-[26px] text-hp-ink">{row?.name || "Unknown"}</h1>
          <p className="text-[11px] smallcaps text-hp-muted">{row?.role || "member"}</p>
        </header>
        <TeamTrendChart points={history} />
      </section>
    </main>
  );
}
