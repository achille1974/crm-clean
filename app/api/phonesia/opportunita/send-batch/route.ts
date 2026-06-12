import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
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

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE_OPPORTUNITA_NAME =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_NAME || "phonesia_opportunita_marketing_v2";
const WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE || "it";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_NAME = "phonesia_messaggio_personalizzato_v1";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE = "it";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_IMAGE_NAME =
  "phonesia_messaggio_personalizzato_media_v1";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_DOCUMENT_NAME =
  "phonesia_messaggio_personalizzato_documento_v1";

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
  clienteId: number;
  nome: string;
  status: "sent" | "blocked" | "error" | "not_found";
  reason: string;
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

type TemplateHeaderParameter =
  | {
      kind: "image";
      link: string;
      mimeType?: string | null;
    }
  | {
      kind: "document";
      link: string;
      fileName: string | null;
      mimeType?: string | null;
    };

type MetaTemplateSendAttempt = {
  attempt: 1 | 2;
  template_name: string;
  status: "success" | "error";
  http_status: number | null;
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
  mediaPreflight?: MediaUrlPreflightResult | null;
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

function summarizeComponent(component: unknown): Record<string, unknown> {
  const item = asRecord(component);

  if (!item) {
    return { type: "unknown" };
  }

  const parameters = Array.isArray(item.parameters) ? item.parameters : [];

  return {
    type: typeof item.type === "string" ? item.type : "unknown",
    sub_type: typeof item.sub_type === "string" ? item.sub_type : undefined,
    index: typeof item.index === "string" ? item.index : undefined,
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
      components: getTemplateComponents(payload).map(summarizeComponent),
    },
  };
}

