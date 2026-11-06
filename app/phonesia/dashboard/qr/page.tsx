import { formatRomeTime, romeDayStart, romeDate, shiftDate } from "@/lib/phonesia/rome-time";
import Link from "next/link";
import CtwaStats from "@/components/phonesia/dashboard/CtwaStats";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type ClienteQrRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  negozio_id: number | null;
  qr_id: string | null;
  whatsapp_active: boolean | null;
  created_at: string | null;
};

type ClienteQrStatsRow = Pick<
  ClienteQrRow,
  "id" | "negozio_id" | "qr_id" | "whatsapp_active" | "created_at"
>;

type StoreStats = {
  negozioId: number | null;
  negozioLabel: string;
  totale: number;
  oggi: number;
  ultimi7: number;
  ultimi30: number;
  whatsappAttivi: number;
  ultimoQr: string | null;
};

const QR_FETCH_PAGE_SIZE = 1000;
const RECENT_QR_ROWS_LIMIT = 100;

const NEGOZI: Record<number, string> = {
  1: "Floridia",
  2: "Augusta",
  3: "Siracusa",
  4: "Avola",
  5: "Tabacchino Floridia",
};

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

function negozioLabel(negozioId?: number | null): string {
  if (!negozioId) return "Senza negozio";
  return NEGOZI[negozioId] ?? `Negozio ${negozioId}`;
}

function fullName(row: ClienteQrRow): string {
  return [row.nome, row.cognome].filter(Boolean).join(" ").replace(/\s+/g, " ").trim() || "Cliente";
}

const formatDateTime = formatRomeTime;
function startOfToday() { return romeDayStart(); }
function daysAgo(days: number) { return romeDayStart(shiftDate(romeDate(), -days)); }

function isAfter(value: string | null, date: Date): boolean {
  if (!value) return false;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;

  return parsed >= date;
}

function hasCompiledQr(row: { qr_id: string | null }): boolean {
  return typeof row.qr_id === "string" && row.qr_id.trim().length > 0;
}

