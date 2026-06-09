import { ChangeLogClient } from "@/components/change-log-client";
import { listChangeLogEntries } from "@/lib/change-log";
import { requirePagePermission } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function ChangeLogPage() {
  await requirePagePermission("view_change_log", "/analyst/change-log");
  const entries = await listChangeLogEntries();
  return <ChangeLogClient initialEntries={entries} today={new Date().toISOString().slice(0, 10)} />;
}
