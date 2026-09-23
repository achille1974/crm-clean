/* eslint-disable @typescript-eslint/no-unused-vars -- legacy sender helpers kept for payload parity while the persistent worker rollout is pending */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  buildCustomTemplatePayload,
  CUSTOM_MESSAGE_BODY_PARAMETER_NAMES,
  sanitizeWhatsAppTemplateText,
  type CustomTemplateHeaderMedia,
} from "@/lib/phonesia/whatsapp-template-payload";
import {
  buildDuplicatePromoClienteIds,
  buildPromoKeyFromName,
  buildPromoSendSummaries,
  buildTodayPromoDateFilter,
  DAILY_WHATSAPP_PROMO_SKIP_REASON,
  DUPLICATE_PROMO_SKIP_REASON,
  isValidPromoKey,
  isValidPromoName,
  normalizePromoKey,
  normalizePromoName,
  type PromoOpportunityHistoryRow,
} from "@/lib/phonesia/opportunita-promo-history";
import {
  resolvePromoReference,
  type PromoCampaignReference,
} from "@/lib/phonesia/promo-reference";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BATCH_PROCESSING_BUDGET_MS = 270_000;
const BATCH_TIME_LIMIT_REASON =
  "Non elaborato: limite temporale del batch raggiunto prima del timeout piattaforma.";

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

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE_OPPORTUNITA_NAME =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_NAME || "phonesia_opportunita_marketing_v2";
const WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE || "it";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_NAME = "ph_msg_txt2_v1";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE = "it";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_IMAGE_NAME = "ph_msg_img_v1";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_DOCUMENT_NAME = "ph_msg_doc_v1";
const MAX_CUSTOM_MESSAGE_LENGTH = 320;

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
};

type ContrattoRow = {
  cliente_id: number | null;
  negozio_id: number | null;
  data_stipula: string | null;
  created_at: string | null;
};

type SendResultRow = {
  clienteId: number | null;
  nome: string;
  status: "sent" | "failed" | "skipped";
  reason: string;
  errorCode?: number | null;
  fbtraceId?: string | null;
  metaMessage?: string | null;
  templateName?: string | null;
  parameterFormat?: "NAMED" | "POSITIONAL" | null;
  bodyParameterNames?: string[];
  telefonoMascherato?: string | null;
  mediaUrl?: string | null;
  skipped_reason?: string | null;
};

type MarketingRow = {
  cliente_id: number | null;
};

type AlreadySentRow = {
  cliente_id: number | null;
  opportunita_code: string | null;
};

type SendMode =
  | "standard"
  | "custom_message"
  | "custom_message_image"
  | "custom_message_document";

type CustomMessageMode = "text" | "image" | "document";

type CustomTemplateConfig = {
  mode: CustomMessageMode;
  sendMode: SendMode;
  templateName: string;
  headerKind: "image" | "document" | null;
};

type TemplateBodyParameter = {
  parameterName?: string;
  text: string;
};

type MetaTemplateSendAttempt = {
  attempt: 1 | 2;
  template_name: string;
  status: "success" | "error";
  http_status: number | null;
  whatsapp_message_id?: string | null;
  meta_message_id?: string | null;
  error_message: string | null;
  error_type: string | null;
  error_code: number | null;
  error_subcode: number | null;
  error_data: unknown | null;
  is_transient: boolean | null;
  fbtrace_id: string | null;
  message: string | null;
  payload_summary: Record<string, unknown> | null;
};

type MetaTemplateSendResult = {
  response: unknown;
  whatsappMessageId: string | null;
  metaMessages: Record<string, unknown>[];
  attempts: MetaTemplateSendAttempt[];
};

type ParsedMetaError = {
  message: string | null;
  type: string | null;
  code: number | null;
  subcode: number | null;
  errorData: unknown | null;
  isTransient: boolean | null;
  fbtraceId: string | null;
};

type MediaUrlPreflightResult = {
  checked: boolean;
  ok: boolean;
  url_is_https: boolean;
  accessible_without_login: boolean;
  is_direct_media: boolean;
  has_expiring_query: boolean;
  http_status: number | null;
  content_type: string | null;
  expected_kind: "image" | "document";
  sanitized_url: string | null;
  error: string | null;
};

type MetaTemplateSendDiagnostics = {
  mode: string;
  templateName: string;
  language: string;
  hasHeaderMedia: boolean;
  mediaUrl: string | null;
  mediaMime: string | null;
  bodyParamsCount: number;
  parameterFormat: "NAMED" | "POSITIONAL";
  bodyParameterNames: string[];
  mediaPreflight?: MediaUrlPreflightResult | null;
  messageWasSanitized?: boolean;
  originalMessageLength?: number;
  sanitizedMessageLength?: number;
};

class MetaTemplateSendError extends Error {
  attempts: MetaTemplateSendAttempt[];
  templateName: string;

  constructor(templateName: string, attempts: MetaTemplateSendAttempt[]) {
    const lastAttempt = attempts[attempts.length - 1] ?? null;
    const hadTransientRetry = attempts.some(
      (attempt) => attempt.is_transient === true || attempt.error_code === 2,
    );
    const transientText =
      hadTransientRetry
        ? "Errore transitorio Meta. Ho ritentato una volta dopo 3 secondi, ma il secondo tentativo non è riuscito."
        : "Meta non ha accettato il template WhatsApp.";

    super(
      `${transientText} Template: ${templateName}.` +
        (lastAttempt?.error_code != null ? ` Codice: ${lastAttempt.error_code}.` : "") +
        (lastAttempt?.fbtrace_id ? ` fbtrace_id: ${lastAttempt.fbtrace_id}.` : ""),
    );

    this.name = "MetaTemplateSendError";
    this.templateName = templateName;
    this.attempts = attempts;
  }
}

type OpportunityInsertRow = {
  cliente_id: number;
  channel: "whatsapp";
  opportunita_code: string;
  opportunita_label: string;
  send_mode: string;
  batch_id: string | null;
  messaggio: string | null;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  negozio_contatto: string | null;
  metadata: Record<string, unknown>;
};

const STORE_CONTACTS: Record<
  number,
  {
    label: string;
    whatsappBase: string;
    mapsUrl: string;
  }
