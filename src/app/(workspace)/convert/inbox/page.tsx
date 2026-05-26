import { PrototypeSwitcher, type VariantKey } from "@/components/inbox-prototype/prototype-switcher";
import { VariantA } from "@/components/inbox-prototype/variant-a";
import { SocialInboxClient, type SocialInboxStatus } from "@/components/social-inbox-client";
import { getMissingRequiredEnv } from "@/lib/env";
import { safeErrorMessage } from "@/lib/error-message";
import { getMetaPermissionHealth, validateConfiguredMetaAccounts } from "@/lib/meta";
import { requirePagePermission } from "@/lib/server-route-auth";
import {
  emptySocialInboxData,
  getSocialInboxData,
  type SocialInboxData,
} from "@/lib/social-inbox";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function parseVariant(raw: string | string[] | undefined): VariantKey | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "A" ? "A" : null;
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const params = searchParams ? await searchParams : {};
  const variant = parseVariant(params.variant);

  // PROTOTYPE — variants render seed data only, no real auth needed.
  // Guarded by NODE_ENV so a stray ?variant= cannot show in production.
  if (variant && process.env.NODE_ENV !== "production") {
    return (
      <div className="mx-auto max-w-[1320px] px-6 py-6">
        <VariantA />
        <PrototypeSwitcher current={variant} />
      </div>
    );
  }

  const profile = await requirePagePermission("view_inbox", "/convert/inbox");

  const [status, inboxData] = await Promise.all([
    getSocialInboxStatus(),
    getSafeSocialInboxData(profile),
  ]);
  return (
    <SocialInboxClient
      status={status}
      initialData={inboxData.data}
      dataError={inboxData.error}
      canManageInboxState={profile.permissions.includes("manage_inbox_state")}
      canSendInboxReply={profile.permissions.includes("send_inbox_reply")}
      canCreateManagerCoaching={
        profile.roles.includes("admin") || profile.roles.includes("sales_lead")
      }
    />
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
