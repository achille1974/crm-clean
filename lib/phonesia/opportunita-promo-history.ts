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

export type PromoHistoryLabelSummary = {
  key: string | null;
  label: string;
  detailLabel: string;
  promoName: string | null;
  description: string;
  negozioLabel: string;
  attachmentFileName: string | null;
  sentClientCount: number;
  sentRowCount: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
  messagePreview: string | null;
};

const KNOWN_PROMO_NAMES: Record<string, string> = {
  promo_3999cfa0c4f24f73: "TIM Motorola 6 euro mese",
};

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

export function normalizePromoText(value?: string | null): string {
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

export function normalizePromoKey(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, "");
}

export function isValidPromoKey(value?: string | null): boolean {
  return /^promo_[a-z0-9][a-z0-9_-]{2,140}$/i.test(normalizePromoKey(value));
}

export function normalizePromoName(value?: string | null): string {
  return normalizePromoText(value).slice(0, 120);
}

export function isValidPromoName(value?: string | null): boolean {
  const name = normalizePromoName(value);
  return name.length >= 3 && name.length <= 120;
}

export function getKnownPromoName(promoKey?: string | null): string | null {
  const key = normalizePromoKey(promoKey);
  return KNOWN_PROMO_NAMES[key] ?? null;
}

function slugifyPromoName(value?: string | null): string {
  return normalizePromoName(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    .slice(0, 80);
}

function getPromoMonthSuffix(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  return `${values.get("year") ?? ""}${values.get("month") ?? ""}`;
}

export function buildPromoKeyFromName(value?: string | null, now = new Date()): string {
  const slug = slugifyPromoName(value);
  if (!slug) return "";
  return `promo_${slug}_${getPromoMonthSuffix(now)}`;
}

export function getPromoDisplayName(
  promoKey?: string | null,
  rows: PromoOpportunityHistoryRow[] = [],
): string | null {
  const knownName = getKnownPromoName(promoKey);
  if (knownName) return knownName;

  for (const row of rows) {
    const name =
      getMetadataString(row.metadata, "promo_name") ||
      getMetadataString(row.metadata, "display_name") ||
      getMetadataString(row.metadata, "campaign_name");
    if (name) return normalizePromoName(name);
  }

  return null;
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

function normalizePreviewText(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

function getPromoSourceText(row: PromoOpportunityHistoryRow): string {
  return (
    normalizePreviewText(row.messaggio) ||
    normalizePreviewText(getMetadataString(row.metadata, "custom_message")) ||
    normalizePreviewText(getMetadataString(row.metadata, "messaggio_personalizzato")) ||
    normalizePreviewText(row.opportunita_code)
  );
}

function cleanPromoPhrase(value: string): string {
  return value
    .replace(/\s*,?\s*(anticipo zero|salvo approvazione|ti aspettiamo).*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function extractPromoDescription(row: PromoOpportunityHistoryRow): string | null {
  const text = getPromoSourceText(row);
  if (!text) return null;

  const operatorMatch = text.match(/\b(TIM|Vodafone|WINDTRE|WindTre|Iliad|Fastweb|Kena|Very)\b/i);
  const operator = operatorMatch?.[1]
    ? operatorMatch[1].toUpperCase() === "WINDTRE"
      ? "WINDTRE"
      : operatorMatch[1].toUpperCase()
    : null;
  const purchaseMatch = text.match(/puoi acquistare\s+(.+?)(?:[,.]|$)/i);
  const offerMatch = text.match(/promo\s+[A-Z0-9]+\s*:\s*(.+?)(?:[,.]|$)/i);
  const service = normalizeText(row.opportunita_code)
    .replace(/^CUSTOM_MESSAGE(?:_IMAGE|_DOCUMENT)?:/i, "")
    .replace(/[-_]+/g, " ");
  const rawPhrase = purchaseMatch?.[1] || offerMatch?.[1] || "";
  const phrase = cleanPromoPhrase(rawPhrase);

  if (operator && phrase) return `${operator} ${phrase}`;
  if (operator) return `Promo ${operator}`;
  if (phrase) return phrase;

  if (service && !/^[0-9a-f]{8}/i.test(service)) {
    return service.length > 80 ? `${service.slice(0, 77)}...` : service;
  }

  return null;
}

function getPromoAttachmentFileName(row: PromoOpportunityHistoryRow): string | null {
  return (
    normalizeText(row.attachment_file_name) ||
    getMetadataString(row.metadata, "attachment_file_name") ||
    null
  );
}

function inferNegozioLabelFromText(value: string): string | null {
  const text = value.toLowerCase();
  const labels = ["Floridia", "Augusta", "Siracusa", "Avola", "Tabacchino Floridia"];
  return labels.find((label) => text.includes(label.toLowerCase())) ?? null;
}

export function buildPromoHistoryLabelSummary(
  rows: PromoOpportunityHistoryRow[],
  options?: {
    promoKey?: string | null;
    negozioLabelByClienteId?: Map<number, string>;
  },
): PromoHistoryLabelSummary | null {
  const promoKey = normalizePromoKey(options?.promoKey);
  const matchingRows = rows.filter((row) => {
    const rowPromoKey = getPromoKeyFromHistoryRow(row);
    return rowPromoKey && (!promoKey || rowPromoKey === promoKey);
  });

  if (matchingRows.length === 0) return null;

  const sentClientIds = new Set<number>();
  const negozioCounts = new Map<string, number>();
  let firstSentAt: string | null = null;
  let lastSentAt: string | null = null;
  let description: string | null = null;
  let attachmentFileName: string | null = null;
  let messagePreview: string | null = null;
  let resolvedPromoKey: string | null = promoKey || null;

  for (const row of matchingRows) {
    resolvedPromoKey ||= getPromoKeyFromHistoryRow(row);
    const clienteId = Number(row.cliente_id);
    if (Number.isFinite(clienteId)) {
      sentClientIds.add(clienteId);
      const rowNegozioLabel =
        options?.negozioLabelByClienteId?.get(clienteId) ??
        inferNegozioLabelFromText(getPromoSourceText(row));

      if (rowNegozioLabel) {
        negozioCounts.set(
          rowNegozioLabel,
          (negozioCounts.get(rowNegozioLabel) ?? 0) + 1,
        );
      }
    }

    const sentAt = getPromoOpportunitySentAt(row);
    const sentAtMs = sentAt ? Date.parse(sentAt) : NaN;
    const firstSentAtMs = firstSentAt ? Date.parse(firstSentAt) : NaN;
    const lastSentAtMs = lastSentAt ? Date.parse(lastSentAt) : NaN;

    if (Number.isFinite(sentAtMs)) {
      if (!Number.isFinite(firstSentAtMs) || sentAtMs < firstSentAtMs) {
        firstSentAt = sentAt;
      }

      if (!Number.isFinite(lastSentAtMs) || sentAtMs > lastSentAtMs) {
        lastSentAt = sentAt;
      }
    }

    description ||= extractPromoDescription(row);
    attachmentFileName ||= getPromoAttachmentFileName(row);
    const sourceText = getPromoSourceText(row);
    messagePreview ||= sourceText
      ? sourceText.length > 90
        ? `${sourceText.slice(0, 87)}...`
        : sourceText
      : null;
  }

  const dateLabel = firstSentAt ? formatPromoDateRome(firstSentAt) : "";
  const negozioWinner = [...negozioCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0]?.[0];
  const negozioLabel = negozioWinner ?? "Negozio non disponibile";
  const summaryDescription = description ?? "Promo WhatsApp";
  const attachmentPart = attachmentFileName ? ` - ${attachmentFileName}` : "";
  const detailLabel = [
    dateLabel || "Data non disponibile",
    negozioLabel,
    `${summaryDescription}${attachmentPart}`,
    `${sentClientIds.size} clienti`,
  ].join(" - ");
  const promoName = getPromoDisplayName(resolvedPromoKey, matchingRows);

  return {
    key: resolvedPromoKey,
    label: promoName ? `${promoName} - ${detailLabel}` : detailLabel,
    detailLabel,
    promoName,
    description: summaryDescription,
    negozioLabel,
    attachmentFileName,
    sentClientCount: sentClientIds.size,
    sentRowCount: matchingRows.length,
    firstSentAt,
    lastSentAt,
    messagePreview,
  };
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

function formatPromoDateRome(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
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
