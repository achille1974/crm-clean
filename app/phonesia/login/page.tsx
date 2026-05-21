"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function getSupabaseBrowserClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

function getSafeNextUrl() {
  if (typeof window === "undefined") return "/phonesia/dashboard/clienti";

  const params = new URLSearchParams(window.location.search);
  const next = params.get("next");

  if (next && next.startsWith("/phonesia/") && !next.startsWith("/phonesia/login")) {
    return next;
  }

  return "/phonesia/dashboard/clienti";
}

export default function PhonesiaLoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setErrorMessage("");

    try {
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage("Email o password non corretti.");
        return;
      }

      router.replace(getSafeNextUrl());
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "Errore durante l’accesso. Riprova.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] px-5 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md items-center">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-7 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
          <div className="mb-7 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-2xl font-black text-white">
              P
            </div>

            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Accesso PHONESIA
            </h1>

            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Inserisci le credenziali autorizzate per accedere al CRM.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500"
                placeholder="nome@azienda.it"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Password
              </label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none transition focus:border-orange-500"
                placeholder="Password"
              />
            </div>

            {errorMessage && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={[
                "w-full rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition",
                loading
                  ? "cursor-not-allowed bg-orange-300"
                  : "bg-orange-500 hover:bg-orange-600",
              ].join(" ")}
            >
              {loading ? "Accesso in corso..." : "Accedi"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
