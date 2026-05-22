"use client";

import { Eye, EyeOff, LockKeyhole, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { AUTH, translateError } from "@/lib/glossary";
import { createBrowserClient } from "@/lib/supabase";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const establishAppSession = useCallback(
    async function establishAppSession(session: Session | null) {
      if (!session?.access_token) return;

      setLoading(true);
      setStatus("");

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accessToken: session.access_token,
          expiresAt: session.expires_at,
          expiresIn: session.expires_in,
          next: nextPath,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        destination?: string;
        error?: unknown;
      };

      if (!response.ok || !payload.destination) {
        await createBrowserClient().auth.signOut();
        const errorMessage =
          typeof payload.error === "string" && payload.error.trim()
            ? payload.error
            : "Your account does not have access to this app.";
        throw new Error(errorMessage);
      }

      router.replace(payload.destination);
      router.refresh();
    },
    [nextPath, router],
  );

  useEffect(() => {
    let mounted = true;
    let supabase: ReturnType<typeof createBrowserClient>;

    try {
      supabase = createBrowserClient();
    } catch {
      return () => {
        mounted = false;
      };
    }

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) {
        void establishAppSession(data.session).catch((error) => {
          if (!mounted) return;
          setStatus(translateError(error));
          setLoading(false);
        });
      }
    });

    return () => {
      mounted = false;
    };
  }, [establishAppSession]);

  async function establishLocalTestSession(emailValue: string, passwordValue: string) {
    const response = await fetch("/api/auth/local-test-session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: emailValue,
        password: passwordValue,
        next: nextPath,
      }),
    });

    if (response.status === 401 || response.status === 404) return false;

    const payload = (await response.json().catch(() => ({}))) as {
      destination?: string;
      error?: unknown;
    };

    if (!response.ok || !payload.destination) {
      const errorMessage =
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error
          : "Local test sign in failed.";
      throw new Error(errorMessage);
    }

    router.replace(payload.destination);
    router.refresh();
    return true;
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    try {
      const emailValue = email.trim();
      const localSessionEstablished = await establishLocalTestSession(emailValue, password);
      if (localSessionEstablished) return;

      const supabase = createBrowserClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password,
      });

      if (error) throw error;
      await establishAppSession(data.session);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      setStatus(
        message.includes("does not have access")
          ? message
          : translateError(error, "Sign in failed. Check your email and password, then try again."),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-hp-foundation px-4 py-8 text-hp-body md:px-8">
      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-md flex-col justify-center">
        <div className="mb-6 text-center">
          <span className="text-[11px] uppercase tracking-[0.14em] text-hp-muted">
            HP/VVS Internal Access
          </span>
          <h1 className="mt-3 font-title text-4xl leading-tight text-hp-ink md:text-5xl">
            Sign In
          </h1>
        </div>

        <form onSubmit={submit} className="border border-hp-rule bg-hp-card p-6">
          <div className="mb-6 flex items-center gap-2 text-hp-ink">
            <LockKeyhole size={18} />
            <span className="text-[11px] uppercase tracking-[0.14em]">{AUTH.signIn}</span>
          </div>

          <label className="mb-5 block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
              className="w-full border-0 border-b border-hp-rule bg-transparent px-0.5 py-2 text-hp-body outline-none transition-colors focus:border-b-2 focus:border-hp-pink focus:pb-[7px]"
            />
          </label>

          <label className="mb-5 block">
            <span className="mb-2 block text-[11px] uppercase tracking-[0.14em] text-hp-muted">
              Password
            </span>
            <div className="flex items-center border-b border-hp-rule focus-within:border-b-2 focus-within:border-hp-pink">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
                className="min-w-0 flex-1 bg-transparent px-0.5 py-2 text-hp-body outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="px-2 py-2 text-hp-muted transition-colors hover:text-hp-ink"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
          </label>

          <button
            type="submit"
            disabled={loading || !email.trim() || !password}
            className="flex w-full items-center justify-center gap-2 bg-hp-ink px-5 py-4 text-[11px] uppercase tracking-[0.14em] text-hp-foundation transition-colors hover:bg-hp-pink"
          >
            <LogIn size={15} />
            {loading ? AUTH.signingIn : AUTH.signIn}
          </button>

          {status ? <p className="mt-4 text-sm text-hp-pink">{status}</p> : null}
        </form>
      </section>
    </main>
  );
}