> = {
  1: {
    label: "PHONESIA Floridia",
    whatsappBase: "https://wa.me/393917000017",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
  2: {
    label: "PHONESIA Augusta",
    whatsappBase: "https://wa.me/393202927455",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta",
  },
  3: {
    label: "PHONESIA Siracusa",
    whatsappBase: "https://wa.me/393313137775",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa",
  },
  4: {
    label: "PHONESIA Avola",
    whatsappBase: "https://wa.me/393917510115",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola",
  },
  5: {
    label: "PHONESIA Floridia",
    whatsappBase: "https://wa.me/393473214561",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
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

function normalizePublicUrl(value?: string | null): string | null {
  const text = normalizeText(value);

  if (!text) return null;

  try {
    const url = new URL(text);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function isAllowedImageAttachment(params: {
  publicUrl: string;
  fileName: string | null;
  mimeType: string | null;
}) {
  const mimeType = normalizeText(params.mimeType).toLowerCase();

  if (mimeType) {
    return mimeType.startsWith("image/");
  }

  const source = `${params.fileName ?? ""} ${params.publicUrl}`.toLowerCase();

  return /\.(jpg|jpeg|png|webp)(\?|#|$)/i.test(source);
}

function isAllowedDocumentAttachment(params: {
  publicUrl: string;
  fileName: string | null;
  mimeType: string | null;
}) {
  const mimeType = normalizeText(params.mimeType).toLowerCase();

  if (mimeType) {
    return mimeType === "application/pdf";
  }

  const source = `${params.fileName ?? ""} ${params.publicUrl}`.toLowerCase();

  return /\.pdf(\?|#|$)/i.test(source);
}

function isValidService(value: string): value is ServiceFamily {
  return SERVICE_COLUMNS.includes(value as ServiceFamily);
}

function isValidCustomMessageMode(value: string): value is CustomMessageMode {
  return ["text", "image", "document"].includes(value);
}

function resolveCustomTemplateConfig(mode: CustomMessageMode): CustomTemplateConfig {
  if (mode === "image") {
    return {
      mode,
      sendMode: "custom_message_image",
      templateName: WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_IMAGE_NAME,
      headerKind: "image",
    };
  }

  if (mode === "document") {
    return {
      mode,
      sendMode: "custom_message_document",
      templateName: WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_DOCUMENT_NAME,
      headerKind: "document",
    };
  }

  return {
    mode: "text",
    sendMode: "custom_message",
    templateName: WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_NAME,
    headerKind: null,
  };
}

function isCustomSendMode(sendMode: SendMode): boolean {
  return sendMode.startsWith("custom_message");
}

function serviceLabel(service: ServiceFamily): string {
  switch (service) {
    case "FISSO":
      return "fibra";
    case "MOBILE":
      return "mobile";
    case "ENERGIA":
      return "energia";
    case "TV":
      return "TV";
    case "SMARTPHONE":
      return "smartphone";
    case "ACCESSORI":
      return "accessori";
    case "SICUREZZA":
      return "sicurezza";
    case "FOTOVOLTAICO":
      return "fotovoltaico";
  }
}

function serviceHistoryLabel(service: ServiceFamily): string {
  switch (service) {
    case "FISSO":
      return "Fibra";
    case "MOBILE":
      return "Mobile";
    case "ENERGIA":
      return "Energia";
    case "TV":
      return "TV";
    case "SMARTPHONE":
      return "Smartphone";
    case "ACCESSORI":
      return "Accessori";
    case "SICUREZZA":
      return "Sicurezza";
    case "FOTOVOLTAICO":
      return "Fotovoltaico";
  }
}

function buildOfferText(service: ServiceFamily): string {
  if (service === "FISSO") return "fibra";
  if (service === "MOBILE") return "mobile";
  if (service === "ENERGIA") return "energia";
  return serviceLabel(service);
}

function buildWhatsappUrl(baseUrl: string) {
  return baseUrl;
}

function buildPhoneCandidates(rawPhone: string) {
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, "");
  const variants = new Set<string>();

  if (!cleaned) return [];

  variants.add(cleaned);

  if (cleaned.startsWith("+")) {
    variants.add(cleaned.slice(1));
  } else {
    variants.add(`+${cleaned}`);
  }

  return Array.from(variants);
}

function toMetaRecipient(rawPhone: string) {
  const candidates = buildPhoneCandidates(rawPhone);
  const numeric = candidates.find((value) => /^\d+$/.test(value.replace(/^\+/, "")));
  return numeric ? numeric.replace(/^\+/, "") : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getMetaResponseMessages(value: unknown): Record<string, unknown>[] {
  const response = asRecord(value);
  const messages = response?.messages;

  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => asRecord(message))
    .filter((message): message is Record<string, unknown> => Boolean(message));
}

function getMetaMessageId(messages: Record<string, unknown>[]): string | null {
  for (const message of messages) {
    const id = typeof message.id === "string" ? message.id.trim() : "";
    if (id) return id;
  }

  return null;
}

function sanitizeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;

  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.slice(0, 160);
  }
}

function maskRecipient(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const suffix = value.slice(-4);
  return suffix ? `***${suffix}` : "***";
}

function getTemplateComponents(payload: Record<string, unknown>): unknown[] {
  const template = asRecord(payload.template);
  const components = template?.components;
  return Array.isArray(components) ? components : [];
}

function getBodyTextParameters(payload: Record<string, unknown>): Record<string, unknown>[] {
  const body = getTemplateComponents(payload)
    .map(asRecord)
    .find((component) => component?.type === "body");
  const parameters = body ? body.parameters : null;

  if (!Array.isArray(parameters)) {
    return [];
  }

  return parameters
    .map(asRecord)
    .filter(
      (parameter): parameter is Record<string, unknown> =>
        parameter !== null && parameter.type === "text",
    );
}

function getBodyParameterNames(payload: Record<string, unknown>): string[] {
  return getBodyTextParameters(payload)
    .map((parameter) =>
      typeof parameter.parameter_name === "string" ? parameter.parameter_name : "",
    )
    .filter(Boolean);
}

function getBodyParameterFormat(payload: Record<string, unknown>): "NAMED" | "POSITIONAL" {
  const parameters = getBodyTextParameters(payload);

  return parameters.length > 0 &&
    parameters.every((parameter) => typeof parameter.parameter_name === "string")
    ? "NAMED"
    : "POSITIONAL";
}

function summarizeComponent(component: unknown): Record<string, unknown> {
  const item = asRecord(component);

  if (!item) {
    return { type: "unknown" };
  }

  const parameters = Array.isArray(item.parameters) ? item.parameters : [];
  const bodyParameterNames =
    item.type === "body"
      ? parameters
          .map(asRecord)
          .map((parameter) =>
            typeof parameter?.parameter_name === "string"
              ? parameter.parameter_name
              : "",
          )
          .filter(Boolean)
      : [];

  return {
    type: typeof item.type === "string" ? item.type : "unknown",
    sub_type: typeof item.sub_type === "string" ? item.sub_type : undefined,
    index: typeof item.index === "string" ? item.index : undefined,
    parameter_format:
      item.type === "body" && bodyParameterNames.length === parameters.length
        ? "NAMED"
        : item.type === "body"
          ? "POSITIONAL"
          : undefined,
    body_parameter_names:
      item.type === "body" ? bodyParameterNames : undefined,
    parameters: parameters.map((parameter) => {
      const param = asRecord(parameter);
      if (!param) return { type: "unknown" };

      if (param.type === "image") {
        const image = asRecord(param.image);
        return {
          type: "image",
          image: {
            has_link: Boolean(image?.link),
            link: sanitizeUrl(image?.link),
          },
        };
      }

      if (param.type === "document") {
        const document = asRecord(param.document);
        return {
          type: "document",
          document: {
            has_link: Boolean(document?.link),
            link: sanitizeUrl(document?.link),
            filename:
              typeof document?.filename === "string"
                ? document.filename.slice(0, 120)
                : null,
          },
        };
      }

      if (param.type === "text") {
        const text = typeof param.text === "string" ? param.text : "";
        return {
          type: "text",
          parameter_name:
            typeof param.parameter_name === "string" ? param.parameter_name : null,
          text_length: text.length,
        };
      }

      return {
        type: typeof param.type === "string" ? param.type : "unknown",
      };
    }),
  };
}

function summarizeMetaPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const template = asRecord(payload.template);
  const language = asRecord(template?.language);

  return {
    messaging_product: payload.messaging_product,
    to: maskRecipient(payload.to),
    type: payload.type,
    template: {
      name: template?.name,
      language: {
        code: language?.code,
      },
      parameter_format: getBodyParameterFormat(payload),
      body_parameter_names: getBodyParameterNames(payload),
      components: getTemplateComponents(payload).map(summarizeComponent),
    },
  };
}

function getBodyParamsCount(payload: Record<string, unknown>): number {
  return getBodyTextParameters(payload).length;
}

function getLastErrorAttempt(
  attempts: MetaTemplateSendAttempt[],
): MetaTemplateSendAttempt | null {
  return [...attempts].reverse().find((attempt) => attempt.status === "error") ?? null;
}

function getAttemptParameterFormat(
  attempt: MetaTemplateSendAttempt | null,
): "NAMED" | "POSITIONAL" | null {
  const template = asRecord(attempt?.payload_summary?.template);
  const parameterFormat = template?.parameter_format;

  return parameterFormat === "NAMED" || parameterFormat === "POSITIONAL"
    ? parameterFormat
    : null;
}

function getAttemptBodyParameterNames(attempt: MetaTemplateSendAttempt | null): string[] {
  const template = asRecord(attempt?.payload_summary?.template);
  const names = template?.body_parameter_names;

  return Array.isArray(names)
    ? names.filter((name): name is string => typeof name === "string")
    : [];
}

function formatMetaFailureReason(error: MetaTemplateSendError): string {
  const lastError = getLastErrorAttempt(error.attempts);

  if (lastError?.error_code === 132018) {
    return "Parametri template non validi per questo cliente.";
  }

  return formatMetaTemplateError(error);
}

function validateNamedBodyParameters(
  parameters: TemplateBodyParameter[],
): string | null {
  for (const parameter of parameters) {
    if (!parameter.parameterName) {
      return "Parametro template senza nome.";
    }

    if (!normalizeText(parameter.text)) {
      return `Parametro template ${parameter.parameterName} vuoto.`;
    }
  }

  return null;
}

function validateCustomTemplateBeforeMeta(params: {
  config: CustomTemplateConfig;
  customMessage: string;
  headerParameter: CustomTemplateHeaderMedia | null;
  bodyParameters: TemplateBodyParameter[];
  mediaPreflight: MediaUrlPreflightResult | null;
  globalSkipReason: string | null;
}): string | null {
  if (params.globalSkipReason) {
    return params.globalSkipReason;
  }

  if (!normalizeText(params.customMessage)) {
    return "Messaggio personalizzato vuoto.";
  }

  if (params.customMessage.length > MAX_CUSTOM_MESSAGE_LENGTH) {
    return `Messaggio personalizzato troppo lungo: massimo ${MAX_CUSTOM_MESSAGE_LENGTH} caratteri.`;
  }

  const bodyValidationError = validateNamedBodyParameters(params.bodyParameters);
  if (bodyValidationError) {
    return bodyValidationError;
  }

  if (params.config.headerKind === null && params.headerParameter) {
    return "Il template solo testo non deve avere header media.";
  }

  if (params.config.headerKind !== null && !params.headerParameter) {
    return "Allegato mancante per il template selezionato.";
  }

  if (
    params.config.headerKind !== null &&
    params.headerParameter &&
    params.headerParameter.kind !== params.config.headerKind
  ) {
    return "Allegato non coerente con il template selezionato.";
  }

  if (params.config.headerKind !== null && params.mediaPreflight && !params.mediaPreflight.ok) {
    return "Allegato non accessibile da Meta. Verifica che il file sia pubblico, HTTPS e con content-type corretto.";
  }

  return null;
}

function hasExpiringQueryToken(url: URL): boolean {
  const expiringKeys = [
    "token",
    "expires",
    "expires_in",
    "x-amz-expires",
    "x-amz-signature",
    "signature",
  ];

  return expiringKeys.some((key) => url.searchParams.has(key));
}

async function inspectTemplateMediaUrl(
  publicUrl: string,
  expectedKind: "image" | "document",
): Promise<MediaUrlPreflightResult> {
  let parsedUrl: URL;

  try {
    parsedUrl = new URL(publicUrl);
  } catch {
    return {
      checked: true,
      ok: false,
      url_is_https: false,
      accessible_without_login: false,
      is_direct_media: false,
      has_expiring_query: false,
      http_status: null,
      content_type: null,
      expected_kind: expectedKind,
      sanitized_url: null,
      error: "URL media non valido.",
    };
  }

  const urlIsHttps = parsedUrl.protocol === "https:";
  const hasExpiringQuery = hasExpiringQueryToken(parsedUrl);

  try {
    let response = await fetch(publicUrl, {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow",
    });

    if (response.status === 405 || response.status === 403) {
      response = await fetch(publicUrl, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        headers: {
          Range: "bytes=0-0",
        },
      });
    }

    const contentType = response.headers.get("content-type");
    const normalizedContentType = normalizeText(contentType).toLowerCase();
    const isDirectMedia =
      expectedKind === "image"
        ? normalizedContentType.startsWith("image/")
        : normalizedContentType.startsWith("application/pdf");
    const accessibleWithoutLogin = response.ok && !normalizedContentType.includes("text/html");
    const ok = urlIsHttps && accessibleWithoutLogin && isDirectMedia && !hasExpiringQuery;

    return {
      checked: true,
      ok,
      url_is_https: urlIsHttps,
      accessible_without_login: accessibleWithoutLogin,
      is_direct_media: isDirectMedia,
      has_expiring_query: hasExpiringQuery,
      http_status: response.status,
      content_type: contentType,
      expected_kind: expectedKind,
      sanitized_url: sanitizeUrl(publicUrl),
      error: ok
        ? null
        : "URL media non pubblico, non diretto, non HTTPS o con query temporanea.",
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      url_is_https: urlIsHttps,
      accessible_without_login: false,
      is_direct_media: false,
      has_expiring_query: hasExpiringQuery,
      http_status: null,
      content_type: null,
      expected_kind: expectedKind,
      sanitized_url: sanitizeUrl(publicUrl),
      error: error instanceof Error ? error.message : "Errore verifica URL media.",
    };
  }
}

function parseMetaErrorBody(body: string): ParsedMetaError {
  try {
    const parsed = JSON.parse(body) as {
      error?: {
        message?: unknown;
        type?: unknown;
        code?: unknown;
        error_subcode?: unknown;
        error_data?: unknown;
        is_transient?: unknown;
        fbtrace_id?: unknown;
      };
    };
    const error = parsed.error;

    return {
      message: typeof error?.message === "string" ? error.message : null,
      type: typeof error?.type === "string" ? error.type : null,
      code: typeof error?.code === "number" ? error.code : null,
      subcode:
        typeof error?.error_subcode === "number" ? error.error_subcode : null,
      errorData:
        typeof error?.error_data === "undefined" ? null : error.error_data,
      isTransient:
        typeof error?.is_transient === "boolean" ? error.is_transient : null,
      fbtraceId: typeof error?.fbtrace_id === "string" ? error.fbtrace_id : null,
    };
  } catch {
    return {
      message: body || null,
      type: null,
      code: null,
      subcode: null,
      errorData: null,
      isTransient: null,
      fbtraceId: null,
    };
  }
}

function shouldRetryMetaError(error: ParsedMetaError): boolean {
  return error.isTransient === true || error.code === 2;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatMetaTemplateError(error: MetaTemplateSendError): string {
  const lastError = [...error.attempts]
    .reverse()
    .find((attempt) => attempt.status === "error");
  const hadTransientRetry = error.attempts.some(
    (attempt) => attempt.is_transient === true || attempt.error_code === 2,
  );
  const details = [
    lastError?.error_message
      ? `Dettaglio: ${lastError.error_message}`
      : "Dettaglio non disponibile",
    lastError?.error_type ? `type ${lastError.error_type}` : null,
    lastError?.error_code != null ? `code ${lastError.error_code}` : null,
    lastError?.error_subcode != null
      ? `subcode ${lastError.error_subcode}`
      : null,
    lastError?.fbtrace_id ? `fbtrace ${lastError.fbtrace_id}` : null,
  ].filter(Boolean);

  if (hadTransientRetry) {
    return `Errore temporaneo Meta durante l’invio WhatsApp. Ho ritentato una volta dopo 3 secondi, ma l’invio non è riuscito. ${details.join(" - ")}`;
  }

  return `Meta ha rifiutato il template. ${details.join(" - ")}`;
}

async function sendMetaTemplateWithRetry(params: {
  templateName: string;
  payload: Record<string, unknown>;
  diagnostics: MetaTemplateSendDiagnostics;
}): Promise<MetaTemplateSendResult> {
  if (!WHATSAPP_ACCESS_TOKEN) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  }

  const attempts: MetaTemplateSendAttempt[] = [];
  const payloadSummary = summarizeMetaPayload(params.payload);

  console.info(
    "phonesia.whatsapp.template_send.before",
    JSON.stringify({
      ...params.diagnostics,
      parameter_format: params.diagnostics.parameterFormat,
      body_parameter_names: params.diagnostics.bodyParameterNames,
      message_was_sanitized: params.diagnostics.messageWasSanitized ?? false,
      original_message_length: params.diagnostics.originalMessageLength ?? null,
      sanitized_message_length: params.diagnostics.sanitizedMessageLength ?? null,
      payload: payloadSummary,
    }),
  );

  for (const attempt of [1, 2] as const) {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params.payload),
        cache: "no-store",
      },
    );

    if (response.ok) {
      const responseBody = await response.json().catch(() => null);
      const metaMessages = getMetaResponseMessages(responseBody);
      const whatsappMessageId = getMetaMessageId(metaMessages);

      attempts.push({
        attempt,
        template_name: params.templateName,
        status: "success",
        http_status: response.status,
        whatsapp_message_id: whatsappMessageId,
        meta_message_id: whatsappMessageId,
        error_message: null,
        error_type: null,
        error_code: null,
        error_subcode: null,
        error_data: null,
        is_transient: null,
        fbtrace_id: null,
        message: null,
        payload_summary: payloadSummary,
      });

      return {
        response: responseBody,
        whatsappMessageId,
        metaMessages,
        attempts,
      };
    }

    const body = await response.text();
    const metaError = parseMetaErrorBody(body);

    attempts.push({
      attempt,
      template_name: params.templateName,
      status: "error",
      http_status: response.status,
      error_message: metaError.message,
      error_type: metaError.type,
      error_code: metaError.code,
      error_subcode: metaError.subcode,
      error_data: metaError.errorData,
      is_transient: metaError.isTransient,
      fbtrace_id: metaError.fbtraceId,
      message: metaError.message,
      payload_summary: payloadSummary,
    });

    console.error(
      "phonesia.whatsapp.template_send.meta_error",
      JSON.stringify({
        templateName: params.templateName,
        attempt,
        http_status: response.status,
        error_message: metaError.message,
        error_type: metaError.type,
        error_code: metaError.code,
        error_subcode: metaError.subcode,
        error_data: metaError.errorData,
        is_transient: metaError.isTransient,
        fbtrace_id: metaError.fbtraceId,
        payload: payloadSummary,
      }),
    );

    if (attempt === 1 && shouldRetryMetaError(metaError)) {
      await wait(3000);
      continue;
    }

    throw new MetaTemplateSendError(params.templateName, attempts);
  }

  throw new MetaTemplateSendError(params.templateName, attempts);
}

