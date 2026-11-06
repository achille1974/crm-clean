import Link from "next/link";

import { createPhonesiaAdminClient } from "@/lib/phonesia/admin-client";
import { formatRomeTime } from "@/lib/phonesia/rome-time";

export const dynamic = "force-dynamic";

type OperazioneRow = {
  id: number;
  cliente_id: number | null;
  telefono_riferimento: string | null;
  origine: string | null;
  descrizione: string | null;
  data_operazione: string | null;
};

type ClienteRow = { id: number; nome: string | null; cognome: string | null; negozio_id: number | null; whatsapp_active: boolean | null };

const NEGOZI: Record<number, string> = { 1: "Floridia", 2: "Augusta", 3: "Siracusa", 4: "Avola", 5: "Tabacchino Floridia" };
const MOTIVI: Record<string, string> = {
  whatsapp_optout: "Consenso marketing revocato",
  whatsapp_sospeso: "Numero non raggiungibile",
};

export default async function EsclusiPage() {
  const supabase = createPhonesiaAdminClient();
  const { data: ops, error } = await supabase
    .from("phonesia_operazioni")
    .select("id,cliente_id,telefono_riferimento,origine,descrizione,data_operazione")
    .in("origine", Object.keys(MOTIVI))
    .order("data_operazione", { ascending: false })
    .limit(1000);

  const rows = (ops ?? []) as OperazioneRow[];
  const clienteIds = [...new Set(rows.map((r) => r.cliente_id).filter((v): v is number => v != null))];
  const { data: clienti } = clienteIds.length
    ? await supabase.from("phonesia_clienti").select("id,nome,cognome,negozio_id,whatsapp_active").in("id", clienteIds)
    : { data: [] as ClienteRow[] };
  const byId = new Map(((clienti ?? []) as ClienteRow[]).map((c) => [c.id, c]));

  const latest = new Map<number, OperazioneRow>();
  for (const r of rows) if (r.cliente_id != null && !latest.has(r.cliente_id)) latest.set(r.cliente_id, r);
  const list = [...latest.values()];
  const optout = list.filter((r) => r.origine === "whatsapp_optout").length;

  return (
    <main className="mx-auto max-w-6xl px-4 py-6 md:px-8">
      <Link href="/phonesia/dashboard" className="text-sm font-bold text-orange-600">← Dashboard</Link>
      <h1 className="mt-2 text-2xl font-black text-slate-950">Esclusi dagli invii WhatsApp</h1>
      <p className="mt-1 text-sm text-slate-600">
        Il CRM li esclude da solo: revoca dopo STOP o blocco Meta (errore 131050); sospensione dopo due
        mancate consegne consecutive (131026). Un cliente sospeso torna attivo se scrive OK; la revoca
        del consenso resta finché non si registra di nuovo dal QR.
      </p>
      {error ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">Errore lettura: {error.message}</p> : null}
      <div className="mt-4 grid grid-cols-2 gap-3 md:max-w-md">
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-2xl font-black">{optout}</div><div className="text-xs text-slate-500">consenso revocato</div></div>
        <div className="rounded-2xl bg-white p-4 shadow-sm"><div className="text-2xl font-black">{list.length - optout}</div><div className="text-xs text-slate-500">numeri sospesi</div></div>
      </div>
      <div className="mt-6 overflow-x-auto rounded-2xl bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
            <tr><th className="px-3 py-2">Cliente</th><th className="px-3 py-2">Negozio</th><th className="px-3 py-2">Motivo</th><th className="px-3 py-2">Quando</th><th className="px-3 py-2">WhatsApp oggi</th></tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-500">Nessun cliente escluso finora.</td></tr>
            ) : list.map((r) => {
              const c = r.cliente_id != null ? byId.get(r.cliente_id) : undefined;
              return (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-3 py-2">
                    {c ? <Link className="font-bold text-slate-900 hover:underline" href={`/phonesia/dashboard/clienti/${c.id}`}>{[c.nome, c.cognome].filter(Boolean).join(" ") || `#${c.id}`}</Link> : `#${r.cliente_id}`}
                  </td>
                  <td className="px-3 py-2">{c?.negozio_id != null ? NEGOZI[c.negozio_id] ?? c.negozio_id : "—"}</td>
                  <td className="px-3 py-2">{MOTIVI[r.origine ?? ""] ?? r.origine}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatRomeTime(r.data_operazione)}</td>
                  <td className="px-3 py-2">{c?.whatsapp_active ? "attivo" : "disattivato"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
