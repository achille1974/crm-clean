import type { ReactNode } from "react";
import Link from "next/link";

import { requirePhonesiaAuth } from "@/lib/phonesia-auth";

export const dynamic = "force-dynamic";

function ExitDoorIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      className="h-6 w-6 shrink-0"
      fill="none"
    >
      <path
        d="M35 9h16v46H35"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M35 32H12"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M22 22 12 32l10 10"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="44" cy="32" r="2.8" fill="currentColor" />
    </svg>
  );
}

export default async function PhonesiaDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile } = await requirePhonesiaAuth();

  const displayName =
    profile.nome?.trim() ||
    profile.email?.trim() ||
    "Utente PHONESIA";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/phonesia/dashboard"
              className="inline-flex items-center gap-3"
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-orange-500 text-lg font-black text-white shadow-sm">
                P
              </span>

              <span className="min-w-0">
                <span className="block text-sm font-black tracking-tight text-slate-950 md:text-base">
                  PHONESIA CRM
                </span>
                <span className="block truncate text-xs font-medium text-slate-500">
                  Accesso: {displayName}
                </span>
              </span>
            </Link>
          </div>

          <a
            href="/phonesia/logout"
            className="group inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 focus:outline-none focus:ring-4 focus:ring-emerald-200 md:px-5"
            title="Esci dal CRM"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-xl border-2 border-white/90 text-white">
              <ExitDoorIcon />
            </span>
            <span>Esci</span>
          </a>
        </div>
      </header>

      {children}
    </div>
  );
}
