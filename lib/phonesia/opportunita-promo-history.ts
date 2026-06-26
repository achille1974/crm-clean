const ROME_TIME_ZONE = "Europe/Rome";

const WHATSAPP_PROMO_SEND_MODES = new Set([
  "standard",
  "standard_media",
  "custom_message",
  "custom_message_image",
  "custom_message_document",
]);

export const DAILY_WHATSAPP_PROMO_SKIP_REASON =
  "Promo WhatsApp già inviata oggi";
export const DUPLICATE_PROMO_SKIP_REASON =
  "Promo già inviata a questo cliente";

export type PromoOpportunityHistoryRow = {
  cliente_id: number | null;
  opportunita_code?: string | null;
  channel?: string | null;
  sent_at?: string | null;
  created_at?: string | null;
  send_mode?: string | null;
  inviato_at?: string | null;
  messaggio?: string | null;
  attachment_public_url?: string | null;
  attachment_file_name?: string | null;
  promo_key?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type PromoSendSummary = {
  lastSentAt: string | null;
  sentToday: boolean;
};

export type PromoKeyInput = {
  templateName?: string | null;
  sendMode?: string | null;
  standardService?: string | null;
  messageText?: string | null;
  customMessage?: string | null;
  attachmentPublicUrl?: string | null;
  attachmentFileName?: string | null;
  mediaUrl?: string | null;
  title?: string | null;
};

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

function normalizePromoText(value?: string | null): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePromoToken(value?: string | null): string {
  return normalizePromoText(value).toLowerCase();
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
}

function fnv1aHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function stablePromoHash(value: string): string {
  return `${fnv1aHash(`promo:a:${value}`)}${fnv1aHash(`promo:b:${value}`)}`;
}

export function buildPromoKey(input: PromoKeyInput): string {
  const payload = {
    version: 1,
    template_name: normalizePromoToken(input.templateName),
    send_mode: normalizePromoToken(input.sendMode),
    standard_service: normalizePromoToken(input.standardService),
    title: normalizePromoText(input.title),
    message: normalizePromoText(input.messageText ?? input.customMessage),
    media_url: normalizePromoToken(input.mediaUrl ?? input.attachmentPublicUrl),
    attachment_file_name: normalizePromoToken(input.attachmentFileName),
  };

  return `promo_${stablePromoHash(stableStringify(payload))}`;
}

export function getPromoKeyFromHistoryRow(
  row: PromoOpportunityHistoryRow,
): string | null {
  if (!isWhatsAppPromoOpportunity(row)) return null;

  const savedPromoKey =
    normalizeText(row.promo_key) || getMetadataString(row.metadata, "promo_key");
  if (savedPromoKey) return savedPromoKey;

  const sendMode =
    normalizeText(row.send_mode) ||
    getMetadataString(row.metadata, "send_mode") ||
    getMetadataString(row.metadata, "tipo_invio");
  const opportunityCode = normalizeText(row.opportunita_code);
  const standardService =
    getMetadataString(row.metadata, "standard_service") ||
    (opportunityCode.toUpperCase().startsWith("CUSTOM_MESSAGE")
      ? null
      : opportunityCode);
  const templateName =
    getMetadataString(row.metadata, "template_name") ||
    getMetadataString(row.metadata, "template_usato");
  const isCustomPromo =
    normalizeText(sendMode).startsWith("custom_message") ||
    opportunityCode.toUpperCase().startsWith("CUSTOM_MESSAGE");
  const isStandardPromo =
    Boolean(standardService) && !isCustomPromo;
  const customMessage =
    getMetadataString(row.metadata, "custom_message") ||
    getMetadataString(row.metadata, "messaggio_personalizzato") ||
    normalizeText(row.messaggio);
  const attachmentPublicUrl =
    normalizeText(row.attachment_public_url) ||
    getMetadataString(row.metadata, "attachment_public_url") ||
    getMetadataString(row.metadata, "media_url");
  const attachmentFileName =
    normalizeText(row.attachment_file_name) ||
    getMetadataString(row.metadata, "attachment_file_name");

  return buildPromoKey({
    templateName,
    sendMode,
    standardService: isStandardPromo ? standardService : null,
    messageText: isStandardPromo ? null : customMessage,
    customMessage: isStandardPromo ? null : customMessage,
    attachmentPublicUrl: isStandardPromo ? attachmentPublicUrl : null,
    attachmentFileName,
  });
}

export function buildPromoKeysByCliente(
  rows: PromoOpportunityHistoryRow[],
): Map<number, string[]> {
  const keysByCliente = new Map<number, Set<string>>();

  for (const row of rows) {
    const clienteId = Number(row.cliente_id);
    if (!Number.isFinite(clienteId)) continue;

    const promoKey = getPromoKeyFromHistoryRow(row);
    if (!promoKey) continue;

    const current = keysByCliente.get(clienteId) ?? new Set<string>();
    current.add(promoKey);
    keysByCliente.set(clienteId, current);
  }

  return new Map(
    [...keysByCliente.entries()].map(([clienteId, keys]) => [
      clienteId,
      [...keys].sort(),
    ]),
  );
}

export function buildDuplicatePromoClienteIds(
  rows: PromoOpportunityHistoryRow[],
  promoKey: string,
): Set<number> {
  const duplicateIds = new Set<number>();

  for (const row of rows) {
    const clienteId = Number(row.cliente_id);
    if (!Number.isFinite(clienteId)) continue;
    if (getPromoKeyFromHistoryRow(row) === promoKey) {
      duplicateIds.add(clienteId);
    }
  }

  return duplicateIds;
}

function getDateTimeParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const values = new Map(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second")),
  };
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = getDateTimeParts(date, timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): Date {
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  const firstPass = new Date(utcGuess.getTime() - offset);
  const verifiedOffset = getTimeZoneOffsetMs(firstPass, timeZone);

  if (verifiedOffset === offset) {
    return firstPass;
  }

  return new Date(utcGuess.getTime() - verifiedOffset);
}

export function getRomeTodayBounds(now = new Date()) {
  const parts = getDateTimeParts(now, ROME_TIME_ZONE);
  const start = zonedDateTimeToUtc(
    ROME_TIME_ZONE,
    parts.year,
    parts.month,
    parts.day,
  );
  const end = zonedDateTimeToUtc(
    ROME_TIME_ZONE,
    parts.year,
    parts.month,
    parts.day + 1,
  );

  return {
    start,
    end,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function buildTodayPromoDateFilter(now = new Date()): string {
  const bounds = getRomeTodayBounds(now);

  return [
    `and(inviato_at.gte.${bounds.startIso},inviato_at.lt.${bounds.endIso})`,
    `and(sent_at.gte.${bounds.startIso},sent_at.lt.${bounds.endIso})`,
    `and(created_at.gte.${bounds.startIso},created_at.lt.${bounds.endIso})`,
  ].join(",");
}

export function getPromoOpportunitySentAt(
  row: PromoOpportunityHistoryRow,
): string | null {
  return (
    normalizeText(row.inviato_at) ||
    normalizeText(row.sent_at) ||
    normalizeText(row.created_at) ||
    null
  );
}

function hasPromoMetadataMarker(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }

  if (
    metadata.whatsapp_message_id ||
    metadata.meta_message_id ||
    metadata.meta_messages ||
    metadata.meta_send_attempts ||
    metadata.whatsapp_url
  ) {
    return true;
  }

  const sendMode = normalizeText(metadata.send_mode as string | null).toLowerCase();
  const tipoInvio = normalizeText(metadata.tipo_invio as string | null).toLowerCase();
  const templateName = normalizeText(metadata.template_name as string | null).toLowerCase();
  const templateUsato = normalizeText(metadata.template_usato as string | null).toLowerCase();

  return (
    WHATSAPP_PROMO_SEND_MODES.has(sendMode) ||
    WHATSAPP_PROMO_SEND_MODES.has(tipoInvio) ||
    templateName.startsWith("ph_msg_") ||
    templateName.includes("opportunita") ||
    templateUsato.startsWith("ph_msg_") ||
    templateUsato.includes("opportunita")
  );
}

export function isWhatsAppPromoOpportunity(row: PromoOpportunityHistoryRow): boolean {
  const channel = normalizeText(row.channel).toLowerCase();
  const sendMode = normalizeText(row.send_mode).toLowerCase();

  return (
    channel === "whatsapp" ||
    WHATSAPP_PROMO_SEND_MODES.has(sendMode) ||
    hasPromoMetadataMarker(row.metadata)
  );
}

export function buildPromoSendSummaries(
  rows: PromoOpportunityHistoryRow[],
  now = new Date(),
): Map<number, PromoSendSummary> {
  const summaries = new Map<number, PromoSendSummary>();
  const { start, end } = getRomeTodayBounds(now);
  const startMs = start.getTime();
  const endMs = end.getTime();

  for (const row of rows) {
    const clienteId = Number(row.cliente_id);

    if (!Number.isFinite(clienteId) || !isWhatsAppPromoOpportunity(row)) {
      continue;
    }

    const sentAt = getPromoOpportunitySentAt(row);
    if (!sentAt) continue;

    const sentAtMs = Date.parse(sentAt);
    if (!Number.isFinite(sentAtMs)) continue;

    const current = summaries.get(clienteId) ?? {
      lastSentAt: null,
      sentToday: false,
    };

    const currentLastMs = current.lastSentAt ? Date.parse(current.lastSentAt) : NaN;
    if (!Number.isFinite(currentLastMs) || sentAtMs > currentLastMs) {
      current.lastSentAt = sentAt;
    }

    if (sentAtMs >= startMs && sentAtMs < endMs) {
      current.sentToday = true;
    }

    summaries.set(clienteId, current);
  }

  return summaries;
}

export function formatPromoSentAtRome(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}
