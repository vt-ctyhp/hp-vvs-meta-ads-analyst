import {
  ADS_ANALYST_ENVIRONMENTS,
  DEFAULT_ADS_ANALYST_ENVIRONMENT,
  isAdsAnalystEnvironment,
  type AdsAnalystEnvironment,
} from "./data-boundaries.ts";
import { ConfigurationError, getOptionalEnv, isTruthyEnv } from "./env.ts";
import {
  createAdsAnalystModuleClient,
  createServiceClient,
  type AdsAnalystModuleRole,
} from "./supabase.ts";

export type JsonRecord = Record<string, unknown>;

export function createAdsAnalystClient(role: AdsAnalystModuleRole) {
  if (usesLimitedAdsAnalystDbAccess()) {
    return createAdsAnalystModuleClient(role);
  }

  return createServiceClient();
}

export function usesLimitedAdsAnalystDbAccess() {
  return isTruthyEnv("ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS");
}

export function usesEnvironmentScopedAdsAnalystUpserts() {
  return isTruthyEnv("ADS_ANALYST_USE_ENVIRONMENT_SCOPED_UPSERTS");
}

export function getAdsAnalystEnvironment(): AdsAnalystEnvironment {
  const configured = getOptionalEnv(
    "ADS_ANALYST_ENVIRONMENT",
    DEFAULT_ADS_ANALYST_ENVIRONMENT,
  ).toLowerCase();

  if (isAdsAnalystEnvironment(configured)) return configured;

  throw new ConfigurationError(
    `ADS_ANALYST_ENVIRONMENT must be one of: ${ADS_ANALYST_ENVIRONMENTS.join(", ")}`,
    ["ADS_ANALYST_ENVIRONMENT"],
  );
}

export function withAdsAnalystEnvironment<T extends object>(row: T): T {
  if (!usesLimitedAdsAnalystDbAccess() && !usesEnvironmentScopedAdsAnalystUpserts()) {
    return row;
  }

  return {
    ...row,
    environment: getAdsAnalystEnvironment(),
  };
}

export function withAdsAnalystEnvironmentRows<T extends object>(rows: T[]): T[] {
  if (!usesLimitedAdsAnalystDbAccess() && !usesEnvironmentScopedAdsAnalystUpserts()) {
    return rows;
  }

  return rows.map((row) => withAdsAnalystEnvironment(row));
}

export function adsAnalystOnConflict(legacyOnConflict: string) {
  if (!usesEnvironmentScopedAdsAnalystUpserts()) {
    return legacyOnConflict;
  }

  return legacyOnConflict
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean)
    .includes("environment")
    ? legacyOnConflict
    : `environment,${legacyOnConflict}`;
}
