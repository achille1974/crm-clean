import Link from "next/link";

export const dynamic = "force-dynamic";

const CARDS = [
  {
    href: "/phonesia/dashboard/clienti",
    badge: "Commerciale",
    title: "Clienti / Servizi / Opportunità",
    description:
      "Vista compatta con matrice servizi e accesso rapido alla scheda opportunità del cliente.",
  },
  {
    href: "/phonesia/dashboard/feedback",
    badge: "Soddisfazione",
    title: "Feedback clienti",
    description:
      "Controlla voti medi per negozio, ultimi feedback ricevuti e clienti insoddisfatti da ricontattare.",
  },
  {
    href: "/phonesia/dashboard/contratti",
    badge: "Archivio",
    title: "Contratti",
    description:
      "Storico contratti importati, operatori e date di stipula.",
  },
  {
    href: "/phonesia/dashboard/negozi",
    badge: "Analisi",
    title: "Negozi",
    description:
      "Panoramica per punto vendita e distribuzione clienti.",
  },
  {
    href: "/phonesia/dashboard/operatori",
    badge: "Analisi",
    title: "Operatori",
    description:
      "Vista sintetica per brand e famiglie di servizio.",
  },
];

export default function PhonesiaDashboardPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
          <div className="mb-3 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
            Dashboard commerciale
          </div>

          <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
            Dashboard Phonesia
          </h1>

          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
            Hub principale del CRM. Entra nella sezione clienti per lavorare su
            servizi attivi, opportunità commerciali, feedback e prossime azioni
            dell’agent.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {CARDS.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm transition hover:border-orange-200 hover:bg-orange-50/40"
            >
              <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                {card.badge}
              </div>

              <h2 className="text-2xl font-black tracking-tight text-slate-950">
                {card.title}
              </h2>

              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {card.description}
              </p>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
