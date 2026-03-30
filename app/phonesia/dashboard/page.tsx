import Link from "next/link";

import Filters from "@/components/phonesia/dashboard/Filters";
import {
  getContrattiPerNegozio,
  getContrattiPerOperatore,
  getConversionePerNegozio,
  getDashboardKpis,
  getNegozioOptions,
  type DashboardFilters,
} from "@/lib/phonesia/dashboard";

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

function getSingleValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function buildHref(path: string, filters: DashboardFilters) {
  const params = new URLSearchParams();

  if (filters.negozioCodice) {
    params.set("negozio", String(filters.negozioCodice));
  }

  if (filters.dateFrom) {
    params.set("from", filters.dateFrom);
  }

  if (filters.dateTo) {
    params.set("to", filters.dateTo);
  }

  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

function formatPct(value: number) {
  return `${value}%`;
}

export default async function PhonesiaDashboardPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const negozioRaw = getSingleValue(resolvedParams.negozio);
  const fromRaw = getSingleValue(resolvedParams.from);
  const toRaw = getSingleValue(resolvedParams.to);

  const filters: DashboardFilters = {
    negozioCodice: negozioRaw && negozioRaw !== "all" ? Number(negozioRaw) : null,
    dateFrom: fromRaw || null,
    dateTo: toRaw || null,
  };

  const [kpis, contrattiPerNegozio, conversionePerNegozio, contrattiPerOperatore, negozioOptions] =
    await Promise.all([
      getDashboardKpis(filters),
      getContrattiPerNegozio(filters),
      getConversionePerNegozio(filters),
      getContrattiPerOperatore(filters),
      getNegozioOptions(),
    ]);

  const nonAssociati =
    contrattiPerNegozio.find((item) => item.negozioCodice === null)?.totale ?? 0;

  const migliorNegozio = [...conversionePerNegozio]
    .filter((item) => item.leadQr > 0)
    .sort((a, b) => b.conversionePct - a.conversionePct)[0];

  const topOperatore = contrattiPerOperatore[0];

  const detailContrattiHref = buildHref("/phonesia/dashboard/contratti", filters);
  const detailNegoziHref = buildHref("/phonesia/dashboard/negozi", filters);
  const detailOperatoriHref = buildHref("/phonesia/dashboard/operatori", filters);

  const cards = [
    {
      title: "Contratti",
      value: String(kpis.contrattiTotali),
      subtitle: "Totale contratti filtrati",
      href: detailContrattiHref,
      accent: "orange" as const,
    },
    {
      title: "Clienti con contratto",
      value: String(kpis.contrattiCollegatiQr),
      subtitle: "Contratti collegati a un cliente QR",
      href: detailContrattiHref,
      accent: "slate" as const,
    },
    {
      title: "Telefonia",
      value: String(kpis.contrattiTelefonia),
      subtitle: "Mobile + fisso",
      href: detailContrattiHref,
      accent: "slate" as const,
    },
    {
      title: "Energia",
      value: String(kpis.contrattiEnergia),
      subtitle: "Luce e gas",
      href: detailContrattiHref,
      accent: "slate" as const,
    },
    {
      title: "Negozi",
      value: migliorNegozio ? migliorNegozio.negozio : "—",
      subtitle: migliorNegozio
        ? `Migliore conversione: ${formatPct(migliorNegozio.conversionePct)}`
        : "Apri il dettaglio per analizzare i negozi",
      href: detailNegoziHref,
      accent: "slate" as const,
    },
    {
      title: "Operatori",
      value: topOperatore ? topOperatore.operatore : "—",
      subtitle: topOperatore
        ? `Più venduto: ${topOperatore.totale}`
        : "Apri il dettaglio per analizzare gli operatori",
      href: detailOperatoriHref,
      accent: "slate" as const,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                Dashboard commerciale
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Dashboard Phonesia
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                Hub compatto: apri il dettaglio che ti interessa e analizza solo quello.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Vista mobile ottimizzata con pagine dedicate
            </div>
          </div>
        </section>

        <Filters negozi={negozioOptions} filters={filters} />

        <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {cards.map((card) => {
            const accentClasses =
              card.accent === "orange"
                ? "border-orange-200 bg-orange-50/50"
                : "border-slate-200 bg-white";

            return (
              <Link
                key={card.title}
                href={card.href}
                className={`group rounded-3xl border px-5 py-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${accentClasses}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-slate-500">{card.title}</div>
                    <div className="mt-2 text-3xl font-black tracking-tight text-slate-950">
                      {card.value}
                    </div>
                    <div className="mt-2 text-sm text-slate-600">{card.subtitle}</div>
                  </div>

                  <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-semibold text-slate-700 group-hover:border-orange-300 group-hover:text-orange-700">
                    Apri
                  </div>
                </div>
              </Link>
            );
          })}
        </section>

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Focus rapido</h2>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-medium text-slate-500">Conversione lead</div>
                <div className="mt-1 text-2xl font-black text-orange-600">
                  {formatPct(kpis.conversionePct)}
                </div>
                <div className="mt-1 text-sm text-slate-600">
                  Rapporto lead QR convertiti / lead totali.
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-medium text-slate-500">Contratti non associati</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{nonAssociati}</div>
                <div className="mt-1 text-sm text-slate-600">
                  Record senza negozio o ancora da collegare.
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
            <h2 className="text-xl font-black text-slate-950">Azioni rapide</h2>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Link
                href={detailContrattiHref}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-orange-300 hover:bg-orange-50"
              >
                <div className="text-base font-bold text-slate-950">Vai ai contratti</div>
                <div className="mt-1 text-sm text-slate-600">
                  Lista compatta, date, operatore e negozio.
                </div>
              </Link>

              <Link
                href={detailNegoziHref}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-orange-300 hover:bg-orange-50"
              >
                <div className="text-base font-bold text-slate-950">Vai ai negozi</div>
                <div className="mt-1 text-sm text-slate-600">
                  Conversione e distribuzione per punto vendita.
                </div>
              </Link>

              <Link
                href={detailOperatoriHref}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-orange-300 hover:bg-orange-50 sm:col-span-2"
              >
                <div className="text-base font-bold text-slate-950">Vai agli operatori</div>
                <div className="mt-1 text-sm text-slate-600">
                  Vedi subito chi vende di più e con quali volumi.
                </div>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
