import { UsersClient } from "@/components/users-client";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePagePermission("view_users", "/users");
  return <UsersClient />;
}
