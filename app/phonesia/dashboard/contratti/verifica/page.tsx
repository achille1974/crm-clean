import Link from "next/link";
import { createPhonesiaAdminClient } from "@/lib/phonesia/admin-client";
import { checked } from "@/lib/phonesia/read-all";
import { formatRomeTime } from "@/lib/phonesia/rome-time";

export const dynamic = "force-dynamic";

export default async function VerifyContracts({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const mode = params.tipo === "classificazione" ? "classificazione" : "associazione";
  const rawPage = Number(params.page || 1);
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 100000) : 1;
  const db = createPhonesiaAdminClient();
  let query = db.from("phonesia_contratti").select("id,nome,cognome,operatore,categoria,tipo_contratto,cliente_id,created_at,numero_contratto,classification_notes", { count: "exact" });
  query = mode === "classificazione" ? query.is("service_family", null) : query.is("cliente_id", null);
  const { data, count } = await checked(query.order("created_at", { ascending: false }).order("id").range((page-1)*100, page*100-1), "contratti da verificare");
  const href = (next: number) => `/phonesia/dashboard/contratti/verifica?tipo=${mode}&page=${next}`;
  return <main className="mx-auto max-w-6xl space-y-5 p-6">
    <Link href="/phonesia/dashboard" className="text-orange-700 underline">Torna alla dashboard</Link>
    <h1 className="text-3xl font-bold">Contratti da verificare</h1>
    <p>Le associazioni automatiche usano solo identificativi esatti e univoci. I documenti con dati mancanti o discordanti restano qui per la verifica.</p>
    <nav className="flex gap-4"><Link className="underline" href="?tipo=associazione">Senza cliente</Link><Link className="underline" href="?tipo=classificazione">Da classificare</Link></nav>
    <p>{count ?? 0} contratti · Pagina {page} di {Math.max(1,Math.ceil((count ?? 0)/100))}</p>
    {(data ?? []).map(row => <article key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="font-bold">{[row.nome,row.cognome].filter(Boolean).join(" ") || "Intestatario non rilevato"}</h2>
      <p className="text-sm">{row.operatore || "Operatore non rilevato"} · {[row.categoria,row.tipo_contratto].filter(Boolean).join(" / ")} · Contratto {row.numero_contratto || "senza numero"}</p>
      <p className="mt-2 text-sm text-slate-600">Importato il {formatRomeTime(row.created_at)}. {row.classification_notes}</p>
      {row.cliente_id && <Link className="text-sm underline" href={`/phonesia/dashboard/clienti/${row.cliente_id}`}>Apri cliente</Link>}
    </article>)}
    <nav className="flex gap-5" aria-label="Pagine contratti">{page>1 && <Link href={href(page-1)}>← Precedente</Link>}{page*100<(count??0) && <Link href={href(page+1)}>Successiva →</Link>}</nav>
  </main>;
}
