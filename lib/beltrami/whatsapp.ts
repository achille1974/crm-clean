const GRAPH_API_VERSION = "v23.0";
const DEFAULT_WELCOME_TEMPLATE_NAME = "bel_welcome_img_v1";
const WELCOME_FALLBACK_TEMPLATE_NAME = "beltrami_benvenuto_v1";
const DEFAULT_WELCOME_IMAGE_URL =
  "https://app.crm-supreme.it/beltrami/logo-whatsapp.jpg";
export const BELTRAMI_NOTIFY_TEMPLATE_NAME = "bel_reply_done_v1";
const DEFAULT_NOTIFY_TEMPLATE_NAME = BELTRAMI_NOTIFY_TEMPLATE_NAME;
const WELCOME_TEMPLATE_LANGUAGE = "it";
const NOTIFY_TEMPLATE_LANGUAGE = "it";

type MetaMessageResponse = {
  messages?: Array<{
    id?: string;
  }>;
};

export type BeltramiMetaErrorDetails = {
  message: string | null;
  type: string | null;
  code: number | string | null;
  error_subcode: number | string | null;
  fbtrace_id: string | null;
  http_status: number;
  response_status: string | null;
};

export type BeltramiMetaErrorRawJson = {
  response: {
    http_status: number;
    response_status: string | null;
  };
  error?: {
    message?: string;
    type?: string;
    code?: number | string;
    error_subcode?: number | string;
    fbtrace_id?: string;
  };
  raw_text?: string;
};

export type BeltramiWelcomeSendResult = {
  status: "sent" | "skipped" | "failed";
  reason:
    | "sent"
    | "missing_configuration"
    | "invalid_phone"
    | "meta_rejected"
    | "network_error";
  error: string | null;
  whatsappMessageId: string | null;
  templateName: string;
  errorDetails: BeltramiMetaErrorDetails | null;
  rawJson: BeltramiMetaErrorRawJson | null;
};

export type BeltramiNotifySendResult = {
  status: "sent" | "skipped" | "failed";
  reason:
    | "sent"
    | "missing_configuration"
    | "invalid_phone"
    | "handoff_unavailable"
    | "meta_rejected"
    | "network_error";
  error: string | null;
  whatsappMessageId: string | null;
  templateName: string;
  toPhone: string | null;
  errorDetails: BeltramiMetaErrorDetails | null;
  rawJson: BeltramiMetaErrorRawJson | null;
};

function toMetaRecipient(rawPhone: string): string | null {
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, "");
  const numeric = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  return /^\d+$/.test(numeric) ? numeric : null;
}

function compactTemplateText(value: string, maxLength: number): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 1).trimEnd();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/(access_token=)[^&\s"']+/gi, "$1[redacted]")
    .replace(/(Bearer\s+)[^\s"']+/gi, "$1[redacted]")
    .replace(/([?&]token=)[^&\s"']+/gi, "$1[redacted]");
}

function toSafeText(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const text = redactSensitiveText(value).trim();
  if (!text) {
    return null;
  }

  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function toSafeCode(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    return toSafeText(value, 120);
  }

  return null;
}

function buildSanitizedMetaRawJson(
  details: BeltramiMetaErrorDetails,
  rawText: string | null,
): BeltramiMetaErrorRawJson {
  const error: NonNullable<BeltramiMetaErrorRawJson["error"]> = {};

  if (details.message) error.message = details.message;
  if (details.type) error.type = details.type;
  if (details.code !== null) error.code = details.code;
  if (details.error_subcode !== null) error.error_subcode = details.error_subcode;
  if (details.fbtrace_id) error.fbtrace_id = details.fbtrace_id;

  return {
    response: {
      http_status: details.http_status,
      response_status: details.response_status,
    },
    ...(Object.keys(error).length > 0 ? { error } : {}),
    ...(rawText ? { raw_text: rawText } : {}),
  };
}

async function readMetaErrorResponse(response: Response): Promise<{
  errorDetails: BeltramiMetaErrorDetails;
  rawJson: BeltramiMetaErrorRawJson;
}> {
  const responseText = await response.text().catch(() => "");
  const safeRawText = toSafeText(responseText, 2000);
  const parsed = responseText
    ? await Promise.resolve()
        .then(() => JSON.parse(responseText) as unknown)
        .catch(() => null)
    : null;
  const metaError = isRecord(parsed) && isRecord(parsed.error) ? parsed.error : {};
  const details: BeltramiMetaErrorDetails = {
    message: toSafeText(metaError.message),
    type: toSafeText(metaError.type, 120),
    code: toSafeCode(metaError.code),
    error_subcode: toSafeCode(metaError.error_subcode),
    fbtrace_id: toSafeText(metaError.fbtrace_id, 120),
    http_status: response.status,
    response_status: toSafeText(response.statusText, 120),
  };

  return {
    errorDetails: details,
    rawJson: buildSanitizedMetaRawJson(details, parsed ? null : safeRawText),
  };
}

export async function sendBeltramiWelcomeMessage(params: {
  telefono: string;
}): Promise<BeltramiWelcomeSendResult> {
  const accessToken = process.env.BELTRAMI_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID;
  const requestedTemplateName =
    process.env.BELTRAMI_WHATSAPP_WELCOME_TEMPLATE_NAME || DEFAULT_WELCOME_TEMPLATE_NAME;
  const welcomeImageUrl =
    process.env.BELTRAMI_WHATSAPP_WELCOME_IMAGE_URL || DEFAULT_WELCOME_IMAGE_URL;
  const shouldUseImageHeader = requestedTemplateName === DEFAULT_WELCOME_TEMPLATE_NAME;
  const templateName =
    shouldUseImageHeader && !welcomeImageUrl
      ? WELCOME_FALLBACK_TEMPLATE_NAME
      : requestedTemplateName;
  const components =
    shouldUseImageHeader && templateName === requestedTemplateName
      ? [
          {
            type: "header",
            parameters: [
              {
                type: "image",
                image: {
                  link: welcomeImageUrl,
                },
              },
            ],
          },
        ]
      : undefined;

  if (!accessToken || !phoneNumberId) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      error: "configuration_missing",
      whatsappMessageId: null,
      templateName,
      errorDetails: null,
      rawJson: null,
    };
  }

  const to = toMetaRecipient(params.telefono);

  if (!to) {
    return {
      status: "skipped",
      reason: "invalid_phone",
      error: "invalid_phone",
      whatsappMessageId: null,
      templateName,
      errorDetails: null,
      rawJson: null,
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: {
              code: WELCOME_TEMPLATE_LANGUAGE,
            },
            ...(components ? { components } : {}),
          },
        }),
      },
    );

    if (!response.ok) {
      const metaError = await readMetaErrorResponse(response);

      return {
        status: "failed",
        reason: "meta_rejected",
        error: "meta_send_failed",
        whatsappMessageId: null,
        templateName,
        errorDetails: metaError.errorDetails,
        rawJson: metaError.rawJson,
      };
    }

    const result = (await response.json().catch(() => null)) as MetaMessageResponse | null;

    return {
      status: "sent",
      reason: "sent",
      error: null,
      whatsappMessageId: result?.messages?.[0]?.id ?? null,
      templateName,
      errorDetails: null,
      rawJson: null,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      error: "network_error",
      whatsappMessageId: null,
      templateName,
      errorDetails: null,
      rawJson: null,
    };
  }
}

