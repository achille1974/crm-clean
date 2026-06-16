import Link from "next/link";
import type { ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const MARKETING_MESSAGE_COST_EUR = 0.0522;
const MAX_OPPORTUNITY_ROWS = 1500;
const MAX_BATCH_LOG_ROWS = 4000;
const MAX_RESPONSE_ROWS = 4000;

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type OpportunityRow = {
  id: number | string;
  cliente_id: number | null;
  opportunita_code: string | null;
  opportunita_label: string | null;
  send_mode: string | null;
  batch_id: string | null;
  messaggio: string | null;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  negozio_contatto: string | null;
  negozio_id: number | null;
  inviato_at: string | null;
  sent_at: string | null;
  created_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ConversationRow = {
  id: number | string;
  created_at: string | null;
  cliente_id: number | null;
  canale: string | null;
  intent: string | null;
  stato: string | null;
  messaggio_utente: string | null;
  risposta_agente: string | null;
  metadata: Record<string, unknown> | null;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  negozio_id: number | null;
};

type MetaErrorSummary = {
  label: string;
  code: string | null;
  fbtraceIds: Set<string>;
  count: number;
};

type CampaignDraft = {
  key: string;
  batchId: string | null;
  opportunities: OpportunityRow[];
  logs: ConversationRow[];
  responseCount: number;
};

type CampaignItem = {
  key: string;
  batchId: string | null;
  sentAt: string | null;
  templateName: string;
  sendType: string;
  selectedCount: number;
  alreadyExcludedCount: number;
  estimatedSendableCount: number;
  sentCount: number;
  failedCount: number;
  skippedCount: number;
  estimatedCost: number;
  realCost: number;
  responseCount: number;
  costPerResponse: number | null;
  message: string;
  attachmentUrl: string | null;
  attachmentFileName: string | null;
  metaErrors: MetaErrorSummary[];
  fbtraceIds: string[];
  negozioIds: Set<number>;
  negozioLabels: string[];
  clientNames: string[];
  searchText: string;
};

type Filters = {
  dataDa: string;
  dataA: string;
  template: string;
  tipoInvio: string;
  stato: "tutte" | "con_errori" | "senza_errori";
  negozio: string;
  q: string;
};

const NEGOZI: Record<number, string> = {
  1: "Floridia",
  2: "Augusta",
  3: "Siracusa",
  4: "Avola",
  5: "Tabacchino Floridia",
};

const currencyFormatter = new Intl.NumberFormat("it-IT", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

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

function getFilters(params: Record<string, string | string[] | undefined>): Filters {
  const statoRaw = getSingleValue(params.stato);

  return {
    dataDa: getSingleValue(params.data_da),
    dataA: getSingleValue(params.data_a),
    template: getSingleValue(params.template),
    tipoInvio: getSingleValue(params.tipo_invio),
    stato:
      statoRaw === "con_errori" || statoRaw === "senza_errori" ? statoRaw : "tutte",
    negozio: getSingleValue(params.negozio),
    q: getSingleValue(params.q).trim(),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeSearch(value: string): string {
  return value.toLowerCase().trim();
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

function formatCurrency(value: number) {
  return currencyFormatter.format(value);
}

function truncateText(value: string, maxLength: number) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}...`;
}

function getRowDate(row: OpportunityRow): string | null {
  return row.inviato_at || row.sent_at || row.created_at || null;
}

function getMetadata(row: OpportunityRow | ConversationRow): Record<string, unknown> {
  return row.metadata && isRecord(row.metadata) ? row.metadata : {};
}

function getMetadataString(row: OpportunityRow | ConversationRow, keys: string[]): string {
  const metadata = getMetadata(row);

  for (const key of keys) {
    const value = readString(metadata[key]);
    if (value) return value;
  }

  return "";
}

function getMetadataNumber(row: OpportunityRow | ConversationRow, keys: string[]): number | null {
  const metadata = getMetadata(row);

  for (const key of keys) {
    const value = readNumber(metadata[key]);
    if (value !== null) return value;
  }

  return null;
}

function getTemplateName(row: OpportunityRow | ConversationRow): string {
  return (
    getMetadataString(row, ["template_name", "template_usato"]) ||
    ("send_mode" in row ? readString(row.send_mode) : "") ||
    "Non indicato"
  );
}

function getSendType(row: OpportunityRow | ConversationRow): string {
  return (
    ("send_mode" in row ? readString(row.send_mode) : "") ||
    getMetadataString(row, ["tipo_invio", "send_mode", "message_mode"]) ||
    "standard"
  );
}

function getBatchId(row: OpportunityRow | ConversationRow): string | null {
  return (
    readString("batch_id" in row ? row.batch_id : null) ||
    getMetadataString(row, ["batch_id"]) ||
    null
  );
}

function getCampaignKeyFromOpportunity(row: OpportunityRow): string {
  const batchId = getBatchId(row);
  if (batchId) return `batch:${batchId}`;
  return `single:${row.id}`;
}

function getCampaignKeyFromLog(row: ConversationRow): string | null {
  const batchId = getBatchId(row);
  if (batchId) return `batch:${batchId}`;
  if (row.stato === "errore" || row.stato === "saltato") return `log:${row.id}`;
  return null;
}

function getClienteName(cliente: ClienteRow | undefined, clienteId: number): string {
  if (!cliente) return `Cliente ${clienteId}`;

  return (
    [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() ||
    `Cliente ${cliente.id}`
  );
}

function getNegozioLabel(negozioId: number | null | undefined): string | null {
  if (!negozioId) return null;
  return NEGOZI[negozioId] ?? `Negozio ${negozioId}`;
}

function getAttemptRecords(metadata: Record<string, unknown>): Record<string, unknown>[] {
  const attempts = metadata.meta_send_attempts;
  if (!Array.isArray(attempts)) return [];
  return attempts.filter(isRecord);
}

function getMetaErrorParts(row: ConversationRow | OpportunityRow): MetaErrorSummary[] {
  const metadata = getMetadata(row);
  const attempts = getAttemptRecords(metadata);
  const errors: MetaErrorSummary[] = [];

  for (const attempt of attempts) {
    if (readString(attempt.status) !== "error") continue;

    const code = readNumber(attempt.error_code);
    const label =
      readString(attempt.error_message) ||
      readString(attempt.message) ||
      (code !== null ? `Meta code ${code}` : "Errore Meta");
    const fbtraceId = readString(attempt.fbtrace_id);

    errors.push({
      label,
      code: code !== null ? String(code) : null,
      fbtraceIds: new Set(fbtraceId ? [fbtraceId] : []),
      count: 1,
    });
  }

  if (errors.length > 0) return errors;

  const metadataCode = readNumber(metadata.meta_error_code);
  const metadataFbtraceId = readString(metadata.meta_fbtrace_id);
  const fallbackText =
    "risposta_agente" in row ? readString(row.risposta_agente) : "";

  if (
    metadataCode !== null ||
    metadataFbtraceId ||
    ("stato" in row && row.stato === "errore")
  ) {
    return [
      {
        label:
          fallbackText ||
          (metadataCode !== null ? `Meta code ${metadataCode}` : "Errore Meta"),
        code: metadataCode !== null ? String(metadataCode) : null,
        fbtraceIds: new Set(metadataFbtraceId ? [metadataFbtraceId] : []),
        count: 1,
      },
    ];
  }

  return [];
}

function mergeErrorSummaries(rows: Array<ConversationRow | OpportunityRow>): MetaErrorSummary[] {
  const byKey = new Map<string, MetaErrorSummary>();

  for (const row of rows) {
    for (const error of getMetaErrorParts(row)) {
      const key = `${error.code || "no_code"}:${error.label}`;
      const current = byKey.get(key);

      if (current) {
        current.count += error.count;
        error.fbtraceIds.forEach((fbtraceId) => current.fbtraceIds.add(fbtraceId));
      } else {
        byKey.set(key, {
          label: error.label,
          code: error.code,
          fbtraceIds: new Set(error.fbtraceIds),
          count: error.count,
        });
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => b.count - a.count);
}

function getFbtraceIds(rows: Array<ConversationRow | OpportunityRow>): string[] {
  const ids = new Set<string>();

  for (const row of rows) {
    const metadata = getMetadata(row);
    const metadataFbtraceId = readString(metadata.meta_fbtrace_id);
    if (metadataFbtraceId) ids.add(metadataFbtraceId);

    for (const attempt of getAttemptRecords(metadata)) {
      const fbtraceId = readString(attempt.fbtrace_id);
      if (fbtraceId) ids.add(fbtraceId);
    }
  }

  return Array.from(ids).sort();
}

function getSelectedCount(rows: Array<OpportunityRow | ConversationRow>, fallback: number): number {
  let selectedCount = 0;

  for (const row of rows) {
    const count = getMetadataNumber(row, [
      "selected_client_count",
      "numero_clienti_selezionati",
    ]);

    if (count !== null && count > selectedCount) {
      selectedCount = Math.round(count);
    }
  }

  return selectedCount > 0 ? selectedCount : fallback;
}

function getFirstNonEmpty(values: string[]): string {
  return values.map((value) => value.trim()).find(Boolean) ?? "";
}

function isInboundCustomerConversation(row: ConversationRow): boolean {
  if (row.canale !== "whatsapp") return false;
  if (readString(row.messaggio_utente).startsWith("[dashboard]")) return false;
  if (row.intent === "dashboard_opportunita_send_batch") return false;

  const metadata = getMetadata(row);
  const source = readString(metadata.source);
  const origin = isRecord(metadata.origin) ? metadata.origin : null;
  const originSource = origin ? readString(origin.source) : "";

  return source === "whatsapp_inbound" || originSource === "whatsapp_inbound";
}

function addResponseAttribution(campaigns: CampaignDraft[], rows: ConversationRow[]) {
  const campaignsByCliente = new Map<number, CampaignDraft[]>();

  for (const campaign of campaigns) {
    const clienteIds = new Set<number>();

    for (const row of campaign.opportunities) {
      if (row.cliente_id) clienteIds.add(row.cliente_id);
    }

    for (const row of campaign.logs) {
      if (row.cliente_id) clienteIds.add(row.cliente_id);
    }

    for (const clienteId of clienteIds) {
      const current = campaignsByCliente.get(clienteId) ?? [];
      current.push(campaign);
      campaignsByCliente.set(clienteId, current);
    }
  }

  for (const campaignList of campaignsByCliente.values()) {
    campaignList.sort((a, b) => {
      const aTime = getCampaignStartTime(a);
      const bTime = getCampaignStartTime(b);
      return bTime - aTime;
    });
  }

  for (const row of rows.filter(isInboundCustomerConversation)) {
    if (!row.cliente_id || !row.created_at) continue;

    const responseTime = new Date(row.created_at).getTime();
    if (!Number.isFinite(responseTime)) continue;

    const campaign = (campaignsByCliente.get(row.cliente_id) ?? []).find(
      (item) => getCampaignStartTime(item) <= responseTime,
    );

    if (campaign) {
      campaign.responseCount += 1;
    }
  }
}

function getCampaignStartTime(campaign: CampaignDraft): number {
  const dates = [
    ...campaign.opportunities.map(getRowDate),
    ...campaign.logs.map((row) => row.created_at),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);

  return dates.length > 0 ? Math.min(...dates) : 0;
}

function getCampaignDate(campaign: CampaignDraft): string | null {
  const dates = [
    ...campaign.opportunities.map(getRowDate),
    ...campaign.logs.map((row) => row.created_at),
  ]
    .filter((value): value is string => Boolean(value))
    .sort();

  return dates[0] ?? null;
}

function buildCampaigns(
  opportunities: OpportunityRow[],
  logs: ConversationRow[],
  clientiById: Map<number, ClienteRow>,
): CampaignItem[] {
  const drafts = new Map<string, CampaignDraft>();

  function getOrCreate(key: string, batchId: string | null): CampaignDraft {
    const current = drafts.get(key);
    if (current) return current;

    const draft: CampaignDraft = {
      key,
      batchId,
      opportunities: [],
      logs: [],
      responseCount: 0,
    };

    drafts.set(key, draft);
    return draft;
  }

  for (const row of opportunities) {
    const key = getCampaignKeyFromOpportunity(row);
    getOrCreate(key, getBatchId(row)).opportunities.push(row);
  }

  for (const row of logs) {
    const key = getCampaignKeyFromLog(row);
    if (!key) continue;
    getOrCreate(key, getBatchId(row)).logs.push(row);
  }

  return Array.from(drafts.values())
    .map((campaign) => {
      const allRows: Array<OpportunityRow | ConversationRow> = [
        ...campaign.opportunities,
        ...campaign.logs,
      ];
      const sentCount = Math.max(
        campaign.opportunities.length,
        campaign.logs.filter((row) => row.stato === "completato").length,
      );
      const failedCount = campaign.logs.filter((row) => row.stato === "errore").length;
      const skippedCount = campaign.logs.filter((row) => row.stato === "saltato").length;
      const clientIds = new Set<number>();
      const negozioIds = new Set<number>();
      const negozioLabels = new Set<string>();

      for (const row of allRows) {
        if (row.cliente_id) {
          clientIds.add(row.cliente_id);
          const cliente = clientiById.get(row.cliente_id);
          if (cliente?.negozio_id) negozioIds.add(cliente.negozio_id);
        }

        if ("negozio_id" in row && row.negozio_id) negozioIds.add(row.negozio_id);

        const negozioContatto =
          "negozio_contatto" in row
            ? readString(row.negozio_contatto)
            : getMetadataString(row, ["negozio_contatto"]);

        if (negozioContatto) negozioLabels.add(negozioContatto);
      }

      for (const negozioId of negozioIds) {
        const label = getNegozioLabel(negozioId);
        if (label) negozioLabels.add(label);
      }

      const selectedCount = getSelectedCount(
        allRows,
        clientIds.size || sentCount + failedCount + skippedCount,
      );
      const alreadyExcludedCount = Math.max(
        skippedCount,
        selectedCount > 0 ? selectedCount - sentCount - failedCount : 0,
        0,
      );
      const estimatedSendableCount =
        selectedCount > 0
          ? Math.max(0, selectedCount - alreadyExcludedCount)
          : sentCount + failedCount;
      const templateName = getFirstNonEmpty(allRows.map(getTemplateName)) || "Non indicato";
      const sendType = getFirstNonEmpty(allRows.map(getSendType)) || "standard";
      const message = getFirstNonEmpty([
        ...campaign.opportunities.map((row) => readString(row.messaggio)),
        ...campaign.logs.map((row) => readString(row.risposta_agente)),
      ]);
      const attachmentUrl = getFirstNonEmpty([
        ...campaign.opportunities.map((row) => readString(row.attachment_public_url)),
        ...allRows.map((row) => getMetadataString(row, ["attachment_public_url", "media_url"])),
      ]);
      const attachmentFileName = getFirstNonEmpty([
        ...campaign.opportunities.map((row) => readString(row.attachment_file_name)),
        ...allRows.map((row) => getMetadataString(row, ["attachment_file_name"])),
      ]);
      const clientNames = Array.from(clientIds)
        .map((clienteId) => getClienteName(clientiById.get(clienteId), clienteId))
        .sort((a, b) => a.localeCompare(b, "it"));
      const metaErrors = mergeErrorSummaries(allRows);
      const fbtraceIds = getFbtraceIds(allRows);
      const realCost = sentCount * MARKETING_MESSAGE_COST_EUR;
      const responseCount = campaign.responseCount;
      const costPerResponse = responseCount > 0 ? realCost / responseCount : null;
      const sentAt = getCampaignDate(campaign);
      const searchableValues = [
        campaign.batchId ?? campaign.key,
        sentAt ?? "",
        templateName,
        sendType,
        message,
        attachmentFileName ?? "",
        Array.from(negozioLabels).join(" "),
        clientNames.join(" "),
        metaErrors.map((error) => error.label).join(" "),
        fbtraceIds.join(" "),
      ];

      return {
        key: campaign.key,
        batchId: campaign.batchId,
        sentAt,
        templateName,
        sendType,
        selectedCount,
        alreadyExcludedCount,
        estimatedSendableCount,
        sentCount,
        failedCount,
        skippedCount,
        estimatedCost: estimatedSendableCount * MARKETING_MESSAGE_COST_EUR,
        realCost,
        responseCount,
        costPerResponse,
        message,
        attachmentUrl: attachmentUrl || null,
        attachmentFileName: attachmentFileName || null,
        metaErrors,
        fbtraceIds,
        negozioIds,
        negozioLabels: Array.from(negozioLabels).sort((a, b) => a.localeCompare(b, "it")),
        clientNames,
        searchText: normalizeSearch(searchableValues.join(" ")),
      };
    })
    .sort((a, b) => {
      const aTime = a.sentAt ? new Date(a.sentAt).getTime() : 0;
      const bTime = b.sentAt ? new Date(b.sentAt).getTime() : 0;
      return bTime - aTime;
    });
}

function campaignMatchesFilters(campaign: CampaignItem, filters: Filters): boolean {
  if (filters.template && campaign.templateName !== filters.template) return false;
  if (filters.tipoInvio && campaign.sendType !== filters.tipoInvio) return false;
  if (filters.stato === "con_errori" && campaign.failedCount === 0) return false;
  if (filters.stato === "senza_errori" && campaign.failedCount > 0) return false;

  if (filters.negozio) {
    const negozioId = Number(filters.negozio);
    if (!Number.isFinite(negozioId) || !campaign.negozioIds.has(negozioId)) {
      return false;
    }
  }

  if (filters.q && !campaign.searchText.includes(normalizeSearch(filters.q))) {
    return false;
  }

  return true;
}

async function fetchClienti(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteIds: number[],
): Promise<Map<number, ClienteRow>> {
  if (clienteIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, negozio_id")
    .in("id", clienteIds);

  if (error) {
    throw new Error(`Errore lettura clienti campagne: ${error.message}`);
  }

  return new Map(((data ?? []) as ClienteRow[]).map((row) => [row.id, row]));
}

async function fetchResponseRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteIds: number[],
  minDate: string | null,
): Promise<ConversationRow[]> {
  if (clienteIds.length === 0 || !minDate) return [];

  const { data, error } = await supabase
    .from("phonesia_conversazioni")
    .select(
      "id, created_at, cliente_id, canale, intent, stato, messaggio_utente, risposta_agente, metadata",
    )
    .in("cliente_id", clienteIds)
    .gte("created_at", minDate)
    .order("created_at", { ascending: false })
    .limit(MAX_RESPONSE_ROWS);

  if (error) {
    throw new Error(`Errore lettura risposte campagne: ${error.message}`);
  }

  return (data ?? []) as ConversationRow[];
}

function getUniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b, "it"));
}

function getTotals(campaigns: CampaignItem[]) {
  return campaigns.reduce(
    (totals, campaign) => ({
      selected: totals.selected + campaign.selectedCount,
      sent: totals.sent + campaign.sentCount,
      failed: totals.failed + campaign.failedCount,
      skipped: totals.skipped + campaign.skippedCount,
      estimatedCost: totals.estimatedCost + campaign.estimatedCost,
      realCost: totals.realCost + campaign.realCost,
      responses: totals.responses + campaign.responseCount,
    }),
    {
      selected: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      estimatedCost: 0,
      realCost: 0,
      responses: 0,
    },
  );
}

export default async function PhonesiaCampagneWhatsappPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const filters = getFilters(resolvedParams);
  const supabase = getSupabaseAdmin();

  let opportunityQuery = supabase
    .from("phonesia_opportunita_inviate")
    .select(
      "id, cliente_id, opportunita_code, opportunita_label, send_mode, batch_id, messaggio, attachment_public_url, attachment_file_name, negozio_contatto, negozio_id, inviato_at, sent_at, created_at, metadata",
    )
    .order("inviato_at", { ascending: false })
    .limit(MAX_OPPORTUNITY_ROWS);

  let batchLogQuery = supabase
    .from("phonesia_conversazioni")
    .select(
      "id, created_at, cliente_id, canale, intent, stato, messaggio_utente, risposta_agente, metadata",
    )
    .eq("intent", "dashboard_opportunita_send_batch")
    .order("created_at", { ascending: false })
    .limit(MAX_BATCH_LOG_ROWS);

  if (filters.dataDa) {
    opportunityQuery = opportunityQuery.gte("inviato_at", `${filters.dataDa}T00:00:00`);
    batchLogQuery = batchLogQuery.gte("created_at", `${filters.dataDa}T00:00:00`);
  }

  if (filters.dataA) {
    opportunityQuery = opportunityQuery.lte("inviato_at", `${filters.dataA}T23:59:59`);
    batchLogQuery = batchLogQuery.lte("created_at", `${filters.dataA}T23:59:59`);
  }

  const [
    { data: opportunityData, error: opportunityError },
    { data: batchLogData, error: batchLogError },
  ] = await Promise.all([opportunityQuery, batchLogQuery]);

  if (opportunityError) {
    throw new Error(`Errore lettura opportunità inviate: ${opportunityError.message}`);
  }

  if (batchLogError) {
    throw new Error(`Errore lettura log campagne: ${batchLogError.message}`);
  }

  const opportunities = (opportunityData ?? []) as OpportunityRow[];
  const batchLogs = (batchLogData ?? []) as ConversationRow[];
  const allClienteIds = Array.from(
    new Set(
      [...opportunities, ...batchLogs]
        .map((row) => row.cliente_id)
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value)),
    ),
  );
  const clientiById = await fetchClienti(supabase, allClienteIds);
  const draftsForResponses = new Map<string, CampaignDraft>();

  for (const row of opportunities) {
    const key = getCampaignKeyFromOpportunity(row);
    const current = draftsForResponses.get(key) ?? {
      key,
      batchId: getBatchId(row),
      opportunities: [],
      logs: [],
      responseCount: 0,
    };
    current.opportunities.push(row);
    draftsForResponses.set(key, current);
  }

  for (const row of batchLogs) {
    const key = getCampaignKeyFromLog(row);
    if (!key) continue;
    const current = draftsForResponses.get(key) ?? {
      key,
      batchId: getBatchId(row),
      opportunities: [],
      logs: [],
      responseCount: 0,
    };
    current.logs.push(row);
    draftsForResponses.set(key, current);
  }

  const responseMinDate =
    Array.from(draftsForResponses.values())
      .map(getCampaignStartTime)
      .filter((value) => value > 0)
      .sort((a, b) => a - b)[0] ?? null;
  const responseRows = await fetchResponseRows(
    supabase,
    allClienteIds,
    responseMinDate ? new Date(responseMinDate).toISOString() : null,
  );
  const responseDrafts = Array.from(draftsForResponses.values());
  addResponseAttribution(responseDrafts, responseRows);

  const responseCountsByKey = new Map(
    responseDrafts.map((campaign) => [campaign.key, campaign.responseCount]),
  );
  const campaigns = buildCampaigns(opportunities, batchLogs, clientiById).map((campaign) => {
    const responseCount = responseCountsByKey.get(campaign.key) ?? 0;
    const costPerResponse = responseCount > 0 ? campaign.realCost / responseCount : null;

    return {
      ...campaign,
      responseCount,
      costPerResponse,
    };
  });
  const templateOptions = getUniqueOptions(campaigns.map((campaign) => campaign.templateName));
  const tipoInvioOptions = getUniqueOptions(campaigns.map((campaign) => campaign.sendType));
  const filteredCampaigns = campaigns.filter((campaign) =>
    campaignMatchesFilters(campaign, filters),
  );
  const totals = getTotals(filteredCampaigns);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-sm md:px-8 md:py-8">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <Link
                href="/phonesia/dashboard"
                className="mb-4 inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
              >
                Torna alla dashboard
              </Link>

              <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                WhatsApp
              </div>

              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Campagne WhatsApp
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 md:text-base">
                Controllo operativo degli invii marketing: costi stimati, costi reali,
                errori Meta e risposte ricevute dai clienti.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Costo marketing unitario:{" "}
              <strong className="text-slate-950">
                {MARKETING_MESSAGE_COST_EUR.toLocaleString("it-IT", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}{" "}
                EUR
              </strong>
            </div>
          </div>
        </section>

        <form className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data da
              </span>
              <input
                type="date"
                name="data_da"
                defaultValue={filters.dataDa}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Data a
              </span>
              <input
                type="date"
                name="data_a"
                defaultValue={filters.dataA}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Template
              </span>
              <select
                name="template"
                defaultValue={filters.template}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="">Tutti</option>
                {templateOptions.map((template) => (
                  <option key={template} value={template}>
                    {template}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tipo invio
              </span>
              <select
                name="tipo_invio"
                defaultValue={filters.tipoInvio}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="">Tutti</option>
                {tipoInvioOptions.map((tipoInvio) => (
                  <option key={tipoInvio} value={tipoInvio}>
                    {tipoInvio}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Stato
              </span>
              <select
                name="stato"
                defaultValue={filters.stato}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="tutte">Tutte</option>
                <option value="con_errori">Con errori</option>
                <option value="senza_errori">Senza errori</option>
              </select>
            </label>

            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Negozio
              </span>
              <select
                name="negozio"
                defaultValue={filters.negozio}
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="">Tutti</option>
                {Object.entries(NEGOZI).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
            <label className="block flex-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Ricerca
              </span>
              <input
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="Batch, template, errore, fbtrace, messaggio"
                className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
            </label>

            <button
              type="submit"
              className="rounded-2xl bg-orange-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-orange-600"
            >
              Filtra
            </button>

            <Link
              href="/phonesia/dashboard/campagne"
              className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2.5 text-center text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              Reset
            </Link>
          </div>
        </form>

        <section className="grid gap-4 md:grid-cols-4">
          <SummaryCard label="Campagne" value={String(filteredCampaigns.length)} />
          <SummaryCard label="Clienti selezionati" value={String(totals.selected)} />
          <SummaryCard label="Inviati" value={String(totals.sent)} />
          <SummaryCard label="Risposte generate" value={String(totals.responses)} />
          <SummaryCard label="Falliti" value={String(totals.failed)} />
          <SummaryCard label="Saltati" value={String(totals.skipped)} />
          <SummaryCard label="Costo stimato" value={formatCurrency(totals.estimatedCost)} />
          <SummaryCard label="Costo reale" value={formatCurrency(totals.realCost)} />
        </section>

        <section className="space-y-4">
          {filteredCampaigns.length === 0 ? (
            <div className="rounded-3xl border border-slate-200 bg-white px-5 py-8 text-sm text-slate-600 shadow-sm">
              Nessuna campagna trovata con i filtri selezionati.
            </div>
          ) : (
            filteredCampaigns.map((campaign) => (
              <article
                key={campaign.key}
                className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                        {campaign.batchId ? "Batch" : "Invio"}
                      </span>
                      <span className="text-sm font-semibold text-slate-500">
                        {campaign.batchId ?? campaign.key.replace(/^single:/, "#")}
                      </span>
                    </div>

                    <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
                      {campaign.templateName}
                    </h2>

                    <div className="mt-2 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {formatDate(campaign.sentAt)}
                      </span>
                      <span className="rounded-full bg-slate-100 px-3 py-1">
                        {campaign.sendType}
                      </span>
                      {campaign.negozioLabels.map((label) => (
                        <span key={label} className="rounded-full bg-slate-100 px-3 py-1">
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="grid min-w-full gap-3 sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
                    <MiniMetric label="Selezionati" value={String(campaign.selectedCount)} />
                    <MiniMetric
                      label="Già inviati/esclusi"
                      value={String(campaign.alreadyExcludedCount)}
                    />
                    <MiniMetric label="Inviati" value={String(campaign.sentCount)} />
                    <MiniMetric label="Falliti" value={String(campaign.failedCount)} />
                    <MiniMetric label="Saltati" value={String(campaign.skippedCount)} />
                    <MiniMetric
                      label="Costo stimato"
                      value={formatCurrency(campaign.estimatedCost)}
                    />
                    <MiniMetric label="Costo reale" value={formatCurrency(campaign.realCost)} />
                    <MiniMetric
                      label="Costo per risposta"
                      value={
                        campaign.costPerResponse === null
                          ? "-"
                          : formatCurrency(campaign.costPerResponse)
                      }
                    />
                  </div>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                  <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="mb-2 text-sm font-semibold text-slate-900">
                      Messaggio inviato
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {campaign.message ? truncateText(campaign.message, 700) : "-"}
                    </div>
                  </section>

                  <section className="space-y-3">
                    <InfoRow
                      label="Clienti da inviare"
                      value={String(campaign.estimatedSendableCount)}
                    />
                    <InfoRow
                      label="Risposte generate"
                      value={String(campaign.responseCount)}
                    />
                    <InfoRow
                      label="Allegato"
                      value={
                        campaign.attachmentUrl ? (
                          <a
                            href={campaign.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="font-semibold text-orange-700 underline-offset-2 hover:underline"
                          >
                            {campaign.attachmentFileName || "Apri allegato"}
                          </a>
                        ) : (
                          "-"
                        )
                      }
                    />
                    <InfoRow
                      label="fbtrace_id"
                      value={
                        campaign.fbtraceIds.length > 0
                          ? campaign.fbtraceIds.slice(0, 4).join(", ")
                          : "-"
                      }
                    />
                  </section>
                </div>

                <section className="mt-4 rounded-2xl border border-slate-200 bg-white px-4 py-4">
                  <div className="mb-2 text-sm font-semibold text-slate-900">
                    Errori Meta principali
                  </div>

                  {campaign.metaErrors.length === 0 ? (
                    <div className="text-sm text-slate-500">-</div>
                  ) : (
                    <div className="space-y-2">
                      {campaign.metaErrors.slice(0, 4).map((error) => (
                        <div
                          key={`${error.code || "no-code"}-${error.label}`}
                          className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-900"
                        >
                          <div className="font-semibold">
                            {error.count}x {truncateText(error.label, 220)}
                          </div>
                          <div className="mt-1 text-xs text-rose-700">
                            {error.code ? `code ${error.code}` : "code non indicato"}
                            {error.fbtraceIds.size > 0
                              ? ` - fbtrace ${Array.from(error.fbtraceIds).slice(0, 3).join(", ")}`
                              : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-lg font-black text-slate-950">{value}</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-1 break-words text-slate-900">{value}</div>
    </div>
  );
}
