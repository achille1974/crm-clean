import Link from "next/link";

import Filters from "@/components/phonesia/dashboard/Filters";
import {
  getDashboardKpis,
  getLeadOpportunityRows,
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

export default async function DashboardClientiPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const negozioRaw = getSingleValue(resolvedParams.negozio);
  const fromRaw = getSingleValue(resolvedParams.from);
  const toRaw = getSingleValue(resolvedParams.to);

  const filters: DashboardFilters = {
    negozioCodice: negozioRaw && negozioRaw !== "all" ? Number(negozioRaw) : null,
    dateFrom: fromRaw || null,
    dateTo: toRaw || null,
  };

  const [kpis, leadRows, negozioOptions] = await Promise.all([
    getDashboardKpis(filters),
    getLeadOpportunityRows(filters),
    getNegozioOptions(),
  ]);

  const leadConvertiti = leadRows.filter((row) => row.hasContract);
  const leadDaLavorare = leadRows.filter((row) => !row.hasContract);

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
                  Dettaglio clienti
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Clienti / Opportunità
                </h1>
                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Lead QR, clienti già convertiti e opportunità ancora da lavorare.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Record visibili: {leadRows.length}
              </div>
            </div>
          </div>
        </section>

        <Filters negozi={negozioOptions} filters={filters} />

        <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Lead QR</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{kpis.leadTotali}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Convertiti</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{leadConvertiti.length}</div>
          </div>

          <div className="rounded-3xl border border-orange-200 bg-orange-50 px-4 py-4 shadow-sm">
            <div className="text-sm text-orange-700">Da lavorare</div>
            <div className="mt-2 text-3xl font-black text-orange-700">{leadDaLavorare.length}</div>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-sm text-slate-500">Conversione</div>
            <div className="mt-2 text-3xl font-black text-slate-950">{kpis.conversionePct}%</div>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-950">Lead da lavorare</h2>
              <p className="mt-1 text-sm text-slate-600">
                Clienti registrati che non risultano ancora convertiti in contratto.
              </p>
            </div>
          </div>

          {leadDaLavorare.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-slate-500">
              Nessuna opportunità aperta con i filtri selezionati.
            </div>
          ) : (
            leadDaLavorare.slice(0, 20).map((row) => (
              <article
                key={row.id}
                className="rounded-3xl border border-orange-200 bg-white px-5 py-5 shadow-sm"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="text-lg font-black text-slate-950">
                      {[row.nome, row.cognome].filter(Boolean).join(" ") || "Cliente non indicato"}
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {row.negozioNome} · Lead registrato il {formatDate(row.createdAt)}
                    </div>
                  </div>

                  <div className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-sm font-bold text-orange-700">
                    Opportunità
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Telefono</div>
                    <div className="mt-1 font-semibold text-slate-950">{row.telefono || "—"}</div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Email</div>
                    <div className="mt-1 font-semibold text-slate-950">{row.email || "—"}</div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Codice fiscale</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {row.codiceFiscale || "—"}
                    </div>
                  </div>
                </div>
              </article>
            ))
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-950">Clienti convertiti</h2>
              <p className="mt-1 text-sm text-slate-600">
                Lead che risultano già collegati ad almeno un contratto.
              </p>
            </div>
          </div>

          {leadConvertiti.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-5 py-8 text-center text-slate-500">
              Nessun cliente convertito con i filtri selezionati.
            </div>
          ) : (
            leadConvertiti.slice(0, 20).map((row) => (
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
                      {row.negozioNome} · Lead registrato il {formatDate(row.createdAt)}
                    </div>
                  </div>

                  <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-bold text-emerald-700">
                    Convertito
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Contratti</div>
                    <div className="mt-1 font-semibold text-slate-950">{row.contractCount}</div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Ultima stipula</div>
                    <div className="mt-1 font-semibold text-slate-950">
                      {formatDate(row.lastContractDate)}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Telefono</div>
                    <div className="mt-1 font-semibold text-slate-950">{row.telefono || "—"}</div>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-3 py-3">
                    <div className="text-slate-500">Email</div>
                    <div className="mt-1 font-semibold text-slate-950">{row.email || "—"}</div>
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
