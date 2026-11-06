import FeedbackLinkButton from "@/components/phonesia/dashboard/FeedbackLinkButton";
import { parseDatabaseTime } from "@/lib/phonesia/rome-time";
import { isServizioAttivo, isServizioDaVerificare } from "@/lib/phonesia/service-state";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import ClienteAgentDecisionPanel from "@/components/phonesia/dashboard/ClienteAgentDecisionPanel";
import ClienteOpportunityPanel from "@/components/phonesia/dashboard/ClienteOpportunityPanel";
import ClienteAgentInsight from "@/components/phonesia/dashboard/ClienteAgentInsight";

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

type ParamsInput = Promise<{ id: string }>;

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

type AgentConversationRow = {
  id: number | string;
  created_at: string | null;
  messaggio_utente: string | null;
  intent: string | null;
  handoff_richiesto: boolean | null;
  risposta_agente: string | null;
  metadata: Record<string, unknown> | null;
};

type AgentConversationView = {
  id: number | string;
  createdAt: string | null;
  message: string;
  intent: string;
  handoffRequired: boolean;
  operationalStatus: string;
  action: string;
  priority: string;
  score: number;
  scoreReasons: string[];
  previousIntent: string | null;
  previousMessage: string | null;
};

type ActivityImportRow = {
  id: number;
  data_vendita: string | null;
  data: string | null;
  negozio_label: string | null;
  documento: string | null;
  numero: string | null;
  descrizione: string | null;
  codice: string | null;
  totale: number | string | null;
  pag_1: string | null;
  pag_2: string | null;
  numero_tel: string | null;
  operatore: string | null;
  scontrino: string | null;
  fattura: string | null;
};

type ActivityCustomerLinkRow = {
  id: number;
  activity_row_id: number;
  batch_id: number;
  cliente_id: number;
  match_method: string | null;
  confidence: number | string | null;
  activity_phone: string | null;
  crm_phone: string | null;
  created_at: string | null;
  phonesia_activity_import_rows: ActivityImportRow | ActivityImportRow[] | null;
};

