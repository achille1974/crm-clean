import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import RichiestaStatusActions from "@/components/phonesia/dashboard/RichiestaStatusActions";

export const dynamic = "force-dynamic";

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type ConversationRow = {
  id: number | string;
  created_at: string | null;
  cliente_id: number | null;
  messaggio_utente: string | null;
  intent: string | null;
  handoff_richiesto: boolean | null;
  metadata: Record<string, unknown> | null;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
};

type OperationalSla = {
  due_at: string | null;
  level: string;
  status: string;
  reason: string | null;
};

type OperationalMetadata = {
  cliente_riconosciuto: boolean;
  negozio_id: number | null;
  negozio_label: string | null;
  motivo_handoff: string | null;
  azione_richiesta: string;
  priorita: string;
  stato_operativo: string;
  opportunity_score: number;
  opportunity_score_reason: string[];
  sla: OperationalSla | null;
};

type ConversationMemory = {
  is_follow_up: boolean;
  previous_intent: string | null;
  previous_message: string | null;
  previous_conversation_id: number | string | null;
  previous_created_at: string | null;
  confidence: string | null;
  reason: string | null;
};

type AgentNextBestAction = {
  code: string;
  label: string;
  reason: string;
};

type AgentDecision = {
  next_best_action: AgentNextBestAction;
  required_data: string[];
  questions_to_ask: string[];
  risk_flags: string[];
  operator_summary: string;
};

type RequestItem = {
  id: number | string;
  created_at: string | null;
  cliente_id: number;
  cliente_nome: string;
  telefono: string;
  messaggio_utente: string;
  intent: string;
  handoff_richiesto: boolean;
  handoff_status: string;
  handoff_error: string | null;
  operational: OperationalMetadata;
  conversation_memory: ConversationMemory | null;
  agent_decision: AgentDecision | null;
};

const ACTION_LABELS: Record<string, string> = {
  nessuna_azione: "Nessuna azione",
  verificare_offerta_smartphone: "Verificare offerta smartphone",
  verificare_offerta_energia_con_bolletta: "Verificare energia con bolletta",
  verificare_copertura_fibra: "Verificare copertura fibra",
  gestire_assistenza_cliente: "Gestire assistenza cliente",
  richiamare_cliente: "Richiamare cliente",
  verificare_offerta_adatta: "Verificare offerta adatta",
  verificare_richiesta_cliente: "Verificare richiesta cliente",
};

