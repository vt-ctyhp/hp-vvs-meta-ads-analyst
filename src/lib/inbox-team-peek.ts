import type { SocialInboxData } from "./social-inbox.ts";

export function canLeadViewUser(
  viewer: { teamLead: boolean; teamUserIds: readonly string[] },
  targetUserId: string,
): boolean {
  return Boolean(viewer.teamLead) && viewer.teamUserIds.includes(targetUserId);
}

// Server action: returns the target teammate's inbox data (scoped read),
// only if the caller is a lead over that teammate. Throws otherwise.
//
// Uses inline "use server" + dynamic imports so the module's top level stays
// free of next/headers (server-route-auth) and the social-inbox graph — that
// keeps the pure canLeadViewUser helper importable from unit tests.
export async function getInboxForUser(targetUserId: string): Promise<SocialInboxData> {
  "use server";
  const { getServerAccessProfile } = await import("./server-route-auth.ts");
  const { getSocialInboxData } = await import("./social-inbox.ts");

  const profile = await getServerAccessProfile();
  if (
    !profile ||
    !canLeadViewUser(
      { teamLead: Boolean(profile.teamLead), teamUserIds: profile.teamUserIds || [] },
      targetUserId,
    )
  ) {
    throw new Error("Not authorized to view this teammate's inbox.");
  }

  const data = await getSocialInboxData({
    appUserId: profile.appUserId,
    roles: profile.roles,
    permissions: profile.permissions,
  });
  return {
    ...data,
    inboxConversations: data.inboxConversations.filter(
      (c) => c.assigned_user_id === targetUserId,
    ),
  };
}
