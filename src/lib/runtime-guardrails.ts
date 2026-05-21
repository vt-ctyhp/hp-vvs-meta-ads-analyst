import { ADS_ANALYST_ENVIRONMENTS } from "./data-boundaries.ts";
import { getAdsAnalystEnvironment } from "./ads-analyst-db.ts";
import { isTruthyEnv } from "./env.ts";

export type DataBoundaryRuntimeStatus = {
  ok: boolean;
  mode: "legacy_service_role" | "limited_module_role";
  strict: boolean;
  serviceRoleConfigured: boolean;
  moduleCredentialsConfigured: {
    web: boolean;
    worker: boolean;
    ingest: boolean;
  };
  moduleCredentialSources: {
    web: "key" | "jwt" | "missing";
    worker: "key" | "jwt" | "missing";
    ingest: "key" | "jwt" | "missing";
  };
  environment: string;
  issues: string[];
};

export function getDataBoundaryRuntimeStatus(): DataBoundaryRuntimeStatus {
  const strict = isTruthyEnv("ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS");
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  const moduleCredentialSources = {
    web: adsAnalystCredentialSource("WEB"),
    worker: adsAnalystCredentialSource("WORKER"),
    ingest: adsAnalystCredentialSource("INGEST"),
  };
  const moduleCredentialsConfigured = {
    web: moduleCredentialSources.web !== "missing",
    worker: moduleCredentialSources.worker !== "missing",
    ingest: moduleCredentialSources.ingest !== "missing",
  };
  const hasAllModuleCredentials = Object.values(moduleCredentialsConfigured).every(Boolean);
  const mode = strict ? "limited_module_role" : "legacy_service_role";
  const issues: string[] = [];
  let environment: string;
  let environmentValid = true;

  try {
    environment = getAdsAnalystEnvironment();
  } catch {
    environmentValid = false;
    environment = process.env.ADS_ANALYST_ENVIRONMENT || "";
    issues.push(
      `ADS_ANALYST_ENVIRONMENT must be one of: ${ADS_ANALYST_ENVIRONMENTS.join(", ")}.`,
    );
  }

  if (serviceRoleConfigured) {
    issues.push(
      "SUPABASE_SERVICE_ROLE_KEY is still configured. Phase 4 must remove it from the Ads Analyst runtime.",
    );
  }

  if (!hasAllModuleCredentials) {
    issues.push("Not all Ads Analyst module credentials are configured yet.");
  }

  return {
    ok: !strict || (!serviceRoleConfigured && hasAllModuleCredentials && environmentValid),
    mode,
    strict,
    serviceRoleConfigured,
    moduleCredentialsConfigured,
    moduleCredentialSources,
    environment,
    issues,
  };
}

export function assertLimitedDataBoundaryRuntime() {
  const status = getDataBoundaryRuntimeStatus();
  if (!status.ok) {
    throw new Error(`Ads Analyst data boundary guard failed: ${status.issues.join(" ")}`);
  }
}

function adsAnalystCredentialSource(
  role: "WEB" | "WORKER" | "INGEST",
): "key" | "jwt" | "missing" {
  if (process.env[`SUPABASE_ADS_ANALYST_${role}_KEY`]?.trim()) return "key";
  if (process.env[`SUPABASE_ADS_ANALYST_${role}_JWT`]?.trim()) return "jwt";
  return "missing";
}
