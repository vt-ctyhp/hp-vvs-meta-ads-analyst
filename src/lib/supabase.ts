import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ConfigurationError } from "./env.ts";
import type { Database } from "./database.types.ts";

let browserClient: SupabaseClient<Database> | null = null;

export type AdsAnalystModuleRole = "web" | "worker" | "ingest";

const MODULE_JWT_ENV_BY_ROLE: Record<AdsAnalystModuleRole, string> = {
  web: "SUPABASE_ADS_ANALYST_WEB_JWT",
  worker: "SUPABASE_ADS_ANALYST_WORKER_JWT",
  ingest: "SUPABASE_ADS_ANALYST_INGEST_JWT",
};

const MODULE_KEY_ENV_BY_ROLE: Record<AdsAnalystModuleRole, string> = {
  web: "SUPABASE_ADS_ANALYST_WEB_KEY",
  worker: "SUPABASE_ADS_ANALYST_WORKER_KEY",
  ingest: "SUPABASE_ADS_ANALYST_INGEST_KEY",
};

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new ConfigurationError("Missing NEXT_PUBLIC_SUPABASE_URL", [
      "NEXT_PUBLIC_SUPABASE_URL",
    ]);
  }
  return url;
}

export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new ConfigurationError("Missing SUPABASE_SERVICE_ROLE_KEY", [
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
  }

  return createClient<Database>(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createAdsAnalystModuleClient(role: AdsAnalystModuleRole) {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const keyEnvName = MODULE_KEY_ENV_BY_ROLE[role];
  const jwtEnvName = MODULE_JWT_ENV_BY_ROLE[role];
  const moduleKey = process.env[keyEnvName];
  const moduleJwt = process.env[jwtEnvName];

  if (moduleKey?.trim()) {
    return createClient<Database>(getSupabaseUrl(), moduleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  if (!moduleJwt?.trim()) {
    throw new ConfigurationError(`Missing ${keyEnvName} or ${jwtEnvName}`, [
      keyEnvName,
      jwtEnvName,
    ]);
  }

  if (!publishableKey) {
    throw new ConfigurationError("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  }

  return createClient<Database>(getSupabaseUrl(), publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    accessToken: async () => moduleJwt,
  });
}

export function createServerAuthClient() {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new ConfigurationError("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  }

  return createClient<Database>(getSupabaseUrl(), publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function createBrowserClient() {
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!publishableKey) {
    throw new ConfigurationError("Missing NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", [
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    ]);
  }

  if (typeof window === "undefined") {
    return createClient<Database>(getSupabaseUrl(), publishableKey);
  }

  browserClient ??= createClient<Database>(getSupabaseUrl(), publishableKey);
  return browserClient;
}
