import "server-only";

import { createBeltramiSupabaseAdmin } from "./supabase";

type BeltramiSupabaseAdmin = ReturnType<typeof createBeltramiSupabaseAdmin>;

type QueryResultPayload = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

type QueryErrorLike = {
  code?: unknown;
  message?: unknown;
  details?: unknown;
  hint?: unknown;
};

export type BeltramiWhatsappConsentFilter = "tutti" | "si" | "no";
export type BeltramiActivityType = "tutte" | "registrazioni" | "whatsapp" | "richieste" | "errori";
export type BeltramiActivityPeriod = "oggi" | "7" | "30" | "tutto";

export type BeltramiClienteRow = {
  id: number;
  created_at: string | null;
  updated_at: string | null;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  telefono_normalizzato: string | null;
  email: string | null;
  codice_fiscale: string | null;
  note: string | null;
  servizio_interesse: string | null;
  privacy_consent: boolean | null;
  whatsapp_consent: boolean | null;
  privacy_version: string | null;
  qr_id: string | null;
  source: string | null;
};

export type BeltramiConsensoRow = {
  id: number;
  created_at: string | null;
  cliente_id: number | null;
  tipo_evento: string | null;
  metodo: string | null;
  privacy_version: string | null;
  qr_id: string | null;
  user_agent: string | null;
};

export type BeltramiWhatsappMessageRow = {
  id: number | string;
  created_at: string | null;
  cliente_id: number | null;
  direction: string | null;
  message_kind: string | null;
  routing_status: string | null;
  from_phone: string | null;
  to_phone: string | null;
  body: string | null;
  template_name: string | null;
  whatsapp_message_id: string | null;
  context_message_id: string | null;
  status: string | null;
  status_reason: string | null;
  notification_key: string | null;
  metadata: Record<string, unknown> | null;
};

export type BeltramiWhatsappStatusRow = {
  id: number | string;
  created_at: string | null;
  whatsapp_message_id: string | null;
  status: string | null;
  recipient_phone: string | null;
  timestamp_meta: string | null;
  conversation_id_meta: string | null;
  pricing_category: string | null;
  pricing_billable: boolean | null;
  error_code: string | null;
  error_title: string | null;
  error_message: string | null;
};

export type BeltramiHandoffRow = {
  id: number | string;
  created_at: string | null;
  updated_at: string | null;
  cliente_id: number | null;
  cliente_phone: string | null;
  cliente_nome: string | null;
  destinazione_nome: string | null;
  destinazione_phone: string | null;
  inbound_message_id: string | null;
  inbound_body: string | null;
  notified_at: string | null;
  notification_whatsapp_message_id: string | null;
  reply_link: string | null;
  mark_done_url: string | null;
  marked_done_at: string | null;
  marked_done_by: string | null;
  status: string | null;
  due_at: string | null;
  reminder_sent_at: string | null;
  reminder_count: number | null;
  metadata: Record<string, unknown> | null;
};

export type BeltramiClienteListItem = BeltramiClienteRow & {
  lastWhatsappMessage: BeltramiWhatsappMessageRow | null;
};

export type BeltramiClientiPage = {
  rows: BeltramiClienteListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  warnings: string[];
};

export type BeltramiDashboardOverview = {
  kpis: {
    clientiTotali: number;
    registrazioniOggi: number;
    registrazioniUltimi7: number;
    registrazioniUltimi30: number;
    consensoPrivacy: number;
    consensoWhatsapp: number;
    inboundRecenti: number;
    notificheInterneInviate: number;
    handoffAperti: number;
    handoffChiusi: number;
    erroriWhatsappRecenti: number;
  };
  ultimeRegistrazioni: BeltramiClienteRow[];
  ultimiInbound: BeltramiWhatsappMessageRow[];
  ultimeRichiesteAperte: BeltramiHandoffRow[];
  erroriWhatsapp: BeltramiWhatsappMessageRow[];
  warnings: string[];
};

export type BeltramiClienteDetail = {
  cliente: BeltramiClienteRow;
  consensi: BeltramiConsensoRow[];
  whatsappMessages: BeltramiWhatsappMessageRow[];
  whatsappStatusesByMessageId: Map<string, BeltramiWhatsappStatusRow[]>;
  handoffRichieste: BeltramiHandoffRow[];
  warnings: string[];
};

