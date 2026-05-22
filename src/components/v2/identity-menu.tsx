"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { UserRole } from "@/lib/access-control";
import { ROLE_LABELS } from "@/lib/access-control";

type Props = {
  email: string | null;
  fullName: string | null;
  initials: string | null;
  roles: UserRole[];
};

export function IdentityMenu({ email, fullName, initials, roles }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
    } catch {
      // Network failures still drop the cookie next render; ignore.
    } finally {
      router.push("/sign-in");
      router.refresh();
    }
  }

  const displayName = fullName ?? email ?? "Signed in";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex h-10 min-w-[40px] items-center justify-center gap-2 border border-hp-rule bg-hp-card px-3 text-sm font-medium text-hp-ink shadow-sm transition-colors hover:bg-hp-inset"
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-hp-ink text-xs font-semibold text-hp-foundation">
          {initials ?? "—"}
        </span>
        <span className="hidden text-sm sm:inline">{displayName}</span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-72 border border-hp-rule bg-hp-card p-3 shadow-xl"
          onMouseLeave={() => setOpen(false)}
        >
          <div className="space-y-1 border-b border-hp-rule pb-3">
            <p className="text-sm font-medium text-hp-ink">{displayName}</p>
            {email ? <p className="truncate text-xs text-hp-muted">{email}</p> : null}
            <p className="pt-1 text-xs uppercase tracking-[0.14em] text-hp-muted">Roles</p>
            <p className="text-xs text-hp-body">
              {roles.length === 0
                ? "No roles assigned"
                : roles.map((role) => ROLE_LABELS[role] ?? role).join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-3 w-full border border-hp-rule bg-hp-card px-3 py-2 text-sm font-medium text-hp-ink transition-colors hover:bg-hp-inset disabled:cursor-not-allowed disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
