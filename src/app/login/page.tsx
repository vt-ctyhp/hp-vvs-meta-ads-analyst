import { Suspense } from "react";

import { LoginClient } from "@/components/login-client";
import { redirectAuthenticatedUserFromLogin } from "@/lib/server-route-auth";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  await redirectAuthenticatedUserFromLogin(firstParam(params.next));

  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function LoginFallback() {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-3xl border border-hp-rule bg-hp-card p-6">
        <p className="bg-hp-inset px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          Preparing Sign In
        </p>
      </section>
    </main>
  );
}
