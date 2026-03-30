type Row = {
  negozioCodice: number | null;
  negozio: string;
  leadQr: number;
  leadConvertiti: number;
  contratti: number;
  conversionePct: number;
};

type Props = {
  rows: Row[];
};

function conversionBadgeClass(value: number): string {
  if (value >= 50) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (value > 0) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function ConversionTable({ rows }: Props) {
  const totalLeadQr = rows.reduce((sum, row) => sum + row.leadQr, 0);
  const totalLeadConvertiti = rows.reduce((sum, row) => sum + row.leadConvertiti, 0);
  const totalContratti = rows.reduce((sum, row) => sum + row.contratti, 0);
  const totalConversione = totalLeadQr
    ? Math.round((totalLeadConvertiti / totalLeadQr) * 10000) / 100
    : 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-5">
        <h3 className="text-2xl font-black tracking-tight text-slate-950">
          Conversione QR per negozio
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Lead QR, lead convertiti e contratti collegati ai clienti QR reali.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 border-b border-slate-200 bg-slate-50 px-6 py-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Lead QR
          </div>
          <div className="mt-1 text-2xl font-black text-slate-950">{totalLeadQr}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Lead convertiti
          </div>
          <div className="mt-1 text-2xl font-black text-slate-950">{totalLeadConvertiti}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Contratti collegati
          </div>
          <div className="mt-1 text-2xl font-black text-slate-950">{totalContratti}</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Conversione media
          </div>
          <div className="mt-1 text-2xl font-black text-slate-950">{totalConversione}%</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr className="bg-white text-left text-sm text-slate-500">
              <th className="border-b border-slate-200 px-4 py-4 font-semibold">Negozio</th>
              <th className="border-b border-slate-200 px-4 py-4 text-center font-semibold">
                Lead QR
              </th>
              <th className="border-b border-slate-200 px-4 py-4 text-center font-semibold">
                Lead convertiti
              </th>
              <th className="border-b border-slate-200 px-4 py-4 text-center font-semibold">
                Contratti collegati
              </th>
              <th className="border-b border-slate-200 px-4 py-4 text-center font-semibold">
                Conversione
              </th>
              <th className="border-b border-slate-200 px-4 py-4 font-semibold">
                Lettura operativa
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => {
              const lettura =
                row.leadQr === 0
                  ? "Nessun lead QR nel periodo"
                  : row.leadConvertiti === 0
                    ? "Lead presenti ma nessuna conversione"
                    : row.conversionePct >= 50
                      ? "Buona resa QR"
                      : "Conversione da migliorare";

              return (
                <tr key={row.negozioCodice ?? row.negozio} className="align-top">
                  <td className="border-b border-slate-100 px-4 py-4">
                    <div className="font-semibold text-slate-950">{row.negozio}</div>
                    {row.negozioCodice != null ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Codice negozio {row.negozioCodice}
                      </div>
                    ) : null}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-4 text-center text-sm font-semibold text-slate-900">
                    {row.leadQr}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-4 text-center text-sm font-semibold text-slate-900">
                    {row.leadConvertiti}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-4 text-center text-sm font-semibold text-slate-900">
                    {row.contratti}
                  </td>

                  <td className="border-b border-slate-100 px-4 py-4 text-center">
                    <span
                      className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${conversionBadgeClass(
                        row.conversionePct,
                      )}`}
                    >
                      {row.conversionePct}%
                    </span>
                  </td>

                  <td className="border-b border-slate-100 px-4 py-4 text-sm text-slate-700">
                    {lettura}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
