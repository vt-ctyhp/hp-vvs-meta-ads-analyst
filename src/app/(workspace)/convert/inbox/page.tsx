import { SocialInboxClient, type SocialInboxStatus } from "@/components/social-inbox-client";
import { SmallScreenInboxRedirect } from "@/components/v2/inbox/small-screen-inbox-redirect";
import { getMissingRequiredEnv, isTruthyEnv } from "@/lib/env";
import { safeErrorMessage } from "@/lib/error-message";
import { getPersonalHeaderMetrics } from "@/lib/inbox-metrics-db";
import { getMetaPermissionHealth, validateConfiguredMetaAccounts } from "@/lib/meta";
import { getActiveMetaInboxEnvironment } from "@/lib/meta-inbox-environment";
import { requirePagePermission } from "@/lib/server-route-auth";
import {
  emptySocialInboxData,
  getSocialInboxData,
  type SocialInboxData,
} from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const profile = await requirePagePermission("view_inbox", "/convert/inbox");
  const metricsHeaderEnabled = isTruthyEnv("INBOX_METRICS_HEADER_ENABLED");

  const [status, inboxData, headerMetrics] = await Promise.all([
    getSocialInboxStatus(),
    getSafeSocialInboxData(profile),
    metricsHeaderEnabled
      ? getPersonalHeaderMetrics(
          {
            appUserId: profile.appUserId,
            roles: profile.roles,
            permissions: profile.permissions,
            teamLead: profile.teamLead,
            teamIds: profile.teamIds,
            teamUserIds: profile.teamUserIds,
          },
          new Date(),
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  // Frontline sales (no dashboard) land here by default; on phone-sized screens
  // bounce them to the phone-first /m/inbox shell. Dashboard roles stay.
  const prefersMobileShell = !profile.permissions.includes("view_dashboard");
  let environment = "production";
  try {
    environment = await getActiveMetaInboxEnvironment();
  } catch {
    /* default to production for the realtime topic */
  }
  return (
    <>
      {prefersMobileShell ? <SmallScreenInboxRedirect /> : null}
      <SocialInboxClient
        status={status}
        environment={environment}
        initialData={inboxData.data}
        dataError={inboxData.error}
        canManageInboxState={profile.permissions.includes("manage_inbox_state")}
        canSendInboxReply={profile.permissions.includes("send_inbox_reply")}
        canCreateManagerCoaching={
          profile.roles.includes("admin") || profile.roles.includes("sales_lead")
        }
        metricsHeaderEnabled={metricsHeaderEnabled}
        headerMetrics={headerMetrics}
        teamLead={profile.teamLead}
      />
    </>
  );
}

async function getSafeSocialInboxData(
  profile: Awaited<ReturnType<typeof requirePagePermission>>,
): Promise<{ data: SocialInboxData; error: string | null }> {
  try {
    return { data: await getSocialInboxData(profile), error: null };
  } catch (error) {
    return {
      data: emptySocialInboxData(),
      error: safeErrorMessage(error),
    };
  }
}

async function getSocialInboxStatus(): Promise<SocialInboxStatus> {
  const missingEnv = getMissingRequiredEnv();
  const metaIncomplete =
    missingEnv.includes("META_ACCESS_TOKEN") || missingEnv.includes("META_HP_AD_ACCOUNT_ID");

  if (metaIncomplete) {
    return {
      ok: false,
      missingEnv,
      permissions: null,
      accounts: [],
      readiness: {
        adsSync: false,
        socialInbox: false,
        socialReply: false,
      },
      error: "Meta environment variables are incomplete.",
    };
  }

  try {
    const [permissions, accounts] = await Promise.all([
      getMetaPermissionHealth(),
      validateConfiguredMetaAccounts(),
    ]);

    return {
      ok:
        missingEnv.length === 0 &&
        accounts.every((account) => account.ok) &&
        permissions.forbiddenGranted.length === 0 &&
        permissions.socialInbox.ok,
      missingEnv,
      permissions,
      accounts,
      readiness: {
        adsSync: permissions.adsSync.ok && accounts.every((account) => account.ok),
        socialInbox: permissions.socialInbox.ok,
        socialReply: permissions.socialReply.ok,
      },
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      missingEnv,
      permissions: null,
      accounts: [],
      readiness: {
        adsSync: false,
        socialInbox: false,
        socialReply: false,
      },
      error: safeErrorMessage(error),
    };
  }
}