async function sendWhatsAppTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  mode: string;
  headerParameter?: CustomTemplateHeaderMedia | null;
  bodyParameters: TemplateBodyParameter[];
  mediaPreflight?: MediaUrlPreflightResult | null;
}) {
  const components: Array<Record<string, unknown>> = [];

  if (params.headerParameter?.kind === "image") {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: params.headerParameter.link,
          },
        },
      ],
    });
  }

  if (params.headerParameter?.kind === "document") {
    components.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: params.headerParameter.link,
            ...(params.headerParameter.fileName
              ? { filename: params.headerParameter.fileName }
              : {}),
          },
        },
      ],
    });
  }

  components.push({
    type: "body",
    parameters: params.bodyParameters.map((parameter) => ({
      type: "text",
      ...(parameter.parameterName
        ? { parameter_name: parameter.parameterName }
        : {}),
      text: parameter.text,
    })),
  });

  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: params.languageCode,
      },
      components,
    },
  };

  return sendMetaTemplateWithRetry({
    templateName: params.templateName,
    payload,
    diagnostics: {
      mode: params.mode,
      templateName: params.templateName,
      language: params.languageCode,
      hasHeaderMedia: Boolean(params.headerParameter),
      mediaUrl: params.headerParameter ? sanitizeUrl(params.headerParameter.link) : null,
      mediaMime:
        params.headerParameter?.mimeType ??
        params.mediaPreflight?.content_type ??
        null,
      bodyParamsCount: getBodyParamsCount(payload),
      parameterFormat: getBodyParameterFormat(payload),
      bodyParameterNames: getBodyParameterNames(payload),
      mediaPreflight: params.mediaPreflight ?? null,
    },
  });
}

