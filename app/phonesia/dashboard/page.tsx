import KpiCards from "@/components/phonesia/dashboard/KpiCards";
import SimpleBarChart from "@/components/phonesia/dashboard/SimpleBarChart";
import ConversionTable from "@/components/phonesia/dashboard/ConversionTable";
import Filters from "@/components/phonesia/dashboard/Filters";
import {
  getContrattiPerNegozio,
  getContrattiPerOperatore,
  getConversionePerNegozio,
  getDashboardKpis,
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

export default async function PhonesiaDashboardPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const negozioRaw = getSingleValue(resolvedParams.negozio);
  const fromRaw = getSingleValue(resolvedParams.from);
  const toRaw = getSingleValue(resolvedParams.to);

  const filters: DashboardFilters = {
    negozioCodice:
      negozioRaw && negozioRaw !== "all" ? Number(negozioRaw) : null,
    dateFrom: fromRaw || null,
    dateTo: toRaw || null,
  };

  const [
    kpis,
    leadPerNegozio,
    contrattiPerNegozio,
    conversionePerNegozio,
    contrattiPerOperatore,
    negozioOptions,
  ] = await Promise.all([
    getDashboardKpis(filters),
    getLeadPerNegozio(filters),
    getContrattiPerNegozio(filters),
    getConversionePerNegozio(filters),
    getContrattiPerOperatore(filters),
    getNegozioOptions(),
  ]);

  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 md:px-8 xl:px-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white px-6 py-6 shadow-sm md:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                Dashboard commerciale
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Dashboard Phonesia
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                Vista sintetica di lead QR, contratti, conversione e distribuzione per negozio.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Dati aggiornati in tempo reale dal nuovo database Phonesia
            </div>
          </div>
        </section>

        <Filters negozi={negozioOptions} filters={filters} />

        <KpiCards kpis={kpis} />

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <SimpleBarChart
            title="Lead QR per negozio"
            subtitle="Numero di clienti registrati tramite QR in ogni punto vendita"
            items={leadPerNegozio.map((item) => ({
              label: item.negozio,
              value: item.totale,
            }))}
          />

          <SimpleBarChart
            title="Contratti per negozio"
            subtitle="Contratti attualmente associati ai negozi o ancora non collegati"
            items={contrattiPerNegozio.map((item) => ({
              label: item.negozio,
              value: item.totale,
            }))}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <ConversionTable rows={conversionePerNegozio} />

          <SimpleBarChart
            title="Contratti per operatore"
            subtitle="Distribuzione dei contratti per brand o operatore commerciale"
            items={contrattiPerOperatore.map((item) => ({
              label: item.operatore,
              value: item.totale,
            }))}
          />
        </section>
      </div>
    </main>
  );
}
