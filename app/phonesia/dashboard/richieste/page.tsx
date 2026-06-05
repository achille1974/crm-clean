import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import AgentTaskStatusActions from "@/components/phonesia/dashboard/AgentTaskStatusActions";

export const dynamic = "force-dynamic";

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type AgentTaskRow = {
  id: number | string;
  conversation_id: number | string | null;
  thread_id: string | null;
  cliente_id: number | null;
  negozio_id: number | null;
  negozio_label: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  source: string | null;
  intent: string | null;
  detected_intent: string | null;
  message: string | null;
  reply: string | null;
  next_best_action_code: string | null;
  next_best_action_label: string | null;
  next_best_action_reason: string | null;
  required_data: unknown;
  questions_to_ask: unknown;
  risk_flags: unknown;
  operator_summary: string | null;
  priority: string | null;
  score: number | null;
  score_reasons: unknown;
  sla_due_at: string | null;
  sla_level: string | null;
  sla_status: string | null;
  sla_reason: string | null;
  status: string | null;
  created_at: string | null;
  closed_at: string | null;
  metadata: Record<string, unknown> | null;
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

type ConversationMemory = {
  is_follow_up: boolean;
  previous_intent: string | null;
  previous_message: string | null;
  previous_conversation_id: number | string | null;
  previous_created_at: string | null;
  confidence: string | null;
  reason: string | null;
};

type TaskItem = {
  id: number | string;
  conversation_id: number | string | null;
  created_at: string | null;
  closed_at: string | null;
  cliente_id: number;
  cliente_nome: string;
  telefono: string;
  negozio_id: number | null;
  negozio_label: string | null;
  messaggio_utente: string;
  intent: string;
  detected_intent: string | null;
  status: string;
  priority: string;
  score: number;
  score_reasons: string[];
  sla_due_at: string | null;
  sla_level: string;
  sla_status: string;
  sla_reason: string | null;
  source: string;
  agent_decision: AgentDecision | null;
  conversation_memory: ConversationMemory | null;
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

const STATUS_LABELS: Record<string, string> = {
  da_gestire: "Da gestire",
  in_lavorazione: "In lavorazione",
  ricontattato: "Ricontattato",
  chiusa: "Chiusa",
  non_interessato: "Non interessato",
  informativo: "Informativo",
  annullata: "Annullata",
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

function getMetadataRecord(
  metadata: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  if (!metadata) return null;
  const value = metadata[key];
  return isRecord(value) ? value : null;
}

function getConversationMemory(
  metadata: Record<string, unknown> | null,
): ConversationMemory | null {
  const raw = getMetadataRecord(metadata, "conversation_memory");
  if (!raw) return null;

  const isFollowUp = raw.is_follow_up === true;
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

function getAgentDecision(row: AgentTaskRow): AgentDecision | null {
  const metadataDecision = getMetadataRecord(row.metadata, "agent_decision");

  if (metadataDecision) {
    const nextBestActionRaw = metadataDecision.next_best_action;
    if (isRecord(nextBestActionRaw)) {
      const code = readString(nextBestActionRaw.code);
      const label = readString(nextBestActionRaw.label);
      const reason = readString(nextBestActionRaw.reason);

      if (code && label) {
        return {
          next_best_action: {
            code,
            label,
            reason,
          },
          required_data: readStringArray(metadataDecision.required_data),
          questions_to_ask: readStringArray(metadataDecision.questions_to_ask),
          risk_flags: readStringArray(metadataDecision.risk_flags),
          operator_summary: readString(metadataDecision.operator_summary),
        };
      }
    }
  }

  const code = row.next_best_action_code ?? "";
  const label = row.next_best_action_label ?? "";

  if (!code || !label) return null;

  return {
    next_best_action: {
      code,
      label,
      reason: row.next_best_action_reason ?? "",
    },
    required_data: readStringArray(row.required_data),
    questions_to_ask: readStringArray(row.questions_to_ask),
    risk_flags: readStringArray(row.risk_flags),
    operator_summary: row.operator_summary ?? "",
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

function normalizeSearch(value: string): string {
  return value.toLowerCase().trim();
}

function truncateText(value: string, maxLength: number) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

function getIntentLabel(intent: string) {
  return INTENT_LABELS[intent] ?? intent;
}

function getStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

function isClosedStatus(status: string): boolean {
  return (
    status === "chiusa" ||
    status === "ricontattato" ||
    status === "non_interessato" ||
    status === "annullata"
  );
}

function getSlaStatus(task: TaskItem): string {
  if (isClosedStatus(task.status)) {
    return "completata";
  }

  if (!task.sla_due_at) {
    return "nessuna";
  }

  const dueTime = new Date(task.sla_due_at).getTime();

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

  if (status === "non_interessato" || status === "annullata") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "informativo") {
    return "border-slate-200 bg-slate-50 text-slate-600";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
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

function getTaskGroupKey(task: TaskItem): string {
  return String(task.cliente_id);
}

function getLatestOperationalTasks(rows: TaskItem[]): TaskItem[] {
  const uniqueRows = new Map<string, TaskItem>();

  for (const row of rows) {
    const key = getTaskGroupKey(row);

    if (!uniqueRows.has(key)) {
      uniqueRows.set(key, row);
    }
  }

  return Array.from(uniqueRows.values());
}

function getTaskItem(row: AgentTaskRow): TaskItem | null {
  if (!row.cliente_id) return null;

  return {
    id: row.id,
    conversation_id: row.conversation_id,
    created_at: row.created_at,
    closed_at: row.closed_at,
    cliente_id: row.cliente_id,
    cliente_nome: row.customer_name || "Cliente",
    telefono: row.customer_phone || "—",
    negozio_id: row.negozio_id,
    negozio_label: row.negozio_label,
    messaggio_utente: row.message || "",
    intent: row.intent || "altro",
    detected_intent: row.detected_intent,
    status: row.status || "da_gestire",
    priority: row.priority || "normale",
    score: readNumber(row.score),
    score_reasons: readStringArray(row.score_reasons),
    sla_due_at: row.sla_due_at,
    sla_level: row.sla_level || "nessuna",
    sla_status: row.sla_status || "in_tempo",
    sla_reason: row.sla_reason,
    source: row.source || "agent_message",
    agent_decision: getAgentDecision(row),
    conversation_memory: getConversationMemory(row.metadata),
  };
}

function isTaskItem(value: TaskItem | null): value is TaskItem {
  return value !== null;
}

export default async function PhonesiaRichiestePage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const q = getSingleValue(resolvedParams.q);
  const vistaParam = getSingleValue(resolvedParams.vista);
  const vista = vistaParam === "storico" ? "storico" : "operative";
  const stato = getSingleValue(resolvedParams.stato) || "da_gestire";
  const priorita = getSingleValue(resolvedParams.priorita) || "tutte";
  const negozio = getSingleValue(resolvedParams.negozio) || "tutti";
  const sla = getSingleValue(resolvedParams.sla) || "tutte";

  const supabase = getSupabaseAdmin();

  const { data: tasksData, error: tasksError } = await supabase
    .from("phonesia_agent_tasks")
    .select(
      "id, conversation_id, thread_id, cliente_id, negozio_id, negozio_label, customer_name, customer_phone, source, intent, detected_intent, message, reply, next_best_action_code, next_best_action_label, next_best_action_reason, required_data, questions_to_ask, risk_flags, operator_summary, priority, score, score_reasons, sla_due_at, sla_level, sla_status, sla_reason, status, created_at, closed_at, metadata",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (tasksError) {
    throw new Error(`Errore lettura task agent: ${tasksError.message}`);
  }

  const tasks = ((tasksData ?? []) as AgentTaskRow[])
    .map(getTaskItem)
    .filter(isTaskItem);

  const query = normalizeSearch(q);
  const tasksPulite = getLatestOperationalTasks(tasks);
  const tasksBase = vista === "storico" ? tasks : tasksPulite;
  const tasksNascosteVistaPulita = Math.max(0, tasks.length - tasksPulite.length);

  const tasksFiltrate = tasksBase.filter((row) => {
    const slaStatus = getSlaStatus(row);
    const matchesStato = stato === "tutte" || row.status === stato;
    const matchesPriorita = priorita === "tutte" || row.priority === priorita;
    const matchesNegozio = negozio === "tutti" || String(row.negozio_id ?? "") === negozio;
    const matchesSla = sla === "tutte" || slaStatus === sla;

    const searchBlob = [
      row.cliente_nome,
      row.telefono,
      row.messaggio_utente,
      row.intent,
      row.detected_intent,
      row.conversation_memory?.previous_intent,
      row.conversation_memory?.previous_message,
      row.negozio_label,
      row.agent_decision?.next_best_action.label,
      row.agent_decision?.next_best_action.reason,
      row.agent_decision?.operator_summary,
      ...(row.agent_decision?.required_data ?? []),
      ...(row.agent_decision?.questions_to_ask ?? []),
      ...(row.agent_decision?.risk_flags ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = !query || searchBlob.includes(query);

    return matchesStato && matchesPriorita && matchesNegozio && matchesSla && matchesSearch;
  });

  const daGestire = tasksBase.filter((row) => row.status === "da_gestire").length;
  const inLavorazione = tasksBase.filter((row) => row.status === "in_lavorazione").length;
  const ricontattati = tasksBase.filter((row) => row.status === "ricontattato").length;
  const chiuse = tasksBase.filter((row) => row.status === "chiusa").length;
  const nonInteressati = tasksBase.filter((row) => row.status === "non_interessato").length;
  const altaPriorita = tasksBase.filter((row) => row.priority === "alta").length;
  const inRitardo = tasksBase.filter((row) => getSlaStatus(row) === "in_ritardo").length;
  const inScadenza = tasksBase.filter((row) => getSlaStatus(row) === "in_scadenza").length;
  const scoreMedio =
    tasksBase.length > 0
      ? Math.round(tasksBase.reduce((sum, row) => sum + row.score, 0) / tasksBase.length)
      : 0;

  const buildFilterHref = (overrides: Record<string, string>) => {
    const nextParams: Record<string, string> = {
      q,
      vista,
      stato,
      priorita,
      negozio,
      sla,
      ...overrides,
    };

    const params = new URLSearchParams();

    Object.entries(nextParams).forEach(([key, value]) => {
      if (value) {
        params.set(key, value);
      }
    });

    const queryString = params.toString();
    return queryString
      ? `/phonesia/dashboard/richieste?${queryString}`
      : "/phonesia/dashboard/richieste";
  };

  const negoziOptions = Array.from(
    new Map(
      tasks
        .filter((row) => row.negozio_id && row.negozio_label)
        .map((row) => [String(row.negozio_id), row.negozio_label || "Negozio"]),
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
                Task clienti da gestire
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                Coda operativa generata dall’agent WhatsApp: prossime azioni,
                SLA, score, dati da raccogliere e rischi per i negozi.
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
            label="Task operative"
            value={tasksBase.length}
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
            label="SLA critica"
            value={inRitardo + inScadenza}
            note={`${inRitardo} in ritardo · ${inScadenza} in scadenza`}
            danger={inRitardo > 0}
            warning={inRitardo === 0 && inScadenza > 0}
          />
          <StatCard
            label="Score medio opportunità"
            value={`${scoreMedio}/100`}
            note="Più è alto, più va gestita prima"
          />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-black tracking-tight text-slate-950">
              Filtri rapidi
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Usa questi pulsanti per passare subito da una corsia operativa all’altra.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <QuickFilterLink
              href={buildFilterHref({ stato: "da_gestire", sla: "tutte", priorita: "tutte" })}
              label="Da gestire"
              count={daGestire}
              active={stato === "da_gestire" && sla === "tutte" && priorita === "tutte"}
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "in_lavorazione", sla: "tutte", priorita: "tutte" })}
              label="In lavorazione"
              count={inLavorazione}
              active={stato === "in_lavorazione" && sla === "tutte" && priorita === "tutte"}
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "ricontattato", sla: "tutte", priorita: "tutte" })}
              label="Ricontattati"
              count={ricontattati}
              active={stato === "ricontattato" && sla === "tutte" && priorita === "tutte"}
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "chiusa", sla: "tutte", priorita: "tutte" })}
              label="Chiuse"
              count={chiuse}
              active={stato === "chiusa" && sla === "tutte" && priorita === "tutte"}
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "non_interessato", sla: "tutte", priorita: "tutte" })}
              label="Non interessati"
              count={nonInteressati}
              active={stato === "non_interessato" && sla === "tutte" && priorita === "tutte"}
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "tutte", sla: "tutte", priorita: "tutte" })}
              label="Tutti"
              count={tasksBase.length}
              active={stato === "tutte" && sla === "tutte" && priorita === "tutte"}
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <QuickFilterLink
              href={buildFilterHref({ stato: "tutte", sla: "in_ritardo", priorita: "tutte" })}
              label="In ritardo"
              count={inRitardo}
              active={sla === "in_ritardo"}
              danger
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "tutte", sla: "in_scadenza", priorita: "tutte" })}
              label="In scadenza"
              count={inScadenza}
              active={sla === "in_scadenza"}
              warning
            />
            <QuickFilterLink
              href={buildFilterHref({ stato: "tutte", sla: "tutte", priorita: "alta" })}
              label="Alta priorità"
              count={altaPriorita}
              active={priorita === "alta" && sla === "tutte"}
              danger
            />
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-6">
          <form className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr_1fr_1fr_auto]">
            <input
              name="q"
              defaultValue={q}
              placeholder="Cerca cliente, telefono, azione, dati, domande..."
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
              <option value="annullata">Annullata</option>
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
              name="sla"
              defaultValue={sla}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-orange-500"
            >
              <option value="tutte">Tutte le SLA</option>
              <option value="in_ritardo">In ritardo</option>
              <option value="in_scadenza">In scadenza</option>
              <option value="in_tempo">In tempo</option>
              <option value="completata">Completata</option>
              <option value="nessuna">Nessuna SLA</option>
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
              Lo score aiuta a capire quali task gestire prima: non è una vendita garantita,
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
              Task trovate: {tasksFiltrate.length}
            </h2>

            <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-600">
              {vista === "storico"
                ? "Stai vedendo lo storico completo delle task operative, incluse richieste ripetute dello stesso cliente."
                : "Vista pulita: mostra solo l’ultima task utile per ogni cliente."}
              {vista !== "storico" && tasksNascosteVistaPulita > 0
                ? ` Elementi nascosti nella vista pulita: ${tasksNascosteVistaPulita}.`
                : ""}
            </p>
          </div>

          {tasksFiltrate.length === 0 ? (
            <div className="p-8 text-sm font-semibold text-slate-500">
              Nessuna task trovata con questi filtri.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] w-full border-collapse text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-[0.16em] text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-black">Data</th>
                    <th className="px-5 py-4 font-black">Cliente</th>
                    <th className="px-5 py-4 font-black">Negozio</th>
                    <th className="px-5 py-4 font-black">Intent</th>
                    <th className="px-5 py-4 font-black">Priorità</th>
                    <th className="px-5 py-4 font-black">Score</th>
                    <th className="px-5 py-4 font-black">SLA</th>
                    <th className="px-5 py-4 font-black">Azione agent</th>
                    <th className="px-5 py-4 font-black">Messaggio</th>
                    <th className="px-5 py-4 font-black">Scheda</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {tasksFiltrate.map((row) => {
                    const slaStatus = getSlaStatus(row);

                    return (
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
                          {row.negozio_label || "—"}
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
                              priorityClass(row.priority),
                            ].join(" ")}
                          >
                            {row.priority}
                          </span>
                        </td>

                        <td className="px-5 py-4">
                          <div
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                              scoreClass(row.score),
                            ].join(" ")}
                            title={row.score_reasons.join(" · ")}
                          >
                            {row.score}/100 · {scoreLabel(row.score)}
                          </div>

                          <div className="mt-2 max-w-[230px] text-xs font-bold leading-relaxed text-slate-700">
                            {scoreDescription(row.score)}
                          </div>

                          <div className="mt-1 max-w-[230px] text-[11px] leading-relaxed text-slate-500">
                            {scoreExplanation(row.score)}
                          </div>

                          {row.score_reasons.length > 0 ? (
                            <details className="mt-2 max-w-[230px] text-[11px] text-slate-500">
                              <summary className="cursor-pointer font-bold text-slate-600">
                                Perché questo score
                              </summary>
                              <ul className="mt-2 list-disc space-y-1 pl-4">
                                {row.score_reasons.map((reason) => (
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
                              slaClass(slaStatus),
                            ].join(" ")}
                          >
                            {slaLabel(slaStatus)}
                          </span>

                          <div className="mt-2 text-xs font-bold text-slate-700">
                            {slaLevelLabel(row.sla_level)}
                          </div>

                          {row.sla_due_at ? (
                            <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
                              Scadenza: {formatDate(row.sla_due_at)}
                            </div>
                          ) : null}

                          {row.sla_reason ? (
                            <div className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-slate-500">
                              {row.sla_reason}
                            </div>
                          ) : null}
                        </td>

                        <td className="px-5 py-4">
                          <div
                            className={[
                              "inline-flex rounded-full border px-3 py-1 text-xs font-black",
                              statusClass(row.status),
                            ].join(" ")}
                          >
                            {getStatusLabel(row.status)}
                          </div>

                          <AgentTaskStatusActions
                            taskId={row.id}
                            currentStatus={row.status}
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
                                  {truncateText(row.conversation_memory.previous_message, 130)}
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
                          <Link
                            href={`/phonesia/dashboard/clienti/${row.cliente_id}`}
                            className="inline-flex rounded-2xl bg-orange-500 px-4 py-2 text-xs font-black text-white transition hover:bg-orange-600"
                          >
                            Apri
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
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
    <div className="mt-4 max-w-[360px] rounded-3xl border border-violet-200 bg-violet-50 px-4 py-4 text-xs leading-relaxed text-slate-700">
      <div className="font-black uppercase tracking-[0.14em] text-violet-700">
        Decisione agent
      </div>

      <div className="mt-2 font-black text-slate-950">
        {decision.next_best_action.label}
      </div>

      {decision.next_best_action.reason ? (
        <div className="mt-1 text-slate-600">
          {decision.next_best_action.reason}
        </div>
      ) : null}

      {decision.operator_summary ? (
        <div className="mt-2 rounded-2xl border border-violet-200 bg-white px-3 py-2 font-semibold text-slate-700">
          {decision.operator_summary}
        </div>
      ) : null}

      <div className="mt-3 grid gap-2">
        <CompactList title="Dati" items={decision.required_data} />
        <CompactList title="Domande" items={decision.questions_to_ask} />
        <CompactList title="Rischi" items={decision.risk_flags} danger />
      </div>
    </div>
  );
}

function CompactList({
  title,
  items,
  danger,
}: {
  title: string;
  items: string[];
  danger?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <details className="rounded-2xl border border-white/80 bg-white/80 px-3 py-2">
      <summary
        className={[
          "cursor-pointer font-black",
          danger ? "text-red-700" : "text-slate-700",
        ].join(" ")}
      >
        {title}: {items.length}
      </summary>
      <ul className="mt-2 list-disc space-y-1 pl-4 text-slate-600">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </details>
  );
}

function QuickFilterLink({
  href,
  label,
  count,
  active,
  warning,
  danger,
}: {
  href: string;
  label: string;
  count: number;
  active?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  const className = active
    ? "border-slate-950 bg-slate-950 text-white"
    : danger
      ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-100"
      : warning
        ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
        : "border-slate-200 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50";

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-black transition ${className}`}
    >
      <span>{label}</span>
      <span
        className={[
          "rounded-full px-2 py-0.5 text-xs font-black",
          active ? "bg-white/20 text-white" : "bg-slate-900/5 text-current",
        ].join(" ")}
      >
        {count}
      </span>
    </Link>
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

