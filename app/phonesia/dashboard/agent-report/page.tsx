import { parseDatabaseTime } from "@/lib/phonesia/rome-time";
import { readAll } from "@/lib/phonesia/read-all";
import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type AgentTaskRow = {
  id: number;
  cliente_id: number | null;
  negozio_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  intent: string | null;
  status: string | null;
  priority: string | null;
  score: number | null;
  sla_due_at: string | null;
  next_best_action_label: string | null;
  created_at: string | null;
};

type StoreReport = {
  negozio: string;
  totale: number;
  daGestire: number;
  inLavorazione: number;
  ricontattati: number;
  chiuse: number;
  annullate: number;
  inRitardo: number;
  altaPriorita: number;
  scoreSomma: number;
  scoreMedio: number;
};

const NEGOZI = [
  "PHONESIA Floridia",
  "PHONESIA Augusta",
  "PHONESIA Siracusa",
  "PHONESIA Avola",
  "PHONESIA Floridia / Tabacchino Floridia",
];

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function runtimeSlaStatus(task: AgentTaskRow): string {
  if (["ricontattato", "chiusa", "non_interessato", "annullata"].includes(task.status || "")) {
    return "completata";
  }

  if (!task.sla_due_at) return "nessuna";

  const due = new Date(task.sla_due_at).getTime();
  if (!Number.isFinite(due)) return "nessuna";

  const diff = due - Date.now();
  if (diff < 0) return "in_ritardo";
  if (diff <= 2 * 60 * 60 * 1000) return "in_scadenza";

  return "in_tempo";
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = parseDatabaseTime(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function intentLabel(intent?: string | null): string {
  const labels: Record<string, string> = {
    smartphone: "Smartphone",
    energia: "Energia",
    fibra: "Fibra",
    assistenza: "Assistenza",
    ricontatto: "Ricontatto",
    offerte_generiche: "Offerte",
    altro: "Altro",
    saluto: "Saluto",
  };

  return labels[intent || ""] || intent || "Altro";
}

function statusLabel(status?: string | null): string {
  const labels: Record<string, string> = {
    da_gestire: "Da gestire",
    in_lavorazione: "In lavorazione",
    ricontattato: "Ricontattato",
    chiusa: "Chiusa",
    non_interessato: "Non interessato",
    annullata: "Annullata",
    informativo: "Informativo",
  };

  return labels[status || ""] || status || "—";
}

function statusClass(status?: string | null): string {
  if (status === "da_gestire") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "in_lavorazione") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "ricontattato") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "annullata") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "chiusa") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "non_interessato") return "border-red-200 bg-red-50 text-red-700";

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function slaLabel(status: string): string {
  if (status === "in_ritardo") return "In ritardo";
  if (status === "in_scadenza") return "In scadenza";
  if (status === "in_tempo") return "In tempo";
  if (status === "completata") return "Completata";
  return "Nessuna SLA";
}

function slaClass(status: string): string {
  if (status === "in_ritardo") return "border-red-200 bg-red-50 text-red-700";
  if (status === "in_scadenza") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "in_tempo") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function buildStoreReport(rows: AgentTaskRow[]): StoreReport[] {
  const map = new Map<string, StoreReport>();

  for (const negozio of NEGOZI) {
    map.set(negozio, {
      negozio,
      totale: 0,
      daGestire: 0,
      inLavorazione: 0,
      ricontattati: 0,
      chiuse: 0,
      annullate: 0,
      inRitardo: 0,
      altaPriorita: 0,
      scoreSomma: 0,
      scoreMedio: 0,
    });
  }

  for (const row of rows) {
    const key = row.negozio_label || "Senza negozio";
    const current =
      map.get(key) ||
      {
        negozio: key,
        totale: 0,
        daGestire: 0,
        inLavorazione: 0,
        ricontattati: 0,
        chiuse: 0,
        annullate: 0,
        inRitardo: 0,
        altaPriorita: 0,
        scoreSomma: 0,
        scoreMedio: 0,
      };

    current.totale += 1;
    current.scoreSomma += Number(row.score) || 0;

    if (row.status === "da_gestire") current.daGestire += 1;
    if (row.status === "in_lavorazione") current.inLavorazione += 1;
    if (row.status === "ricontattato") current.ricontattati += 1;
    if (["chiusa", "non_interessato"].includes(row.status || "")) current.chiuse += 1;
    if (row.status === "annullata") current.annullate += 1;
    if (row.priority === "alta") current.altaPriorita += 1;
    if (runtimeSlaStatus(row) === "in_ritardo") current.inRitardo += 1;

    map.set(key, current);
  }

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      scoreMedio: row.totale ? Math.round(row.scoreSomma / row.totale) : 0,
    }))
    .sort((a, b) => b.totale - a.totale);
}