export async function sendBeltramiNotifyMessage(params: {
  clienteNome: string;
  telefonoCliente: string;
  messaggioCliente: string;
  replyUrl: string;
  markDoneUrl: string;
  templateName?: string;
}): Promise<BeltramiNotifySendResult> {
  const accessToken = process.env.BELTRAMI_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID;
  const notifyTo = process.env.BELTRAMI_WHATSAPP_NOTIFY_TO_PHONE;
  const templateName = params.templateName || DEFAULT_NOTIFY_TEMPLATE_NAME;

  if (!accessToken || !phoneNumberId || !notifyTo) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      error: "configuration_missing",
      whatsappMessageId: null,
      templateName,
      toPhone: notifyTo ?? null,
      errorDetails: null,
      rawJson: null,
    };
  }

  const to = toMetaRecipient(notifyTo);

  if (!to) {
    return {
      status: "skipped",
      reason: "invalid_phone",
      error: "invalid_phone",
      whatsappMessageId: null,
      templateName,
      toPhone: notifyTo,
      errorDetails: null,
      rawJson: null,
    };
  }

  const bodyParameters = [
    {
      type: "text",
      parameter_name: "cliente_nome",
      text: compactTemplateText(params.clienteNome, 120),
    },
    {
      type: "text",
      parameter_name: "cliente_telefono",
      text: compactTemplateText(params.telefonoCliente, 60),
    },
    {
      type: "text",
      parameter_name: "messaggio_cliente",
      text: compactTemplateText(params.messaggioCliente, 320),
    },
    {
      type: "text",
      parameter_name: "link_risposta",
      text: compactTemplateText(params.replyUrl, 500),
    },
    {
      type: "text",
      parameter_name: "link_chiusura",
      text: compactTemplateText(params.markDoneUrl, 500),
    },
  ];

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: templateName,
            language: {
              code: process.env.BELTRAMI_WHATSAPP_NOTIFY_TEMPLATE_LANGUAGE || NOTIFY_TEMPLATE_LANGUAGE,
            },
            components: [
              {
                type: "body",
                parameters: bodyParameters,
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      const metaError = await readMetaErrorResponse(response);

      return {
        status: "failed",
        reason: "meta_rejected",
        error: "meta_send_failed",
        whatsappMessageId: null,
        templateName,
        toPhone: to,
        errorDetails: metaError.errorDetails,
        rawJson: metaError.rawJson,
      };
    }

    const result = (await response.json().catch(() => null)) as MetaMessageResponse | null;

    return {
      status: "sent",
      reason: "sent",
      error: null,
      whatsappMessageId: result?.messages?.[0]?.id ?? null,
      templateName,
      toPhone: to,
      errorDetails: null,
      rawJson: null,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      error: "network_error",
      whatsappMessageId: null,
      templateName,
      toPhone: to,
      errorDetails: null,
      rawJson: null,
    };
  }
}
