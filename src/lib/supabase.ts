import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { ConfigurationError } from "./env";
import type { Database } from "./database.types";

let browserClient: SupabaseClient<Database> | null = null;

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
