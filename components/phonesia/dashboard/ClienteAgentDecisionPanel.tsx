import { createClient } from "@supabase/supabase-js";

type Props = {
  clienteId: number;
};

type ConversationRow = {
  id: number | string;
  created_at: string | null;
  messaggio_utente: string | null;
  intent: string | null;
  handoff_richiesto: boolean | null;
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

type OperationalMetadata = {
  stato_operativo: string;
  priorita: string;
  opportunity_score: number;
  sla_due_at: string | null;
  sla_level: string | null;
};

type DecisionView = {
  conversationId: number | string;
  createdAt: string | null;
  message: string;
  intent: string;
  decision: AgentDecision;
  operational: OperationalMetadata;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is string => typeof item === "string");
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

function truncateText(value: string, maxLength: number): string {
  const text = value.trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function getAgentDecision(metadata: Record<string, unknown> | null): AgentDecision | null {
  if (!metadata) return null;

  const raw = metadata.agent_decision;

  if (!isRecord(raw)) return null;

  const nextBestActionRaw = raw.next_best_action;

  if (!isRecord(nextBestActionRaw)) return null;

  const label = readString(nextBestActionRaw.label);
  const code = readString(nextBestActionRaw.code);
  const reason = readString(nextBestActionRaw.reason);

  if (!label || !code) return null;

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

function getOperationalMetadata(
  metadata: Record<string, unknown> | null,
): OperationalMetadata {
  const raw = metadata?.agent_operational;
  const operational = isRecord(raw) ? raw : {};
  const slaRaw = operational.sla;
  const sla = isRecord(slaRaw) ? slaRaw : {};

  return {
    stato_operativo: readString(operational.stato_operativo) || "informativo",
    priorita: readString(operational.priorita) || "normale",
    opportunity_score: readNumber(operational.opportunity_score),
    sla_due_at: readNullableString(sla.due_at),
    sla_level: readNullableString(sla.level),
  };
}

function getDecisionView(row: ConversationRow): DecisionView | null {
  const decision = getAgentDecision(row.metadata);

  if (!decision) return null;

  return {
    conversationId: row.id,
    createdAt: row.created_at,
    message: readString(row.messaggio_utente),
    intent: readString(row.intent) || "altro",
    decision,
    operational: getOperationalMetadata(row.metadata),
  };
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

function slaLabel(level: string | null): string {
  if (level === "oggi") return "Entro oggi";
  if (level === "24_ore") return "Entro 24 ore";
  if (level === "48_ore") return "Entro 48 ore";

  return "Nessuna SLA";
}

export default async function ClienteAgentDecisionPanel({ clienteId }: Props) {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("phonesia_conversazioni")
    .select("id, created_at, messaggio_utente, intent, handoff_richiesto, metadata")
    .eq("cliente_id", clienteId)
    .eq("canale", "whatsapp")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(`Errore lettura decisioni agent: ${error.message}`);
  }

  const decisions = ((data ?? []) as ConversationRow[])
    .map(getDecisionView)
    .filter((row): row is DecisionView => row !== null);

  const latest = decisions[0] ?? null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
      <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="mb-3 inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-black uppercase tracking-[0.18em] text-violet-700">
            Agent decision
          </div>

          <h2 className="text-xl font-black text-slate-950">
            Decisione operativa dell’agent
          </h2>

          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-slate-600">
            Sintesi operativa generata dall’agent per aiutare l’operatore a capire
            cosa fare, quali dati raccogliere e quali rischi considerare.
          </p>
        </div>

        {latest ? (
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-black text-slate-700">
              {intentLabel(latest.intent)}
            </span>

            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-black",
                statusClass(latest.operational.stato_operativo),
              ].join(" ")}
            >
              {latest.operational.stato_operativo}
            </span>

            <span
              className={[
                "rounded-full border px-3 py-1 text-xs font-black",
                scoreClass(latest.operational.opportunity_score),
              ].join(" ")}
            >
              Score {latest.operational.opportunity_score}/100
            </span>
          </div>
        ) : null}
      </div>

      {!latest ? (
        <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
          Nessuna decisione agent disponibile per questo cliente.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-3xl border border-violet-200 bg-violet-50 p-5">
            <div className="text-xs font-black uppercase tracking-[0.18em] text-violet-700">
              Prossima azione consigliata
            </div>

            <h3 className="mt-2 text-xl font-black text-slate-950">
              {latest.decision.next_best_action.label}
            </h3>

            <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700">
              {latest.decision.next_best_action.reason}
            </p>

            {latest.decision.operator_summary ? (
              <p className="mt-3 rounded-2xl border border-violet-200 bg-white px-4 py-3 text-sm font-semibold leading-relaxed text-slate-700">
                {latest.decision.operator_summary}
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <InfoListCard
              title="Dati da raccogliere"
              emptyText="Nessun dato specifico richiesto."
              items={latest.decision.required_data}
            />

            <InfoListCard
              title="Domande da fare"
              emptyText="Nessuna domanda suggerita."
              items={latest.decision.questions_to_ask}
            />

            <InfoListCard
              title="Rischi operativi"
              emptyText="Nessun rischio operativo rilevato."
              items={latest.decision.risk_flags}
              danger={latest.decision.risk_flags.length > 0}
            />
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <MiniInfo label="Ultimo messaggio" value={truncateText(latest.message, 120)} />
              <MiniInfo label="Data" value={formatDateTime(latest.createdAt)} />
              <MiniInfo label="SLA" value={slaLabel(latest.operational.sla_level)} />
              <MiniInfo
                label="Scadenza"
                value={formatDateTime(latest.operational.sla_due_at)}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function InfoListCard({
  title,
  items,
  emptyText,
  danger,
}: {
  title: string;
  items: string[];
  emptyText: string;
  danger?: boolean;
}) {
  const cardClass = danger
    ? "border-red-200 bg-red-50"
    : "border-slate-200 bg-white";

  const titleClass = danger ? "text-red-700" : "text-slate-500";
  const bulletClass = danger ? "bg-red-500" : "bg-orange-500";

  return (
    <div className={`rounded-3xl border p-5 ${cardClass}`}>
      <h3 className={`text-sm font-black uppercase tracking-[0.18em] ${titleClass}`}>
        {title}
      </h3>

      {items.length === 0 ? (
        <p className="mt-3 text-sm font-semibold text-slate-500">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-2 text-sm leading-relaxed text-slate-700">
          {items.map((item) => (
            <li key={item} className="flex gap-2">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${bulletClass}`} />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-400">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-black text-slate-950" title={value}>
        {value || "—"}
      </div>
    </div>
  );
}
