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
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_NAME ||
  "phonesia_opportunita_marketing_v2";

const WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE || "it";

const WHATSAPP_TEMPLATE_OPPORTUNITA_MEDIA_NAME =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_MEDIA_NAME ||
  "phonesia_opportunita_marketing_media_v1";

const WHATSAPP_TEMPLATE_OPPORTUNITA_MEDIA_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_MEDIA_LANGUAGE ||
  WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE;

const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_NAME = "ph_msg_txt_v1";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE = "it";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_IMAGE_NAME = "ph_msg_img_v1";
const WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_DOCUMENT_NAME = "ph_msg_doc_v1";
const CUSTOM_MESSAGE_BODY_PARAMETER_NAMES = ["nome_cliente", "messaggio"] as const;

const OPPORTUNITA_HEADER_IMAGE_URL =
  "https://crm-clean.vercel.app/phonesia/welcome-header.jpg";

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
  negozio_id: number | null;
  data_stipula: string | null;
  created_at: string | null;
};

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

type OpportunitySentRow = {
  id: number | string | null;
  opportunita_code: string | null;
  opportunita_label: string | null;
  send_mode: string | null;
  batch_id: string | null;
  messaggio: string | null;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  negozio_contatto: string | null;
  inviato_at: string | null;
};

type AlreadySentRow = {
  opportunita_code: string | null;
};

type SendMode =
  | "standard"
  | "standard_media"
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
  parameterFormat: "NAMED" | "POSITIONAL";
  bodyParameterNames: string[];
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

const STORE_CONTACTS: Record<
  number,
  {
    label: string;
    mapsUrl: string;
    mapsQuery: string;
  }
> = {
  1: {
    label: "PHONESIA Floridia",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
    mapsQuery: "Corso+Vittorio+Emanuele+735+Floridia",
  },
  2: {
    label: "PHONESIA Augusta",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta",
    mapsQuery: "Viale+Italia+195+Augusta",
  },
  3: {
    label: "PHONESIA Siracusa",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa",
    mapsQuery: "Corso+Gelone+41+Siracusa",
  },
  4: {
    label: "PHONESIA Avola",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola",
    mapsQuery: "Corso+Vittorio+Emanuele+281+Avola",
  },
  5: {
    label: "PHONESIA Floridia",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
    mapsQuery: "Corso+Vittorio+Emanuele+735+Floridia",
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

function serviceMessageLabel(service: ServiceFamily): string {
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

function buildOfferText(services: ServiceFamily[]): string {
  if (services.length === 1) {
    const service = services[0];

    if (service === "FISSO") return "fibra";
    if (service === "MOBILE") return "mobile";
    if (service === "ENERGIA") return "energia";

    return serviceMessageLabel(service);
  }

  return services.map((service) => serviceMessageLabel(service)).join(", ");
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

async function sendWhatsAppOpportunityTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  headerImageUrl: string;
  nomeCliente: string;
  servizio: string;
  indirizzoNegozio: string;
  mediaPreflight?: MediaUrlPreflightResult | null;
}) {
  const payload = {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: params.languageCode,
      },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                link: params.headerImageUrl,
              },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            {
              type: "text",
              parameter_name: "nome_cliente",
              text: params.nomeCliente,
            },
            {
              type: "text",
              parameter_name: "servizio",
              text: params.servizio,
            },
          ],
        },
        {
          type: "button",
          sub_type: "url",
          index: "1",
          parameters: [
            {
              type: "text",
              text: params.indirizzoNegozio,
            },
          ],
        },
      ],
    },
  };

  return sendMetaTemplateWithRetry({
    templateName: params.templateName,
    payload,
    diagnostics: {
      mode: "standard_image",
      templateName: params.templateName,
      language: params.languageCode,
      hasHeaderMedia: true,
      mediaUrl: sanitizeUrl(params.headerImageUrl),
      mediaMime: params.mediaPreflight?.content_type ?? null,
      bodyParamsCount: getBodyParamsCount(payload),
      parameterFormat: getBodyParameterFormat(payload),
      bodyParameterNames: getBodyParameterNames(payload),
      mediaPreflight: params.mediaPreflight ?? null,
    },
  });
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