function getBodyParamsCount(payload: Record<string, unknown>): number {
  const body = getTemplateComponents(payload)
    .map(asRecord)
    .find((component) => component?.type === "body");
  const parameters = body ? body.parameters : null;
  return Array.isArray(parameters) ? parameters.length : 0;
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
      attempts.push({
        attempt,
        template_name: params.templateName,
        status: "success",
        http_status: response.status,
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
        response: await response.json().catch(() => null),
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
  headerParameter?: TemplateHeaderParameter | null;
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
      mediaPreflight: params.mediaPreflight ?? null,
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
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
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
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
    negozioContatto: string;
    whatsappUrl: string;
    mapsUrl: string;
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
      template_usato: params.templateName,
      tipo_invio: params.sendMode,
      send_mode: params.sendMode,
      standard_service: params.standardService,
      custom_message: params.customMessage,
      messaggio_personalizzato: params.customMessage,
      selected_client_count: params.selectedClientCount,
      numero_clienti_selezionati: params.selectedClientCount,
      meta_send_attempts: params.metaSendAttempts,
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
  },
) {
  const lastError = [...params.attempts]
    .reverse()
    .find((attempt) => attempt.status === "error");

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
      },
    });
  } catch (error) {
    console.error("Errore log fallimento Meta template batch:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

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

    const customMessage = normalizeText(String(formData.get("customMessage") ?? ""));
    const attachmentPublicUrl = normalizeText(String(formData.get("attachmentPublicUrl") ?? ""));
    const attachmentFileName = normalizeText(String(formData.get("attachmentFileName") ?? ""));
    const attachmentMimeType = normalizeText(String(formData.get("attachmentMimeType") ?? ""));
    const hasAttachment = Boolean(attachmentPublicUrl);

    if (clienteIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "nessun_cliente_selezionato" },
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
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_custom_non_supportato",
          message:
            "Gli allegati richiedono un template Meta con intestazione immagine o documento.",
        },
        { status: 400 },
      );
    }

    if (
      messageMode === "custom" &&
      customTemplateConfig.headerKind &&
      !attachmentPublicUrl
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_custom_mancante",
          message: "Carica un allegato compatibile con il template selezionato.",
        },
        { status: 400 },
      );
    }

    if (
      messageMode === "custom" &&
      customTemplateConfig.headerKind === "image" &&
      attachmentPublicUrl &&
      !isAllowedImageAttachment({
        publicUrl: attachmentPublicUrl,
        fileName: attachmentFileName || null,
        mimeType: attachmentMimeType || null,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_custom_non_compatibile",
          message: "Carica un allegato compatibile con il template selezionato.",
        },
        { status: 400 },
      );
    }

    if (
      messageMode === "custom" &&
      customTemplateConfig.headerKind === "document" &&
      attachmentPublicUrl &&
      !isAllowedDocumentAttachment({
        publicUrl: attachmentPublicUrl,
        fileName: attachmentFileName || null,
        mimeType: attachmentMimeType || null,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_custom_non_compatibile",
          message: "Carica un allegato compatibile con il template selezionato.",
        },
        { status: 400 },
      );
    }

    const mediaPreflight =
      messageMode === "custom" && customTemplateConfig.headerKind
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

      return NextResponse.json(
        {
          ok: false,
          error: "attachment_non_accessibile_da_meta",
          message:
            "Allegato non accessibile da Meta. Verifica che il file sia pubblico, HTTPS e con content-type corretto.",
          media_check: mediaPreflight,
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const batchId = crypto.randomUUID();

    const [
      { data: clientiData, error: clientiError },
      { data: marketingRows, error: marketingError },
      { data: contrattiData, error: contrattiError },
      { data: alreadySentRows, error: alreadySentError },
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

    const clienti = (clientiData ?? []) as ClienteRow[];
    const contratti = (contrattiData ?? []) as ContrattoRow[];
    const marketingData = (marketingRows ?? []) as MarketingRow[];
    const alreadySentData = (alreadySentRows ?? []) as AlreadySentRow[];

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

    const results: SendResultRow[] = [];

    for (const clienteId of clienteIds) {
      const cliente = clientiMap.get(clienteId);

      if (!cliente) {
        results.push({
          clienteId,
          nome: `Cliente ${clienteId}`,
          status: "not_found",
          reason: "Cliente non trovato.",
        });
        continue;
      }

      const nomeCompleto =
        [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() || `Cliente ${cliente.id}`;

      if (!marketingIds.has(cliente.id)) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Consenso marketing mancante.",
        });
        continue;
      }

      if (!cliente.whatsapp_active) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "WhatsApp non attivo.",
        });
        continue;
      }

      if (!cliente.telefono) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Telefono mancante o non valido.",
        });
        continue;
      }

      if (sendMode === "standard" && standardService && alreadySentIds.has(cliente.id)) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Opportunità già inviata in precedenza.",
        });
        continue;
      }

      try {
        const contrattiCliente = contrattiByCliente.get(cliente.id) ?? [];
        const negozioContrattoId =
          contrattiCliente.find((row) => row.negozio_id != null)?.negozio_id ?? null;

        const contactStoreId = negozioContrattoId ?? cliente.negozio_id ?? 1;
        const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];

        const metaRecipient = toMetaRecipient(cliente.telefono);

        if (!metaRecipient) {
          results.push({
            clienteId: cliente.id,
            nome: nomeCompleto,
            status: "blocked",
            reason: "Numero non valido per WhatsApp.",
          });
          continue;
        }

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
        let metaSendResult: MetaTemplateSendResult;

        try {
          if (messageMode === "custom") {
            metaSendResult = await sendWhatsAppTemplate({
              to: metaRecipient,
              templateName,
              languageCode: templateLanguage,
              mode: `custom_${customTemplateConfig.mode}`,
              headerParameter: customTemplateConfig.headerKind
                ? {
                    kind: customTemplateConfig.headerKind,
                    link: attachmentPublicUrl,
                    mimeType: attachmentMimeType || null,
                    ...(customTemplateConfig.headerKind === "document"
                      ? { fileName: attachmentFileName || null }
                      : {}),
                  } as TemplateHeaderParameter
                : null,
              bodyParameters: [
                {
                  parameterName: "nome_cliente",
                  text: normalizeText(cliente.nome) || "cliente",
                },
                {
                  parameterName: "messaggio",
                  text: customMessage,
                },
              ],
              mediaPreflight,
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
            const message = formatMetaTemplateError(error);

            await logMetaTemplateFailure(supabase, {
              clienteId: cliente.id,
              responseText: message,
              negozioContatto: contactStore.label,
              batchId,
              sendMode,
              standardService: messageMode === "standard" ? standardService : null,
              templateName,
              customMessage: messageMode === "custom" ? customMessage : null,
              selectedClientCount: clienteIds.length,
              attempts: error.attempts,
            });

            results.push({
              clienteId: cliente.id,
              nome: nomeCompleto,
              status: "error",
              reason: message,
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
          clienteId: cliente.id,
          batchId,
          sendMode,
          standardService: messageMode === "standard" ? standardService : null,
          messageText: text,
          templateName,
          customMessage: messageMode === "custom" ? customMessage : null,
          selectedClientCount: clienteIds.length,
          metaSendAttempts: metaSendResult.attempts,
          attachmentPublicUrl: messageMode === "custom" ? attachmentPublicUrl || null : null,
          attachmentFileName: messageMode === "custom" ? attachmentFileName || null : null,
          negozioContatto: contactStore.label,
          whatsappUrl,
          mapsUrl: contactStore.mapsUrl,
        });

        await logOpportunitySend(supabase, {
          clienteId: cliente.id,
          responseText: text,
          negozioContatto: contactStore.label,
          batchId,
          sendMode,
          standardService: messageMode === "standard" ? standardService : null,
          templateName,
          customMessage: messageMode === "custom" ? customMessage : null,
          selectedClientCount: clienteIds.length,
          metaSendAttempts: metaSendResult.attempts,
          attachmentPublicUrl: messageMode === "custom" ? attachmentPublicUrl || null : null,
          attachmentFileName: messageMode === "custom" ? attachmentFileName || null : null,
        });

        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "sent",
          reason: "Messaggio inviato correttamente.",
        });
      } catch (error) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "error",
          reason: error instanceof Error ? error.message : "Errore imprevisto.",
        });
      }
    }

    const sentCount = results.filter((row) => row.status === "sent").length;
    const blockedCount = results.filter((row) => row.status === "blocked").length;
    const errorCount = results.filter(
      (row) => row.status === "error" || row.status === "not_found",
    ).length;

    return NextResponse.json({
      ok: true,
      batchId,
      sentCount,
      blockedCount,
      errorCount,
      results,
    });
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