async function sendWhatsAppCustomTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  mode: CustomMessageMode;
  headerMedia?: CustomTemplateHeaderMedia | null;
  nomeCliente: string;
  messaggio: string;
  mediaPreflight?: MediaUrlPreflightResult | null;
  messageWasSanitized?: boolean;
  originalMessageLength?: number;
  sanitizedMessageLength?: number;
}) {
  const payload = buildCustomTemplatePayload({
    to: params.to,
    mode: params.mode,
    templateName: params.templateName,
    language: params.languageCode,
    nomeCliente: params.nomeCliente,
    messaggio: params.messaggio,
    headerMedia: params.headerMedia ?? null,
  });

  return sendMetaTemplateWithRetry({
    templateName: params.templateName,
    payload,
    diagnostics: {
      mode: `custom_${params.mode}`,
      templateName: params.templateName,
      language: params.languageCode,
      hasHeaderMedia: Boolean(params.headerMedia),
      mediaUrl: params.headerMedia ? sanitizeUrl(params.headerMedia.link) : null,
      mediaMime:
        params.headerMedia?.mimeType ??
        params.mediaPreflight?.content_type ??
        null,
      bodyParamsCount: getBodyParamsCount(payload),
      parameterFormat: "NAMED",
      bodyParameterNames: [...CUSTOM_MESSAGE_BODY_PARAMETER_NAMES],
      mediaPreflight: params.mediaPreflight ?? null,
      messageWasSanitized: params.messageWasSanitized ?? false,
      originalMessageLength: params.originalMessageLength ?? params.messaggio.length,
      sanitizedMessageLength: params.sanitizedMessageLength ?? params.messaggio.length,
    },
  });
}

async function logOpportunitySend(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    responseText: string;
    negozioContatto: string;
    batchId: string;
    sendMode: SendMode;
    standardService: ServiceFamily | null;
    templateName: string;
    customMessage: string | null;
    selectedClientCount: number;
    metaSendAttempts: MetaTemplateSendAttempt[];
    whatsappMessageId: string | null;
    metaMessages: Record<string, unknown>[];
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
    promoKey: string;
    promoName: string;
  },
) {
  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "whatsapp",
      messaggio_utente:
        isCustomSendMode(params.sendMode)
          ? "[dashboard] invio messaggio personalizzato batch"
          : "[dashboard] invio opportunità batch (standard)",
      intent: "dashboard_opportunita_send_batch",
      tool_usato: "api_phonesia_opportunita_send_batch",
      risposta_agente: params.responseText,
      stato: "completato",
      handoff_richiesto: false,
      metadata: {
        batch_id: params.batchId,
        negozio_contatto: params.negozioContatto,
        promo_key: params.promoKey,
        promo_name: params.promoName,
        template_name: params.templateName,
        template_usato: params.templateName,
        tipo_invio: params.sendMode,
        send_mode: params.sendMode,
        message_mode: params.sendMode,
        standard_service: params.standardService,
        custom_message: params.customMessage,
        messaggio_personalizzato: params.customMessage,
        selected_client_count: params.selectedClientCount,
        numero_clienti_selezionati: params.selectedClientCount,
        meta_send_attempts: params.metaSendAttempts,
        whatsapp_message_id: params.whatsappMessageId,
        meta_message_id: params.whatsappMessageId,
        meta_messages: params.metaMessages,
        meta_error_code:
          params.metaSendAttempts.find((attempt) => attempt.status === "error")
            ?.error_code ?? null,
        meta_is_transient:
          params.metaSendAttempts.find((attempt) => attempt.status === "error")
            ?.is_transient ?? null,
        meta_fbtrace_id:
          params.metaSendAttempts.find((attempt) => attempt.status === "error")
            ?.fbtrace_id ?? null,
        attachment_public_url: params.attachmentPublicUrl,
        attachment_file_name: params.attachmentFileName,
      },
    });
  } catch (error) {
    console.error("Errore log opportunità batch:", error);
  }
}

async function logBatchSkipped(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    responseText: string;
    negozioContatto: string;
    batchId: string;
    sendMode: SendMode;
    standardService: ServiceFamily | null;
    templateName: string;
    customMessage: string | null;
    selectedClientCount: number;
    maskedPhone: string | null;
    parameterFormat: "NAMED" | "POSITIONAL" | null;
    bodyParameterNames: string[];
    mediaUrl: string | null;
    promoKey: string;
    promoName: string;
  },
) {
  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "whatsapp",
      messaggio_utente:
        isCustomSendMode(params.sendMode)
          ? "[dashboard] cliente saltato messaggio personalizzato batch"
          : "[dashboard] cliente saltato opportunità batch",
      intent: "dashboard_opportunita_send_batch",
      tool_usato: "api_phonesia_opportunita_send_batch",
      risposta_agente: params.responseText,
      stato: "saltato",
      handoff_richiesto: false,
      metadata: {
        batch_id: params.batchId,
        negozio_contatto: params.negozioContatto,
        promo_key: params.promoKey,
        promo_name: params.promoName,
        template_name: params.templateName,
        template_usato: params.templateName,
        tipo_invio: params.sendMode,
        send_mode: params.sendMode,
        message_mode: params.sendMode,
        standard_service: params.standardService,
        custom_message: params.customMessage,
        messaggio_personalizzato: params.customMessage,
        selected_client_count: params.selectedClientCount,
        numero_clienti_selezionati: params.selectedClientCount,
        skipped_reason: params.responseText,
        telefono_mascherato: params.maskedPhone,
        parameter_format: params.parameterFormat,
        body_parameter_names: params.bodyParameterNames,
        media_url: params.mediaUrl,
        meta_error_code: null,
        meta_fbtrace_id: null,
      },
    });
  } catch (error) {
    console.error("Errore log cliente saltato batch:", error);
  }
}

async function saveOpportunitySentRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    batchId: string;
    sendMode: SendMode;
    standardService: ServiceFamily | null;
    messageText: string;
    templateName: string;
    customMessage: string | null;
    selectedClientCount: number;
    metaSendAttempts: MetaTemplateSendAttempt[];
    whatsappMessageId: string | null;
    metaMessages: Record<string, unknown>[];
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
    negozioContatto: string;
    whatsappUrl: string;
    mapsUrl: string;
    promoKey: string;
    promoName: string;
  },
) {
  const customPrefix =
    params.sendMode === "custom_message_image"
      ? "CUSTOM_MESSAGE_IMAGE"
      : params.sendMode === "custom_message_document"
        ? "CUSTOM_MESSAGE_DOCUMENT"
        : "CUSTOM_MESSAGE";
  const opportunityCode =
    params.sendMode === "standard" && params.standardService
      ? params.standardService
      : `${customPrefix}:${params.batchId}`;

  const opportunityLabel =
    params.sendMode === "standard" && params.standardService
      ? serviceHistoryLabel(params.standardService)
      : "Messaggio personalizzato";

  const row: OpportunityInsertRow = {
    cliente_id: params.clienteId,
    channel: "whatsapp",
    opportunita_code: opportunityCode,
    opportunita_label: opportunityLabel,
    send_mode: params.sendMode,
    batch_id: params.batchId,
    messaggio: params.messageText,
    attachment_public_url: params.attachmentPublicUrl,
    attachment_file_name: params.attachmentFileName,
    negozio_contatto: params.negozioContatto,
    metadata: {
      template_name: params.templateName,
      promo_key: params.promoKey,
      promo_name: params.promoName,
      template_usato: params.templateName,
      tipo_invio: params.sendMode,
      send_mode: params.sendMode,
      standard_service: params.standardService,
      custom_message: params.customMessage,
      messaggio_personalizzato: params.customMessage,
      selected_client_count: params.selectedClientCount,
      numero_clienti_selezionati: params.selectedClientCount,
      meta_send_attempts: params.metaSendAttempts,
      whatsapp_message_id: params.whatsappMessageId,
      meta_message_id: params.whatsappMessageId,
      meta_messages: params.metaMessages,
      meta_error_code:
        params.metaSendAttempts.find((attempt) => attempt.status === "error")
          ?.error_code ?? null,
      meta_is_transient:
        params.metaSendAttempts.find((attempt) => attempt.status === "error")
          ?.is_transient ?? null,
      meta_fbtrace_id:
        params.metaSendAttempts.find((attempt) => attempt.status === "error")
          ?.fbtrace_id ?? null,
      whatsapp_url: params.whatsappUrl,
      maps_url: params.mapsUrl,
    },
  };

  const { error } = await supabase.from("phonesia_opportunita_inviate").upsert(row, {
    onConflict: "cliente_id,opportunita_code",
  });

  if (error) {
    throw new Error(`Errore salvataggio opportunità inviata: ${error.message}`);
  }
}

