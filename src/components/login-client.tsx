"use client";

import { Eye, EyeOff, LockKeyhole, LogIn } from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { createBrowserClient } from "@/lib/supabase";

export function LoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let mounted = true;
    const supabase = createBrowserClient();

    supabase.auth.getSession().then(({ data }) => {
      if (mounted && data.session) router.replace("/");
    });

    return () => {
      mounted = false;
    };
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    try {
      const supabase = createBrowserClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) throw error;
      router.push("/");
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
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
            <span className="text-[11px] uppercase tracking-[0.14em]">Login</span>
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
            {loading ? "Signing In" : "Sign In"}
          </button>

          {status ? <p className="mt-4 text-sm text-hp-pink">{status}</p> : null}
        </form>
      </section>
    </main>
  );
}