function buildIntentReport(rows: AgentTaskRow[]) {
  const map = new Map<string, number>();

  for (const row of rows) {
    const key = row.intent || "altro";
    map.set(key, (map.get(key) || 0) + 1);
  }

  return Array.from(map.entries())
    .map(([intent, totale]) => ({ intent, totale }))
    .sort((a, b) => b.totale - a.totale);
}

export default async function AgentReportPage() {
  const supabase = getSupabaseAdmin();

  const { data, error } = await readAll(supabase
    .from("phonesia_agent_tasks")
    .select(
      "id, cliente_id, negozio_label, customer_name, customer_phone, intent, status, priority, score, sla_due_at, next_best_action_label, created_at",
    )
    .order("created_at", { ascending: false }), "report agent");

  if (error) {
    throw new Error(`Errore lettura report agent: ${error.message}`);
  }

  const rows = (data || []) as AgentTaskRow[];

  const totale = rows.length;
  const daGestire = rows.filter((row) => row.status === "da_gestire").length;
  const inLavorazione = rows.filter((row) => row.status === "in_lavorazione").length;
  const ricontattati = rows.filter((row) => row.status === "ricontattato").length;
  const inRitardo = rows.filter((row) => runtimeSlaStatus(row) === "in_ritardo").length;
  const scoreMedio = rows.length
    ? Math.round(rows.reduce((sum, row) => sum + (Number(row.score) || 0), 0) / rows.length)
    : 0;

  const perNegozio = buildStoreReport(rows);
  const perIntent = buildIntentReport(rows);
  const ultime = rows.slice(0, 10);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            Agent report
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Report operativo agent
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                Controlla task generate dall’agent, stato di lavorazione, SLA,
                score medio e andamento per negozio.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/phonesia/dashboard/richieste"
                className="rounded-2xl bg-orange-500 px-5 py-3 text-center text-sm font-black text-white transition hover:bg-orange-600"
              >
                Richieste agent
              </Link>

              <Link
                href="/phonesia/dashboard"
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Dashboard
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Task totali" value={totale} note="Generate dall’agent" />
          <StatCard label="Da gestire" value={daGestire} note="Aperte" warning={daGestire > 0} />
          <StatCard label="In lavorazione" value={inLavorazione} note="Prese in carico" />
          <StatCard label="Ricontattati" value={ricontattati} note="Clienti richiamati" success={ricontattati > 0} />
          <StatCard label="In ritardo" value={inRitardo} note="SLA superata" danger={inRitardo > 0} />
          <StatCard label="Score medio" value={`${scoreMedio}/100`} note="Potenziale medio" />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                Performance per negozio
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Include anche negozi con zero task, così è chiaro chi non ha ancora richieste.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-black">Negozio</th>
                    <th className="px-5 py-4 font-black">Totale</th>
                    <th className="px-5 py-4 font-black">Da gestire</th>
                    <th className="px-5 py-4 font-black">Lavorazione</th>
                    <th className="px-5 py-4 font-black">Ritardo</th>
                    <th className="px-5 py-4 font-black">Score medio</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {perNegozio.map((row) => (
                    <tr key={row.negozio} className="hover:bg-orange-50/30">
                      <td className="px-5 py-4 font-black text-slate-950">{row.negozio}</td>
                      <td className="px-5 py-4">{row.totale}</td>
                      <td className="px-5 py-4">{row.daGestire}</td>
                      <td className="px-5 py-4">{row.inLavorazione}</td>
                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            row.inRitardo > 0
                              ? "border-red-200 bg-red-50 text-red-700"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700",
                          ].join(" ")}
                        >
                          {row.inRitardo}
                        </span>
                      </td>
                      <td className="px-5 py-4 font-black">{row.scoreMedio}/100</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              Task per tipo richiesta
            </h2>

            <div className="mt-4 space-y-3">
              {perIntent.length === 0 ? (
                <p className="text-sm font-semibold text-slate-500">Nessun dato disponibile.</p>
              ) : (
                perIntent.map((row) => (
                  <div
                    key={row.intent}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"
                  >
                    <span className="text-sm font-black text-slate-700">
                      {intentLabel(row.intent)}
                    </span>
                    <span className="rounded-full bg-slate-950 px-3 py-1 text-xs font-black text-white">
                      {row.totale}
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              Ultime task agent
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1100px] w-full border-collapse text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-black">Data</th>
                  <th className="px-5 py-4 font-black">Cliente</th>
                  <th className="px-5 py-4 font-black">Negozio</th>
                  <th className="px-5 py-4 font-black">Intent</th>
                  <th className="px-5 py-4 font-black">Azione</th>
                  <th className="px-5 py-4 font-black">Stato</th>
                  <th className="px-5 py-4 font-black">SLA</th>
                  <th className="px-5 py-4 font-black">Scheda</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {ultime.map((row) => {
                  const sla = runtimeSlaStatus(row);

                  return (
                    <tr key={row.id} className="align-top hover:bg-orange-50/30">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDateTime(row.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-black text-slate-950">
                          {row.customer_name || "Cliente"}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {row.customer_phone || "—"}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {row.negozio_label || "Senza negozio"}
                      </td>

                      <td className="px-5 py-4">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
                          {intentLabel(row.intent)}
                        </span>
                      </td>

                      <td className="max-w-xs px-5 py-4 font-semibold text-slate-700">
                        {row.next_best_action_label || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-xs font-black",
                            statusClass(row.status),
                          ].join(" ")}
                        >
                          {statusLabel(row.status)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-xs font-black",
                            slaClass(sla),
                          ].join(" ")}
                        >
                          {slaLabel(sla)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        {row.cliente_id ? (
                          <Link
                            href={`/phonesia/dashboard/clienti/${row.cliente_id}`}
                            className="inline-flex rounded-2xl bg-orange-500 px-4 py-2 text-xs font-black text-white transition hover:bg-orange-600"
                          >
                            Apri
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  note,
  warning,
  danger,
  success,
}: {
  label: string;
  value: number | string;
  note: string;
  warning?: boolean;
  danger?: boolean;
  success?: boolean;
}) {
  const cardClass = danger
    ? "border-red-200 bg-red-50"
    : success
      ? "border-emerald-200 bg-emerald-50"
      : warning
        ? "border-amber-200 bg-amber-50"
        : "border-slate-200 bg-white";

  const valueClass = danger
    ? "text-red-700"
    : success
      ? "text-emerald-700"
      : warning
        ? "text-amber-700"
        : "text-slate-950";

  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${cardClass}`}>
      <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
        {label}
      </div>
      <div className={`mt-3 text-4xl font-black tracking-tight ${valueClass}`}>
        {value}
      </div>
      <div className="mt-2 text-sm font-semibold text-slate-500">{note}</div>
    </div>
  );
}

