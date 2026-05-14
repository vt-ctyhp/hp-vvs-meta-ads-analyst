import { getMissingRequiredEnv } from "@/lib/env";
import { validateReadOnlyMetaToken } from "@/lib/meta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const missingEnv = getMissingRequiredEnv();
  const meta =
    missingEnv.includes("META_ACCESS_TOKEN") || missingEnv.includes("META_HP_AD_ACCOUNT_ID")
      ? { ok: false, error: "Meta environment variables are incomplete." }
      : await validateMeta();

  return Response.json({
    ok: missingEnv.length === 0 && meta.ok,
    missingEnv,
    meta,
    readOnly: true,
    forbiddenPermissions: ["ads_management"],
  });
}

async function validateMeta() {
  try {
    const permissions = await validateReadOnlyMetaToken();
    return { ok: true, permissions };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
