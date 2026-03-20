import type { ContrattoRecente } from "@/lib/phonesia/dashboard";

type Props = {
  rows: ContrattoRecente[];
};

function formatDate(value: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function ContrattiTable({ rows }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 text-lg font-semibold text-slate-900">Contratti recenti</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-3 pr-4 font-medium">Data</th>
              <th className="pb-3 pr-4 font-medium">Cliente</th>
              <th className="pb-3 pr-4 font-medium">Operatore</th>
              <th className="pb-3 pr-4 font-medium">Categoria</th>
              <th className="pb-3 pr-4 font-medium">Numero</th>
              <th className="pb-3 pr-4 font-medium">Negozio</th>
              <th className="pb-3 font-medium">Origine</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-slate-500" colSpan={7}>
                  Nessun contratto disponibile.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100 align-top">
                  <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{formatDate(row.createdAt)}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium text-slate-800">
                      {row.nome} {row.cognome}
                    </div>
                    <div className="text-xs text-slate-500">{row.telefono || row.email || "-"}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{row.operatore || "-"}</td>
                  <td className="py-3 pr-4 text-slate-700">
                    {row.categoria || "-"}
                    {row.tipoContratto ? <div className="text-xs text-slate-500">{row.tipoContratto}</div> : null}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{row.numeroContratto || "-"}</td>
                  <td className="py-3 pr-4 text-slate-700">{row.negozioNome}</td>
                  <td className="py-3">
                    <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                      {row.origineCliente || "manuale / non collegato"}
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
