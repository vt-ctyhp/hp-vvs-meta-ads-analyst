// ---------------------------------------------------------------------------
// inbox-user-directory.ts
//
// Mode-aware resolution of inbox user names + roles, mirroring how /api/users
// and app-auth read identity:
//   - limited DB-access mode  -> analytics.ads_analyst_identity_profiles_v1
//     (the scoped web role's sanctioned, users-free path)
//   - default mode            -> public.users + public.user_roles via the
//     service client (the analytics schema is not exposed to the API, so a
//     .schema("analytics") read returns empty there).
//
// Centralizing this avoids every caller getting the mode/branch wrong.
// ---------------------------------------------------------------------------

import { createAdsAnalystClient, usesLimitedAdsAnalystDbAccess } from "./ads-analyst-db.ts";
import { createServiceClient } from "./supabase.ts";

export type InboxUserProfile = {
  appUserId: string;
  fullName: string | null;
  roles: string[];
  active: boolean;
};

export async function loadInboxUserDirectory(): Promise<InboxUserProfile[]> {
  if (usesLimitedAdsAnalystDbAccess()) {
    const supabase = createAdsAnalystClient("web") as unknown as {
      schema: (s: "analytics") => {
        from: (t: "ads_analyst_identity_profiles_v1") => {
          select: (c: string) => {
            order: (
              col: string,
              o: { ascending: boolean },
            ) => Promise<{
              data:
                | {
                    app_user_id: string;
                    full_name: string | null;
                    active: boolean | null;
                    roles: unknown;
                  }[]
                | null;
            }>;
          };
        };
      };
    };
    const { data } = await supabase
      .schema("analytics")
      .from("ads_analyst_identity_profiles_v1")
      .select("app_user_id,full_name,active,roles")
      .order("full_name", { ascending: true });
    return (
      (data || []) as {
        app_user_id: string;
        full_name: string | null;
        active: boolean | null;
        roles: unknown;
      }[]
    ).map((r) => ({
      appUserId: r.app_user_id,
      fullName: r.full_name,
      roles: Array.isArray(r.roles) ? (r.roles as string[]) : [],
      active: Boolean(r.active),
    }));
  }

  // Default mode: read public.users + user_roles via the service client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as unknown as { from: (t: string) => any };
  const [usersRes, rolesRes] = await Promise.all([
    supabase.from("users").select("id,full_name,active"),
    supabase.from("user_roles").select("user_id,role"),
  ]);

  const rolesByUser = new Map<string, string[]>();
  for (const row of (rolesRes.data || []) as { user_id: string; role: string }[]) {
    rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) || []), row.role]);
  }
  return (
    (usersRes.data || []) as { id: string; full_name: string | null; active: boolean | null }[]
  ).map((u) => ({
    appUserId: u.id,
    fullName: u.full_name,
    roles: rolesByUser.get(u.id) || [],
    active: Boolean(u.active),
  }));
}
