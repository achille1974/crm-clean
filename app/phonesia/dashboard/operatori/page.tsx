import Link from "next/link";

import Filters from "@/components/phonesia/dashboard/Filters";
import {
  getContrattiPerOperatore,
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

export default async function DashboardOperatoriPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const negozioRaw = getSingleValue(resolvedParams.negozio);
  const fromRaw = getSingleValue(resolvedParams.from);
  const toRaw = getSingleValue(resolvedParams.to);

  const filters: DashboardFilters = {
    negozioCodice: negozioRaw && negozioRaw !== "all" ? Number(negozioRaw) : null,
    dateFrom: fromRaw || null,
    dateTo: toRaw || null,
  };

  const [kpis, contrattiPerOperatore, negozioOptions] = await Promise.all([
    getDashboardKpis(filters),
    getContrattiPerOperatore(filters),
    getNegozioOptions(),
  ]);

  const total = contrattiPerOperatore.reduce((sum, item) => sum + item.totale, 0);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-4">
            <Link
              href={buildHref("/phonesia/dashboard", filters)}
              className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              ← Torna alla dashboard
            </Link>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Dettaglio operatori
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Operatori
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Distribuzione compatta per brand e operatore commerciale.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Contratti filtrati: {kpis.contrattiTotali}
              </div>
            </div>
          </div>
        </section>

        <Filters negozi={negozioOptions} filters={filters} />

        <section className="space-y-3">
          {contrattiPerOperatore.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-slate-500">
              Nessun operatore trovato con i filtri selezionati.
            </div>
          ) : (
            contrattiPerOperatore.map((item) => {
              const pct = total > 0 ? Math.round((item.totale / total) * 100) : 0;

              return (
                <article
                  key={item.operatore}
                  className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-black text-slate-950">{item.operatore}</h2>
                      <p className="mt-1 text-sm text-slate-600">
                        Peso sul totale filtrato: {pct}%
                      </p>
                    </div>

                    <div className="rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-lg font-black text-orange-700">
                      {item.totale}
                    </div>
                  </div>

                  <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-orange-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </article>
              );
            })
          )}
        </section>
      </div>
    </main>
  );
}
