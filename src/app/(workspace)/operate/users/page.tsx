import { PeopleRoster } from "@/components/v2/operate/people-roster";
import { StatusSentence } from "@/components/v2/status-sentence";
import { fetchOperateRoster } from "@/lib/operate-data";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OperateUsersPage() {
  await requirePagePermission("view_users", "/operate/users");
  const roster = await fetchOperateRoster().catch(() => []);

  return (
    <div className="space-y-6">
      <StatusSentence sentence="Read-only roster from the analytics identity view." />
      <PeopleRoster roster={roster} />
    </div>
  );
}
