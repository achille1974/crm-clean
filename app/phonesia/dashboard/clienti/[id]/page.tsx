import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import ClienteOpportunityPanel from "@/components/phonesia/dashboard/ClienteOpportunityPanel";

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

type ParamsInput = Promise<{ id: string }> | { id: string };

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
  negozio_id: number | null;
  data_stipula: string | null;
  created_at: string | null;
};

type OpportunitaInviataRow = {
  id: number;
  opportunita_code: string | null;
  opportunita_label: string | null;
  send_mode: string | null;
  batch_id: string | null;
  messaggio: string | null;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  negozio_contatto: string | null;
  inviato_at: string | null;
};

type SentOpportunityView = {
  id: number;
  opportunityCode: string;
  opportunityLabel: string;
  sendMode: string;
  batchId: string;
  message: string;
  attachmentPublicUrl: string;
  attachmentFileName: string;
  negozioContatto: string;
  sentAt: string;
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

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

function isServizioAttivo(status?: string | null): boolean {
  const normalized = normalizeText(status).toUpperCase();
  if (!normalized) return true;
  return !["CESSATO", "DISATTIVO", "CHIUSO", "ANNULLATO"].includes(normalized);
}

function normalizeServiceFamily(row: ServizioRow): ServiceFamily | null {
  const family = normalizeText(row.service_family).toUpperCase();
  const code = normalizeText(row.service_code).toUpperCase();

  if (SERVICE_COLUMNS.includes(family as ServiceFamily)) return family as ServiceFamily;

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

function negozioLabel(negozioId?: number | null): string {
  if (!negozioId) return "Non assegnato";
  return NEGOZI[negozioId] ?? `Negozio ${negozioId}`;
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function resolveOperatore(servizi: ServizioRow[], contratti: ContrattoRow[]): string {
  const contrattoConOperatore = contratti.find((row) => normalizeText(row.operatore));
  if (contrattoConOperatore?.operatore) return contrattoConOperatore.operatore;

  const counts = new Map<string, number>();

  for (const servizio of servizi) {
    const label = normalizeText(servizio.brand_raw) || normalizeText(servizio.provider_cluster);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner?.[0] ?? "—";
}

function CellFlag({ active, alreadySent }: { active: boolean; alreadySent?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={[
          "mx-auto flex h-9 w-9 items-center justify-center rounded-full border text-sm font-bold",
          active
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-slate-200 bg-slate-50 text-slate-300",
        ].join(" ")}
      >
        {active ? "✓" : "—"}
      </div>

      {alreadySent ? (
        <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">
          Inviata
        </span>
      ) : (
        <span className="h-[18px]" />
      )}
    </div>
  );
}

function formatDistinctStoreLabels(values: Array<number | null | undefined>): string {
  const unique = [...new Set(values.filter((value): value is number => Boolean(value)))];
  if (unique.length === 0) return "Non assegnato";
  return unique.map((value) => negozioLabel(value)).join(", ");
}

function buildDistinctOpportunityBadges(rows: SentOpportunityView[]): string[] {
  const labels = rows.map((row) => {
    const label = normalizeText(row.opportunityLabel);
    const code = normalizeText(row.opportunityCode).toUpperCase();
    return label || code;
  });

  return [...new Set(labels.filter(Boolean))];
}

function InfoCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className={["mt-2 text-base font-bold text-slate-950", mono ? "font-mono text-sm" : ""].join(" ")}>
        {value}
      </div>
    </div>
  );
}

export default async function DashboardClienteOpportunitaPage({
  params,
}: {
  params: ParamsInput;
}) {
  const resolvedParams = await params;
  const clienteId = Number(resolvedParams.id);

  if (!Number.isFinite(clienteId)) {
    notFound();
  }

  const supabase = getSupabaseAdmin();

  const [
    { data: clienteData, error: clienteError },
    { data: serviziData, error: serviziError },
    { data: contrattiData, error: contrattiError },
    { data: marketingConsentData, error: marketingConsentError },
    { data: opportunitaData, error: opportunitaError },
  ] = await Promise.all([
    supabase
      .from("phonesia_clienti")
      .select(
        "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active, created_at",
      )
      .eq("id", clienteId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("phonesia_servizi_cliente")
      .select(
        "cliente_id, service_family, service_code, provider_cluster, brand_raw, service_status",
      )
      .eq("cliente_id", clienteId),
    supabase
      .from("phonesia_contratti")
      .select("cliente_id, operatore, negozio_id, data_stipula, created_at")
      .eq("cliente_id", clienteId)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("phonesia_consensi")
      .select("id")
      .eq("cliente_id", clienteId)
      .eq("tipo_evento", "marketing_accepted")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("phonesia_opportunita_inviate")
      .select(
        "id, opportunita_code, opportunita_label, send_mode, batch_id, messaggio, attachment_public_url, attachment_file_name, negozio_contatto, inviato_at",
      )
      .eq("cliente_id", clienteId)
      .order("inviato_at", { ascending: false }),
  ]);

  if (clienteError) throw new Error(`Errore lettura cliente: ${clienteError.message}`);
  if (serviziError) throw new Error(`Errore lettura servizi cliente: ${serviziError.message}`);
  if (contrattiError) throw new Error(`Errore lettura contratti cliente: ${contrattiError.message}`);
  if (marketingConsentError) {
    throw new Error(`Errore lettura consenso marketing: ${marketingConsentError.message}`);
  }
  if (opportunitaError) {
    throw new Error(`Errore lettura opportunità inviate: ${opportunitaError.message}`);
  }

  const cliente = clienteData as ClienteRow | null;
  if (!cliente) notFound();

  const servizi = ((serviziData ?? []) as ServizioRow[]).filter((row) =>
    isServizioAttivo(row.service_status),
  );
  const contratti = (contrattiData ?? []) as ContrattoRow[];
  const opportunitaInviate: SentOpportunityView[] = ((opportunitaData ?? []) as OpportunitaInviataRow[]).map((row) => ({
    id: row.id,
    opportunityCode: normalizeText(row.opportunita_code),
    opportunityLabel: normalizeText(row.opportunita_label),
    sendMode: normalizeText(row.send_mode),
    batchId: normalizeText(row.batch_id),
    message: normalizeText(row.messaggio),
    attachmentPublicUrl: normalizeText(row.attachment_public_url),
    attachmentFileName: normalizeText(row.attachment_file_name),
    negozioContatto: normalizeText(row.negozio_contatto),
    sentAt: normalizeText(row.inviato_at),
  }));

  const activeFamilies = new Set<ServiceFamily>();
  for (const servizio of servizi) {
    const family = normalizeServiceFamily(servizio);
    if (family) activeFamilies.add(family);
  }

  const sentOpportunityCodes = new Set<string>(
    opportunitaInviate
      .map((row) => normalizeText(row.opportunityCode).toUpperCase())
      .filter(Boolean),
  );

  const operatore = resolveOperatore(servizi, contratti);
  const ultimaStipula =
    contratti.find((row) => normalizeText(row.data_stipula))?.data_stipula ??
    contratti[0]?.created_at ??
    null;

  const negozioQr = negozioLabel(cliente.negozio_id);
  const negozioContratto = formatDistinctStoreLabels(contratti.map((row) => row.negozio_id));
  const contactStoreId =
    contratti.find((row) => row.negozio_id != null)?.negozio_id ??
    cliente.negozio_id ??
    1;
  const contactStoreLabel = negozioLabel(contactStoreId);
  const marketingConsented = Boolean(marketingConsentData);

  const ultimoInvio = opportunitaInviate[0]?.sentAt ?? null;
  const ultimaOpportunita =
    opportunitaInviate[0]?.opportunityLabel ||
    opportunitaInviate[0]?.opportunityCode ||
    "—";
  const distinctOpportunityBadges = buildDistinctOpportunityBadges(opportunitaInviate);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-4">
            <Link
              href="/phonesia/dashboard/clienti"
              className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              ← Torna alla lista clienti
            </Link>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Scheda opportunità
                </div>

                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  {[cliente.nome, cliente.cognome].filter(Boolean).join(" ") || "Cliente"}
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Anagrafica completa, servizi attivi e servizi che puoi proporre commercialmente al cliente.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Operatore principale: <strong className="text-slate-950">{operatore}</strong>
              </div>
            </div>

            {distinctOpportunityBadges.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {distinctOpportunityBadges.map((label) => (
                  <span
                    key={label}
                    className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700"
                  >
                    Già inviata: {label}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Telefono" value={cliente.telefono || "—"} />
          <InfoCard label="Email" value={cliente.email || "—"} />
          <InfoCard label="Codice fiscale" value={cliente.codice_fiscale || "—"} mono />
          <InfoCard label="Negozio QR" value={negozioQr} />
          <InfoCard label="Negozio contratto" value={negozioContratto} />
          <InfoCard label="Negozio messaggio" value={contactStoreLabel} />
          <InfoCard label="WhatsApp" value={cliente.whatsapp_active ? "Attivo" : "Non attivo"} />
          <InfoCard
            label="Consenso marketing"
            value={marketingConsented ? "Autorizzato" : "Non autorizzato"}
          />
          <InfoCard label="Ultima stipula" value={formatDate(ultimaStipula)} />
          <InfoCard label="Contratti collegati" value={String(contratti.length)} />
          <InfoCard label="Opportunità inviate" value={String(opportunitaInviate.length)} />
          <InfoCard label="Ultimo invio" value={formatDateTime(ultimoInvio)} />
          <InfoCard label="Ultima opportunità" value={ultimaOpportunita} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <div className="mb-4">
            <h2 className="text-xl font-black text-slate-950">Servizi attivi</h2>
            <p className="mt-1 text-sm text-slate-600">
              Questa griglia mostra i servizi già attivi per il cliente.
            </p>
          </div>

          <div className="overflow-x-auto">
            <div className="min-w-[900px]">
              <div className="sticky top-0 z-20 grid grid-cols-8 border-b border-slate-200 bg-slate-50 text-slate-600 shadow-[0_1px_0_0_rgb(226_232_240)]">
                {SERVICE_COLUMNS.map((service) => (
                  <div
                    key={service}
                    className="px-3 py-3 text-center text-sm font-semibold"
                  >
                    {service}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-8">
                {SERVICE_COLUMNS.map((service) => (
                  <div
                    key={service}
                    className="border-b border-slate-100 px-3 py-4 text-center"
                  >
                    <CellFlag
                      active={activeFamilies.has(service)}
                      alreadySent={sentOpportunityCodes.has(service)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <ClienteOpportunityPanel
          clienteId={cliente.id}
          clienteNome={[cliente.nome, cliente.cognome].filter(Boolean).join(" ") || "Cliente"}
          activeServices={[...activeFamilies]}
          whatsappActive={cliente.whatsapp_active === true}
          marketingConsented={marketingConsented}
          contactStoreLabel={contactStoreLabel}
          sentOpportunities={opportunitaInviate}
        />
      </div>
    </main>
  );
}