function getLastMetaErrorDetail(error: MetaTemplateSendError) {
  const lastError = [...error.attempts]
    .reverse()
    .find((attempt) => attempt.status === "error");

  return lastError
    ? {
        http_status: lastError.http_status,
        message: lastError.error_message ?? lastError.message,
        type: lastError.error_type,
        code: lastError.error_code,
        error_subcode: lastError.error_subcode,
        error_data: lastError.error_data,
        is_transient: lastError.is_transient,
        fbtrace_id: lastError.fbtrace_id,
        template_name: lastError.template_name,
        attempt: lastError.attempt,
        payload_summary: lastError.payload_summary,
      }
    : null;
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

async function sendWhatsAppCustomMessageTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  nomeCliente: string;
  messaggio: string;
  headerMedia: {
    kind: "image" | "document";
    link: string;
    fileName: string | null;
    mimeType: string | null;
  } | null;
  mediaPreflight?: MediaUrlPreflightResult | null;
}) {
  const components: Array<Record<string, unknown>> = [];

  if (params.headerMedia?.kind === "image") {
    components.push({
      type: "header",
      parameters: [
        {
          type: "image",
          image: {
            link: params.headerMedia.link,
          },
        },
      ],
    });
  }

  if (params.headerMedia?.kind === "document") {
    components.push({
      type: "header",
      parameters: [
        {
          type: "document",
          document: {
            link: params.headerMedia.link,
            ...(params.headerMedia.fileName
              ? { filename: params.headerMedia.fileName }
              : {}),
          },
        },
      ],
    });
  }

  components.push({
    type: "body",
    parameters: [
      {
        type: "text",
        parameter_name: CUSTOM_MESSAGE_BODY_PARAMETER_NAMES[0],
        text: params.nomeCliente,
      },
      {
        type: "text",
        parameter_name: CUSTOM_MESSAGE_BODY_PARAMETER_NAMES[1],
        text: params.messaggio,
      },
    ],
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
      mode: params.headerMedia ? `custom_${params.headerMedia.kind}` : "custom_text",
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
    },
  });
}

async function logOpportunitySend(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    services: ServiceFamily[];
    responseText: string;
    negozioContatto: string;
    templateName: string;
    sendMode: SendMode;
    customMessage?: string | null;
    selectedClientCount?: number;
    metaSendAttempts?: MetaTemplateSendAttempt[];
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
          ? "[dashboard] invio messaggio personalizzato"
          : params.attachmentPublicUrl
            ? `[dashboard] invio opportunità con locandina: ${params.services.join(", ")}`
            : `[dashboard] invio opportunità: ${params.services.join(", ")}`,
      intent: "dashboard_opportunita_send",
      tool_usato: "api_phonesia_opportunita_send",
      risposta_agente: params.responseText,
      stato: "completato",
      handoff_richiesto: false,
      metadata: {
        servizi: params.services,
        negozio_contatto: params.negozioContatto,
        template_name: params.templateName,
        template_usato: params.templateName,
        tipo_invio: params.sendMode,
        send_mode: params.sendMode,
        custom_message: params.customMessage ?? null,
        messaggio_personalizzato: params.customMessage ?? null,
        selected_client_count: params.selectedClientCount ?? 1,
        numero_clienti_selezionati: params.selectedClientCount ?? 1,
        meta_send_attempts: params.metaSendAttempts ?? [],
        meta_error_code:
          params.metaSendAttempts?.find((attempt) => attempt.status === "error")
            ?.error_code ?? null,
        meta_is_transient:
          params.metaSendAttempts?.find((attempt) => attempt.status === "error")
            ?.is_transient ?? null,
        meta_fbtrace_id:
          params.metaSendAttempts?.find((attempt) => attempt.status === "error")
            ?.fbtrace_id ?? null,
        attachment_public_url: params.attachmentPublicUrl,
        attachment_file_name: params.attachmentFileName,
      },
    });
  } catch (error) {
    console.error("Errore log opportunità:", error);
  }
}