type StoreActivityView = {
  linkId: number;
  activityRowId: number;
  batchId: number;
  activityDate: string | null;
  negozioLabel: string;
  documento: string;
  numero: string;
  descrizione: string;
  codice: string;
  totale: number | null;
  pag1: string;
  pag2: string;
  numeroTel: string;
  operatore: string;
  scontrino: string;
  fattura: string;
  matchMethod: string;
  confidence: number | null;
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
  const date = parseDatabaseTime(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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

function formatCurrency(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

function parseNumeric(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.replace(",", "."));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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

function CellFlag({ active, pending, alreadySent }: { active: boolean; pending?: boolean; alreadySent?: boolean }) {
  if (!active && pending) return <span title="Contratto presente; stato del servizio da verificare" className="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-amber-300 bg-amber-50 font-bold text-amber-800">?</span>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.min(100, Math.round(parsed)));
    }
  }

  return 0;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function getAgentConversationView(row: AgentConversationRow): AgentConversationView {
  const metadata = row.metadata ?? {};
  const operationalRaw = metadata.agent_operational;
  const operational = isRecord(operationalRaw) ? operationalRaw : {};
  const memoryRaw = metadata.conversation_memory;
  const memory = isRecord(memoryRaw) ? memoryRaw : {};

  return {
    id: row.id,
    createdAt: row.created_at,
    message: normalizeText(row.messaggio_utente),
    intent: normalizeText(row.intent) || "altro",
    handoffRequired: row.handoff_richiesto === true,
    operationalStatus: readString(operational.stato_operativo) || "informativo",
    action: readString(operational.azione_richiesta) || "nessuna_azione",
    priority: readString(operational.priorita) || "normale",
    score: readNumber(operational.opportunity_score),
    scoreReasons: readStringArray(operational.opportunity_score_reason),
    previousIntent: readNullableString(memory.previous_intent),
    previousMessage: readNullableString(memory.previous_message),
  };
}

function actionLabel(action: string): string {
  const labels: Record<string, string> = {
    nessuna_azione: "Nessuna azione",
    verificare_offerta_smartphone: "Verificare offerta smartphone",
    verificare_offerta_energia_con_bolletta: "Verificare energia con bolletta",
    verificare_copertura_fibra: "Verificare copertura fibra",
    gestire_assistenza_cliente: "Gestire assistenza cliente",
    richiamare_cliente: "Richiamare cliente",
    verificare_offerta_adatta: "Verificare offerta adatta",
    verificare_richiesta_cliente: "Verificare richiesta cliente",
  };

  return labels[action] ?? action.replaceAll("_", " ");
}

function intentLabel(intent: string): string {
  const labels: Record<string, string> = {
    smartphone: "Smartphone",
    fibra: "Fibra",
    energia: "Energia",
    assistenza: "Assistenza",
    ricontatto: "Ricontatto",
    offerte_generiche: "Offerte",
    saluto: "Saluto",
    altro: "Altro",
  };

  return labels[intent] ?? intent;
}

function statusClass(status: string): string {
  if (status === "da_gestire") return "border-amber-200 bg-amber-50 text-amber-700";
  if (status === "in_lavorazione") return "border-blue-200 bg-blue-50 text-blue-700";
  if (status === "ricontattato") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "chiusa") return "border-slate-300 bg-slate-100 text-slate-700";
  if (status === "non_interessato") return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreClass(score: number): string {
  if (score >= 75) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 50) return "border-orange-200 bg-orange-50 text-orange-700";
  if (score >= 25) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function truncateText(value: string, maxLength: number): string {
  const normalized = normalizeText(value);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildDistinctOpportunityBadges(rows: SentOpportunityView[]): string[] {
  const labels = rows.map((row) => {
    const label = normalizeText(row.opportunityLabel);
    const code = normalizeText(row.opportunityCode).toUpperCase();
    return label || code;
  });

  return [...new Set(labels.filter(Boolean))];
}

function getStoreActivityView(row: ActivityCustomerLinkRow): StoreActivityView | null {
  const activity = Array.isArray(row.phonesia_activity_import_rows)
    ? row.phonesia_activity_import_rows[0]
    : row.phonesia_activity_import_rows;
  if (!activity) return null;

  return {
    linkId: row.id,
    activityRowId: row.activity_row_id,
    batchId: row.batch_id,
    activityDate: activity.data_vendita ?? activity.data,
    negozioLabel: normalizeText(activity.negozio_label) || "—",
    documento: normalizeText(activity.documento) || "—",
    numero: normalizeText(activity.numero) || "—",
    descrizione: normalizeText(activity.descrizione) || "—",
    codice: normalizeText(activity.codice) || "—",
    totale: parseNumeric(activity.totale),
    pag1: normalizeText(activity.pag_1) || "—",
    pag2: normalizeText(activity.pag_2) || "—",
    numeroTel: normalizeText(activity.numero_tel) || "—",
    operatore: normalizeText(activity.operatore) || "—",
    scontrino: normalizeText(activity.scontrino) || "—",
    fattura: normalizeText(activity.fattura) || "—",
    matchMethod: normalizeText(row.match_method) || "—",
    confidence: parseNumeric(row.confidence),
  };
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
    { data: agentConversationsData, error: agentConversationsError },
    { data: activityLinksData, error: activityLinksError },
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
      .from("phonesia_servizi_cliente_coerenti")
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
    supabase
      .from("phonesia_conversazioni")
      .select(
        "id, created_at, messaggio_utente, intent, handoff_richiesto, risposta_agente, metadata",
      )
      .eq("cliente_id", clienteId)
      .eq("canale", "whatsapp")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("phonesia_activity_customer_links")
      .select(
        "id, activity_row_id, batch_id, cliente_id, match_method, confidence, activity_phone, crm_phone, created_at, phonesia_activity_import_rows!inner(id, data_vendita, data, negozio_label, documento, numero, descrizione, codice, totale, pag_1, pag_2, numero_tel, operatore, scontrino, fattura)",
      )
      .eq("cliente_id", clienteId),
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
  if (agentConversationsError) {
    throw new Error(
      `Errore lettura conversazioni agent: ${agentConversationsError.message}`,
    );
  }
  if (activityLinksError) {
    throw new Error(`Errore lettura attività negozio: ${activityLinksError.message}`);
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

  const agentConversations = ((agentConversationsData ?? []) as AgentConversationRow[])
    .map(getAgentConversationView)
    .filter((row) => row.message || row.intent !== "altro");
  const storeActivities = ((activityLinksData ?? []) as ActivityCustomerLinkRow[])
    .map(getStoreActivityView)
    .filter((row): row is StoreActivityView => Boolean(row))
    .sort((a, b) => {
      const timeA = a.activityDate ? new Date(a.activityDate).getTime() : 0;
      const timeB = b.activityDate ? new Date(b.activityDate).getTime() : 0;
      return timeB - timeA || b.activityRowId - a.activityRowId;
    });
  const visibleStoreActivities = storeActivities.slice(0, 20);
  const storeActivityTotal = storeActivities.reduce((sum, row) => sum + (row.totale ?? 0), 0);
  const storeActivityStores = [
    ...new Set(storeActivities.map((row) => row.negozioLabel).filter((value) => value !== "—")),
  ];
  const lastStoreActivity = storeActivities[0]?.activityDate ?? null;

  const pendingFamilies = new Set<ServiceFamily>(((serviziData ?? []) as ServizioRow[]).filter(row => isServizioDaVerificare(row.service_status)).map(normalizeServiceFamily).filter((family): family is ServiceFamily => family !== null));
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
                <FeedbackLinkButton clienteId={cliente.id} />

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
            <h2 className="text-xl font-black text-slate-950">Servizi censiti</h2>
            <p className="mt-2 text-sm text-slate-600">✓ Attivo confermato · ? Contratto presente, stato da verificare · — Nessun servizio attivo censito.</p>
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
                      pending={pendingFamilies.has(service)}
                      alreadySent={sentOpportunityCodes.has(service)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="mb-3 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-blue-700">
                Conversazioni agent
              </div>

              <h2 className="text-xl font-black text-slate-950">
                Ultime richieste agent
              </h2>

              <p className="mt-1 text-sm text-slate-600">
                Le ultime richieste WhatsApp salvate dall’agent per questo cliente.
              </p>
            </div>

            <Link
              href={`/phonesia/dashboard/richieste?q=${encodeURIComponent(
                [cliente.nome, cliente.cognome].filter(Boolean).join(" ") ||
                  cliente.telefono ||
                  String(cliente.id),
              )}&vista=storico&stato=tutte`}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-2 text-center text-sm font-bold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              Vedi in dashboard richieste
            </Link>
          </div>

          {agentConversations.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
              Nessuna richiesta agent salvata per questo cliente.
            </div>
          ) : (
            <div className="space-y-3">
              {agentConversations.map((row) => (
                <div
                  key={row.id}
                  className="rounded-3xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-700">
                          {intentLabel(row.intent)}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-xs font-black",
                            statusClass(row.operationalStatus),
                          ].join(" ")}
                        >
                          {row.operationalStatus}
                        </span>
                        <span
                          className={[
                            "rounded-full border px-3 py-1 text-xs font-black",
                            scoreClass(row.score),
                          ].join(" ")}
                          title={row.scoreReasons.join(" · ")}
                        >
                          Score {row.score}/100
                        </span>
                      </div>

                      <div className="mt-3 text-sm font-bold text-slate-950">
                        {truncateText(row.message, 220)}
                      </div>

                      <div className="mt-2 text-xs font-semibold text-slate-500">
                        {formatDateTime(row.createdAt)} · {actionLabel(row.action)}
                      </div>

                      {row.previousMessage ? (
                        <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs leading-relaxed text-blue-800">
                          <div className="font-black uppercase tracking-[0.14em] text-blue-700">
                            Collegata a richiesta precedente
                          </div>
                          <div className="mt-2">
                            Tipo:{" "}
                            <strong>
                              {row.previousIntent
                                ? intentLabel(row.previousIntent)
                                : "—"}
                            </strong>
                          </div>
                          <div className="mt-1">
                            Prima richiesta: {truncateText(row.previousMessage, 180)}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    <div className="shrink-0 text-xs font-semibold text-slate-500">
                      ID #{row.id}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <div className="mb-4">
            <div className="mb-3 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-emerald-700">
              Attività negozio
            </div>

            <h2 className="text-xl font-black text-slate-950">
              Registro attività collegate
            </h2>

            <p className="mt-1 text-sm text-slate-600">
              Ultime attività importate e collegate al cliente tramite telefono.
            </p>
          </div>

          <div className="mb-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <InfoCard label="Attività collegate" value={String(storeActivities.length)} />
            <InfoCard label="Ultimo acquisto/attività" value={formatDateTime(lastStoreActivity)} />
            <InfoCard label="Totale importi" value={formatCurrency(storeActivityTotal)} />
            <InfoCard
              label="Negozi coinvolti"
              value={storeActivityStores.length > 0 ? storeActivityStores.join(", ") : "—"}
            />
          </div>

          {visibleStoreActivities.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
              Nessuna attività negozio collegata.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1100px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Negozio</th>
                    <th className="px-3 py-3">Documento</th>
                    <th className="px-3 py-3">Descrizione</th>
                    <th className="px-3 py-3">Codice</th>
                    <th className="px-3 py-3 text-right">Totale</th>
                    <th className="px-3 py-3">Pagamenti</th>
                    <th className="px-3 py-3">Telefono</th>
                    <th className="px-3 py-3">Operatore</th>
                    <th className="px-3 py-3">Doc. fiscali</th>
                    <th className="px-3 py-3">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleStoreActivities.map((row) => (
                    <tr key={row.linkId} className="align-top">
                      <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">
                        {formatDateTime(row.activityDate)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-700">
                        {row.negozioLabel}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        {row.documento} {row.numero}
                      </td>
                      <td className="max-w-[260px] px-3 py-3 font-semibold text-slate-950">
                        {row.descrizione}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                        {row.codice}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-950">
                        {formatCurrency(row.totale)}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        <div>{row.pag1}</div>
                        <div className="text-xs text-slate-400">{row.pag2}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                        {row.numeroTel}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{row.operatore}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                        <div>Scontrino: {row.scontrino}</div>
                        <div className="text-xs text-slate-400">Fattura: {row.fattura}</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
                          {row.matchMethod}
                          <div className="mt-1 text-emerald-600">
                            Confidenza {row.confidence ?? "—"}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

	<ClienteAgentDecisionPanel clienteId={cliente.id} />
        <ClienteAgentInsight
          clienteNome={[cliente.nome, cliente.cognome].filter(Boolean).join(" ") || "Cliente"}
          activeServices={[...activeFamilies]}
          pendingServices={[...pendingFamilies]}
          operatore={operatore}
          contactStoreLabel={contactStoreLabel}
          marketingConsented={marketingConsented}
          whatsappActive={cliente.whatsapp_active === true}
          contrattiCount={contratti.length}
          opportunitaInviateCount={opportunitaInviate.length}
          ultimaOpportunita={ultimaOpportunita}
        />

        <ClienteOpportunityPanel
          clienteId={cliente.id}
          clienteNome={[cliente.nome, cliente.cognome].filter(Boolean).join(" ") || "Cliente"}
          activeServices={[...activeFamilies]}
          pendingServices={[...pendingFamilies]}
          whatsappActive={cliente.whatsapp_active === true}
          marketingConsented={marketingConsented}
          contactStoreLabel={contactStoreLabel}
          sentOpportunities={opportunitaInviate}
        />
      </div>
    </main>
  );
}
