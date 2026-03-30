import Link from "next/link";

import Filters from "@/components/phonesia/dashboard/Filters";
import {
  getContrattiPerNegozio,
  getConversionePerNegozio,
  getLeadPerNegozio,
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

export default async function DashboardNegoziPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const negozioRaw = getSingleValue(resolvedParams.negozio);
  const fromRaw = getSingleValue(resolvedParams.from);
  const toRaw = getSingleValue(resolvedParams.to);

  const filters: DashboardFilters = {
    negozioCodice: negozioRaw && negozioRaw !== "all" ? Number(negozioRaw) : null,
    dateFrom: fromRaw || null,
    dateTo: toRaw || null,
  };

  const [leadPerNegozio, contrattiPerNegozio, conversionePerNegozio, negozioOptions] =
    await Promise.all([
      getLeadPerNegozio(filters),
      getContrattiPerNegozio(filters),
      getConversionePerNegozio(filters),
      getNegozioOptions(),
    ]);

  const contrattiMap = new Map(
    contrattiPerNegozio
      .filter((item) => item.negozioCodice !== null)
      .map((item) => [item.negozioCodice as number, item.totale]),
  );

  const leadMap = new Map(
    leadPerNegozio
      .filter((item) => item.negozioCodice !== null)
      .map((item) => [item.negozioCodice as number, item.totale]),
  );

  const nonAssociati =
    contrattiPerNegozio.find((item) => item.negozioCodice === null)?.totale ?? 0;

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
                  Dettaglio negozi
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Negozi
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Ogni negozio in una card separata, senza tabelle lunghe.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Contratti non associati: {nonAssociati}
              </div>
            </div>
          </div>
        </section>

        <Filters negozi={negozioOptions} filters={filters} />

        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {conversionePerNegozio.map((negozio) => (
            <article
              key={negozio.negozioCodice}
              className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-black text-slate-950">{negozio.negozio}</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Panoramica negozio con lead, contratti e conversione.
                  </p>
                </div>

                <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm font-bold text-orange-700">
                  {negozio.conversionePct}%
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <div className="text-sm text-slate-500">Lead QR</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">
                    {leadMap.get(negozio.negozioCodice ?? -1) ?? negozio.leadQr}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <div className="text-sm text-slate-500">Lead convertiti</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">
                    {negozio.leadConvertiti}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <div className="text-sm text-slate-500">Contratti</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">
                    {contrattiMap.get(negozio.negozioCodice ?? -1) ?? negozio.contratti}
                  </div>
                </div>

                <div className="rounded-2xl bg-slate-50 px-3 py-3">
                  <div className="text-sm text-slate-500">Conversione</div>
                  <div className="mt-1 text-2xl font-black text-orange-600">
                    {negozio.conversionePct}%
                  </div>
                </div>
              </div>
            </article>
          ))}

          {conversionePerNegozio.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-slate-500 xl:col-span-2">
              Nessun negozio trovato con i filtri selezionati.
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
