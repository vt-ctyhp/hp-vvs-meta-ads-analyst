"use client";

import { LogOut } from "lucide-react";

import { AUTH } from "@/lib/glossary";
import { createBrowserClient } from "@/lib/supabase";

type Props = {
  email: string | null;
};

export function NoAccessClient({ email }: Props) {
  async function signOut() {
    await fetch("/api/auth/session", { method: "DELETE" }).catch(() => null);
    await createBrowserClient().auth.signOut();
    window.location.assign("/login");
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md flex-col justify-center">
        <div className="mb-6 text-center">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Internal Access
          </span>
          <h1 className="mt-3 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Access Unavailable
          </h1>
        </div>

        <div className="border border-hp-rule bg-hp-card p-6">
          <p className="text-sm leading-6 text-hp-muted">
            {email
              ? `${email} is signed in, but this account is not active for this app.`
              : "This account is not active for this app."}
          </p>
          <button
            type="button"
            onClick={signOut}
            className="mt-6 flex w-full items-center justify-center gap-2 bg-hp-ink px-5 py-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
          >
            <LogOut size={15} />
            {AUTH.signOut}
          </button>
        </div>
      </section>
    </main>
  );
}
