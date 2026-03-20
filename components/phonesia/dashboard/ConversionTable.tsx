import type { ConversioneNegozioStat } from "@/lib/phonesia/dashboard";

type Props = {
  rows: ConversioneNegozioStat[];
};

function getBadgeClass(value: number) {
  if (value >= 70) {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  if (value >= 30) {
    return "bg-amber-50 text-amber-700 border border-amber-200";
  }
  return "bg-rose-50 text-rose-700 border border-rose-200";
}

export default function ConversionTable({ rows }: Props) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <div className="text-2xl font-bold tracking-tight text-slate-950">
          Conversione per negozio
        </div>
        <div className="mt-1 text-sm text-slate-500">
          Rapporto tra lead QR registrati e lead che hanno generato almeno un contratto.
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-4 pr-4 font-medium">Negozio</th>
              <th className="pb-4 pr-4 font-medium">Lead QR</th>
              <th className="pb-4 pr-4 font-medium">Lead convertiti</th>
              <th className="pb-4 pr-4 font-medium">Contratti</th>
              <th className="pb-4 font-medium">Conversione</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-6 text-slate-500" colSpan={5}>
                  Nessun dato disponibile.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={`${row.negozioCodice}-${row.negozio}`}
                  className="border-b border-slate-100 last:border-b-0"
                >
                  <td className="py-4 pr-4 font-semibold text-slate-800">{row.negozio}</td>
                  <td className="py-4 pr-4 text-slate-700">{row.leadQr}</td>
                  <td className="py-4 pr-4 text-slate-700">{row.leadConvertiti}</td>
                  <td className="py-4 pr-4 text-slate-700">{row.contratti}</td>
                  <td className="py-4">
                    <span
                      className={[
                        "inline-flex rounded-full px-3 py-1 text-xs font-semibold",
                        getBadgeClass(row.conversionePct),
                      ].join(" ")}
                    >
                      {row.conversionePct}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
