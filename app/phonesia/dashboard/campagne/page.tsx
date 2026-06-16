import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const WHATSAPP_MARKETING_MESSAGE_COST_EUR = 0.0522;
const MAX_OPPORTUNITY_ROWS = 1500;
const MAX_BATCH_LOG_ROWS = 4000;
const MAX_RESPONSE_ROWS = 4000;

type CampaignSection = "dettaglio" | "clienti" | "errori" | "risposte" | "costi";

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
  telefono: string | null;
  negozio_id: number | null;
};

type WhatsappMessageStatusRow = {
  whatsapp_message_id: string | null;
  status: "sent" | "delivered" | "read" | "failed" | string | null;
  recipient_phone: string | null;
  timestamp_meta: string | null;
  created_at: string | null;
  pricing_category: string | null;
  pricing_billable: boolean | null;
  error_code: string | null;
  error_title: string | null;
  error_message: string | null;
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

type CampaignStatusSummary = {
  hasDeliveryStatus: boolean;
  deliveredCount: number | null;
  readCount: number | null;
  failedCount: number | null;
  billableDeliveredCount: number | null;
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
  deliveredCount: number | null;
  readCount: number | null;
  hasDeliveryStatus: boolean;
  billableEstimatedCost: number | null;
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

function normalizePhoneDigits(value: string | null | undefined): string {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("39") && digits.length > 10) return digits;
  if (digits.startsWith("3") && digits.length >= 9) return `39${digits}`;
  return digits;
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

function readMessageStatus(value: unknown): "delivered" | "read" | "sent" | "failed" | null {
  const status = readString(value).toLowerCase();

  if (
    status === "delivered" ||
    status === "read" ||
    status === "sent" ||
    status === "failed"
  ) {
    return status;
  }

  return null;
}

function getExplicitWhatsappStatuses(row: OpportunityRow | ConversationRow) {
  const metadata = getMetadata(row);
  const statuses: Array<"delivered" | "read" | "sent" | "failed"> = [];
  const directKeys = [
    "whatsapp_status",
    "message_status",
    "delivery_status",
    "wa_status",
    "meta_message_status",
  ];

  for (const key of directKeys) {
    const status = readMessageStatus(metadata[key]);
    if (status) statuses.push(status);
  }

  const statusContainers = [
    metadata.statuses,
    metadata.message_statuses,
    metadata.whatsapp_statuses,
  ];

  for (const container of statusContainers) {
    if (!Array.isArray(container)) continue;

    for (const item of container) {
      const status = isRecord(item) ? readMessageStatus(item.status) : readMessageStatus(item);
      if (status) statuses.push(status);
    }
  }

  return statuses;
}

function getWhatsappMessageIds(row: OpportunityRow | ConversationRow): string[] {
  const metadata = getMetadata(row);
  const ids = new Set<string>();
  const directKeys = [
    "whatsapp_message_id",
    "message_id",
    "meta_message_id",
    "wa_message_id",
  ];

  for (const key of directKeys) {
    const value = readString(metadata[key]);
    if (value) ids.add(value);
  }

  for (const attempt of getAttemptRecords(metadata)) {
    for (const key of directKeys) {
      const value = readString(attempt[key]);
      if (value) ids.add(value);
    }
  }

  return Array.from(ids);
}

function getStatusRank(status: string | null): number {
  if (status === "read") return 4;
  if (status === "delivered") return 3;
  if (status === "sent") return 2;
  if (status === "failed") return 1;
  return 0;
}

function getCampaignStatusSummaryFromWebhookRows(
  campaign: CampaignDraft,
  rows: Array<OpportunityRow | ConversationRow>,
  clientiById: Map<number, ClienteRow>,
  whatsappStatuses: WhatsappMessageStatusRow[],
): CampaignStatusSummary | null {
  if (whatsappStatuses.length === 0) return null;

  const messageIds = new Set(rows.flatMap(getWhatsappMessageIds));
  const campaignStartTime = getCampaignStartTime(campaign);
  const campaignEndTime = campaignStartTime + 7 * 24 * 60 * 60 * 1000;
  const phones = new Set<string>();

  for (const row of rows) {
    if (!row.cliente_id) continue;
    const phone = normalizePhoneDigits(clientiById.get(row.cliente_id)?.telefono);
    if (phone) phones.add(phone);
  }

  const matchingStatuses = whatsappStatuses.filter((row) => {
    const messageId = readString(row.whatsapp_message_id);
    if (messageId && messageIds.has(messageId)) return true;

    if (messageIds.size > 0) return false;

    const phone = normalizePhoneDigits(row.recipient_phone);
    if (!phone || !phones.has(phone)) return false;

    const statusTime = new Date(row.timestamp_meta || row.created_at || "").getTime();
    if (!Number.isFinite(statusTime) || campaignStartTime <= 0) return false;

    return statusTime >= campaignStartTime && statusTime <= campaignEndTime;
  });

  if (matchingStatuses.length === 0) return null;

  const latestByMessage = new Map<string, WhatsappMessageStatusRow>();

  for (const row of matchingStatuses) {
    const messageKey =
      readString(row.whatsapp_message_id) ||
      `${normalizePhoneDigits(row.recipient_phone)}:${row.timestamp_meta ?? row.created_at ?? ""}`;
    const current = latestByMessage.get(messageKey);

    if (!current || getStatusRank(row.status) >= getStatusRank(current.status)) {
      latestByMessage.set(messageKey, row);
    }
  }

  const latest = Array.from(latestByMessage.values());
  const deliveredCount = latest.filter((row) => row.status === "delivered").length;
  const readCount = latest.filter((row) => row.status === "read").length;
  const failedCount = latest.filter((row) => row.status === "failed").length;

  return {
    hasDeliveryStatus: true,
    deliveredCount,
    readCount,
    failedCount,
    billableDeliveredCount: deliveredCount + readCount,
  };
}

function getDeliveryStatusSummary(rows: Array<OpportunityRow | ConversationRow>) {
  const statuses = rows.flatMap(getExplicitWhatsappStatuses);

  if (statuses.length === 0) {
    return {
      hasDeliveryStatus: false,
      deliveredCount: null as number | null,
      readCount: null as number | null,
      failedCount: null as number | null,
      billableDeliveredCount: null as number | null,
    };
  }

  const deliveredCount = statuses.filter((status) => status === "delivered").length;
  const readCount = statuses.filter((status) => status === "read").length;
  const failedCount = statuses.filter((status) => status === "failed").length;

  return {
    hasDeliveryStatus: true,
    deliveredCount,
    readCount,
    failedCount,
    billableDeliveredCount: deliveredCount + readCount,
  };
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
  whatsappStatuses: WhatsappMessageStatusRow[],
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
      const deliveryStatusSummary =
        getCampaignStatusSummaryFromWebhookRows(
          campaign,
          allRows,
          clientiById,
          whatsappStatuses,
        ) ?? getDeliveryStatusSummary(allRows);
      const effectiveFailedCount =
        deliveryStatusSummary.failedCount === null
          ? failedCount
          : Math.max(failedCount, deliveryStatusSummary.failedCount);
      const realCost = sentCount * WHATSAPP_MARKETING_MESSAGE_COST_EUR;
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
        failedCount: effectiveFailedCount,
        skippedCount,
        estimatedCost: estimatedSendableCount * WHATSAPP_MARKETING_MESSAGE_COST_EUR,
        realCost,
        deliveredCount: deliveryStatusSummary.deliveredCount,
        readCount: deliveryStatusSummary.readCount,
        hasDeliveryStatus: deliveryStatusSummary.hasDeliveryStatus,
        billableEstimatedCost:
          deliveryStatusSummary.billableDeliveredCount === null
            ? null
            : deliveryStatusSummary.billableDeliveredCount *
              WHATSAPP_MARKETING_MESSAGE_COST_EUR,
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
    .select("id, nome, cognome, telefono, negozio_id")
    .in("id", clienteIds);

  if (error) {
    throw new Error(`Errore lettura clienti campagne: ${error.message}`);
  }

  return new Map(((data ?? []) as ClienteRow[]).map((row) => [row.id, row]));
}

async function fetchWhatsappStatuses(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  phones: string[],
  minDate: string | null,
): Promise<WhatsappMessageStatusRow[]> {
  const normalizedPhones = Array.from(new Set(phones.map(normalizePhoneDigits).filter(Boolean)));

  if (normalizedPhones.length === 0 || !minDate) return [];

  const { data, error } = await supabase
    .from("phonesia_whatsapp_message_statuses")
    .select(
      "whatsapp_message_id, status, recipient_phone, timestamp_meta, created_at, pricing_category, pricing_billable, error_code, error_title, error_message",
    )
    .in("recipient_phone", normalizedPhones)
    .gte("timestamp_meta", minDate)
    .order("timestamp_meta", { ascending: false })
    .limit(5000);

  if (error) {
    console.warn("Status WhatsApp non disponibili per campagne:", error.message);
    return [];
  }

  return (data ?? []) as WhatsappMessageStatusRow[];
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
  const totals = campaigns.reduce(
    (current, campaign) => ({
      selected: current.selected + campaign.selectedCount,
      sent: current.sent + campaign.sentCount,
      failed: current.failed + campaign.failedCount,
      skipped: current.skipped + campaign.skippedCount,
      estimatedCost: current.estimatedCost + campaign.estimatedCost,
      realCost: current.realCost + campaign.realCost,
      billableEstimatedCost:
        current.billableEstimatedCost + (campaign.billableEstimatedCost ?? 0),
      campaignsWithDeliveryStatus:
        current.campaignsWithDeliveryStatus + (campaign.hasDeliveryStatus ? 1 : 0),
      responses: current.responses + campaign.responseCount,
    }),
    {
      selected: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      estimatedCost: 0,
      realCost: 0,
      billableEstimatedCost: 0,
      campaignsWithDeliveryStatus: 0,
      responses: 0,
    },
  );

  const hasDeliveryStatus = totals.campaignsWithDeliveryStatus > 0;
  const costForResponse = hasDeliveryStatus ? totals.billableEstimatedCost : totals.realCost;

  return {
    ...totals,
    hasDeliveryStatus,
    billableEstimatedCost: hasDeliveryStatus ? totals.billableEstimatedCost : null,
    costPerResponse: totals.responses > 0 ? costForResponse / totals.responses : null,
  };
}

function getCampaignSection(value: string): CampaignSection {
  if (
    value === "clienti" ||
    value === "errori" ||
    value === "risposte" ||
    value === "costi"
  ) {
    return value;
  }

  return "dettaglio";
}

function getCampaignDomId(key: string): string {
  return `campagna-${key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

function buildCampaignSectionHref(
  params: Record<string, string | string[] | undefined>,
  campaignKey: string,
  section: CampaignSection,
): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "open" || key === "section") continue;

    const normalizedValue = getSingleValue(value);
    if (normalizedValue) query.set(key, normalizedValue);
  }

  query.set("open", campaignKey);
  query.set("section", section);

  return `/phonesia/dashboard/campagne?${query.toString()}#${getCampaignDomId(campaignKey)}`;
}

function buildCampaignCloseHref(params: Record<string, string | string[] | undefined>): string {
  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (key === "open" || key === "section") continue;

    const normalizedValue = getSingleValue(value);
    if (normalizedValue) query.set(key, normalizedValue);
  }

  const queryString = query.toString();
  return queryString ? `/phonesia/dashboard/campagne?${queryString}` : "/phonesia/dashboard/campagne";
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
  const minStatusDate = responseMinDate ? new Date(responseMinDate).toISOString() : null;
  const clientePhones = Array.from(clientiById.values())
    .map((cliente) => cliente.telefono)
    .filter((value): value is string => Boolean(value));
  const [responseRows, whatsappStatuses] = await Promise.all([
    fetchResponseRows(supabase, allClienteIds, minStatusDate),
    fetchWhatsappStatuses(supabase, clientePhones, minStatusDate),
  ]);
  const responseDrafts = Array.from(draftsForResponses.values());
  addResponseAttribution(responseDrafts, responseRows);

  const responseCountsByKey = new Map(
    responseDrafts.map((campaign) => [campaign.key, campaign.responseCount]),
  );
  const campaigns = buildCampaigns(
    opportunities,
    batchLogs,
    clientiById,
    whatsappStatuses,
  ).map((campaign) => {
    const responseCount = responseCountsByKey.get(campaign.key) ?? 0;
    const costForResponse = campaign.billableEstimatedCost ?? campaign.realCost;
    const costPerResponse = responseCount > 0 ? costForResponse / responseCount : null;

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
  const activeCampaignKey = getSingleValue(resolvedParams.open);
  const activeSection = getCampaignSection(getSingleValue(resolvedParams.section));

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-7">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
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

              <h1 className="text-3xl font-black tracking-tight text-slate-950">
                Campagne WhatsApp
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                Vista sintetica di invii, risposte e costi marketing.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Costo marketing unitario:{" "}
              <strong className="text-slate-950">
                {WHATSAPP_MARKETING_MESSAGE_COST_EUR.toLocaleString("it-IT", {
                  minimumFractionDigits: 4,
                  maximumFractionDigits: 4,
                })}{" "}
                €
              </strong>
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-5">
          <SummaryCard label="Campagne totali" value={String(filteredCampaigns.length)} />
          <SummaryCard label="Costo stimato" value={formatCurrency(totals.estimatedCost)} />
          <SummaryCard
            label="Costo fatturabile stimato"
            value={
              totals.billableEstimatedCost === null
                ? "-"
                : formatCurrency(totals.billableEstimatedCost)
            }
            note={
              totals.billableEstimatedCost === null
                ? "Dato stimato: Meta fattura i messaggi consegnati, non solo inviati."
                : "Basato sugli status delivered/read disponibili."
            }
          />
          <SummaryCard label="Risposte generate" value={String(totals.responses)} />
          <SummaryCard
            label="Costo per risposta"
            value={totals.costPerResponse === null ? "-" : formatCurrency(totals.costPerResponse)}
            note={totals.responses === 0 ? "Nessuna risposta attribuita." : undefined}
          />
        </section>

        <details className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <summary className="cursor-pointer text-sm font-semibold text-slate-800">
            Filtri
          </summary>

          <form className="mt-4">
            <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
              <FilterDate label="Data da" name="data_da" defaultValue={filters.dataDa} />
              <FilterDate label="Data a" name="data_a" defaultValue={filters.dataA} />

              <FilterSelect label="Template" name="template" defaultValue={filters.template}>
                <option value="">Tutti</option>
                {templateOptions.map((template) => (
                  <option key={template} value={template}>
                    {template}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect
                label="Tipo invio"
                name="tipo_invio"
                defaultValue={filters.tipoInvio}
              >
                <option value="">Tutti</option>
                {tipoInvioOptions.map((tipoInvio) => (
                  <option key={tipoInvio} value={tipoInvio}>
                    {tipoInvio}
                  </option>
                ))}
              </FilterSelect>

              <FilterSelect label="Stato" name="stato" defaultValue={filters.stato}>
                <option value="tutte">Tutte</option>
                <option value="con_errori">Con errori</option>
                <option value="senza_errori">Senza errori</option>
              </FilterSelect>

              <FilterSelect label="Negozio" name="negozio" defaultValue={filters.negozio}>
                <option value="">Tutti</option>
                {Object.entries(NEGOZI).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </FilterSelect>
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
        </details>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          {filteredCampaigns.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-600">
              Nessuna campagna trovata con i filtri selezionati.
            </div>
          ) : (
            <div className="relative max-h-[72vh] overflow-auto">
              <table className="min-w-[1180px] w-full text-sm">
                <thead className="sticky top-0 z-20 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 shadow-sm">
                  <tr className="border-b border-slate-200">
                    <th className="px-4 py-3 text-left font-semibold">Data</th>
                    <th className="px-4 py-3 text-left font-semibold">Negozio</th>
                    <th className="px-4 py-3 text-left font-semibold">Template</th>
                    <th className="px-4 py-3 text-left font-semibold">Tipo invio</th>
                    <th className="px-4 py-3 text-right font-semibold">Clienti selezionati</th>
                    <th className="px-4 py-3 text-right font-semibold">Inviati</th>
                    <th className="px-4 py-3 text-right font-semibold">Falliti</th>
                    <th className="px-4 py-3 text-right font-semibold">Saltati</th>
                    <th className="px-4 py-3 text-right font-semibold">Risposte</th>
                    <th className="px-4 py-3 text-right font-semibold">Costo</th>
                    <th className="px-4 py-3 text-left font-semibold">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCampaigns.map((campaign) => {
                    const isOpen = activeCampaignKey === campaign.key;

                    return (
                      <Fragment key={campaign.key}>
                        <tr
                          id={getCampaignDomId(campaign.key)}
                          className="border-b border-slate-100 align-top"
                        >
                          <td className="px-4 py-4 text-slate-700">
                            {formatDate(campaign.sentAt)}
                          </td>
                          <td className="px-4 py-4 text-slate-700">
                            {campaign.negozioLabels.join(", ") || "-"}
                          </td>
                          <td className="px-4 py-4 font-semibold text-slate-950">
                            {campaign.templateName}
                          </td>
                          <td className="px-4 py-4 text-slate-700">{campaign.sendType}</td>
                          <td className="px-4 py-4 text-right font-semibold text-slate-950">
                            {campaign.selectedCount}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-700">
                            {campaign.sentCount}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-700">
                            {campaign.failedCount}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-700">
                            {campaign.skippedCount}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-700">
                            {campaign.responseCount}
                          </td>
                          <td className="px-4 py-4 text-right">
                            <div className="font-semibold text-slate-950">
                              {formatCurrency(campaign.realCost)}
                            </div>
                            <div className="text-[11px] text-slate-500">provvisorio</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              {(
                                [
                                  ["dettaglio", "Dettaglio"],
                                  ["clienti", "Clienti"],
                                  ["errori", "Errori"],
                                  ["risposte", "Risposte"],
                                  ["costi", "Costi"],
                                ] as const
                              ).map(([section, label]) => (
                                <ActionLink
                                  key={section}
                                  href={buildCampaignSectionHref(
                                    resolvedParams,
                                    campaign.key,
                                    section,
                                  )}
                                  active={isOpen && activeSection === section}
                                >
                                  {label}
                                </ActionLink>
                              ))}
                            </div>
                          </td>
                        </tr>

                        {isOpen ? (
                          <tr className="border-b border-slate-200 bg-slate-50/70">
                            <td colSpan={11} className="px-4 py-4">
                              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                                <div className="text-sm font-semibold text-slate-900">
                                  {campaign.batchId ? `Batch ${campaign.batchId}` : "Invio singolo"}
                                </div>
                                <Link
                                  href={buildCampaignCloseHref(resolvedParams)}
                                  className="w-fit rounded-2xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 transition hover:border-orange-300 hover:text-orange-700"
                                >
                                  Chiudi
                                </Link>
                              </div>

                              <div className="grid gap-3 lg:grid-cols-2">
                                <DetailsSection title="Dettaglio" open={activeSection === "dettaglio"}>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <InfoRow label="Clienti da inviare" value={String(campaign.estimatedSendableCount)} />
                                    <InfoRow label="Già inviati/esclusi" value={String(campaign.alreadyExcludedCount)} />
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
                                  </div>

                                  <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                    <div className="mb-1 font-semibold text-slate-900">Messaggio inviato</div>
                                    <div className="whitespace-pre-wrap">
                                      {campaign.message ? truncateText(campaign.message, 700) : "-"}
                                    </div>
                                  </div>
                                </DetailsSection>

                                <DetailsSection title="Clienti" open={activeSection === "clienti"}>
                                  {campaign.clientNames.length === 0 ? (
                                    <div className="text-sm text-slate-500">-</div>
                                  ) : (
                                    <div className="flex flex-wrap gap-2">
                                      {campaign.clientNames.slice(0, 60).map((name) => (
                                        <span
                                          key={name}
                                          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700"
                                        >
                                          {name}
                                        </span>
                                      ))}
                                      {campaign.clientNames.length > 60 ? (
                                        <span className="rounded-full bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700">
                                          +{campaign.clientNames.length - 60}
                                        </span>
                                      ) : null}
                                    </div>
                                  )}
                                </DetailsSection>

                                <DetailsSection title="Errori" open={activeSection === "errori"}>
                                  {campaign.metaErrors.length === 0 ? (
                                    <div className="text-sm text-slate-500">Nessun errore Meta registrato.</div>
                                  ) : (
                                    <div className="space-y-2">
                                      {campaign.metaErrors.slice(0, 6).map((error) => (
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
                                </DetailsSection>

                                <DetailsSection title="Risposte" open={activeSection === "risposte"}>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <InfoRow label="Risposte generate" value={String(campaign.responseCount)} />
                                    <InfoRow
                                      label="Costo per risposta"
                                      value={
                                        campaign.costPerResponse === null
                                          ? "-"
                                          : formatCurrency(campaign.costPerResponse)
                                      }
                                    />
                                  </div>
                                </DetailsSection>

                                <DetailsSection title="Costi" open={activeSection === "costi"}>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <InfoRow
                                      label="Costo stimato"
                                      value={`${campaign.estimatedSendableCount} x ${WHATSAPP_MARKETING_MESSAGE_COST_EUR.toLocaleString("it-IT", {
                                        minimumFractionDigits: 4,
                                        maximumFractionDigits: 4,
                                      })} EUR = ${formatCurrency(campaign.estimatedCost)}`}
                                    />
                                    <InfoRow
                                      label="Costo reale provvisorio"
                                      value={`${campaign.sentCount} x ${WHATSAPP_MARKETING_MESSAGE_COST_EUR.toLocaleString("it-IT", {
                                        minimumFractionDigits: 4,
                                        maximumFractionDigits: 4,
                                      })} EUR = ${formatCurrency(campaign.realCost)}`}
                                    />
                                    <InfoRow
                                      label="Costo fatturabile stimato"
                                      value={
                                        campaign.billableEstimatedCost === null
                                          ? "-"
                                          : `${campaign.deliveredCount ?? 0} delivered + ${campaign.readCount ?? 0} read = ${formatCurrency(campaign.billableEstimatedCost)}`
                                      }
                                    />
                                    <InfoRow
                                      label="Status webhook"
                                      value={
                                        campaign.hasDeliveryStatus
                                          ? `${campaign.deliveredCount ?? 0} delivered, ${campaign.readCount ?? 0} read, ${campaign.failedCount} failed`
                                          : "-"
                                      }
                                    />
                                  </div>

                                  {!campaign.hasDeliveryStatus ? (
                                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                      Dato stimato: Meta fattura i messaggi consegnati, non solo inviati.
                                    </div>
                                  ) : null}
                                </DetailsSection>
                              </div>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
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

function SummaryCard({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
      {note ? <div className="mt-2 text-xs leading-relaxed text-slate-500">{note}</div> : null}
    </div>
  );
}

function FilterDate({
  label,
  name,
  defaultValue,
}: {
  label: string;
  name: string;
  defaultValue: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <input
        type="date"
        name={name}
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
      />
    </label>
  );
}

function FilterSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-orange-500"
      >
        {children}
      </select>
    </label>
  );
}

function ActionLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={[
        "rounded-2xl border px-3 py-1.5 text-xs font-semibold transition",
        active
          ? "border-orange-300 bg-orange-50 text-orange-700"
          : "border-slate-200 bg-slate-50 text-slate-600 hover:border-orange-300 hover:text-orange-700",
      ].join(" ")}
    >
      {children}
    </Link>
  );
}

function DetailsSection({
  title,
  open,
  children,
}: {
  title: string;
  open: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={open}
      className="rounded-2xl border border-slate-200 bg-white px-4 py-3"
    >
      <summary className="cursor-pointer text-sm font-semibold text-slate-900">
        {title}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
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
