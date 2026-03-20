import type { DashboardFilters, NegozioOption } from "@/lib/phonesia/dashboard";

type Props = {
  negozi: NegozioOption[];
  filters: DashboardFilters;
};

export default function Filters({ negozi, filters }: Props) {
  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
      method="get"
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr_1fr_auto_auto] xl:items-end">
        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">Negozio</label>
          <select
            name="negozio"
            defaultValue={filters.negozioCodice?.toString() ?? ""}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-orange-500"
          >
            <option value="">Tutti i negozi</option>
            {negozi.map((negozio) => (
              <option key={negozio.codice} value={negozio.codice}>
                {negozio.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">Dal</label>
          <input
            name="from"
            type="date"
            defaultValue={filters.dateFrom ?? ""}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-orange-500"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-slate-600">Al</label>
          <input
            name="to"
            type="date"
            defaultValue={filters.dateTo ?? ""}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-orange-500"
          />
        </div>

        <button
          type="submit"
          className="rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
        >
          Applica filtri
        </button>

        <a
          href="/phonesia/dashboard"
          className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
        >
          Reset
        </a>
      </div>
    </form>
  );
}
