import type { LeadRecente } from "@/lib/phonesia/dashboard";

type Props = {
  rows: LeadRecente[];
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

export default function LeadTable({ rows }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 text-lg font-semibold text-slate-900">Lead QR recenti</div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="pb-3 pr-4 font-medium">Data</th>
              <th className="pb-3 pr-4 font-medium">Cliente</th>
              <th className="pb-3 pr-4 font-medium">Telefono</th>
              <th className="pb-3 pr-4 font-medium">Email</th>
              <th className="pb-3 font-medium">Negozio</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td className="py-4 text-slate-500" colSpan={5}>
                  Nessun lead disponibile.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 whitespace-nowrap text-slate-600">{formatDate(row.createdAt)}</td>
                  <td className="py-3 pr-4 font-medium text-slate-800">
                    {row.nome} {row.cognome}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">{row.telefono || "-"}</td>
                  <td className="py-3 pr-4 text-slate-700">{row.email || "-"}</td>
                  <td className="py-3 text-slate-700">{row.negozioNome}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