export type BeltramiActivityItem = {
  id: string;
  type: "registration" | "whatsapp_inbound" | "whatsapp_notify" | "handoff" | "error";
  createdAt: string | null;
  title: string;
  subtitle: string;
  body: string | null;
  href: string | null;
  status: string | null;
};

export type BeltramiActivityTimeline = {
  items: BeltramiActivityItem[];
  warnings: string[];
};

const CLIENTE_SELECT_FULL = [
  "id",
  "created_at",
  "updated_at",
  "nome",
  "cognome",
  "telefono",
  "telefono_normalizzato",
  "email",
  "codice_fiscale",
  "note",
  "servizio_interesse",
  "privacy_consent",
  "whatsapp_consent",
  "privacy_version",
  "qr_id",
  "source",
].join(", ");

const CLIENTE_SELECT_MINIMAL = [
  "id",
  "created_at",
  "nome",
  "cognome",
  "telefono",
  "telefono_normalizzato",
  "email",
  "codice_fiscale",
  "privacy_consent",
  "whatsapp_consent",
  "qr_id",
  "source",
].join(", ");

const WHATSAPP_MESSAGE_SELECT = [
  "id",
  "created_at",
  "cliente_id",
  "direction",
  "message_kind",
  "routing_status",
  "from_phone",
  "to_phone",
  "body",
  "template_name",
  "whatsapp_message_id",
  "context_message_id",
  "status",
  "status_reason",
  "notification_key",
  "metadata",
].join(", ");

const WHATSAPP_STATUS_SELECT = [
  "id",
  "created_at",
  "whatsapp_message_id",
  "status",
  "recipient_phone",
  "timestamp_meta",
  "conversation_id_meta",
  "pricing_category",
  "pricing_billable",
  "error_code",
  "error_title",
  "error_message",
].join(", ");

const HANDOFF_SELECT = [
  "id",
  "created_at",
  "updated_at",
  "cliente_id",
  "cliente_phone",
  "cliente_nome",
  "destinazione_nome",
  "destinazione_phone",
  "inbound_message_id",
  "inbound_body",
  "notified_at",
  "notification_whatsapp_message_id",
  "reply_link",
  "mark_done_url",
  "marked_done_at",
  "marked_done_by",
  "status",
  "due_at",
  "reminder_sent_at",
  "reminder_count",
  "metadata",
].join(", ");

const CONSENSI_SELECT = [
  "id",
  "created_at",
  "cliente_id",
  "tipo_evento",
  "metodo",
  "privacy_version",
  "qr_id",
  "user_agent",
].join(", ");

const OPEN_HANDOFF_STATUSES = ["pending", "taken", "overdue"];
const DEFAULT_CLIENTI_PAGE_SIZE = 50;

function readQueryError(error: unknown): QueryErrorLike {
  return typeof error === "object" && error !== null ? (error as QueryErrorLike) : {};
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;

  const record = readQueryError(error);
  if (typeof record.message === "string" && record.message) return record.message;
  if (typeof record.details === "string" && record.details) return record.details;
  return "errore sconosciuto";
}