async function saveSentOpportunities(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    services: ServiceFamily[];
    text: string;
    negozioContatto: string;
    mapsUrl: string;
    sendMode: SendMode;
    templateName: string;
    metaSendAttempts?: MetaTemplateSendAttempt[];
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
  },
) {
  const rows: OpportunityInsertRow[] = params.services.map((service) => ({
    cliente_id: params.clienteId,
    opportunita_code: service,
    opportunita_label: serviceLabel(service),
    send_mode: params.sendMode,
    batch_id: null,
    messaggio: params.text,
    attachment_public_url: params.attachmentPublicUrl,
    attachment_file_name: params.attachmentFileName,
    negozio_contatto: params.negozioContatto,
    metadata: {
      services: params.services,
      maps_url: params.mapsUrl,
      template_name: params.templateName,
      template_usato: params.templateName,
      tipo_invio: params.sendMode,
      send_mode: params.sendMode,
      meta_send_attempts: params.metaSendAttempts ?? [],
      meta_error_code:
        params.metaSendAttempts?.find((attempt) => attempt.status === "error")
          ?.error_code ?? null,
      meta_is_transient:
        params.metaSendAttempts?.find((attempt) => attempt.status === "error")
          ?.is_transient ?? null,
      meta_fbtrace_id:
        params.metaSendAttempts?.find((attempt) => attempt.status === "error")
          ?.fbtrace_id ?? null,
      attachment_public_url: params.attachmentPublicUrl,
      attachment_file_name: params.attachmentFileName,
    },
  }));

  const { data, error } = await supabase
    .from("phonesia_opportunita_inviate")
    .upsert(rows, {
      onConflict: "cliente_id,opportunita_code",
    })
    .select(
      "id, opportunita_code, opportunita_label, send_mode, batch_id, messaggio, attachment_public_url, attachment_file_name, negozio_contatto, inviato_at",
    );

  if (error) {
    throw new Error(`Errore salvataggio opportunità inviate: ${error.message}`);
  }

  return ((data ?? []) as OpportunitySentRow[]).map((row) => ({
    id: Number(row.id),
    opportunityCode: normalizeText(row.opportunita_code),
    opportunityLabel: normalizeText(row.opportunita_label),
    sendMode: normalizeText(row.send_mode),
    batchId: normalizeText(row.batch_id),
    message: normalizeText(row.messaggio),
    attachmentPublicUrl: normalizeText(row.attachment_public_url),
    attachmentFileName: normalizeText(row.attachment_file_name),
    negozioContatto: normalizeText(row.negozio_contatto),
    sentAt: normalizeText(row.inviato_at),
  }));
}

