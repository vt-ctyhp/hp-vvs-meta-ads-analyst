import { NoAccessClient } from "@/components/no-access-client";
import { requireNoAccessProfile } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const profile = await requireNoAccessProfile();
  return <NoAccessClient email={profile.email} />;
}