function isSchemaError(error: unknown): boolean {
  const record = readQueryError(error);
  const code = typeof record.code === "string" ? record.code : "";
  const message = [
    record.message,
    record.details,
    record.hint,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return (
    code === "42P01" ||
    code === "42703" ||
    message.includes("does not exist") ||
    message.includes("schema cache")
  );
}

async function readQueryResult(request: PromiseLike<unknown>): Promise<QueryResultPayload> {
  return (await request) as QueryResultPayload;
}

async function fetchRequiredCount(
  label: string,
  request: PromiseLike<unknown>,
): Promise<number> {
  const { count, error } = await readQueryResult(request);
  if (error) throw new Error(`${label}: ${getErrorMessage(error)}`);
  return count ?? 0;
}

async function fetchOptionalRows<T>(
  label: string,
  request: PromiseLike<unknown>,
  warnings: string[],
): Promise<T[]> {
  const { data, error } = await readQueryResult(request);
  if (error) {
    if (isSchemaError(error)) {
      warnings.push(`${label} non disponibile: ${getErrorMessage(error)}`);
      return [];
    }

    throw new Error(`${label}: ${getErrorMessage(error)}`);
  }

  return (data ?? []) as T[];
}

async function fetchOptionalCount(
  label: string,
  request: PromiseLike<unknown>,
  warnings: string[],
): Promise<number> {
  const { count, error } = await readQueryResult(request);
  if (error) {
    if (isSchemaError(error)) {
      warnings.push(`${label} non disponibile: ${getErrorMessage(error)}`);
      return 0;
    }

    throw new Error(`${label}: ${getErrorMessage(error)}`);
  }

  return count ?? 0;
}

function normalizeClienteRows(rows: BeltramiClienteRow[]): BeltramiClienteRow[] {
  return rows.map((row) => ({
    id: Number(row.id),
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    nome: row.nome ?? null,
    cognome: row.cognome ?? null,
    telefono: row.telefono ?? null,
    telefono_normalizzato: row.telefono_normalizzato ?? null,
    email: row.email ?? null,
    codice_fiscale: row.codice_fiscale ?? null,
    note: row.note ?? null,
    servizio_interesse: row.servizio_interesse ?? null,
    privacy_consent: row.privacy_consent ?? null,
    whatsapp_consent: row.whatsapp_consent ?? null,
    privacy_version: row.privacy_version ?? null,
    qr_id: row.qr_id ?? null,
    source: row.source ?? null,
  }));
}

async function fetchRecentClienti(
  supabase: BeltramiSupabaseAdmin,
  limit: number,
  warnings: string[],
): Promise<BeltramiClienteRow[]> {
  const run = (selectFields: string) =>
    supabase
      .from("beltrami_clienti")
      .select(selectFields)
      .order("created_at", { ascending: false })
      .limit(limit);

  const first = await readQueryResult(run(CLIENTE_SELECT_FULL));
  if (!first.error) {
    return normalizeClienteRows((first.data ?? []) as BeltramiClienteRow[]);
  }

  if (!isSchemaError(first.error)) {
    throw new Error(`clienti Beltrami: ${getErrorMessage(first.error)}`);
  }

  warnings.push(`Alcune colonne cliente non disponibili: ${getErrorMessage(first.error)}`);
  const fallback = await readQueryResult(run(CLIENTE_SELECT_MINIMAL));
  if (fallback.error) {
    throw new Error(`clienti Beltrami: ${getErrorMessage(fallback.error)}`);
  }

  return normalizeClienteRows((fallback.data ?? []) as BeltramiClienteRow[]);
}

async function fetchClienteById(
  supabase: BeltramiSupabaseAdmin,
  id: number,
  warnings: string[],
): Promise<BeltramiClienteRow | null> {
  const run = (selectFields: string) =>
    supabase
      .from("beltrami_clienti")
      .select(selectFields)
      .eq("id", id)
      .limit(1)
      .maybeSingle();

  const first = await readQueryResult(run(CLIENTE_SELECT_FULL));
  if (!first.error) {
    const row = first.data ? (first.data as BeltramiClienteRow) : null;
    return row ? normalizeClienteRows([row])[0] : null;
  }

  if (!isSchemaError(first.error)) {
    throw new Error(`cliente Beltrami: ${getErrorMessage(first.error)}`);
  }

  warnings.push(`Alcune colonne cliente non disponibili: ${getErrorMessage(first.error)}`);
  const fallback = await readQueryResult(run(CLIENTE_SELECT_MINIMAL));
  if (fallback.error) {
    throw new Error(`cliente Beltrami: ${getErrorMessage(fallback.error)}`);
  }

  const row = fallback.data ? (fallback.data as BeltramiClienteRow) : null;
  return row ? normalizeClienteRows([row])[0] : null;
}

function getStartOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getDaysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function getPeriodCutoffIso(period: BeltramiActivityPeriod): string | null {
  if (period === "oggi") return getStartOfTodayIso();
  if (period === "7") return getDaysAgoIso(7);
  if (period === "30") return getDaysAgoIso(30);
  return null;
}

function normalizeSearchTerm(value: string): string {
  return value
    .replace(/[(),%]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildClienteSearchFilter(value: string): string | null {
  const term = normalizeSearchTerm(value);
  if (!term) return null;

  return [
    "nome",
    "cognome",
    "telefono",
    "telefono_normalizzato",
    "email",
    "codice_fiscale",
  ]
    .map((column) => `${column}.ilike.%${term}%`)
    .join(",");
}

function applyWhatsappConsentFilter<T extends { eq: (column: string, value: boolean) => T }>(
  query: T,
  filter: BeltramiWhatsappConsentFilter,
) {
  if (filter === "si") return query.eq("whatsapp_consent", true);
  if (filter === "no") return query.eq("whatsapp_consent", false);
  return query;
}

function getClienteName(cliente: BeltramiClienteRow | null | undefined): string {
  const fullName = [cliente?.nome, cliente?.cognome].filter(Boolean).join(" ").trim();
  return fullName || "Cliente Beltrami";
}

function getClientePhone(cliente: BeltramiClienteRow | null | undefined): string {
  return cliente?.telefono_normalizzato || cliente?.telefono || "-";
}

function getDateValue(value: string | null): number {
  if (!value) return 0;
  const date = new Date(value).getTime();
  return Number.isFinite(date) ? date : 0;
}

function mapClienteNames(clienti: BeltramiClienteRow[]) {
  return new Map(clienti.map((cliente) => [cliente.id, getClienteName(cliente)]));
}

async function fetchClientiByIds(
  supabase: BeltramiSupabaseAdmin,
  ids: number[],
  warnings: string[],
): Promise<BeltramiClienteRow[]> {
  const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isFinite(id))));
  if (uniqueIds.length === 0) return [];

  const run = (selectFields: string) =>
    supabase
      .from("beltrami_clienti")
      .select(selectFields)
      .in("id", uniqueIds)
      .limit(uniqueIds.length);

  const first = await readQueryResult(run(CLIENTE_SELECT_FULL));
  if (!first.error) {
    return normalizeClienteRows((first.data ?? []) as BeltramiClienteRow[]);
  }

  if (!isSchemaError(first.error)) {
    throw new Error(`clienti collegati: ${getErrorMessage(first.error)}`);
  }

  warnings.push(`Alcune colonne cliente non disponibili: ${getErrorMessage(first.error)}`);
  const fallback = await readQueryResult(run(CLIENTE_SELECT_MINIMAL));
  if (fallback.error) {
    throw new Error(`clienti collegati: ${getErrorMessage(fallback.error)}`);
  }

  return normalizeClienteRows((fallback.data ?? []) as BeltramiClienteRow[]);
}