async function saveCustomMessageOpportunity(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    text: string;
    negozioContatto: string;
    mapsUrl: string;
    sendMode: SendMode;
    templateName: string;
    selectedClientCount: number;
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
    metaSendAttempts: MetaTemplateSendAttempt[];
  },
) {
  const codePrefix =
    params.sendMode === "custom_message_image"
      ? "CUSTOM_MESSAGE_IMAGE"
      : params.sendMode === "custom_message_document"
        ? "CUSTOM_MESSAGE_DOCUMENT"
        : "CUSTOM_MESSAGE";

  const row: OpportunityInsertRow = {
    cliente_id: params.clienteId,
    opportunita_code: `${codePrefix}:${crypto.randomUUID()}`,
    opportunita_label: "Messaggio personalizzato",
    send_mode: params.sendMode,
    batch_id: null,
    messaggio: params.text,
    attachment_public_url: params.attachmentPublicUrl,
    attachment_file_name: params.attachmentFileName,
    negozio_contatto: params.negozioContatto,
    metadata: {
      maps_url: params.mapsUrl,
      template_name: params.templateName,
      template_usato: params.templateName,
      tipo_invio: params.sendMode,
      send_mode: params.sendMode,
      custom_message: params.text,
      messaggio_personalizzato: params.text,
      attachment_public_url: params.attachmentPublicUrl,
      attachment_file_name: params.attachmentFileName,
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
    },
  };

  const { data, error } = await supabase
    .from("phonesia_opportunita_inviate")
    .insert(row)
    .select(
      "id, opportunita_code, opportunita_label, send_mode, batch_id, messaggio, attachment_public_url, attachment_file_name, negozio_contatto, inviato_at",
    )
    .single();

  if (error) {
    throw new Error(`Errore salvataggio messaggio personalizzato: ${error.message}`);
  }

  const sent = data as OpportunitySentRow;

  return [
    {
      id: Number(sent.id),
      opportunityCode: normalizeText(sent.opportunita_code),
      opportunityLabel: normalizeText(sent.opportunita_label),
      sendMode: normalizeText(sent.send_mode),
      batchId: normalizeText(sent.batch_id),
      message: normalizeText(sent.messaggio),
      attachmentPublicUrl: normalizeText(sent.attachment_public_url),
      attachmentFileName: normalizeText(sent.attachment_file_name),
      negozioContatto: normalizeText(sent.negozio_contatto),
      sentAt: normalizeText(sent.inviato_at),
    },
  ];
}

