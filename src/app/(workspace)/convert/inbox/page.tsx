import { SocialInboxClient, type SocialInboxStatus } from "@/components/social-inbox-client";
import { getMissingRequiredEnv } from "@/lib/env";
import { getMetaPermissionHealth, validateConfiguredMetaAccounts } from "@/lib/meta";
import { requirePagePermission } from "@/lib/server-route-auth";
import { getSocialInboxData, type SocialInboxData } from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  await requirePagePermission("view_inbox", "/convert/inbox");
  const [status, inboxData] = await Promise.all([getSocialInboxStatus(), getSafeSocialInboxData()]);
  return <SocialInboxClient status={status} initialData={inboxData.data} dataError={inboxData.error} />;
}

async function getSafeSocialInboxData(): Promise<{ data: SocialInboxData; error: string | null }> {
  try {
    return { data: await getSocialInboxData(), error: null };
  } catch (error) {
    return {
      data: emptySocialInboxData(),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function emptySocialInboxData(): SocialInboxData {
  return {
    threads: [],
    messages: [],
    comments: [],
    syncRuns: [],
  };
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
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
