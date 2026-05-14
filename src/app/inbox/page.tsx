import { SocialInboxClient, type SocialInboxStatus } from "@/components/social-inbox-client";
import { getMissingRequiredEnv } from "@/lib/env";
import { getMetaPermissionHealth, validateConfiguredMetaAccounts } from "@/lib/meta";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const status = await getSocialInboxStatus();
  return <SocialInboxClient status={status} />;
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