const INTENT_LABELS: Record<string, string> = {
  smartphone: "Smartphone",
  fibra: "Fibra",
  energia: "Energia",
  assistenza: "Assistenza",
  ricontatto: "Ricontatto",
  offerte_generiche: "Offerte",
  saluto: "Saluto",
  altro: "Altro",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function readBoolean(value: unknown): boolean {
  return value === true;
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

function getConversationMemory(
  metadata: Record<string, unknown> | null,
): ConversationMemory | null {
  if (!metadata) return null;

  const raw = metadata.conversation_memory;

  if (!isRecord(raw)) return null;

  const isFollowUp = readBoolean(raw.is_follow_up);

  if (!isFollowUp) return null;

  const previousConversationId = raw.previous_conversation_id;
  const safePreviousConversationId =
    typeof previousConversationId === "number" ||
    typeof previousConversationId === "string"
      ? previousConversationId
      : null;

  return {
    is_follow_up: true,
    previous_intent: readNullableString(raw.previous_intent),
    previous_message: readNullableString(raw.previous_message),
    previous_conversation_id: safePreviousConversationId,
    previous_created_at: readNullableString(raw.previous_created_at),
    confidence: readNullableString(raw.confidence),
    reason: readNullableString(raw.reason),
  };
}

function getAgentDecision(
  metadata: Record<string, unknown> | null,
): AgentDecision | null {
  if (!metadata) return null;

  const raw = metadata.agent_decision;

  if (!isRecord(raw)) return null;

  const nextBestActionRaw = raw.next_best_action;
  const nextBestAction = isRecord(nextBestActionRaw) ? nextBestActionRaw : {};
  const code = readString(nextBestAction.code) || "verify_customer_request";
  const label = readString(nextBestAction.label) || "Verificare richiesta cliente";
  const reason =
    readString(nextBestAction.reason) ||
    "Decisione operativa generata dall’agent.";

  return {
    next_best_action: {
      code,
      label,
      reason,
    },
    required_data: readStringArray(raw.required_data),
    questions_to_ask: readStringArray(raw.questions_to_ask),
    risk_flags: readStringArray(raw.risk_flags),
    operator_summary: readString(raw.operator_summary),
  };
}

function getOperationalSla(value: unknown): OperationalSla | null {
  if (!isRecord(value)) return null;

  return {
    due_at: readNullableString(value.due_at),
    level: readString(value.level) || "nessuna",
    status: readString(value.status) || "in_tempo",
    reason: readNullableString(value.reason),
  };
}

function isClosedOperationalStatus(status: string): boolean {
  return (
    status === "chiusa" ||
    status === "ricontattato" ||
    status === "non_interessato"
  );
}

function getSlaStatus(
  sla: OperationalSla | null,
  operationalStatus: string,
): string {
  if (isClosedOperationalStatus(operationalStatus)) {
    return "completata";
  }

  if (!sla?.due_at) {
    return "nessuna";
  }

  const dueTime = new Date(sla.due_at).getTime();

  if (!Number.isFinite(dueTime)) {
    return "nessuna";
  }

  const diffMs = dueTime - Date.now();

  if (diffMs < 0) {
    return "in_ritardo";
  }

  if (diffMs <= 2 * 60 * 60 * 1000) {
    return "in_scadenza";
  }

  return "in_tempo";
}

function slaClass(status: string): string {
  if (status === "in_ritardo") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "in_scadenza") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "in_tempo") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "completata") {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function slaLabel(status: string): string {
  if (status === "in_ritardo") return "In ritardo";
  if (status === "in_scadenza") return "In scadenza";
  if (status === "in_tempo") return "In tempo";
  if (status === "completata") return "Completata";
  return "Nessuna SLA";
}

function slaLevelLabel(level: string): string {
  if (level === "oggi") return "Entro oggi";
  if (level === "24_ore") return "Entro 24 ore";
  if (level === "48_ore") return "Entro 48 ore";
  return "Nessuna scadenza";
}

function getOperationalMetadata(
  metadata: Record<string, unknown> | null,
): OperationalMetadata | null {
  if (!metadata) return null;

  const raw = metadata.agent_operational;

  if (!isRecord(raw)) return null;

  const statoOperativo = readString(raw.stato_operativo) || "da_gestire";
  const azioneRichiesta =
    readString(raw.azione_richiesta) || "verificare_richiesta_cliente";
  const priorita = readString(raw.priorita) || "normale";

  return {
    cliente_riconosciuto: readBoolean(raw.cliente_riconosciuto),
    negozio_id: readNullableNumber(raw.negozio_id),
    negozio_label: readNullableString(raw.negozio_label),
    motivo_handoff: readNullableString(raw.motivo_handoff),
    azione_richiesta: azioneRichiesta,
    priorita,
    stato_operativo: statoOperativo,
    opportunity_score: readNumber(raw.opportunity_score),
    opportunity_score_reason: readStringArray(raw.opportunity_score_reason),
    sla: getOperationalSla(raw.sla),
  };
}

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function fullName(cliente: ClienteRow | undefined): string {
  const name = [cliente?.nome, cliente?.cognome].filter(Boolean).join(" ").trim();
  return name || "Cliente";
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().trim();
}

function truncateText(value: string, maxLength: number) {
  const text = value.trim();

  if (text.length <= maxLength) return text;

  return `${text.slice(0, maxLength - 1)}…`;
}

function getActionLabel(action: string) {
  return ACTION_LABELS[action] ?? action.replaceAll("_", " ");
}

function getIntentLabel(intent: string) {
  return INTENT_LABELS[intent] ?? intent;
}

function priorityClass(priority: string) {
  if (priority === "alta") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function statusClass(status: string) {
  if (status === "da_gestire") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "in_lavorazione") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "ricontattato") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "chiusa") {
    return "border-slate-300 bg-slate-100 text-slate-700";
  }

  if (status === "non_interessato") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "informativo") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function handoffClass(status: string) {
  if (status === "sent_template") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "skipped_duplicate") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (status === "failed_template") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreClass(score: number) {
  if (score >= 75) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (score >= 50) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (score >= 25) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function scoreLabel(score: number) {
  if (score >= 75) return "Alta";
  if (score >= 50) return "Buona";
  if (score >= 25) return "Media";
  return "Bassa";
}

function scoreDescription(score: number) {
  if (score >= 75) return "Da gestire velocemente";
  if (score >= 50) return "Opportunità interessante";
  if (score >= 25) return "Da valutare";
  return "Bassa priorità";
}

function scoreExplanation(score: number) {
  if (score >= 75) {
    return "Cliente con richiesta concreta e buon potenziale commerciale.";
  }

  if (score >= 50) {
    return "Richiesta utile, da verificare senza urgenza massima.";
  }

  if (score >= 25) {
    return "Richiesta da leggere e valutare caso per caso.";
  }

  return "Messaggio informativo o con poco potenziale commerciale.";
}

function isRequestItem(value: RequestItem | null): value is RequestItem {
  return value !== null;
}

function buildRequestGroupKey(row: RequestItem): string {
  return String(row.cliente_id);
}

function getLatestOperationalRequests(rows: RequestItem[]): RequestItem[] {
  const uniqueRows = new Map<string, RequestItem>();

  for (const row of rows) {
    if (row.handoff_status === "skipped_duplicate") {
      continue;
    }

    const key = buildRequestGroupKey(row);

    if (!uniqueRows.has(key)) {
      uniqueRows.set(key, row);
    }
  }

  return Array.from(uniqueRows.values());
}

export default async function PhonesiaRichiestePage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const q = getSingleValue(resolvedParams.q);
  const vistaParam = getSingleValue(resolvedParams.vista);
  const vista = vistaParam === "storico" ? "storico" : "operative";
  const stato = getSingleValue(resolvedParams.stato) || "da_gestire";
  const priorita = getSingleValue(resolvedParams.priorita) || "tutte";
  const negozio = getSingleValue(resolvedParams.negozio) || "tutti";

  const supabase = getSupabaseAdmin();

  const { data: conversazioniData, error: conversazioniError } = await supabase
    .from("phonesia_conversazioni")
    .select(
      "id, created_at, cliente_id, messaggio_utente, intent, handoff_richiesto, metadata",
    )
    .eq("canale", "whatsapp")
    .eq("handoff_richiesto", true)
    .order("created_at", { ascending: false })
    .limit(300);

  if (conversazioniError) {
    throw new Error(`Errore lettura richieste agent: ${conversazioniError.message}`);
  }

  const conversazioni = (conversazioniData ?? []) as ConversationRow[];
  const clienteIds = Array.from(
    new Set(
      conversazioni
        .map((row) => row.cliente_id)
        .filter((id): id is number => typeof id === "number"),
    ),
  );

  const clientiById = new Map<number, ClienteRow>();

  if (clienteIds.length > 0) {
    const { data: clientiData, error: clientiError } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, email, negozio_id, whatsapp_active")
      .in("id", clienteIds);

    if (clientiError) {
      throw new Error(`Errore lettura clienti richieste: ${clientiError.message}`);
    }

    ((clientiData ?? []) as ClienteRow[]).forEach((cliente) => {
      clientiById.set(cliente.id, cliente);
    });
  }

  const richieste = conversazioni
    .map((row): RequestItem | null => {
      if (!row.cliente_id) return null;

      const operational = getOperationalMetadata(row.metadata);
      if (!operational) return null;

      const cliente = clientiById.get(row.cliente_id);
      const metadata = row.metadata ?? {};
      const telefonoMetadata = readString(metadata.telefono);
      const handoffStatus = readString(metadata.handoff_status) || "non_aggiornato";
      const conversationMemory = getConversationMemory(row.metadata);
      const agentDecision = getAgentDecision(row.metadata);

      return {
        id: row.id,
        created_at: row.created_at,
        cliente_id: row.cliente_id,
        cliente_nome: fullName(cliente),
        telefono: cliente?.telefono || telefonoMetadata || "—",
        messaggio_utente: row.messaggio_utente || "",
        intent: row.intent || operational.motivo_handoff || "altro",
        handoff_richiesto: row.handoff_richiesto === true,
        handoff_status: handoffStatus,
        handoff_error: readNullableString(metadata.handoff_error),
        operational,
        conversation_memory: conversationMemory,
        agent_decision: agentDecision,
      };
    })
    .filter(isRequestItem);

  const query = normalizeSearch(q);
  const richiestePulite = getLatestOperationalRequests(richieste);
  const richiesteBase = vista === "storico" ? richieste : richiestePulite;
  const richiesteNascosteVistaPulita = Math.max(
    0,
    richieste.length - richiestePulite.length,
  );

  const richiesteFiltrate = richiesteBase.filter((row) => {
    const matchesStato =
      stato === "tutte" || row.operational.stato_operativo === stato;
    const matchesPriorita =
      priorita === "tutte" || row.operational.priorita === priorita;
    const matchesNegozio =
      negozio === "tutti" || String(row.operational.negozio_id ?? "") === negozio;

    const searchBlob = [
      row.cliente_nome,
      row.telefono,
      row.messaggio_utente,
      row.intent,
      row.conversation_memory?.previous_intent,
      row.conversation_memory?.previous_message,
      row.agent_decision?.next_best_action.label,
      row.agent_decision?.next_best_action.reason,
      row.agent_decision?.operator_summary,
      ...(row.agent_decision?.required_data ?? []),
      ...(row.agent_decision?.questions_to_ask ?? []),
      ...(row.agent_decision?.risk_flags ?? []),
      row.operational.negozio_label,
      row.operational.azione_richiesta,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !query || searchBlob.includes(query);

    return matchesStato && matchesPriorita && matchesNegozio && matchesSearch;
  });

  const daGestire = richiesteBase.filter(
    (row) => row.operational.stato_operativo === "da_gestire",
  ).length;
  const altaPriorita = richiesteBase.filter(
    (row) => row.operational.priorita === "alta",
  ).length;
  const duplicatiBloccati = richieste.filter(
    (row) => row.handoff_status === "skipped_duplicate",
  ).length;
  const scoreMedio =
    richiesteBase.length > 0
      ? Math.round(
          richiesteBase.reduce(
            (sum, row) => sum + row.operational.opportunity_score,
            0,
          ) / richiesteBase.length,
        )
      : 0;

  const negoziOptions = Array.from(
    new Map(
      richieste
        .filter((row) => row.operational.negozio_id && row.operational.negozio_label)
        .map((row) => [
          String(row.operational.negozio_id),
          row.operational.negozio_label || "Negozio",
        ]),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 text-slate-900 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-6">
        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-8">
          <div className="mb-3 inline-flex rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
            AI Agent
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Richieste clienti da gestire
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                Elenco delle richieste create dall’agent WhatsApp: offerte,
                assistenza, ricontatti e azioni operative per i negozi.
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
          <StatCard
            label="Richieste operative"
            value={richiesteBase.length}
            note={vista === "storico" ? "Storico completo" : "Vista pulita"}
          />
          <StatCard
            label="Da gestire"
            value={daGestire}
            note="Stato operativo aperto"
            warning={daGestire > 0}
          />
          <StatCard
            label="Priorità alta"
            value={altaPriorita}
            note="Assistenza, ricontatto o recupero"
            danger={altaPriorita > 0}
          />
          <StatCard
            label="Duplicati bloccati"
            value={duplicatiBloccati}
            note="Notifiche negozio evitate"
          />
          <StatCard
            label="Score medio opportunità"
            value={`${scoreMedio}/100`}
            note="Più è alto, più va gestita prima"
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Cerca cliente, telefono, messaggio..."
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500"
            />

            <select
              name="vista"
              defaultValue={vista}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500"
            >
              <option value="operative">Vista pulita</option>
              <option value="storico">Storico completo</option>
            </select>

            <select
              name="stato"
              defaultValue={stato}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500"
            >
              <option value="da_gestire">Da gestire</option>
              <option value="in_lavorazione">In lavorazione</option>
              <option value="ricontattato">Ricontattato</option>
              <option value="chiusa">Chiusa</option>
              <option value="non_interessato">Non interessato</option>
              <option value="informativo">Informativo</option>
              <option value="tutte">Tutti gli stati</option>
            </select>

            <select
              name="priorita"
              defaultValue={priorita}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500"
            >
              <option value="tutte">Tutte le priorità</option>
              <option value="alta">Alta</option>
              <option value="normale">Normale</option>
            </select>

            <select
              name="negozio"
              defaultValue={negozio}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500"
            >
              <option value="tutti">Tutti i negozi</option>
              {negoziOptions.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              Filtra
            </button>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-black tracking-tight text-slate-950">
              Come leggere lo score opportunità
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Lo score aiuta a capire quali richieste gestire prima: non è una vendita garantita,
              ma un indicatore di priorità commerciale e operativa.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <ScoreLegendItem
              range="75-100"
              label="Alta"
              description="Da gestire velocemente"
              className="border-emerald-200 bg-emerald-50 text-emerald-700"
            />
            <ScoreLegendItem
              range="50-74"
              label="Buona"
              description="Opportunità interessante"
              className="border-orange-200 bg-orange-50 text-orange-700"
            />
            <ScoreLegendItem
              range="25-49"
              label="Media"
              description="Da valutare"
              className="border-amber-200 bg-amber-50 text-amber-700"
            />
            <ScoreLegendItem
              range="0-24"
              label="Bassa"
              description="Bassa priorità"
              className="border-slate-200 bg-slate-50 text-slate-600"
            />
          </div>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 md:px-6">
            <h2 className="text-xl font-black tracking-tight text-slate-950">
              Richieste trovate: {richiesteFiltrate.length}
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
              {vista === "storico"
                ? "Stai vedendo lo storico completo delle conversazioni operative, inclusi duplicati tecnici e richieste ripetute."
                : "Vista pulita: mostra solo l’ultima richiesta utile per ogni cliente, nascondendo duplicati tecnici e richieste ripetute."}
              {vista !== "storico" && richiesteNascosteVistaPulita > 0
                ? ` Elementi nascosti nella vista pulita: ${richiesteNascosteVistaPulita}.`
                : ""}
            </p>
          </div>

          {richiesteFiltrate.length === 0 ? (
            <div className="p-8 text-sm font-semibold text-slate-500">
              Nessuna richiesta trovata con questi filtri.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1400px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-black">Data</th>
                    <th className="px-5 py-4 font-black">Cliente</th>
                    <th className="px-5 py-4 font-black">Negozio</th>
                    <th className="px-5 py-4 font-black">Intent</th>
                    <th className="px-5 py-4 font-black">Priorità</th>
                    <th className="px-5 py-4 font-black">Score</th>
                    <th className="px-5 py-4 font-black">SLA</th>
                    <th className="px-5 py-4 font-black">Azione</th>
                    <th className="px-5 py-4 font-black">Messaggio</th>
                    <th className="px-5 py-4 font-black">Handoff</th>
                    <th className="px-5 py-4 font-black">Scheda</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {richiesteFiltrate.map((row) => (
                    <tr key={row.id} className="align-top hover:bg-orange-50/30">
                      <td className="whitespace-nowrap px-5 py-4 text-slate-600">
                        {formatDate(row.created_at)}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-black text-slate-950">
                          {row.cliente_nome}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {row.telefono}
                        </div>
                      </td>

                      <td className="px-5 py-4 text-slate-700">
                        {row.operational.negozio_label || "—"}
                      </td>

                      <td className="px-5 py-4">
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
                          {getIntentLabel(row.intent)}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            priorityClass(row.operational.priorita),
                          ].join(" ")}
                        >
                          {row.operational.priorita}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <div
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            scoreClass(row.operational.opportunity_score),
                          ].join(" ")}
                          title={row.operational.opportunity_score_reason.join(" · ")}
                        >
                          {row.operational.opportunity_score}/100 ·{" "}
                          {scoreLabel(row.operational.opportunity_score)}
                        </div>

                        <div className="mt-2 max-w-[230px] text-xs font-bold leading-relaxed text-slate-700">
                          {scoreDescription(row.operational.opportunity_score)}
                        </div>

                        <div className="mt-1 max-w-[230px] text-[11px] leading-relaxed text-slate-500">
                          {scoreExplanation(row.operational.opportunity_score)}
                        </div>

                        {row.operational.opportunity_score_reason.length > 0 ? (
                          <details className="mt-2 max-w-[230px] text-[11px] text-slate-500">
                            <summary className="cursor-pointer font-bold text-slate-600">
                              Perché questo score
                            </summary>
                            <ul className="mt-2 list-disc space-y-1 pl-4">
                              {row.operational.opportunity_score_reason.map((reason) => (
                                <li key={reason}>{reason}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            slaClass(
                              getSlaStatus(
                                row.operational.sla,
                                row.operational.stato_operativo,
                              ),
                            ),
                          ].join(" ")}
                        >
                          {slaLabel(
                            getSlaStatus(
                              row.operational.sla,
                              row.operational.stato_operativo,
                            ),
                          )}
                        </span>

                        <div className="mt-2 text-xs font-bold text-slate-700">
                          {slaLevelLabel(row.operational.sla?.level ?? "nessuna")}
                        </div>

                        {row.operational.sla?.due_at ? (
                          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                            Scadenza: {formatDate(row.operational.sla.due_at)}
                          </div>
                        ) : null}

                        {row.operational.sla?.reason ? (
                          <div className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-slate-500">
                            {row.operational.sla.reason}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-5 py-4">
                        <div className="font-semibold text-slate-800">
                          {getActionLabel(row.operational.azione_richiesta)}
                        </div>
                        <div
                          className={[
                            "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            statusClass(row.operational.stato_operativo),
                          ].join(" ")}
                        >
                          {row.operational.stato_operativo}
                        </div>

                        <RichiestaStatusActions
                          richiestaId={row.id}
                          currentStatus={row.operational.stato_operativo}
                        />

                        {row.agent_decision ? (
                          <AgentDecisionBox decision={row.agent_decision} />
                        ) : null}
                      </td>

                      <td className="max-w-md px-5 py-4 text-slate-600">
                        <div className="font-semibold text-slate-800">
                          {truncateText(row.messaggio_utente, 180)}
                        </div>

                        {row.conversation_memory ? (
                          <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 px-3 py-3 text-xs leading-relaxed text-blue-800">
                            <div className="font-black uppercase tracking-[0.14em] text-blue-700">
                              Collegata a richiesta precedente
                            </div>

                            <div className="mt-2">
                              <span className="font-black">Tipo:</span>{" "}
                              {row.conversation_memory.previous_intent
                                ? getIntentLabel(row.conversation_memory.previous_intent)
                                : "—"}
                            </div>

                            {row.conversation_memory.previous_message ? (
                              <div className="mt-1">
                                <span className="font-black">Prima richiesta:</span>{" "}
                                {truncateText(
                                  row.conversation_memory.previous_message,
                                  130,
                                )}
                              </div>
                            ) : null}

                            {row.conversation_memory.reason ? (
                              <div className="mt-1 text-blue-700">
                                {row.conversation_memory.reason}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </td>

                      <td className="px-5 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                            handoffClass(row.handoff_status),
                          ].join(" ")}
                          title={row.handoff_error || undefined}
                        >
                          {row.handoff_status}
                        </span>
                      </td>

                      <td className="px-5 py-4">
                        <Link
                          href={`/phonesia/dashboard/clienti/${row.cliente_id}`}
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

function AgentDecisionBox({ decision }: { decision: AgentDecision }) {
  return (
    <div className="mt-4 max-w-[320px] rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs leading-relaxed text-emerald-900">
      <div className="font-black uppercase tracking-[0.14em] text-emerald-700">
        Decisione agent
      </div>

      <div className="mt-2 font-black text-slate-950">
        {decision.next_best_action.label}
      </div>

      <div className="mt-1 text-emerald-800">
        {decision.next_best_action.reason}
      </div>

      {decision.operator_summary ? (
        <div className="mt-2 rounded-xl border border-emerald-200 bg-white/70 px-3 py-2 text-[11px] font-semibold text-slate-700">
          {decision.operator_summary}
        </div>
      ) : null}

      {decision.required_data.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-black text-emerald-800">
            Dati da raccogliere
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-emerald-900">
            {decision.required_data.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {decision.questions_to_ask.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer font-black text-emerald-800">
            Domande suggerite
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-emerald-900">
            {decision.questions_to_ask.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {decision.risk_flags.length > 0 ? (
        <details className="mt-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800">
          <summary className="cursor-pointer font-black text-red-700">
            Rischi operativi
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            {decision.risk_flags.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function ScoreLegendItem({
  range,
  label,
  description,
  className,
}: {
  range: string;
  label: string;
  description: string;
  className: string;
}) {
  return (
    <div className={`rounded-3xl border p-4 ${className}`}>
      <div className="text-xs font-black uppercase tracking-[0.18em] opacity-75">
        Score {range}
      </div>
      <div className="mt-2 text-xl font-black">{label}</div>
      <div className="mt-1 text-sm font-semibold opacity-85">{description}</div>
    </div>
  );
}

function StatCard({
  label,
  value,
  note,
  warning,
  danger,
}: {
  label: string;
  value: number | string;
  note: string;
  warning?: boolean;
  danger?: boolean;
}) {
  const cardClass = danger
    ? "border-red-200 bg-red-50"
    : warning
      ? "border-amber-200 bg-amber-50"
      : "border-slate-200 bg-white";

  const valueClass = danger
    ? "text-red-700"
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