async function logMetaTemplateFailure(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    responseText: string;
    negozioContatto: string;
    batchId: string;
    sendMode: SendMode;
    standardService: ServiceFamily | null;
    templateName: string;
    customMessage: string | null;
    selectedClientCount: number;
    attempts: MetaTemplateSendAttempt[];
    maskedPhone: string | null;
    mediaUrl: string | null;
    promoKey: string;
    promoName: string;
  },
) {
  const lastError = getLastErrorAttempt(params.attempts);

  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "whatsapp",
      messaggio_utente:
        isCustomSendMode(params.sendMode)
          ? "[dashboard] errore invio messaggio personalizzato batch"
          : "[dashboard] errore invio opportunità batch",
      intent: "dashboard_opportunita_send_batch",
      tool_usato: "api_phonesia_opportunita_send_batch",
      risposta_agente: params.responseText,
      stato: "errore",
      handoff_richiesto: false,
      metadata: {
        batch_id: params.batchId,
        negozio_contatto: params.negozioContatto,
        promo_key: params.promoKey,
        promo_name: params.promoName,
        template_name: params.templateName,
        template_usato: params.templateName,
        tipo_invio: params.sendMode,
        send_mode: params.sendMode,
        message_mode: params.sendMode,
        standard_service: params.standardService,
        custom_message: params.customMessage,
        messaggio_personalizzato: params.customMessage,
        selected_client_count: params.selectedClientCount,
        numero_clienti_selezionati: params.selectedClientCount,
        meta_send_attempts: params.attempts,
        meta_error_code: lastError?.error_code ?? null,
        meta_is_transient: lastError?.is_transient ?? null,
        meta_fbtrace_id: lastError?.fbtrace_id ?? null,
        meta_failed_attempt: lastError?.attempt ?? null,
        telefono_mascherato: params.maskedPhone,
        parameter_format: getAttemptParameterFormat(lastError),
        body_parameter_names: getAttemptBodyParameterNames(lastError),
        media_url: params.mediaUrl,
      },
    });
  } catch (error) {
    console.error("Errore log fallimento Meta template batch:", error);
  }
}

