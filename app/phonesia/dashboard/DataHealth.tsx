import Link from "next/link";
import { createPhonesiaAdminClient } from "@/lib/phonesia/admin-client";
import { checked } from "@/lib/phonesia/read-all";
import { formatRomeTime, parseDatabaseTime } from "@/lib/phonesia/rome-time";

export default async function DataHealth() {
  const db = createPhonesiaAdminClient();
  const [clients, qr, contracts, services, activity, unlinked, unclassified] = await Promise.all([
    checked(db.from("phonesia_clienti").select("id", { count: "exact", head: true })),
    checked(db.from("phonesia_clienti").select("created_at").not("qr_id", "is", null).order("created_at", { ascending: false }).limit(1)),
    checked(db.from("phonesia_contratti").select("created_at", { count: "exact" }).order("created_at", { ascending: false }).limit(1)),
    checked(db.from("phonesia_servizi_cliente_coerenti").select("updated_at", { count: "exact" }).order("updated_at", { ascending: false }).limit(1)),
    checked(db.from("phonesia_activity_import_batches").select("created_at,import_status,imported_rows").order("created_at", { ascending: false }).limit(1)),
    checked(db.from("phonesia_contratti").select("id", { count: "exact", head: true }).is("cliente_id", null)),
    checked(db.from("phonesia_contratti").select("id", { count: "exact", head: true }).is("service_family", null)),
  ]);
  const importedAt = activity.data?.[0]?.created_at;
  const oldActivity = !importedAt || Date.now() - parseDatabaseTime(importedAt).getTime() > 8 * 86400000;
  const sources = [
    { name: "Clienti", value: `${clients.count ?? 0} anagrafiche`, date: qr.data?.[0]?.created_at, label: "Ultima registrazione QR" },
    { name: "Contratti", value: `${contracts.count ?? 0} documenti`, date: contracts.data?.[0]?.created_at, label: "Ultimo contratto importato" },
    { name: "Servizi", value: `${services.count ?? 0} servizi censiti`, date: services.data?.[0]?.updated_at, label: "Ultimo aggiornamento servizi" },
    { name: "Attività negozi", value: activity.data?.[0] ? `Ultimo file: ${activity.data[0].imported_rows ?? 0} righe · ${activity.data[0].import_status}` : "Nessun file importato", date: importedAt, label: "Ultima importazione Excel" },
  ];
  return <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
    <h2 className="text-xl font-bold">Stato dei dati</h2>
    <p className="mt-1 text-sm text-slate-600">Lettura eseguita il {formatRomeTime(new Date().toISOString())} · Ora italiana. Le date delle fonti cambiano quando arrivano nuovi dati.</p>
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{sources.map(source => <div key={source.name} className="rounded-2xl bg-slate-50 p-4">
      <h3 className="font-bold">{source.name}</h3><p className="mt-1 text-sm">{source.value}</p>
      <p className="mt-3 text-xs text-slate-500">{source.label}</p><p className="text-sm font-semibold">{formatRomeTime(source.date)}</p>
    </div>)}</div>
    <p className="mt-4 text-sm text-amber-900">{unlinked.count ?? 0} contratti da associare a un cliente; {unclassified.count ?? 0} da classificare. Le associazioni dubbie richiedono verifica. <Link className="underline" href="/phonesia/dashboard/contratti/verifica">Apri i contratti da verificare</Link>.</p>
    {oldActivity && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Attività negozi: non risultano importazioni recenti. Per aggiornare questa sezione serve un nuovo Excel nella cartella di importazione.</p>}
  </section>;
}
