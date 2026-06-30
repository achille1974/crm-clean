import type { ReactNode } from "react";
import Link from "next/link";

import { requireBeltramiDashboardAuth } from "@/lib/beltrami-auth";

export const dynamic = "force-dynamic";

const NAV_ITEMS = [
  { href: "/beltrami/dashboard", label: "Dashboard" },
  { href: "/beltrami/dashboard/clienti", label: "Clienti" },
  { href: "/beltrami/dashboard/attivita", label: "Attivita" },
  { href: "/beltrami/dashboard/promo", label: "Promo" },
];

export default async function BeltramiDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { profile } = await requireBeltramiDashboardAuth("/beltrami/dashboard");
  const displayName = profile.nome?.trim() || profile.email?.trim() || "Utente interno";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 px-4 py-3 shadow-sm backdrop-blur md:px-8">
        <div className="mx-auto flex max-w-[1700px] flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <Link href="/beltrami/dashboard" className="inline-flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-700 text-lg font-black text-white">
                B
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black tracking-tight text-slate-950 md:text-base">
                  Beltrami 1876
                </span>
                <span className="block truncate text-xs font-medium text-slate-500">
                  Accesso interno: {displayName}
                </span>
              </span>
            </Link>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <nav className="flex flex-wrap gap-2">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <a
              href="/phonesia/logout"
              className="rounded-md bg-slate-900 px-3 py-2 text-sm font-bold text-white transition hover:bg-slate-700"
            >
              Esci
            </a>
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
