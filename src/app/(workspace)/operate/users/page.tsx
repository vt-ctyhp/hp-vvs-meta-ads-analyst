import { UsersClient } from "@/components/users-client";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function OperateUsersPage() {
  await requirePagePermission("view_users", "/operate/users");
  return <UsersClient loginNextPath="/operate/users" />;
}