async function logMetaTemplateFailure(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    templateName: string;
    sendMode: SendMode;
    responseText: string;
    negozioContatto: string;
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
          ? "[dashboard] errore invio messaggio personalizzato"
          : "[dashboard] errore invio opportunità",
      intent: "dashboard_opportunita_send",
      tool_usato: "api_phonesia_opportunita_send",
      risposta_agente: params.responseText,
      stato: "errore",
      handoff_richiesto: false,
      metadata: {
        template_name: params.templateName,
        template_usato: params.templateName,
        tipo_invio: params.sendMode,
        send_mode: params.sendMode,
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
    console.error("Errore log fallimento Meta template:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clienteId?: number;
      messageMode?: string;
      customMessageMode?: string | null;
      services?: string[];
      customMessage?: string | null;
      attachmentPublicUrl?: string | null;
      attachmentFileName?: string | null;
      attachmentMimeType?: string | null;
    };

    const clienteId = Number(body.clienteId);
    const messageMode =
      normalizeText(body.messageMode).toLowerCase() === "custom" ? "custom" : "standard";
    const customMessageModeRaw = normalizeText(body.customMessageMode).toLowerCase();
    const customMessageMode = isValidCustomMessageMode(customMessageModeRaw)
      ? customMessageModeRaw
      : "text";
    const customTemplateConfig = resolveCustomTemplateConfig(customMessageMode);
    const customMessage = normalizeText(body.customMessage);
    const rawServices = Array.isArray(body.services) ? body.services : [];
    const services = [
      ...new Set(
        rawServices
          .map((value) => normalizeText(value).toUpperCase())
          .filter(isValidService),
      ),
    ];

    const rawAttachmentPublicUrl = normalizeText(body.attachmentPublicUrl);
    const attachmentPublicUrl = rawAttachmentPublicUrl
      ? normalizePublicUrl(rawAttachmentPublicUrl)
      : null;

    const attachmentFileName = normalizeText(body.attachmentFileName) || null;
    const attachmentMimeType = normalizeText(body.attachmentMimeType) || null;

    if (!Number.isFinite(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "cliente_non_valido" },
        { status: 400 },
      );
    }

    if (messageMode === "standard" && services.length === 0) {
      return NextResponse.json(
        { ok: false, error: "nessun_servizio_selezionato" },
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

    if (rawAttachmentPublicUrl && !attachmentPublicUrl) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_url_non_valido",
          message: "Il link della locandina non è valido.",
        },
        { status: 400 },
      );
    }

    if (messageMode === "custom" && customMessageMode === "text" && attachmentPublicUrl) {
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
        fileName: attachmentFileName,
        mimeType: attachmentMimeType,
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
        fileName: attachmentFileName,
        mimeType: attachmentMimeType,
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
      messageMode === "standard" &&
      attachmentPublicUrl &&
      !isAllowedImageAttachment({
        publicUrl: attachmentPublicUrl,
        fileName: attachmentFileName,
        mimeType: attachmentMimeType,
      })
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_non_immagine",
          message:
            "Il template con locandina supporta solo immagini. Usa JPG, PNG o WEBP.",
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const [
      { data: clienteData, error: clienteError },
      { data: marketingConsentData, error: marketingConsentError },
      { data: contrattiData, error: contrattiError },
      { data: alreadySentData, error: alreadySentError },
    ] = await Promise.all([
      supabase
        .from("phonesia_clienti")
        .select(
          "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active",
        )
        .eq("id", clienteId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("phonesia_consensi")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("tipo_evento", "marketing_accepted")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("phonesia_contratti")
        .select("negozio_id, data_stipula, created_at")
        .eq("cliente_id", clienteId)
        .order("data_stipula", { ascending: false })
        .order("created_at", { ascending: false }),
      messageMode === "standard"
        ? supabase
            .from("phonesia_opportunita_inviate")
            .select("opportunita_code")
            .eq("cliente_id", clienteId)
            .in("opportunita_code", services)
        : Promise.resolve({ data: [], error: null } as { data: AlreadySentRow[]; error: null }),
    ]);

    if (clienteError) {
      throw new Error(`Errore lettura cliente: ${clienteError.message}`);
    }

    if (marketingConsentError) {
      throw new Error(
        `Errore lettura consenso marketing: ${marketingConsentError.message}`,
      );
    }

    if (contrattiError) {
      throw new Error(`Errore lettura contratti: ${contrattiError.message}`);
    }

    if (alreadySentError) {
      throw new Error(
        `Errore lettura opportunità già inviate: ${alreadySentError.message}`,
      );
    }

    const cliente = clienteData as ClienteRow | null;
    const contratti = (contrattiData ?? []) as ContrattoRow[];
    const alreadySentRows = (alreadySentData ?? []) as AlreadySentRow[];

    if (!cliente) {
      return NextResponse.json(
        { ok: false, error: "cliente_non_trovato" },
        { status: 404 },
      );
    }

    if (!marketingConsentData) {
      return NextResponse.json(
        {
          ok: false,
          error: "consenso_marketing_mancante",
          message: "Il cliente non ha rilasciato il consenso marketing.",
        },
        { status: 409 },
      );
    }

    if (!cliente.whatsapp_active) {
      return NextResponse.json(
        {
          ok: false,
          error: "whatsapp_non_attivo",
          message: "Il cliente non ha WhatsApp attivo.",
        },
        { status: 409 },
      );
    }

    if (!cliente.telefono) {
      return NextResponse.json(
        {
          ok: false,
          error: "telefono_mancante",
          message: "Il cliente non ha un numero di telefono valido.",
        },
        { status: 409 },
      );
    }

    const alreadySentCodes = new Set<string>(
      alreadySentRows
        .map((row) => normalizeText(row.opportunita_code).toUpperCase())
        .filter(Boolean),
    );

    const servicesToSend =
      messageMode === "standard"
        ? services.filter((service) => !alreadySentCodes.has(service))
        : [];

    if (messageMode === "standard" && servicesToSend.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "opportunita_gia_inviata",
          message:
            "Le opportunità selezionate risultano già inviate a questo cliente.",
        },
        { status: 409 },
      );
    }

    const negozioContrattoId =
      contratti.find((row) => row.negozio_id != null)?.negozio_id ?? null;

    const contactStoreId = negozioContrattoId ?? cliente.negozio_id ?? 1;
    const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];

    const nomeCliente =
      normalizeText([cliente.nome, cliente.cognome].filter(Boolean).join(" ")) ||
      "cliente";
    const nomeClienteTemplate = normalizeText(cliente.nome) || "cliente";

    const offerText = buildOfferText(servicesToSend);

    const metaRecipient = toMetaRecipient(cliente.telefono);

    if (!metaRecipient) {
      return NextResponse.json(
        {
          ok: false,
          error: "telefono_non_valido",
          message: "Il numero di telefono del cliente non è valido per WhatsApp.",
        },
        { status: 409 },
      );
    }

    if (messageMode === "custom") {
      let metaSendResult: MetaTemplateSendResult;
      const mediaPreflight = customTemplateConfig.headerKind
        ? await inspectTemplateMediaUrl(
            attachmentPublicUrl!,
            customTemplateConfig.headerKind,
          )
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

      try {
        metaSendResult = await sendWhatsAppCustomMessageTemplate({
          to: metaRecipient,
          templateName: customTemplateConfig.templateName,
          languageCode: WHATSAPP_TEMPLATE_CUSTOM_MESSAGE_LANGUAGE,
          nomeCliente: nomeClienteTemplate,
          messaggio: customMessage,
          headerMedia: customTemplateConfig.headerKind
            ? {
                kind: customTemplateConfig.headerKind,
                link: attachmentPublicUrl!,
                fileName: attachmentFileName,
                mimeType: attachmentMimeType,
              }
            : null,
          mediaPreflight,
        });
      } catch (error) {
        if (error instanceof MetaTemplateSendError) {
          const message = formatMetaTemplateError(error);

          await logMetaTemplateFailure(supabase, {
            clienteId,
            templateName: customTemplateConfig.templateName,
            sendMode: customTemplateConfig.sendMode,
            responseText: message,
            negozioContatto: contactStore.label,
            customMessage,
            selectedClientCount: 1,
            attempts: error.attempts,
          });

          return NextResponse.json(
            {
              ok: false,
              error: "meta_template_send_failed",
              message,
              detail: error.message,
              template_name: error.templateName,
              meta_error: getLastMetaErrorDetail(error),
              meta_attempts: error.attempts,
            },
            { status: 502 },
          );
        }

        throw error;
      }

      const sentOpportunities = await saveCustomMessageOpportunity(supabase, {
        clienteId,
        text: customMessage,
        negozioContatto: contactStore.label,
        mapsUrl: contactStore.mapsUrl,
        sendMode: customTemplateConfig.sendMode,
        templateName: customTemplateConfig.templateName,
        selectedClientCount: 1,
        attachmentPublicUrl,
        attachmentFileName,
        metaSendAttempts: metaSendResult.attempts,
      });

      await logOpportunitySend(supabase, {
        clienteId,
        services: [],
        responseText: customMessage,
        negozioContatto: contactStore.label,
        templateName: customTemplateConfig.templateName,
        sendMode: customTemplateConfig.sendMode,
        customMessage,
        selectedClientCount: 1,
        metaSendAttempts: metaSendResult.attempts,
        attachmentPublicUrl,
        attachmentFileName,
      });

      return NextResponse.json({
        ok: true,
        message: "Messaggio personalizzato inviato correttamente.",
        negozio_contatto: contactStore.label,
        services: [],
        template_name: customTemplateConfig.templateName,
        send_mode: customTemplateConfig.sendMode,
        attachment_public_url: attachmentPublicUrl,
        attachment_file_name: attachmentFileName,
        sentOpportunities,
      });
    }

    const hasAttachment = Boolean(attachmentPublicUrl);
    const templateName = hasAttachment
      ? WHATSAPP_TEMPLATE_OPPORTUNITA_MEDIA_NAME
      : WHATSAPP_TEMPLATE_OPPORTUNITA_NAME;

    const templateLanguage = hasAttachment
      ? WHATSAPP_TEMPLATE_OPPORTUNITA_MEDIA_LANGUAGE
      : WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE;

    const headerImageUrl = attachmentPublicUrl || OPPORTUNITA_HEADER_IMAGE_URL;
    const sendMode = hasAttachment ? "standard_media" : "standard";
    const mediaPreflight = hasAttachment
      ? await inspectTemplateMediaUrl(attachmentPublicUrl!, "image")
      : null;

    if (mediaPreflight && !mediaPreflight.ok) {
      console.warn(
        "phonesia.whatsapp.template_media.preflight_failed",
        JSON.stringify({
          mode: "standard_image",
          templateName,
          language: templateLanguage,
          mediaPreflight,
        }),
      );

      return NextResponse.json(
        {
          ok: false,
          error: "attachment_non_accessibile_da_meta",
          message:
            "Allegato non accessibile da Meta. Verifica che il file sia pubblico, HTTPS e con content-type immagine.",
          media_check: mediaPreflight,
        },
        { status: 400 },
      );
    }

    let metaSendResult: MetaTemplateSendResult;

    try {
      metaSendResult = await sendWhatsAppOpportunityTemplate({
        to: metaRecipient,
        templateName,
        languageCode: templateLanguage,
        headerImageUrl,
        nomeCliente,
        servizio: offerText,
        indirizzoNegozio: contactStore.mapsQuery,
        mediaPreflight,
      });
    } catch (error) {
      if (error instanceof MetaTemplateSendError) {
        const message = formatMetaTemplateError(error);

        await logMetaTemplateFailure(supabase, {
          clienteId,
          templateName,
          sendMode,
          responseText: message,
          negozioContatto: contactStore.label,
          customMessage: null,
          selectedClientCount: 1,
          attempts: error.attempts,
        });

        return NextResponse.json(
          {
            ok: false,
            error: "meta_template_send_failed",
            message,
            detail: error.message,
            template_name: error.templateName,
            meta_error: getLastMetaErrorDetail(error),
            meta_attempts: error.attempts,
          },
          { status: 502 },
        );
      }

      throw error;
    }

    const text = hasAttachment
      ? `Ciao ${nomeCliente}, abbiamo una proposta dedicata per te su ${offerText}.\n\n` +
        "Guarda la locandina e, se vuoi maggiori informazioni, puoi contattarci o passare direttamente nel tuo punto vendita PHONESIA.\n\n" +
        `Dove siamo: ${contactStore.mapsUrl}\n\n` +
        "Siamo a tua disposizione 🙂"
      : `Ciao ${nomeCliente}, abbiamo una proposta dedicata per te su ${offerText}.\n\n` +
        "Puoi rispondere direttamente a questo messaggio per ricevere informazioni dal tuo punto vendita PHONESIA.\n\n" +
        `Dove siamo: ${contactStore.mapsUrl}\n\n` +
        "Siamo a tua disposizione 🙂";

    const sentOpportunities = await saveSentOpportunities(supabase, {
      clienteId,
      services: servicesToSend,
      text,
      negozioContatto: contactStore.label,
      mapsUrl: contactStore.mapsUrl,
      sendMode,
      templateName,
      metaSendAttempts: metaSendResult.attempts,
      attachmentPublicUrl,
      attachmentFileName,
    });

    await logOpportunitySend(supabase, {
      clienteId,
      services: servicesToSend,
      responseText: text,
      negozioContatto: contactStore.label,
      templateName,
      sendMode,
      metaSendAttempts: metaSendResult.attempts,
      attachmentPublicUrl,
      attachmentFileName,
    });

    return NextResponse.json({
      ok: true,
      message:
        servicesToSend.length === 1
          ? "Opportunità inviata correttamente."
          : "Opportunità inviate correttamente.",
      negozio_contatto: contactStore.label,
      services: servicesToSend,
      template_name: templateName,
      send_mode: sendMode,
      attachment_public_url: attachmentPublicUrl,
      attachment_file_name: attachmentFileName,
      sentOpportunities,
    });
  } catch (error) {
    console.error("phonesia opportunita send error:", error);

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