async function fetchAllQrStatsRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<ClienteQrStatsRow[]> {
  const rows: ClienteQrStatsRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select("id, negozio_id, qr_id, whatsapp_active, created_at")
      .not("qr_id", "is", null)
      .neq("qr_id", "")
      .order("created_at", { ascending: false }).order("id", { ascending: false })
      .range(from, from + QR_FETCH_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Errore lettura statistiche QR: ${error.message}`);
    }

    const page = (data ?? []) as ClienteQrStatsRow[];
    rows.push(...page.filter(hasCompiledQr));

    if (page.length < QR_FETCH_PAGE_SIZE) break;
    from += QR_FETCH_PAGE_SIZE;
  }

  return rows;
}

async function fetchRecentQrRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
): Promise<ClienteQrRow[]> {
  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telefono, email, negozio_id, qr_id, whatsapp_active, created_at")
    .not("qr_id", "is", null)
    .neq("qr_id", "")
    .order("created_at", { ascending: false }).order("id", { ascending: false })
    .limit(RECENT_QR_ROWS_LIMIT);

  if (error) {
    throw new Error(`Errore lettura registrazioni QR recenti: ${error.message}`);
  }

  return ((data ?? []) as ClienteQrRow[]).filter(hasCompiledQr);
}

function buildStoreStats(rows: ClienteQrStatsRow[]): StoreStats[] {
  const today = startOfToday();
  const last7 = daysAgo(7);
  const last30 = daysAgo(30);

  const stats = new Map<string, StoreStats>();

  for (const row of rows) {
    const key = String(row.negozio_id ?? "senza_negozio");
    const current =
      stats.get(key) ??
      {
        negozioId: row.negozio_id,
        negozioLabel: negozioLabel(row.negozio_id),
        totale: 0,
        oggi: 0,
        ultimi7: 0,
        ultimi30: 0,
        whatsappAttivi: 0,
        ultimoQr: null,
      };

    current.totale += 1;

    if (isAfter(row.created_at, today)) current.oggi += 1;
    if (isAfter(row.created_at, last7)) current.ultimi7 += 1;
    if (isAfter(row.created_at, last30)) current.ultimi30 += 1;
    if (row.whatsapp_active === true) current.whatsappAttivi += 1;

    if (
      row.created_at &&
      (!current.ultimoQr || new Date(row.created_at) > new Date(current.ultimoQr))
    ) {
      current.ultimoQr = row.created_at;
    }

    stats.set(key, current);
  }

  return Array.from(stats.values()).sort((a, b) => b.totale - a.totale);
}

export default async function DashboardQrPage() {
  const supabase = getSupabaseAdmin();

  const [statsRows, recentRows] = await Promise.all([
    fetchAllQrStatsRows(supabase),
    fetchRecentQrRows(supabase),
  ]);

  const today = startOfToday();
  const last7 = daysAgo(7);
  const last30 = daysAgo(30);

  const totale = statsRows.length;
  const oggi = statsRows.filter((row) => isAfter(row.created_at, today)).length;
  const ultimi7 = statsRows.filter((row) => isAfter(row.created_at, last7)).length;
  const ultimi30 = statsRows.filter((row) => isAfter(row.created_at, last30)).length;
  const whatsappAttivi = statsRows.filter((row) => row.whatsapp_active === true).length;
  const whatsappRate = totale > 0 ? Math.round((whatsappAttivi / totale) * 100) : 0;

  const storeStats = buildStoreStats(statsRows);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="mb-3 inline-flex rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-black uppercase tracking-[0.18em] text-orange-700">
            QR Code
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Registrazioni QR compilate
              </h1>
          <p className="mt-2 text-sm text-slate-500">Dati letti il {formatRomeTime(new Date().toISOString())} · Ora italiana. Ultima registrazione indica l’ultimo modulo ricevuto.</p>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                Conta i clienti che hanno scansionato il QR e completato il form,
                divisi per punto vendita.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/phonesia/dashboard"
                className="rounded-2xl border border-orange-300 bg-orange-50 px-5 py-3 text-center text-sm font-semibold text-orange-700 transition hover:border-orange-400 hover:bg-orange-100"
              >
                Dashboard
              </Link>

              <Link
                href="/phonesia/dashboard/clienti"
                className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
              >
                Clienti
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard label="QR compilati" value={totale} note="Totale registrazioni" />
          <StatCard label="Oggi" value={oggi} note="Form completati oggi" warning={oggi > 0} />
          <StatCard label="Ultimi 7 giorni" value={ultimi7} note="Registrazioni recenti" />
          <StatCard label="Ultimi 30 giorni" value={ultimi30} note="Trend mensile" />
          <StatCard
            label="WhatsApp attivi"
            value={`${whatsappAttivi}/${totale}`}
            note={`${whatsappRate}% dei QR compilati`}
            success={whatsappRate >= 80}
          />
        </section>

        <CtwaStats supabase={supabase} />

        <section className="grid gap-4 md:grid-cols-3">
          {storeStats.map((store) => (
            <div
              key={store.negozioId ?? "senza_negozio"}
              className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            >
              <div className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
                Negozio
              </div>

              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                {store.negozioLabel}
              </h2>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <MiniStat label="Totale" value={store.totale} />
                <MiniStat label="Oggi" value={store.oggi} />
                <MiniStat label="Ultimi 7g" value={store.ultimi7} />
                <MiniStat label="WhatsApp" value={`${store.whatsappAttivi}/${store.totale}`} />
              </div>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
                Ultima registrazione QR compilato:{" "}
                <span className="font-black text-slate-900">
                  {formatDateTime(store.ultimoQr)}
                </span>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 md:px-6">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              Ultimi clienti registrati da QR
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              Elenco degli ultimi form QR completati, con negozio di provenienza.
            </p>
          </div>

          {recentRows.length === 0 ? (
            <div className="p-8 text-sm font-semibold text-slate-500">
              Nessuna registrazione QR trovata.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[900px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-black">Data</th>
                    <th className="px-5 py-4 font-black">Cliente</th>
                    <th className="px-5 py-4 font-black">Telefono</th>
                    <th className="px-5 py-4 font-black">Negozio</th>
                    <th className="px-5 py-4 font-black">WhatsApp</th>
                    <th className="px-5 py-4 font-black">Scheda</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {recentRows.map((row) => (
                    <tr key={row.id} className="hover:bg-orange-50/30">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDateTime(row.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-black text-slate-950">
                          {fullName(row)}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          ID cliente #{row.id}
                        </div>
                      </td>

                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                        {row.telefono || "—"}
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {negozioLabel(row.negozio_id)}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            row.whatsapp_active
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : "border-amber-200 bg-amber-50 text-amber-700",
                          ].join(" ")}
                        >
                          {row.whatsapp_active ? "Attivo" : "Non attivo"}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/phonesia/dashboard/clienti/${row.id}`}
                          className="inline-flex rounded-2xl bg-orange-500 px-4 py-2 text-xs font-black text-white transition hover:bg-orange-600"
                        >
                          Apri
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
  success,
}: {
  label: string;
  value: number | string;
  note: string;
  warning?: boolean;
  success?: boolean;
}) {
  const cardClass = success
    ? "border-emerald-200 bg-emerald-50"
    : warning
      ? "border-amber-200 bg-amber-50"
      : "border-slate-200 bg-white";

  const valueClass = success
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

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}
