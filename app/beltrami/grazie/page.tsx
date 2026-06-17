import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registrazione ricevuta | Beltrami 1876",
};

export default function BeltramiGraziePage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[70vh] max-w-2xl items-center">
        <section className="w-full rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm md:p-10">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
            Beltrami 1876
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
            Registrazione ricevuta
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-700">
            Grazie. Beltrami 1876 potra usare WhatsApp per comunicazioni legate
            ai servizi richiesti e alle relative scadenze.
          </p>
          <Link
            href="/beltrami/registrazione"
            className="mt-7 inline-flex rounded-lg border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-800 transition hover:border-emerald-600 hover:text-emerald-700"
          >
            Torna alla registrazione
          </Link>
        </section>
      </div>
    </main>
  );
}
