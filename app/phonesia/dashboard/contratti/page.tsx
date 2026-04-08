import Link from "next/link";

import Filters from "@/components/phonesia/dashboard/Filters";
import {
  getContrattiPerOperatore,
  getContrattiRecenti,
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

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function labelContratto(categoria: string | null, tipo: string | null) {
  const parts = [categoria, tipo].filter(Boolean);
  if (parts.length === 0) return "Non classificato";
  return parts.join(" · ");
}

export default async function DashboardContrattiPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const negozioRaw = getSingleValue(resolvedParams.negozio);
  const fromRaw = getSingleValue(resolvedParams.from);
  const toRaw = getSingleValue(resolvedParams.to);

  const filters: DashboardFilters = {
    negozioCodice: negozioRaw && negozioRaw !== "all" ? Number(negozioRaw) : null,
    dateFrom: fromRaw || null,
    dateTo: toRaw || null,
  };

  const [kpis, contrattiRecenti, contrattiPerOperatore, negozioOptions] = await Promise.all([
    getDashboardKpis(filters),
    getContrattiRecenti(filters),
    getContrattiPerOperatore(filters),
    getNegozioOptions(),
  ]);

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
                  Dettaglio contratti
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Contratti
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Elenco compatto per consultazione rapida da smartphone.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Record visibili: {contrattiRecenti.length}
              </div>
            </div>
          </div>
        </section>

        <Filters negozi={negozioOptions} filters={filters} />

        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Contratti</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{kpis.contrattiTotali}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Clienti con consenso marketing</div>
            <div className="mt-2 text-3xl font-black text-slate-950">
              {kpis.clientiConConsensoMarketing}
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Telefonia</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{kpis.contrattiTelefonia}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Energia</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{kpis.contrattiEnergia}</div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-950">Operatori principali</h2>
              <p className="mt-1 text-sm text-slate-600">Distribuzione rapida sui record filtrati.</p>
            </div>
            <Link
              href={buildHref("/phonesia/dashboard/operatori", filters)}
              className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              Apri operatori
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {contrattiPerOperatore.slice(0, 3).map((item) => (
              <div
                key={item.operatore}
                className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="text-sm text-slate-500">{item.operatore}</div>
                <div className="mt-1 text-2xl font-black text-slate-950">{item.totale}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-950">Ultimi contratti</h2>
              <p className="mt-1 text-sm text-slate-600">
                Vista breve e leggibile anche da mobile.
              </p>
            </div>
          </div>

          {contrattiRecenti.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-slate-500">
              Nessun contratto trovato con i filtri selezionati.
            </div>
          ) : (
            contrattiRecenti.map((row) => (
              <article
                key={row.id}
                className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-black text-slate-950">
                      {[row.nome, row.cognome].filter(Boolean).join(" ") || "Cliente non indicato"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {row.negozioNome} · {labelContratto(row.categoria, row.tipoContratto)}
                    </div>
                  </div>

                  <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-sm font-semibold text-slate-700">
                    {row.operatore || "Operatore non indicato"}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-5">
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Numero contratto</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {row.numeroContratto || "—"}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Data stipula</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatDate(row.dataStipula)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Importato il</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatDate(row.createdAt)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Telefono</div>
                    <div className="mt-1 font-semibold text-slate-950">{row.telefono || "—"}</div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Origine cliente</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {row.origineCliente || "—"}
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
