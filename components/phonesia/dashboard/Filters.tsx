import type { DashboardFilters, NegozioOption } from "@/lib/phonesia/dashboard";

type Props = {
  negozi: NegozioOption[];
  filters: DashboardFilters;
  resetHref?: string;
  exportAction?: string | null;
  exportLabel?: string;
  helperText?: string | null;
};

export default function Filters({
  negozi,
  filters,
  resetHref = "/phonesia/dashboard",
  exportAction = null,
  exportLabel = "Esporta Excel",
  helperText = null,
}: Props) {
  return (
    <form
      className="w-full overflow-hidden rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6"
      method="get"
    >
      <div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr_1fr_auto_auto_auto] xl:items-end">
        <div className="w-full">
          <label className="mb-2 block text-sm font-medium text-slate-600">
            Negozio
          </label>
          <select
            name="negozio"
            defaultValue={filters.negozioCodice?.toString() ?? ""}
            className="block h-[54px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-orange-500"
          >
            <option value="">Tutti i negozi</option>
            {negozi.map((negozio) => (
              <option key={negozio.codice} value={negozio.codice}>
                {negozio.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full">
          <label className="mb-2 block text-sm font-medium text-slate-600">
            Dal
          </label>
          <input
            name="from"
            type="date"
            defaultValue={filters.dateFrom ?? ""}
            className="block h-[54px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-orange-500"
          />
        </div>

        <div className="w-full">
          <label className="mb-2 block text-sm font-medium text-slate-600">
            Al
          </label>
          <input
            name="to"
            type="date"
            defaultValue={filters.dateTo ?? ""}
            className="block h-[54px] w-full rounded-2xl border border-slate-300 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-orange-500"
          />
        </div>

        <button
          type="submit"
          className="h-[54px] w-full rounded-2xl bg-orange-500 px-6 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600 xl:w-auto"
        >
          Applica filtri
        </button>

        {exportAction ? (
          <button
            type="submit"
            formAction={exportAction}
            formMethod="get"
            className="h-[54px] w-full rounded-2xl border border-emerald-200 bg-emerald-50 px-6 text-sm font-semibold text-emerald-700 transition hover:border-emerald-300 hover:bg-emerald-100 xl:w-auto"
          >
            {exportLabel}
          </button>
        ) : null}

        <a
          href={resetHref}
          className="inline-flex h-[54px] w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 xl:w-auto"
        >
          Reset
        </a>
      </div>

      {helperText ? (
        <p className="mt-4 text-sm text-slate-500">
          {helperText}
        </p>
      ) : null}
    </form>
  );
}
