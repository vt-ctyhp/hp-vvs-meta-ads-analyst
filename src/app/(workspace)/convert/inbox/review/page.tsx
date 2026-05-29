import { ManagerReview } from "@/components/v2/inbox/manager-review";
import { resolvePeriodParam } from "@/lib/inbox-metrics";
import { getTeamRollup } from "@/lib/inbox-metrics-db";
import { enrichManagerDashboardWithCreativeMedia } from "@/lib/meta-inbox-attribution-media";
import { buildMetaInboxManagerDashboard } from "@/lib/meta-inbox-manager-dashboard";
import { requirePagePermission } from "@/lib/server-route-auth";
import { getSocialInboxManagerDashboardData } from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

export default async function ManagerReviewPage() {
  const profile = await requirePagePermission("view_review", "/convert/inbox/review");

  const dashboard = await enrichManagerDashboardWithCreativeMedia(
    buildMetaInboxManagerDashboard(await getSocialInboxManagerDashboardData(profile)),
  );

  // Resolve assignee ids to names via the same manager-accessible source the
  // Team page uses (managers don't hold view_users, so /api/users is out).
  // byAssignee[].label stays the fallback for anyone outside the rollup.
  const names = await resolveOwnerNames(profile);

  return (
    <ManagerReview dashboard={dashboard} names={names} />
  );
}

async function resolveOwnerNames(
  profile: Awaited<ReturnType<typeof requirePagePermission>>,
): Promise<Record<string, string>> {
  try {
    const rollup = await getTeamRollup(
      {
        appUserId: profile.appUserId,
        roles: profile.roles,
        permissions: profile.permissions,
        teamLead: profile.teamLead,
        teamIds: profile.teamIds,
        teamUserIds: profile.teamUserIds,
      },
      resolvePeriodParam("7d"),
      new Date(),
    );
    return Object.fromEntries(rollup.rows.map((row) => [row.userId, row.name]));
  } catch {
    return {};
  }
}