export async function POST(request: NextRequest) {
  if (process.env.PHONESIA_BATCH_WORKER_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, error: "batch_worker_disabled", message: "Invio WhatsApp batch temporaneamente sospeso. Nessuna campagna è stata accodata." },
      { status: 503 },
    );
  }
  const requestStartedAt = Date.now();

  try {
    const formData = await request.formData();
    const dryRun = normalizeText(String(formData.get("dryRun") ?? "")).toLowerCase() === "true";
    const idempotencyKey = normalizeText(String(formData.get("idempotencyKey") ?? ""));
    const promoKeyOverride = normalizePromoKey(String(formData.get("promoKeyOverride") ?? ""));
    const promoName = normalizePromoName(String(formData.get("promoName") ?? ""));

    const rawClienteIds = formData.getAll("clienti");
    const clienteIds = [
      ...new Set(
        rawClienteIds
          .map((value) => Number(String(value)))
          .filter((value): value is number => Number.isFinite(value)),
      ),
    ];

    const messageModeRaw = normalizeText(String(formData.get("messageMode") ?? "")).toLowerCase();
    const messageMode = messageModeRaw === "custom" ? "custom" : "standard";
    const customMessageModeRaw = normalizeText(
      String(formData.get("customMessageMode") ?? ""),
    ).toLowerCase();
    const customMessageMode = isValidCustomMessageMode(customMessageModeRaw)
      ? customMessageModeRaw
      : "text";
    const customTemplateConfig = resolveCustomTemplateConfig(customMessageMode);
    const sendMode: SendMode =
      messageMode === "custom" ? customTemplateConfig.sendMode : "standard";

    const standardServiceRaw = normalizeText(
      String(formData.get("standardService") ?? ""),
    ).toUpperCase();
    const standardService = isValidService(standardServiceRaw) ? standardServiceRaw : null;

    const originalCustomMessage = String(formData.get("customMessage") ?? "");
    const customMessage = sanitizeWhatsAppTemplateText(originalCustomMessage);
    const messageWasSanitized = originalCustomMessage !== customMessage;
    const originalMessageLength = originalCustomMessage.length;
    const sanitizedMessageLength = customMessage.length;
    const rawAttachmentPublicUrl = normalizeText(
      String(formData.get("attachmentPublicUrl") ?? ""),
    );
    const attachmentPublicUrl = rawAttachmentPublicUrl
      ? normalizePublicUrl(rawAttachmentPublicUrl)
      : null;
    const attachmentFileName = normalizeText(String(formData.get("attachmentFileName") ?? ""));
    const attachmentMimeType = normalizeText(String(formData.get("attachmentMimeType") ?? ""));
    const hasAttachment = Boolean(rawAttachmentPublicUrl);
    let globalSkipReason: string | null = null;

    if (clienteIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "nessun_cliente_selezionato" },
        { status: 400 },
      );
    }

    if (!isValidPromoName(promoName)) {
      return NextResponse.json(
        {
          ok: false,
          error: "nome_promo_non_valido",
          message: "Inserisci un nome promo valido di almeno 3 caratteri.",
        },
        { status: 400 },
      );
    }

    if (promoKeyOverride && !isValidPromoKey(promoKeyOverride)) {
      return NextResponse.json(
        {
          ok: false,
          error: "promo_key_override_non_valida",
          message: "La promo_key selezionata non ha un formato valido.",
        },
        { status: 400 },
      );
    }

    if (messageMode === "standard" && !standardService) {
      return NextResponse.json(
        { ok: false, error: "servizio_standard_non_valido" },
        { status: 400 },
      );
    }

    if (messageMode === "custom" && !customMessage) {
      return NextResponse.json(
        {
          ok: false,
          error: "Inserisci un messaggio personalizzato.",
          message: "Inserisci un messaggio personalizzato.",
        },
        { status: 400 },
      );
    }

    if (messageMode === "custom" && customMessage.length > MAX_CUSTOM_MESSAGE_LENGTH) {
      return NextResponse.json(
        {
          ok: false,
          error: "Messaggio personalizzato troppo lungo.",
          message: `Messaggio personalizzato troppo lungo: massimo ${MAX_CUSTOM_MESSAGE_LENGTH} caratteri.`,
        },
        { status: 400 },
      );
    }

    if (messageMode === "standard" && hasAttachment) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_batch_non_supportato",
          message:
            "Gli allegati richiedono un template Meta con intestazione immagine o documento.",
        },
        { status: 409 },
      );
    }

    if (messageMode === "custom" && customMessageMode === "text" && hasAttachment) {
      globalSkipReason =
        "Il template solo testo non deve avere header media.";
    }

    if (
      messageMode === "custom" &&
      !dryRun &&
      customTemplateConfig.headerKind &&
      !attachmentPublicUrl
    ) {
      globalSkipReason = rawAttachmentPublicUrl
        ? "URL allegato non valido."
        : "Allegato mancante per il template selezionato.";
    }

    if (
      messageMode === "custom" &&
      !dryRun &&
      customTemplateConfig.headerKind === "image" &&
      attachmentPublicUrl &&
      !isAllowedImageAttachment({
        publicUrl: attachmentPublicUrl,
        fileName: attachmentFileName || null,
        mimeType: attachmentMimeType || null,
      })
    ) {
      globalSkipReason = "Carica un allegato compatibile con il template selezionato.";
    }

    if (
      messageMode === "custom" &&
      !dryRun &&
      customTemplateConfig.headerKind === "document" &&
      attachmentPublicUrl &&
      !isAllowedDocumentAttachment({
        publicUrl: attachmentPublicUrl,
        fileName: attachmentFileName || null,
        mimeType: attachmentMimeType || null,
      })
    ) {
      globalSkipReason = "Carica un allegato compatibile con il template selezionato.";
    }

    const requestedPromoKey = promoKeyOverride || buildPromoKeyFromName(promoName);

    if (!requestedPromoKey) {
      return NextResponse.json(
        {
          ok: false,
          error: "promo_key_non_generabile",
          message: "Nome promo non sufficiente per generare una promo_key stabile.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    if (promoKeyOverride) {
      const [legacyResult, campaignResult] = await Promise.all([
        supabase
          .from("phonesia_opportunita_inviate")
          .select("cliente_id", { count: "exact", head: true })
          .eq("promo_key", promoKeyOverride),
        supabase
          .from("phonesia_whatsapp_campaigns")
          .select(
            "id,historical,snapshot_complete,state,selected_declared,documented_recipients,unreconstructable_count",
          )
          .eq("promo_key", promoKeyOverride)
          .order("created_at", { ascending: false })
          .limit(2),
      ]);

      if (legacyResult.error) {
        throw new Error(
          `Errore validazione promo selezionata: ${legacyResult.error.message}`,
        );
      }
      if (campaignResult.error) {
        throw new Error(`Errore validazione campagna persistente: ${campaignResult.error.message}`);
      }

      const promoReference = resolvePromoReference({
        hasOverride: true,
        legacyCount: legacyResult.count ?? 0,
        campaigns: (campaignResult.data ?? []) as PromoCampaignReference[],
      });

      if (promoReference.kind === "historical_incomplete") {
        const campaign = promoReference.campaign;
        return NextResponse.json(
          {
            ok: false,
            error: "campagna_storica_snapshot_incompleto",
            campaignId: campaign.id,
            message: `Ripresa bloccata: ${campaign.selected_declared} destinatari dichiarati, ${campaign.documented_recipients} documentati e ${campaign.unreconstructable_count} non ricostruibili. La selezione corrente non può sostituire lo snapshot storico.`,
          },
          { status: 409 },
        );
      }

      if (promoReference.kind === "persistent") {
        return NextResponse.json(
          {
            ok: false,
            error: "campagna_persistente_ripresa_non_valida",
            campaignId: promoReference.campaign.id,
            message: "La ripresa deve usare destinatari ed esiti documentati della campagna persistente. Accepted e uncertain non vengono reinviati.",
          },
          { status: 409 },
        );
      }

      if (promoReference.kind === "unknown") {
        return NextResponse.json(
          {
            ok: false,
            error: "promo_key_override_non_trovata",
            message:
              "La promo_key selezionata non esiste nello storico. Invio bloccato.",
          },
          { status: 400 },
        );
      }
    }

    const mediaPreflight =
      !dryRun &&
      messageMode === "custom" &&
      customTemplateConfig.headerKind &&
      attachmentPublicUrl &&
      !globalSkipReason
        ? await inspectTemplateMediaUrl(attachmentPublicUrl, customTemplateConfig.headerKind)
        : null;

    if (mediaPreflight && !mediaPreflight.ok) {
      console.warn(
        "phonesia.whatsapp.template_media.preflight_failed",
        JSON.stringify({
          mode: `custom_${customTemplateConfig.mode}`,
          templateName: customTemplateConfig.templateName,
          language: WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE,
          mediaPreflight,
        }),
      );

      globalSkipReason =
        "Allegato non accessibile da Meta. Verifica che il file sia pubblico, HTTPS e con content-type corretto.";
    }

    const batchId = crypto.randomUUID();

    const [
      { data: clientiData, error: clientiError },
      { data: marketingRows, error: marketingError },
      { data: contrattiData, error: contrattiError },
      { data: alreadySentRows, error: alreadySentError },
      { data: todayPromoRows, error: todayPromoError },
      { data: promoHistoryRows, error: promoHistoryError },
    ] = await Promise.all([
      supabase
        .from("phonesia_clienti")
        .select(
          "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active",
        )
        .in("id", clienteIds),
      supabase
        .from("phonesia_consensi")
        .select("cliente_id")
        .eq("tipo_evento", "marketing_accepted")
        .in("cliente_id", clienteIds),
      supabase
        .from("phonesia_contratti")
        .select("cliente_id, negozio_id, data_stipula, created_at")
        .in("cliente_id", clienteIds)
        .order("data_stipula", { ascending: false })
        .order("created_at", { ascending: false }),
      messageMode === "standard" && standardService
        ? supabase
            .from("phonesia_opportunita_inviate")
            .select("cliente_id, opportunita_code")
            .eq("opportunita_code", standardService)
            .in("cliente_id", clienteIds)
        : Promise.resolve({ data: [], error: null } as { data: AlreadySentRow[]; error: null }),
      supabase
        .from("phonesia_opportunita_inviate")
        .select("cliente_id, channel, sent_at, created_at, send_mode, inviato_at, metadata")
        .in("cliente_id", clienteIds)
        .or(buildTodayPromoDateFilter())
        .limit(Math.max(100, clienteIds.length * 5)),
      supabase
        .from("phonesia_opportunita_inviate")
        .select(
          "cliente_id, opportunita_code, channel, sent_at, created_at, send_mode, inviato_at, messaggio, attachment_public_url, attachment_file_name, promo_key, metadata",
        )
        .in("cliente_id", clienteIds)
        .limit(Math.max(1000, clienteIds.length * 20)),
    ]);

    if (clientiError) {
      throw new Error(`Errore lettura clienti: ${clientiError.message}`);
    }

    if (marketingError) {
      throw new Error(`Errore lettura consensi marketing: ${marketingError.message}`);
    }

    if (contrattiError) {
      throw new Error(`Errore lettura contratti: ${contrattiError.message}`);
    }

    if (alreadySentError) {
      throw new Error(`Errore lettura opportunità già inviate: ${alreadySentError.message}`);
    }

    if (todayPromoError) {
      throw new Error(`Errore lettura promo già inviate oggi: ${todayPromoError.message}`);
    }

    if (promoHistoryError) {
      throw new Error(`Errore lettura storico promo WhatsApp: ${promoHistoryError.message}`);
    }

    const clienti = (clientiData ?? []) as ClienteRow[];
    const contratti = (contrattiData ?? []) as ContrattoRow[];
    const marketingData = (marketingRows ?? []) as MarketingRow[];
    const alreadySentData = (alreadySentRows ?? []) as AlreadySentRow[];
    const todayPromoSummaries = buildPromoSendSummaries(
      (todayPromoRows ?? []) as PromoOpportunityHistoryRow[],
    );
    const duplicatePromoSentIds = buildDuplicatePromoClienteIds(
      (promoHistoryRows ?? []) as PromoOpportunityHistoryRow[],
      requestedPromoKey,
    );

    const clientiMap = new Map<number, ClienteRow>();
    for (const cliente of clienti) {
      clientiMap.set(cliente.id, cliente);
    }

    const marketingIds = new Set<number>(
      marketingData
        .map((row) => Number(row.cliente_id))
        .filter((value): value is number => Number.isFinite(value)),
    );

    const contrattiByCliente = new Map<number, ContrattoRow[]>();
    for (const row of contratti) {
      const key = Number(row.cliente_id);
      if (!Number.isFinite(key)) continue;
      const list = contrattiByCliente.get(key) ?? [];
      list.push(row);
      contrattiByCliente.set(key, list);
    }

    const alreadySentIds = new Set<number>(
      alreadySentData
        .map((row) => Number(row.cliente_id))
        .filter((value): value is number => Number.isFinite(value)),
    );
    const todayPromoSentIds = new Set<number>(
      [...todayPromoSummaries.entries()]
        .filter(([, summary]) => summary.sentToday)
        .map(([clienteId]) => clienteId),
    );

    if (dryRun) {
      let missingClientCount = 0;
      let missingMarketingConsentCount = 0;
      let invalidWhatsappCount = 0;
      let sentTodayCount = 0;
      let alreadyContactedCount = 0;
      let legacyAlreadySentCount = 0;
      let sendableCount = 0;

      for (const clienteId of clienteIds) {
        const cliente = clientiMap.get(clienteId);

        if (!cliente) {
          missingClientCount += 1;
          continue;
        }

        const hasMarketingConsent = marketingIds.has(cliente.id);
        const hasUsableWhatsapp =
          cliente.whatsapp_active === true && Boolean(toMetaRecipient(cliente.telefono ?? ""));
        const alreadyContacted = duplicatePromoSentIds.has(cliente.id);
        const sentToday = todayPromoSentIds.has(cliente.id);
        const legacyAlreadySent =
          sendMode === "standard" && standardService
            ? alreadySentIds.has(cliente.id)
            : false;

        if (!hasMarketingConsent) missingMarketingConsentCount += 1;
        if (!hasUsableWhatsapp) invalidWhatsappCount += 1;
        if (sentToday) sentTodayCount += 1;
        if (alreadyContacted) alreadyContactedCount += 1;
        if (legacyAlreadySent) legacyAlreadySentCount += 1;

        if (
          hasMarketingConsent &&
          hasUsableWhatsapp &&
          !sentToday &&
          !alreadyContacted &&
          !legacyAlreadySent
        ) {
          sendableCount += 1;
        }
      }

      return NextResponse.json({
        ok: true,
        dryRun: true,
        promoKey: requestedPromoKey,
        promoName,
        totalSelectedCount: clienteIds.length,
        missingClientCount,
        alreadyContactedCount,
        missingMarketingConsentCount,
        invalidWhatsappCount,
        sentTodayCount,
        legacyAlreadySentCount,
        sendableCount,
        blockedCount:
          missingClientCount +
          alreadyContactedCount +
          missingMarketingConsentCount +
          invalidWhatsappCount +
          sentTodayCount +
          legacyAlreadySentCount,
        errorCount: 0,
      });
    }

    if (!idempotencyKey) {
      return NextResponse.json(
        { ok: false, error: "idempotency_key_mancante", message: "Ripetere il preflight prima della conferma." },
        { status: 400 },
      );
    }

    const snapshotRecipients = clienteIds.map((clienteId, inputPosition) => {
      const cliente = clientiMap.get(clienteId);
      const normalizedPhone = cliente ? toMetaRecipient(cliente.telefono ?? "") : null;
      const contractStoreId = cliente
        ? (contrattiByCliente.get(cliente.id) ?? []).find((row) => row.negozio_id != null)?.negozio_id
        : null;
      const contactStore = STORE_CONTACTS[contractStoreId ?? cliente?.negozio_id ?? 1] ?? STORE_CONTACTS[1];
      const fullName = cliente
        ? [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() || `Cliente ${cliente.id}`
        : `Cliente ${clienteId}`;
      let exclusionReason: string | null = null;
      if (!cliente) exclusionReason = "Cliente non trovato.";
      else if (!marketingIds.has(cliente.id)) exclusionReason = "Consenso marketing mancante.";
      else if (!cliente.whatsapp_active) exclusionReason = "WhatsApp non attivo.";
      else if (!normalizedPhone) exclusionReason = "Telefono mancante o non valido.";
      else if (todayPromoSentIds.has(cliente.id)) exclusionReason = DAILY_WHATSAPP_PROMO_SKIP_REASON;
      else if (duplicatePromoSentIds.has(cliente.id)) exclusionReason = DUPLICATE_PROMO_SKIP_REASON;
      else if (sendMode === "standard" && standardService && alreadySentIds.has(cliente.id))
        exclusionReason = "Opportunità già inviata in precedenza.";
      else if (globalSkipReason) exclusionReason = globalSkipReason;

      const payload = normalizedPhone
        ? messageMode === "custom"
          ? buildCustomTemplatePayload({
              to: normalizedPhone,
              mode: customTemplateConfig.mode,
              templateName: customTemplateConfig.templateName,
              language: WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE,
              nomeCliente: sanitizeWhatsAppTemplateText(cliente?.nome ?? "") || "cliente",
              messaggio: customMessage,
              headerMedia:
                customTemplateConfig.headerKind && attachmentPublicUrl
                  ? customTemplateConfig.headerKind === "image"
                    ? { kind: "image" as const, link: attachmentPublicUrl, mimeType: attachmentMimeType || null }
                    : { kind: "document" as const, link: attachmentPublicUrl, fileName: attachmentFileName || null, mimeType: attachmentMimeType || null }
                  : null,
            })
          : {
              messaging_product: "whatsapp",
              to: normalizedPhone,
              type: "template",
              template: {
                name: WHATSAPP_TEMPLATE_OPPORTUNITA_NAME,
                language: { code: WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE },
                components: [{
                  type: "body",
                  parameters: [
                    { type: "text", text: fullName },
                    { type: "text", text: buildOfferText(standardService!) },
                    { type: "text", text: buildWhatsappUrl(contactStore.whatsappBase) },
                    { type: "text", text: contactStore.mapsUrl },
                  ],
                }],
              },
            }
        : null;

      return {
        cliente_id: clienteId,
        input_position: inputPosition,
        normalized_phone: normalizedPhone,
        exclusion_reason: exclusionReason,
        eligibility_snapshot: {
          marketing_consented: cliente ? marketingIds.has(cliente.id) : false,
          whatsapp_active: cliente?.whatsapp_active === true,
          promo_sent_today: cliente ? todayPromoSentIds.has(cliente.id) : false,
          duplicate_promo: cliente ? duplicatePromoSentIds.has(cliente.id) : false,
          payload,
        },
      };
    });

    const { data: persistentCampaignId, error: snapshotError } = await supabase.rpc(
      "phonesia_create_whatsapp_campaign_snapshot",
      {
        p_idempotency_key: idempotencyKey,
        p_promo_key: requestedPromoKey,
        p_promo_name: promoName,
        p_send_mode: sendMode,
        p_template_name: messageMode === "custom" ? customTemplateConfig.templateName : WHATSAPP_TEMPLATE_OPPORTUNITA_NAME,
        p_template_language: messageMode === "custom" ? WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE : WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE,
        p_normalized_message: messageMode === "custom" ? customMessage : buildOfferText(standardService!),
        p_attachment_public_url: attachmentPublicUrl,
        p_attachment_file_name: attachmentFileName || null,
        p_attachment_mime_type: attachmentMimeType || null,
        p_created_by: null,
        p_recipients: snapshotRecipients,
      },
    );
    if (snapshotError) throw new Error(`Salvataggio snapshot campagna fallito: ${snapshotError.message}`);

    const skippedResults: SendResultRow[] = snapshotRecipients
      .filter((row) => row.exclusion_reason)
      .map((row) => ({
        clienteId: row.cliente_id,
        nome: clientiMap.get(row.cliente_id)
          ? [clientiMap.get(row.cliente_id)?.nome, clientiMap.get(row.cliente_id)?.cognome].filter(Boolean).join(" ")
          : `Cliente ${row.cliente_id}`,
        status: "skipped",
        reason: row.exclusion_reason!,
        skipped_reason: row.exclusion_reason!,
      }));
    return NextResponse.json({
      ok: true, dryRun: false, queued: true, batchId: persistentCampaignId,
      promoKey: requestedPromoKey, promoName, totalSelectedCount: clienteIds.length,
      sentCount: 0, failedCount: 0, skippedCount: skippedResults.length,
      blockedCount: skippedResults.length, errorCount: 0, results: skippedResults,
      failedResults: [], skippedResults,
      message: "Snapshot completo salvato. Nessun invio eseguito dalla richiesta di conferma.",
    });

    /* Legacy synchronous sender intentionally disabled. The persistent worker owns sends.
    const results: SendResultRow[] = [];

    for (const [clienteIndex, clienteId] of clienteIds.entries()) {
      if (!dryRun && Date.now() - requestStartedAt >= BATCH_PROCESSING_BUDGET_MS) {
        for (const pendingClienteId of clienteIds.slice(clienteIndex)) {
          const pendingCliente = clientiMap.get(pendingClienteId);
          const pendingName =
            [pendingCliente?.nome, pendingCliente?.cognome].filter(Boolean).join(" ").trim() ||
            `Cliente ${pendingClienteId}`;

          results.push({
            clienteId: pendingClienteId,
            nome: pendingName,
            status: "skipped",
            reason: BATCH_TIME_LIMIT_REASON,
            errorCode: null,
            fbtraceId: null,
            metaMessage: null,
            templateName:
              messageMode === "custom"
                ? customTemplateConfig.templateName
                : WHATSAPP_TEMPLATE_OPPORTUNITA_NAME,
            parameterFormat: messageMode === "custom" ? "NAMED" : null,
            bodyParameterNames:
              messageMode === "custom" ? [...CUSTOM_MESSAGE_BODY_PARAMETER_NAMES] : [],
            telefonoMascherato: pendingCliente
              ? maskRecipient(pendingCliente.telefono ?? "")
              : null,
            mediaUrl:
              messageMode === "custom" && customTemplateConfig.headerKind
                ? sanitizeUrl(attachmentPublicUrl)
                : null,
            skipped_reason: BATCH_TIME_LIMIT_REASON,
          });
        }

        break;
      }

      const cliente = clientiMap.get(clienteId);

      if (!cliente) {
        results.push({
          clienteId,
          nome: `Cliente ${clienteId}`,
          status: "skipped",
          reason: "Cliente non trovato.",
          errorCode: null,
          fbtraceId: null,
          metaMessage: null,
          templateName:
            messageMode === "custom"
              ? customTemplateConfig.templateName
              : WHATSAPP_TEMPLATE_OPPORTUNITA_NAME,
          parameterFormat: messageMode === "custom" ? "NAMED" : null,
          bodyParameterNames:
            messageMode === "custom" ? [...CUSTOM_MESSAGE_BODY_PARAMETER_NAMES] : [],
          telefonoMascherato: null,
          mediaUrl: null,
          skipped_reason: "Cliente non trovato.",
        });
        continue;
      }

      const clienteCorrente = cliente;
      const nomeCompleto =
        [clienteCorrente.nome, clienteCorrente.cognome].filter(Boolean).join(" ").trim() ||
        `Cliente ${clienteCorrente.id}`;
      const contrattiCliente = contrattiByCliente.get(clienteCorrente.id) ?? [];
      const negozioContrattoId =
        contrattiCliente.find((row) => row.negozio_id != null)?.negozio_id ?? null;
      const contactStoreId = negozioContrattoId ?? clienteCorrente.negozio_id ?? 1;
      const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];
      const offerText = sendMode === "standard" ? buildOfferText(standardService!) : "";
      const whatsappUrl = buildWhatsappUrl(contactStore.whatsappBase);
      const templateName =
        messageMode === "custom"
          ? customTemplateConfig.templateName
          : WHATSAPP_TEMPLATE_OPPORTUNITA_NAME;
      const templateLanguage =
        messageMode === "custom"
          ? WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE
          : WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE;
      const customBodyParameters: TemplateBodyParameter[] = [
        {
          parameterName: CUSTOM_MESSAGE_BODY_PARAMETER_NAMES[0],
          text: sanitizeWhatsAppTemplateText(clienteCorrente.nome ?? "") || "cliente",
        },
        {
          parameterName: CUSTOM_MESSAGE_BODY_PARAMETER_NAMES[1],
          text: customMessage,
        },
      ];
      const customHeaderParameter: CustomTemplateHeaderMedia | null =
        messageMode === "custom" &&
        customTemplateConfig.headerKind === "image" &&
        attachmentPublicUrl
          ? {
              kind: "image",
              link: attachmentPublicUrl,
              mimeType: attachmentMimeType || null,
            }
          : messageMode === "custom" &&
              customTemplateConfig.headerKind === "document" &&
              attachmentPublicUrl
            ? {
                kind: "document",
                link: attachmentPublicUrl,
                fileName: attachmentFileName || null,
                mimeType: attachmentMimeType || null,
              }
            : null;
      const customParameterFormat: "NAMED" | "POSITIONAL" =
        customBodyParameters.every((parameter) => parameter.parameterName)
          ? "NAMED"
          : "POSITIONAL";

      async function pushSkipped(
        reason: string,
        params?: {
          maskedPhone?: string | null;
          parameterFormat?: "NAMED" | "POSITIONAL" | null;
          bodyParameterNames?: string[];
          mediaUrl?: string | null;
        },
      ) {
        const maskedPhone =
          params?.maskedPhone ?? maskRecipient(clienteCorrente.telefono ?? "");
        const bodyParameterNames =
          params?.bodyParameterNames ??
          (messageMode === "custom"
            ? [...CUSTOM_MESSAGE_BODY_PARAMETER_NAMES]
            : []);
        const parameterFormat =
          params?.parameterFormat ?? (messageMode === "custom" ? customParameterFormat : null);
        const mediaUrl =
          params?.mediaUrl ??
          (messageMode === "custom" && customTemplateConfig.headerKind
            ? sanitizeUrl(attachmentPublicUrl)
            : null);

        await logBatchSkipped(supabase, {
          clienteId: clienteCorrente.id,
          responseText: reason,
          negozioContatto: contactStore.label,
          batchId,
          sendMode,
          standardService: messageMode === "standard" ? standardService : null,
          templateName,
          customMessage: messageMode === "custom" ? customMessage : null,
          selectedClientCount: clienteIds.length,
          maskedPhone,
          parameterFormat,
          bodyParameterNames,
          mediaUrl,
          promoKey: requestedPromoKey,
          promoName,
        });

        results.push({
          clienteId: clienteCorrente.id,
          nome: nomeCompleto,
          status: "skipped",
          reason,
          errorCode: null,
          fbtraceId: null,
          metaMessage: null,
          templateName,
          parameterFormat,
          bodyParameterNames,
          telefonoMascherato: maskedPhone,
          mediaUrl,
          skipped_reason: reason,
        });
      }

      if (!marketingIds.has(clienteCorrente.id)) {
        await pushSkipped("Consenso marketing mancante.");
        continue;
      }

      if (!clienteCorrente.whatsapp_active) {
        await pushSkipped("WhatsApp non attivo.");
        continue;
      }

      if (!clienteCorrente.telefono) {
        await pushSkipped("Telefono mancante o non valido.");
        continue;
      }

      if (todayPromoSentIds.has(clienteCorrente.id)) {
        await pushSkipped(DAILY_WHATSAPP_PROMO_SKIP_REASON);
        continue;
      }

      if (duplicatePromoSentIds.has(clienteCorrente.id)) {
        await pushSkipped(DUPLICATE_PROMO_SKIP_REASON);
        continue;
      }

      if (sendMode === "standard" && standardService && alreadySentIds.has(clienteCorrente.id)) {
        await pushSkipped("Opportunità già inviata in precedenza.");
        continue;
      }

      try {
        const metaRecipient = toMetaRecipient(clienteCorrente.telefono);
        const maskedPhone = metaRecipient
          ? maskRecipient(metaRecipient)
          : maskRecipient(clienteCorrente.telefono);

        if (!metaRecipient) {
          await pushSkipped("Numero non valido per WhatsApp.", { maskedPhone });
          continue;
        }

        let metaSendResult: MetaTemplateSendResult;

        try {
          if (messageMode === "custom") {
            const validationError = validateCustomTemplateBeforeMeta({
              config: customTemplateConfig,
              customMessage,
              headerParameter: customHeaderParameter,
              bodyParameters: customBodyParameters,
              mediaPreflight,
              globalSkipReason,
            });

            if (validationError) {
              await pushSkipped(validationError, { maskedPhone });
              continue;
            }

            metaSendResult = await sendWhatsAppCustomTemplate({
              to: metaRecipient,
              templateName,
              languageCode: templateLanguage,
              mode: customTemplateConfig.mode,
              headerMedia: customHeaderParameter,
              nomeCliente: customBodyParameters[0].text,
              messaggio: customBodyParameters[1].text,
              mediaPreflight,
              messageWasSanitized,
              originalMessageLength,
              sanitizedMessageLength,
            });
          } else {
            metaSendResult = await sendWhatsAppTemplate({
              to: metaRecipient,
              templateName,
              languageCode: templateLanguage,
              mode: "standard",
              bodyParameters: [
                { text: nomeCompleto },
                { text: offerText },
                { text: whatsappUrl },
                { text: contactStore.mapsUrl },
              ],
            });
          }
        } catch (error) {
          if (error instanceof MetaTemplateSendError) {
            const message = formatMetaFailureReason(error);
            const lastError = getLastErrorAttempt(error.attempts);
            const parameterFormat = getAttemptParameterFormat(lastError);
            const bodyParameterNames = getAttemptBodyParameterNames(lastError);
            const mediaUrl =
              messageMode === "custom" && customTemplateConfig.headerKind
                ? sanitizeUrl(attachmentPublicUrl)
                : null;

            await logMetaTemplateFailure(supabase, {
              clienteId: clienteCorrente.id,
              responseText: message,
              negozioContatto: contactStore.label,
              batchId,
              sendMode,
              standardService: messageMode === "standard" ? standardService : null,
              templateName,
              customMessage: messageMode === "custom" ? customMessage : null,
              selectedClientCount: clienteIds.length,
              attempts: error.attempts,
              maskedPhone,
              mediaUrl,
              promoKey: requestedPromoKey,
              promoName,
            });

            results.push({
              clienteId: clienteCorrente.id,
              nome: nomeCompleto,
              status: "failed",
              reason: message,
              errorCode: lastError?.error_code ?? null,
              fbtraceId: lastError?.fbtrace_id ?? null,
              metaMessage: lastError?.error_message ?? null,
              templateName,
              parameterFormat,
              bodyParameterNames,
              telefonoMascherato: maskedPhone,
              mediaUrl,
            });
            continue;
          }

          throw error;
        }

        const text =
          messageMode === "custom"
            ? customMessage
            : `Ciao ${nomeCompleto}, abbiamo un'offerta dedicata per te su ${offerText}.\n\n` +
              `Contattaci qui: ${whatsappUrl}\n` +
              `Oppure vieni in negozio: ${contactStore.mapsUrl}\n\n` +
              "— PHONESIA";

        await saveOpportunitySentRow(supabase, {
          clienteId: clienteCorrente.id,
          batchId,
          sendMode,
          standardService: messageMode === "standard" ? standardService : null,
          messageText: text,
          templateName,
          customMessage: messageMode === "custom" ? customMessage : null,
          selectedClientCount: clienteIds.length,
          metaSendAttempts: metaSendResult.attempts,
          whatsappMessageId: metaSendResult.whatsappMessageId,
          metaMessages: metaSendResult.metaMessages,
          attachmentPublicUrl: messageMode === "custom" ? attachmentPublicUrl || null : null,
          attachmentFileName: messageMode === "custom" ? attachmentFileName || null : null,
          negozioContatto: contactStore.label,
          whatsappUrl,
          mapsUrl: contactStore.mapsUrl,
          promoKey: requestedPromoKey,
          promoName,
        });

        await logOpportunitySend(supabase, {
          clienteId: clienteCorrente.id,
          responseText: text,
          negozioContatto: contactStore.label,
          batchId,
          sendMode,
          standardService: messageMode === "standard" ? standardService : null,
          templateName,
          customMessage: messageMode === "custom" ? customMessage : null,
          selectedClientCount: clienteIds.length,
          metaSendAttempts: metaSendResult.attempts,
          whatsappMessageId: metaSendResult.whatsappMessageId,
          metaMessages: metaSendResult.metaMessages,
          attachmentPublicUrl: messageMode === "custom" ? attachmentPublicUrl || null : null,
          attachmentFileName: messageMode === "custom" ? attachmentFileName || null : null,
          promoKey: requestedPromoKey,
          promoName,
        });

        results.push({
          clienteId: clienteCorrente.id,
          nome: nomeCompleto,
          status: "sent",
          reason: "Messaggio inviato correttamente.",
          errorCode: null,
          fbtraceId: null,
          metaMessage: null,
          templateName,
          parameterFormat:
            messageMode === "custom"
              ? customParameterFormat
              : null,
          bodyParameterNames:
            messageMode === "custom" ? [...CUSTOM_MESSAGE_BODY_PARAMETER_NAMES] : [],
          telefonoMascherato: maskRecipient(metaRecipient),
          mediaUrl:
            messageMode === "custom" && customTemplateConfig.headerKind
              ? sanitizeUrl(attachmentPublicUrl)
              : null,
        });
      } catch (error) {
        results.push({
          clienteId: clienteCorrente.id,
          nome: nomeCompleto,
          status: "failed",
          reason: error instanceof Error ? error.message : "Errore imprevisto.",
          errorCode: null,
          fbtraceId: null,
          metaMessage: error instanceof Error ? error.message : null,
          templateName,
          parameterFormat: messageMode === "custom" ? customParameterFormat : null,
          bodyParameterNames:
            messageMode === "custom" ? [...CUSTOM_MESSAGE_BODY_PARAMETER_NAMES] : [],
          telefonoMascherato: maskRecipient(clienteCorrente.telefono),
          mediaUrl:
            messageMode === "custom" && customTemplateConfig.headerKind
              ? sanitizeUrl(attachmentPublicUrl)
              : null,
        });
      }
    }

    const sentCount = results.filter((row) => row.status === "sent").length;
    const failedCount = results.filter((row) => row.status === "failed").length;
    const skippedCount = results.filter((row) => row.status === "skipped").length;
    const skippedDuplicatePromo = results.filter(
      (row) => row.status === "skipped" && row.reason === DUPLICATE_PROMO_SKIP_REASON,
    ).length;
    const timeLimitReached = results.some(
      (row) => row.skipped_reason === BATCH_TIME_LIMIT_REASON,
    );

    return NextResponse.json({
      ok: true,
      dryRun: false,
      batchId,
      promoKey: requestedPromoKey,
      promoName,
      totalSelectedCount: clienteIds.length,
      sentCount,
      failedCount,
      skippedCount,
      skipped_duplicate_promo: skippedDuplicatePromo,
      partial: timeLimitReached,
      message: timeLimitReached
        ? "Batch concluso prima del timeout: alcuni destinatari non sono stati elaborati. Verificare Campagne prima di un nuovo invio."
        : undefined,
      blockedCount: skippedCount,
      errorCount: failedCount,
      results,
      failedResults: results.filter((row) => row.status === "failed"),
      skippedResults: results.filter((row) => row.status === "skipped"),
    });
    */
  } catch (error) {
    console.error("phonesia opportunita send-batch error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