async function fetchLastWhatsappByClienteIds(
  supabase: BeltramiSupabaseAdmin,
  clienteIds: number[],
  warnings: string[],
): Promise<Map<number, BeltramiWhatsappMessageRow>> {
  const uniqueIds = Array.from(new Set(clienteIds.filter((id) => Number.isFinite(id))));
  const byCliente = new Map<number, BeltramiWhatsappMessageRow>();
  if (uniqueIds.length === 0) return byCliente;

  const rows = await fetchOptionalRows<BeltramiWhatsappMessageRow>(
    "ultimo WhatsApp clienti",
    supabase
      .from("beltrami_whatsapp_messages")
      .select(WHATSAPP_MESSAGE_SELECT)
      .in("cliente_id", uniqueIds)
      .order("created_at", { ascending: false })
      .limit(Math.min(500, uniqueIds.length * 8)),
    warnings,
  );

  for (const row of rows) {
    const clienteId = Number(row.cliente_id);
    if (!Number.isFinite(clienteId) || byCliente.has(clienteId)) continue;
    byCliente.set(clienteId, row);
  }

  return byCliente;
}

export async function getBeltramiDashboardOverview(): Promise<BeltramiDashboardOverview> {
  const supabase = createBeltramiSupabaseAdmin();
  const warnings: string[] = [];
  const todayIso = getStartOfTodayIso();
  const last7Iso = getDaysAgoIso(7);
  const last30Iso = getDaysAgoIso(30);

  const [
    clientiTotali,
    registrazioniOggi,
    registrazioniUltimi7,
    registrazioniUltimi30,
    consensoPrivacy,
    consensoWhatsapp,
    ultimeRegistrazioni,
  ] = await Promise.all([
    fetchRequiredCount(
      "conteggio clienti",
      supabase.from("beltrami_clienti").select("id", { count: "exact", head: true }),
    ),
    fetchRequiredCount(
      "registrazioni oggi",
      supabase
        .from("beltrami_clienti")
        .select("id", { count: "exact", head: true })
        .gte("created_at", todayIso),
    ),
    fetchRequiredCount(
      "registrazioni ultimi 7 giorni",
      supabase
        .from("beltrami_clienti")
        .select("id", { count: "exact", head: true })
        .gte("created_at", last7Iso),
    ),
    fetchRequiredCount(
      "registrazioni ultimi 30 giorni",
      supabase
        .from("beltrami_clienti")
        .select("id", { count: "exact", head: true })
        .gte("created_at", last30Iso),
    ),
    fetchRequiredCount(
      "consenso privacy",
      supabase
        .from("beltrami_clienti")
        .select("id", { count: "exact", head: true })
        .eq("privacy_consent", true),
    ),
    fetchRequiredCount(
      "consenso WhatsApp",
      supabase
        .from("beltrami_clienti")
        .select("id", { count: "exact", head: true })
        .eq("whatsapp_consent", true),
    ),
    fetchRecentClienti(supabase, 10, warnings),
  ]);

  const [
    inboundRecenti,
    notificheInterneInviate,
    handoffAperti,
    handoffChiusi,
    erroriWhatsappMessaggi,
    erroriWhatsappStatus,
    ultimiInbound,
    ultimeRichiesteAperte,
    erroriWhatsapp,
  ] = await Promise.all([
    fetchOptionalCount(
      "messaggi inbound recenti",
      supabase
        .from("beltrami_whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("direction", "inbound")
        .gte("created_at", last30Iso),
      warnings,
    ),
    fetchOptionalCount(
      "notifiche interne inviate",
      supabase
        .from("beltrami_whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .eq("message_kind", "notify_beltrami")
        .eq("status", "sent")
        .gte("created_at", last30Iso),
      warnings,
    ),
    fetchOptionalCount(
      "richieste handoff aperte",
      supabase
        .from("beltrami_handoff_richieste")
        .select("id", { count: "exact", head: true })
        .in("status", OPEN_HANDOFF_STATUSES),
      warnings,
    ),
    fetchOptionalCount(
      "richieste handoff chiuse",
      supabase
        .from("beltrami_handoff_richieste")
        .select("id", { count: "exact", head: true })
        .eq("status", "done"),
      warnings,
    ),
    fetchOptionalCount(
      "errori WhatsApp recenti",
      supabase
        .from("beltrami_whatsapp_messages")
        .select("id", { count: "exact", head: true })
        .in("status", ["failed", "skipped"])
        .gte("created_at", last30Iso),
      warnings,
    ),
    fetchOptionalCount(
      "errori status Meta recenti",
      supabase
        .from("beltrami_whatsapp_statuses")
        .select("id", { count: "exact", head: true })
        .not("error_code", "is", null)
        .gte("created_at", last30Iso),
      warnings,
    ),
    fetchOptionalRows<BeltramiWhatsappMessageRow>(
      "ultimi inbound",
      supabase
        .from("beltrami_whatsapp_messages")
        .select(WHATSAPP_MESSAGE_SELECT)
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(10),
      warnings,
    ),
    fetchOptionalRows<BeltramiHandoffRow>(
      "ultime richieste aperte",
      supabase
        .from("beltrami_handoff_richieste")
        .select(HANDOFF_SELECT)
        .in("status", OPEN_HANDOFF_STATUSES)
        .order("created_at", { ascending: false })
        .limit(10),
      warnings,
    ),
    fetchOptionalRows<BeltramiWhatsappMessageRow>(
      "errori WhatsApp",
      supabase
        .from("beltrami_whatsapp_messages")
        .select(WHATSAPP_MESSAGE_SELECT)
        .in("status", ["failed", "skipped"])
        .order("created_at", { ascending: false })
        .limit(10),
      warnings,
    ),
  ]);

  return {
    kpis: {
      clientiTotali,
      registrazioniOggi,
      registrazioniUltimi7,
      registrazioniUltimi30,
      consensoPrivacy,
      consensoWhatsapp,
      inboundRecenti,
      notificheInterneInviate,
      handoffAperti,
      handoffChiusi,
      erroriWhatsappRecenti: erroriWhatsappMessaggi + erroriWhatsappStatus,
    },
    ultimeRegistrazioni,
    ultimiInbound,
    ultimeRichiesteAperte,
    erroriWhatsapp,
    warnings: Array.from(new Set(warnings)),
  };
}

export async function getBeltramiClientiPage(params: {
  q: string;
  whatsapp: BeltramiWhatsappConsentFilter;
  page: number;
  pageSize?: number;
}): Promise<BeltramiClientiPage> {
  const supabase = createBeltramiSupabaseAdmin();
  const warnings: string[] = [];
  const pageSize = params.pageSize ?? DEFAULT_CLIENTI_PAGE_SIZE;
  const page = Math.max(1, Number.isFinite(params.page) ? Math.floor(params.page) : 1);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  const searchFilter = buildClienteSearchFilter(params.q);

  const run = async (selectFields: string) => {
    let query = supabase
      .from("beltrami_clienti")
      .select(selectFields, { count: "exact" });

    if (searchFilter) query = query.or(searchFilter);
    query = applyWhatsappConsentFilter(query, params.whatsapp);

    return await readQueryResult(
      query.order("created_at", { ascending: false }).range(from, to),
    );
  };

  let result = await run(CLIENTE_SELECT_FULL);

  if (result.error && isSchemaError(result.error)) {
    warnings.push(`Alcune colonne cliente non disponibili: ${getErrorMessage(result.error)}`);
    result = await run(CLIENTE_SELECT_MINIMAL);
  }

  if (result.error) {
    throw new Error(`clienti Beltrami: ${getErrorMessage(result.error)}`);
  }

  const clienti = normalizeClienteRows((result.data ?? []) as BeltramiClienteRow[]);
  const lastWhatsappByCliente = await fetchLastWhatsappByClienteIds(
    supabase,
    clienti.map((cliente) => cliente.id),
    warnings,
  );
  const rows = clienti.map((cliente) => ({
    ...cliente,
    lastWhatsappMessage: lastWhatsappByCliente.get(cliente.id) ?? null,
  }));
  const total = result.count ?? rows.length;

  return {
    rows,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    warnings: Array.from(new Set(warnings)),
  };
}

export async function getBeltramiClienteDetail(
  id: number,
): Promise<BeltramiClienteDetail | null> {
  const supabase = createBeltramiSupabaseAdmin();
  const warnings: string[] = [];
  const cliente = await fetchClienteById(supabase, id, warnings);

  if (!cliente) return null;

  const [consensi, whatsappMessages, handoffRichieste] = await Promise.all([
    fetchOptionalRows<BeltramiConsensoRow>(
      "consensi cliente",
      supabase
        .from("beltrami_consensi")
        .select(CONSENSI_SELECT)
        .eq("cliente_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      warnings,
    ),
    fetchOptionalRows<BeltramiWhatsappMessageRow>(
      "storico WhatsApp cliente",
      supabase
        .from("beltrami_whatsapp_messages")
        .select(WHATSAPP_MESSAGE_SELECT)
        .eq("cliente_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
      warnings,
    ),
    fetchOptionalRows<BeltramiHandoffRow>(
      "richieste handoff cliente",
      supabase
        .from("beltrami_handoff_richieste")
        .select(HANDOFF_SELECT)
        .eq("cliente_id", id)
        .order("created_at", { ascending: false })
        .limit(50),
      warnings,
    ),
  ]);

  const whatsappMessageIds = whatsappMessages
    .map((row) => row.whatsapp_message_id)
    .filter((value): value is string => Boolean(value));

  const statuses = await fetchOptionalRows<BeltramiWhatsappStatusRow>(
    "status Meta cliente",
    whatsappMessageIds.length > 0
      ? supabase
          .from("beltrami_whatsapp_statuses")
          .select(WHATSAPP_STATUS_SELECT)
          .in("whatsapp_message_id", whatsappMessageIds)
          .order("timestamp_meta", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [], error: null }),
    warnings,
  );

  const whatsappStatusesByMessageId = new Map<string, BeltramiWhatsappStatusRow[]>();
  for (const status of statuses) {
    if (!status.whatsapp_message_id) continue;
    const current = whatsappStatusesByMessageId.get(status.whatsapp_message_id) ?? [];
    current.push(status);
    whatsappStatusesByMessageId.set(status.whatsapp_message_id, current);
  }

  return {
    cliente,
    consensi,
    whatsappMessages,
    whatsappStatusesByMessageId,
    handoffRichieste,
    warnings: Array.from(new Set(warnings)),
  };
}

export async function getBeltramiActivityTimeline(params: {
  tipo: BeltramiActivityType;
  periodo: BeltramiActivityPeriod;
}): Promise<BeltramiActivityTimeline> {
  const supabase = createBeltramiSupabaseAdmin();
  const warnings: string[] = [];
  const cutoffIso = getPeriodCutoffIso(params.periodo);
  const includeRegistrazioni = params.tipo === "tutte" || params.tipo === "registrazioni";
  const includeWhatsapp = params.tipo === "tutte" || params.tipo === "whatsapp";
  const includeRichieste = params.tipo === "tutte" || params.tipo === "richieste";
  const includeErrori = params.tipo === "tutte" || params.tipo === "errori";

  const buildClientiQuery = () => {
    let query = supabase
      .from("beltrami_clienti")
      .select(CLIENTE_SELECT_FULL)
      .order("created_at", { ascending: false })
      .limit(60);

    if (cutoffIso) query = query.gte("created_at", cutoffIso);
    return query;
  };

  const buildInboundQuery = () => {
    let query = supabase
      .from("beltrami_whatsapp_messages")
      .select(WHATSAPP_MESSAGE_SELECT)
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(60);

    if (cutoffIso) query = query.gte("created_at", cutoffIso);
    return query;
  };

  const buildNotifyQuery = () => {
    let query = supabase
      .from("beltrami_whatsapp_messages")
      .select(WHATSAPP_MESSAGE_SELECT)
      .eq("message_kind", "notify_beltrami")
      .order("created_at", { ascending: false })
      .limit(60);

    if (cutoffIso) query = query.gte("created_at", cutoffIso);
    return query;
  };

  const buildHandoffQuery = () => {
    let query = supabase
      .from("beltrami_handoff_richieste")
      .select(HANDOFF_SELECT)
      .order("created_at", { ascending: false })
      .limit(60);

    if (cutoffIso) query = query.gte("created_at", cutoffIso);
    return query;
  };

  const buildMessageErrorQuery = () => {
    let query = supabase
      .from("beltrami_whatsapp_messages")
      .select(WHATSAPP_MESSAGE_SELECT)
      .in("status", ["failed", "skipped"])
      .order("created_at", { ascending: false })
      .limit(60);

    if (cutoffIso) query = query.gte("created_at", cutoffIso);
    return query;
  };

  const buildStatusErrorQuery = () => {
    let query = supabase
      .from("beltrami_whatsapp_statuses")
      .select(WHATSAPP_STATUS_SELECT)
      .not("error_code", "is", null)
      .order("created_at", { ascending: false })
      .limit(60);

    if (cutoffIso) query = query.gte("created_at", cutoffIso);
    return query;
  };

  const [
    registrazioni,
    inboundMessages,
    notifyMessages,
    handoffRows,
    messageErrors,
    statusErrors,
  ] = await Promise.all([
    includeRegistrazioni ? fetchRecentClientiFromQuery(buildClientiQuery(), warnings) : [],
    includeWhatsapp
      ? fetchOptionalRows<BeltramiWhatsappMessageRow>("messaggi inbound", buildInboundQuery(), warnings)
      : [],
    includeWhatsapp
      ? fetchOptionalRows<BeltramiWhatsappMessageRow>("notifiche interne", buildNotifyQuery(), warnings)
      : [],
    includeRichieste
      ? fetchOptionalRows<BeltramiHandoffRow>("richieste handoff", buildHandoffQuery(), warnings)
      : [],
    includeErrori
      ? fetchOptionalRows<BeltramiWhatsappMessageRow>("errori WhatsApp", buildMessageErrorQuery(), warnings)
      : [],
    includeErrori
      ? fetchOptionalRows<BeltramiWhatsappStatusRow>("errori status Meta", buildStatusErrorQuery(), warnings)
      : [],
  ]);

  const clienteIds = [
    ...inboundMessages.map((row) => Number(row.cliente_id)),
    ...notifyMessages.map((row) => Number(row.cliente_id)),
    ...messageErrors.map((row) => Number(row.cliente_id)),
    ...handoffRows.map((row) => Number(row.cliente_id)),
  ].filter((id) => Number.isFinite(id));
  const clienti = await fetchClientiByIds(supabase, clienteIds, warnings);
  const clienteNames = mapClienteNames(clienti);

  const items: BeltramiActivityItem[] = [
    ...registrazioni.map((cliente) => ({
      id: `registration:${cliente.id}`,
      type: "registration" as const,
      createdAt: cliente.created_at,
      title: `Registrazione QR - ${getClienteName(cliente)}`,
      subtitle: [getClientePhone(cliente), cliente.source, cliente.qr_id].filter(Boolean).join(" - "),
      body: null,
      href: `/beltrami/dashboard/clienti/${cliente.id}`,
      status: cliente.whatsapp_consent ? "Contattabile WhatsApp" : "Consenso WhatsApp/contatto assente",
    })),
    ...inboundMessages.map((row) => ({
      id: `whatsapp_inbound:${row.id}`,
      type: "whatsapp_inbound" as const,
      createdAt: row.created_at,
      title: `WhatsApp inbound - ${clienteNames.get(Number(row.cliente_id)) ?? row.from_phone ?? "Cliente"}`,
      subtitle: [row.from_phone, row.routing_status, row.status].filter(Boolean).join(" - "),
      body: row.body,
      href: row.cliente_id ? `/beltrami/dashboard/clienti/${row.cliente_id}` : null,
      status: row.message_kind,
    })),
    ...notifyMessages.map((row) => ({
      id: `whatsapp_notify:${row.id}`,
      type: "whatsapp_notify" as const,
      createdAt: row.created_at,
      title: `Notifica interna - ${clienteNames.get(Number(row.cliente_id)) ?? row.to_phone ?? "Beltrami"}`,
      subtitle: [row.template_name, row.to_phone, row.status_reason].filter(Boolean).join(" - "),
      body: null,
      href: row.cliente_id ? `/beltrami/dashboard/clienti/${row.cliente_id}` : null,
      status: row.status,
    })),
    ...handoffRows.map((row) => ({
      id: `handoff:${row.id}`,
      type: "handoff" as const,
      createdAt: row.created_at,
      title: `Richiesta handoff - ${row.cliente_nome || clienteNames.get(Number(row.cliente_id)) || row.cliente_phone || "Cliente"}`,
      subtitle: [row.cliente_phone, row.destinazione_nome, row.due_at ? `SLA ${row.due_at}` : null]
        .filter(Boolean)
        .join(" - "),
      body: row.inbound_body,
      href: row.cliente_id ? `/beltrami/dashboard/clienti/${row.cliente_id}` : null,
      status: row.status,
    })),
    ...messageErrors.map((row) => ({
      id: `message_error:${row.id}`,
      type: "error" as const,
      createdAt: row.created_at,
      title: `Errore WhatsApp - ${row.template_name || row.message_kind || "messaggio"}`,
      subtitle: [row.to_phone || row.from_phone, row.status_reason, row.routing_status]
        .filter(Boolean)
        .join(" - "),
      body: null,
      href: row.cliente_id ? `/beltrami/dashboard/clienti/${row.cliente_id}` : null,
      status: row.status,
    })),
    ...statusErrors.map((row) => ({
      id: `status_error:${row.id}`,
      type: "error" as const,
      createdAt: row.timestamp_meta || row.created_at,
      title: `Errore Meta status - ${row.error_title || row.error_code || "callback"}`,
      subtitle: [row.recipient_phone, row.whatsapp_message_id, row.error_code].filter(Boolean).join(" - "),
      body: row.error_message,
      href: null,
      status: row.status,
    })),
  ];

  items.sort((a, b) => getDateValue(b.createdAt) - getDateValue(a.createdAt));

  return {
    items: items.slice(0, 120),
    warnings: Array.from(new Set(warnings)),
  };
}

async function fetchRecentClientiFromQuery(
  request: PromiseLike<unknown>,
  warnings: string[],
): Promise<BeltramiClienteRow[]> {
  const first = await readQueryResult(request);
  if (!first.error) {
    return normalizeClienteRows((first.data ?? []) as BeltramiClienteRow[]);
  }

  if (!isSchemaError(first.error)) {
    throw new Error(`registrazioni clienti: ${getErrorMessage(first.error)}`);
  }

  warnings.push(`Alcune colonne cliente non disponibili: ${getErrorMessage(first.error)}`);
  return [];
}
