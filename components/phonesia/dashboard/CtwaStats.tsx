import type { SupabaseClient } from "@supabase/supabase-js";
import { readAll } from "@/lib/phonesia/read-all";
import { countByStore, CTWA_SOURCE, CTWA_STORES } from "@/lib/phonesia/ctwa";

type ArrivoRow = { id: number; negozio_id: number | null; risposta: string; negozio_non_determinato: boolean };
type RegistrazioneRow = { id: number; negozio_id: number | null };

async function loadCtwaStats(supabase: SupabaseClient) {
  const [arrivi, registrazioni] = await Promise.all([
    readAll<ArrivoRow>(
      supabase.from("phonesia_ctwa_arrivi").select("id, negozio_id, risposta, negozio_non_determinato") as never,
      "arrivi da annuncio",
    ),
    readAll<RegistrazioneRow>(
      supabase.from("phonesia_clienti").select("id, negozio_id").eq("origine_registrazione", CTWA_SOURCE) as never,
      "registrazioni da annuncio",
    ),
  ]);
  return { arrivi: arrivi.data ?? [], registrazioni: registrazioni.data ?? [] };
}

/** "Arrivi da annuncio WhatsApp" e "Registrazioni da annuncio" per negozio (campagna CTWA). */
export default async function CtwaStats({ supabase }: { supabase: SupabaseClient }) {
  let data: Awaited<ReturnType<typeof loadCtwaStats>>;
  try {
    data = await loadCtwaStats(supabase);
  } catch {
    return (
      <section className="rounded-3xl border border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">
        Annunci WhatsApp: dati non disponibili (tabella arrivi non ancora attiva o lettura non riuscita).
      </section>
    );
  }

  const arrivi = countByStore(data.arrivi);
  const registrazioni = new Map(countByStore(data.registrazioni).map((row) => [row.negozioId, row.totale]));
  const risposte = (id: number) => data.arrivi.filter((row) => Number(row.negozio_id) === id
    && (row.risposta === "registrazione" || row.risposta === "gia_registrato")).length;
  const nonDeterminati = data.arrivi.filter((row) => row.negozio_non_determinato).length;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
      <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-700">Annunci clic su WhatsApp</div>
      <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">Arrivi e registrazioni da annuncio</h2>
      <p className="mt-1 text-sm text-slate-600">
        Arrivi = persone che hanno scritto su WhatsApp dall’annuncio. Registrazioni = moduli QR completati dal link
        inviato in risposta (src=ctwa).
        {nonDeterminati > 0 ? ` ${nonDeterminati} arrivi con negozio non determinato sono contati su ${CTWA_STORES[1]}.` : ""}
      </p>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {arrivi.map((row) => (
          <div key={row.negozioId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-lg font-black text-slate-950">{row.negozio}</div>
            <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-[11px] font-black uppercase text-slate-400">Arrivi da annuncio WhatsApp</div><div className="text-xl font-black">{row.totale}</div></div>
              <div><div className="text-[11px] font-black uppercase text-slate-400">Risposte inviate</div><div className="text-xl font-black">{risposte(row.negozioId)}</div></div>
              <div><div className="text-[11px] font-black uppercase text-slate-400">Registrazioni da annuncio</div><div className="text-xl font-black">{registrazioni.get(row.negozioId) ?? 0}</div></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
