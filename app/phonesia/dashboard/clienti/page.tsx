import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const SERVICE_COLUMNS = [
  "MOBILE",
  "FISSO",
  "ENERGIA",
  "TV",
  "SMARTPHONE",
  "ACCESSORI",
  "SICUREZZA",
  "FOTOVOLTAICO",
] as const;

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
  created_at: string | null;
};

type ServizioRow = {
  cliente_id: number | null;
  service_family: string | null;
  service_code: string | null;
  provider_cluster: string | null;
  brand_raw: string | null;
  service_status: string | null;
};

type ContrattoRow = {
  cliente_id: number | null;
  operatore: string | null;
  data_stipula: string | null;
  created_at: string | null;
};

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

function getSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

function buildSearchBlob(cliente: ClienteRow): string {
  return [
    cliente.nome,
    cliente.cognome,
    cliente.telefono,
    cliente.email,
    cliente.codice_fiscale,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isServizioAttivo(status?: string | null): boolean {
  const normalized = normalizeText(status).toUpperCase();

  if (!normalized) return true;

  return !["CESSATO", "DISATTIVO", "CHIUSO", "ANNULLATO"].includes(normalized);
}

function normalizeServiceFamily(row: ServizioRow): ServiceFamily | null {
  const family = normalizeText(row.service_family).toUpperCase();
  const code = normalizeText(row.service_code).toUpperCase();

  if (SERVICE_COLUMNS.includes(family as ServiceFamily)) {
    return family as ServiceFamily;
  }

  if (code.includes("MOBILE")) return "MOBILE";
  if (code.includes("FISSO")) return "FISSO";
  if (code.includes("ENERGIA")) return "ENERGIA";
  if (code.includes("TV")) return "TV";
  if (code.includes("SMARTPHONE")) return "SMARTPHONE";
  if (code.includes("ACCESSORI")) return "ACCESSORI";
  if (code.includes("SICUREZZA")) return "SICUREZZA";
  if (code.includes("FOTOVOLTAICO")) return "FOTOVOLTAICO";

  return null;
}

function resolveOperatore(servizi: ServizioRow[], contratti: ContrattoRow[]): string {
  const contrattoConOperatore = contratti.find((row) => normalizeText(row.operatore));
  if (contrattoConOperatore?.operatore) {
    return contrattoConOperatore.operatore;
  }

  const counts = new Map<string, number>();

  for (const servizio of servizi) {
    const label =
      normalizeText(servizio.brand_raw) ||
      normalizeText(servizio.provider_cluster);

    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner?.[0] ?? "—";
}

function CellFlag({ active }: { active: boolean }) {
  return (
    <div
      className={[
        "mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-300",
      ].join(" ")}
    >
      {active ? "✓" : "—"}
    </div>
  );
}

export default async function DashboardClientiPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const q = getSingleValue(resolvedParams.q).trim();
  const negozio = getSingleValue(resolvedParams.negozio).trim();

  const supabase = getSupabaseAdmin();

  const { data: clientiData, error: clientiError } = await supabase
    .from("phonesia_clienti")
    .select(
      "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (clientiError) {
    throw new Error(`Errore lettura clienti: ${clientiError.message}`);
  }

  let clienti = (clientiData ?? []) as ClienteRow[];

  if (q) {
    const query = q.toLowerCase();
    clienti = clienti.filter((cliente) => buildSearchBlob(cliente).includes(query));
  }

  if (negozio) {
    clienti = clienti.filter((cliente) => String(cliente.negozio_id ?? "") === negozio);
  }

  const clienteIds = clienti.map((cliente) => cliente.id);

  const serviziByCliente = new Map<number, ServizioRow[]>();
  const contrattiByCliente = new Map<number, ContrattoRow[]>();

  if (clienteIds.length > 0) {
    const [{ data: serviziData, error: serviziError }, { data: contrattiData, error: contrattiError }] =
      await Promise.all([
        supabase
          .from("phonesia_servizi_cliente")
          .select(
            "cliente_id, service_family, service_code, provider_cluster, brand_raw, service_status",
          )
          .in("cliente_id", clienteIds),
        supabase
          .from("phonesia_contratti")
          .select("cliente_id, operatore, data_stipula, created_at")
          .in("cliente_id", clienteIds)
          .order("data_stipula", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

    if (serviziError) {
      throw new Error(`Errore lettura servizi cliente: ${serviziError.message}`);
    }

    if (contrattiError) {
      throw new Error(`Errore lettura contratti: ${contrattiError.message}`);
    }

    for (const row of (serviziData ?? []) as ServizioRow[]) {
      if (!row.cliente_id) continue;
      const list = serviziByCliente.get(row.cliente_id) ?? [];
      list.push(row);
      serviziByCliente.set(row.cliente_id, list);
    }

    for (const row of (contrattiData ?? []) as ContrattoRow[]) {
      if (!row.cliente_id) continue;
      const list = contrattiByCliente.get(row.cliente_id) ?? [];
      list.push(row);
      contrattiByCliente.set(row.cliente_id, list);
    }
  }

  const rows = clienti.map((cliente) => {
    const servizi = (serviziByCliente.get(cliente.id) ?? []).filter((row) =>
      isServizioAttivo(row.service_status),
    );
    const contratti = contrattiByCliente.get(cliente.id) ?? [];

    const activeFamilies = new Set<ServiceFamily>();

    for (const servizio of servizi) {
      const family = normalizeServiceFamily(servizio);
      if (family) {
        activeFamilies.add(family);
      }
    }

    return {
      cliente,
      operatore: resolveOperatore(servizi, contratti),
      activeFamilies,
    };
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-4">
            <Link
              href="/phonesia/dashboard"
              className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              ← Torna alla dashboard
            </Link>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Dashboard commerciale
                </div>

                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Clienti / Servizi / Opportunità
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Vista compatta con anagrafica essenziale, servizi attivi e accesso
                  rapido alla scheda opportunità del cliente.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Clienti visibili: {rows.length}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <form className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_220px_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Cerca cliente
              </label>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Nome, cognome, telefono, email o codice fiscale"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Negozio
              </label>
              <select
                name="negozio"
                defaultValue={negozio}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="">Tutti i negozi</option>
                {Object.entries(NEGOZI).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Applica filtri
              </button>

              <Link
                href="/phonesia/dashboard/clienti"
                className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </form>
        </section>

        <form
          action="/phonesia/dashboard/opportunita/invio"
          method="get"
          className="space-y-4"
        >
          <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">Selezione clienti</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Seleziona uno o più clienti e poi apri la pagina di composizione opportunità.
                </p>
              </div>

              <button
                type="submit"
                className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Crea invio opportunità
              </button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[70vh] overflow-auto rounded-3xl">
              <table className="min-w-[1580px] w-full text-sm">
                <thead className="text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Seleziona
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Nome
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Cognome
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Operatore
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Codice fiscale
                    </th>
                    {SERVICE_COLUMNS.map((service) => (
                      <th
                        key={service}
                        className="sticky top-0 z-20 bg-slate-50 px-3 py-3 text-center font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]"
                      >
                        {service}
                      </th>
                    ))}
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Opportunità
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6 + SERVICE_COLUMNS.length}
                        className="px-4 py-10 text-center text-sm text-slate-500"
                      >
                        Nessun cliente trovato con i filtri selezionati.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.cliente.id}
                        className="border-b border-slate-100 align-top transition hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            name="clienti"
                            value={row.cliente.id}
                            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                          />
                        </td>

                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {row.cliente.nome || "—"}
                        </td>

                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {row.cliente.cognome || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                            {row.operatore}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-mono text-xs text-slate-700">
                          {row.cliente.codice_fiscale || "—"}
                        </td>

                        {SERVICE_COLUMNS.map((service) => (
                          <td key={service} className="px-3 py-4 text-center">
                            <CellFlag active={row.activeFamilies.has(service)} />
                          </td>
                        ))}

                        <td className="px-4 py-4">
                          <Link
                            href={`/phonesia/dashboard/clienti/${row.cliente.id}`}
                            className="inline-flex rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
                          >
                            Opportunità
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}
