import { Suspense } from "react";

import { LoginClient } from "@/components/login-client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginClient />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto max-w-3xl border border-hp-rule bg-hp-card p-6">
        <p className="bg-hp-inset px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-hp-muted">
          Preparing login
        </p>
      </section>
    </main>
  );
}
