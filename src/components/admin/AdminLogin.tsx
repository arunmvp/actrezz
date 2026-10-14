"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { LogoMark } from "@/components/youtube/icons";

export function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState(process.env.NODE_ENV === "production" ? "" : "admin@actrezz.local");
  const [password, setPassword] = useState(process.env.NODE_ENV === "production" ? "" : "actrezz-admin");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Unable to sign in");
      router.replace("/admin");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to sign in");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-[#09090b] px-4 py-10 text-zinc-100">
      <div className="w-full max-w-md">
        <Link href="/" className="mx-auto flex w-fit items-center justify-center" aria-label="Actrezz home">
          <LogoMark className="h-8 w-auto" />
        </Link>
        <section className="mt-8 rounded-3xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-[#ff2d78] to-violet-600">
            <LockKeyhole className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold">Admin access</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Manage the Actrezz catalogue, publishing queue, media and SEO.</p>

          <form onSubmit={submit} className="mt-7 space-y-4">
            <label className="block text-sm font-medium">
              Email
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 outline-none transition focus:border-[#ff2d78] focus:ring-2 focus:ring-[#ff2d78]/20" />
            </label>
            <label className="block text-sm font-medium">
              Password
              <span className="relative mt-2 block">
                <input value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete="current-password" required className="h-11 w-full rounded-xl border border-white/10 bg-black/30 px-3 pr-11 outline-none transition focus:border-[#ff2d78] focus:ring-2 focus:ring-[#ff2d78]/20" />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0 grid w-11 place-items-center text-zinc-400 hover:text-white">
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </span>
            </label>
            {error && <p role="alert" className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
            <button disabled={submitting} className="h-11 w-full rounded-xl bg-gradient-to-r from-[#ff2d78] to-violet-600 text-sm font-semibold shadow-lg shadow-[#ff2d78]/10 transition hover:brightness-110 disabled:cursor-wait disabled:opacity-60">
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>

          {process.env.NODE_ENV !== "production" && (
            <p className="mt-5 rounded-xl bg-white/5 px-3 py-2 text-xs leading-5 text-zinc-400">Local preview credentials are prefilled. Production requires credentials from the environment file.</p>
          )}
        </section>
      </div>
    </main>
  );
}
