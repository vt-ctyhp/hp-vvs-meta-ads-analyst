const REQUIRED_BASE_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "OPENAI_API_KEY",
  "META_APP_ID",
  "META_APP_SECRET",
  "META_ACCESS_TOKEN",
  "META_HP_AD_ACCOUNT_ID",
  "CRON_SECRET",
] as const;

const LEGACY_SERVICE_ROLE_ENV = ["SUPABASE_SERVICE_ROLE_KEY"] as const;
const LIMITED_MODULE_ENV = [
  "SUPABASE_ADS_ANALYST_WEB_JWT",
  "SUPABASE_ADS_ANALYST_WORKER_JWT",
  "SUPABASE_ADS_ANALYST_INGEST_JWT",
] as const;
const LIMITED_MODULE_KEY_ENV = [
  "SUPABASE_ADS_ANALYST_WEB_KEY",
  "SUPABASE_ADS_ANALYST_WORKER_KEY",
  "SUPABASE_ADS_ANALYST_INGEST_KEY",
] as const;
const LIMITED_MODULE_CREDENTIAL_GROUPS: readonly (readonly string[])[] = [
  ["SUPABASE_ADS_ANALYST_WEB_KEY", "SUPABASE_ADS_ANALYST_WEB_JWT"],
  ["SUPABASE_ADS_ANALYST_WORKER_KEY", "SUPABASE_ADS_ANALYST_WORKER_JWT"],
  ["SUPABASE_ADS_ANALYST_INGEST_KEY", "SUPABASE_ADS_ANALYST_INGEST_JWT"],
] as const;
const REQUIRED_APP_ENV = [...REQUIRED_BASE_ENV, ...LEGACY_SERVICE_ROLE_ENV] as const;

export type RequiredAppEnv = (typeof REQUIRED_APP_ENV)[number];
export type AnalysisMode = "fast" | "deep";

export class ConfigurationError extends Error {
  missing: string[];

  constructor(message: string, missing: string[] = []) {
    super(message);
    this.name = "ConfigurationError";
    this.missing = missing;
  }
}

export function getDefaultRequiredEnv(): readonly string[] {
  if (isTruthyEnv("ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS")) {
    return [...REQUIRED_BASE_ENV, ...LIMITED_MODULE_ENV, ...LIMITED_MODULE_KEY_ENV];
  }

  return REQUIRED_APP_ENV;
}

/**
 * Helper for callers that historically required SUPABASE_SERVICE_ROLE_KEY.
 * In limited-access mode the service-role key is intentionally absent —
 * the deployment uses scoped module keys instead. Anything that hard-coded
 * a service-role check now routes through this so the dashboard, ad-hoc
 * analysis, and creative analysis surfaces don't bail to empty payloads on
 * staging.
 */
export function getMissingDashboardEnv(extra: readonly string[] = []): string[] {
  const limited = isTruthyEnv("ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS");
  const required = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ...(limited ? [] : ["SUPABASE_SERVICE_ROLE_KEY"]),
    ...extra,
  ];
  return getMissingRequiredEnv(required);
}

export function getMissingRequiredEnv(keys: readonly string[] = getDefaultRequiredEnv()): string[] {
  const missing = keys.filter((key) => !process.env[key]?.trim());

  if (!isTruthyEnv("ADS_ANALYST_ENFORCE_LIMITED_DB_ACCESS")) {
    return missing;
  }

  return missing.filter((key) => {
    const credentialGroup = LIMITED_MODULE_CREDENTIAL_GROUPS.find((group) =>
      group.includes(key),
    );
    if (!credentialGroup) return true;
    return !credentialGroup.some((credentialKey) => process.env[credentialKey]?.trim());
  });
}

export function requireEnv(
  name:
    | RequiredAppEnv
    | "OPENAI_MODEL"
    | "OPENAI_FAST_MODEL"
    | "OPENAI_DEEP_MODEL"
    | "META_API_VERSION"
    | "META_WEBHOOK_VERIFY_TOKEN",
): string {
  const value = process.env[name];
  if (!value?.trim()) {
    throw new ConfigurationError(`Missing required environment variable: ${name}`, [name]);
  }
  return value;
}

export function getOptionalEnv(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

export function assertConfigured(keys: readonly string[] = REQUIRED_APP_ENV): void {
  const missing = getMissingRequiredEnv(keys);
  if (missing.length) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(", ")}`,
      missing,
    );
  }
}

export function getMetaApiVersion(): string {
  return getOptionalEnv("META_API_VERSION", "v24.0");
}

export function getOpenAIAnalysisModel(mode: AnalysisMode): string {
  if (mode === "deep") return getOptionalEnv("OPENAI_DEEP_MODEL", "gpt-5.5");
  return getOptionalEnv("OPENAI_FAST_MODEL", "gpt-5.4-nano");
}

export function getOpenAIModel(): string {
  return getOptionalEnv("OPENAI_MODEL", "gpt-4.1-mini");
}

export function isTruthyEnv(name: string) {
  return ["1", "true", "yes", "on"].includes(getOptionalEnv(name).toLowerCase());
}
