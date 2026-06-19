const GRAPH_API_VERSION = "v23.0";
const DEFAULT_WELCOME_TEMPLATE_NAME = "bel_welcome_img_v1";
const WELCOME_FALLBACK_TEMPLATE_NAME = "beltrami_benvenuto_v1";
const CANONICAL_WHATSAPP_BASE_URL = "https://app.crm-supreme.it";
const DEFAULT_WELCOME_IMAGE_URL =
  "https://app.crm-supreme.it/beltrami/logo-whatsapp.jpg";
export const BELTRAMI_NOTIFY_TEMPLATE_NAME = "bel_reply_done_v1";
const WELCOME_TEMPLATE_LANGUAGE = "it";
const NOTIFY_TEMPLATE_LANGUAGE = "it";
const BELTRAMI_NOTIFY_TEMPLATE_BODY_PARAMETER_NAMES = [
  "cliente_nome",
  "cliente_telefono",
  "messaggio_cliente",
] as const;
const BELTRAMI_NOTIFY_TEMPLATE_PARAMETER_NAMES = [
  "cliente_nome",
  "cliente_telefono",
  "messaggio_cliente",
  "link_risposta",
  "link_chiusura",
] as const;
const [
  PARAM_CLIENTE_NOME,
  PARAM_CLIENTE_TELEFONO,
  PARAM_MESSAGGIO_CLIENTE,
  PARAM_LINK_RISPOSTA,
  PARAM_LINK_CHIUSURA,
] = BELTRAMI_NOTIFY_TEMPLATE_PARAMETER_NAMES;

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
  parameterFormat: BeltramiNotifyParameterFormat | null;
  errorDetails: BeltramiMetaErrorDetails | null;
  initialErrorDetails: BeltramiMetaErrorDetails | null;
  rawJson: BeltramiMetaErrorRawJson | null;
};

type BeltramiNotifyTemplateParameterName =
  (typeof BELTRAMI_NOTIFY_TEMPLATE_PARAMETER_NAMES)[number];
type BeltramiNotifyParameterFormat =
  | "named"
  | "positional"
  | "named_url_buttons"
  | "positional_url_buttons";

type BeltramiNamedTextParameter = {
  type: "text";
  parameter_name: BeltramiNotifyTemplateParameterName;
  text: string;
};

type BeltramiPositionalTextParameter = {
  type: "text";
  text: string;
};

type BeltramiNotifyTemplatePayload = {
  messaging_product: "whatsapp";
  to: string;
  type: "template";
  template: {
    name: typeof BELTRAMI_NOTIFY_TEMPLATE_NAME;
    language: {
      code: string;
    };
    components: Array<
      | {
          type: "body";
          parameters: Array<
            BeltramiNamedTextParameter | BeltramiPositionalTextParameter
          >;
        }
      | {
          type: "button";
          sub_type: "url";
          index: "0" | "1";
          parameters: [BeltramiPositionalTextParameter];
        }
    >;
  };
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

function buildNamedTextParameter(
  parameterName: BeltramiNotifyTemplateParameterName,
  value: string,
  maxLength: number,
): BeltramiNamedTextParameter {
  return {
    type: "text",
    parameter_name: parameterName,
    text: compactTemplateText(value, maxLength),
  };
}

function buildPositionalTextParameter(
  value: string,
  maxLength: number,
): BeltramiPositionalTextParameter {
  return {
    type: "text",
    text: compactTemplateText(value, maxLength),
  };
}

function usesNamedBodyParameters(format: BeltramiNotifyParameterFormat) {
  return format === "named" || format === "named_url_buttons";
}

function usesUrlButtonParameters(format: BeltramiNotifyParameterFormat) {
  return format === "named_url_buttons" || format === "positional_url_buttons";
}

function stripUrlButtonPrefix(value: string, prefixes: string[]): string {
  const normalized = (() => {
    try {
      return new URL(value).toString();
    } catch {
      return value;
    }
  })();

  for (const prefix of prefixes) {
    if (normalized.startsWith(prefix)) {
      return normalized.slice(prefix.length);
    }
  }

  return normalized;
}

function toReplyUrlButtonParameter(value: string): string {
  return stripUrlButtonPrefix(value, [
    `${CANONICAL_WHATSAPP_BASE_URL}/beltrami/w/`,
  ]);
}

function toMarkDoneUrlButtonParameter(value: string): string {
  return stripUrlButtonPrefix(value, [
    `${CANONICAL_WHATSAPP_BASE_URL}/beltrami/handoff/`,
  ]);
}

function buildBeltramiNotifyTemplatePayload(params: {
  to: string;
  languageCode: string;
  parameterFormat: BeltramiNotifyParameterFormat;
  clienteNome: string;
  telefonoCliente: string;
  messaggioCliente: string;
  replyUrl: string;
  markDoneUrl: string;
}): BeltramiNotifyTemplatePayload {
  const namedTextByParameterName: Record<
    BeltramiNotifyTemplateParameterName,
    BeltramiNamedTextParameter
  > = {
    cliente_nome: buildNamedTextParameter(
      PARAM_CLIENTE_NOME,
      params.clienteNome,
      120,
    ),
    cliente_telefono: buildNamedTextParameter(
      PARAM_CLIENTE_TELEFONO,
      params.telefonoCliente,
      60,
    ),
    messaggio_cliente: buildNamedTextParameter(
      PARAM_MESSAGGIO_CLIENTE,
      params.messaggioCliente,
      320,
    ),
    link_risposta: buildNamedTextParameter(
      PARAM_LINK_RISPOSTA,
      params.replyUrl,
      500,
    ),
    link_chiusura: buildNamedTextParameter(
      PARAM_LINK_CHIUSURA,
      params.markDoneUrl,
      500,
    ),
  };
  const positionalTextByParameterName: Record<
    BeltramiNotifyTemplateParameterName,
    BeltramiPositionalTextParameter
  > = {
    cliente_nome: buildPositionalTextParameter(params.clienteNome, 120),
    cliente_telefono: buildPositionalTextParameter(params.telefonoCliente, 60),
    messaggio_cliente: buildPositionalTextParameter(params.messaggioCliente, 320),
    link_risposta: buildPositionalTextParameter(params.replyUrl, 500),
    link_chiusura: buildPositionalTextParameter(params.markDoneUrl, 500),
  };
  const bodyParameterNames = usesUrlButtonParameters(params.parameterFormat)
    ? BELTRAMI_NOTIFY_TEMPLATE_BODY_PARAMETER_NAMES
    : BELTRAMI_NOTIFY_TEMPLATE_PARAMETER_NAMES;
  const bodyParameters = bodyParameterNames.map((parameterName) =>
    usesNamedBodyParameters(params.parameterFormat)
      ? namedTextByParameterName[parameterName]
      : positionalTextByParameterName[parameterName],
  );
  const components: BeltramiNotifyTemplatePayload["template"]["components"] = [
    {
      type: "body",
      parameters: bodyParameters,
    },
  ];

  if (usesUrlButtonParameters(params.parameterFormat)) {
    components.push(
      {
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [
          buildPositionalTextParameter(
            toReplyUrlButtonParameter(params.replyUrl),
            500,
          ),
        ],
      },
      {
        type: "button",
        sub_type: "url",
        index: "1",
        parameters: [
          buildPositionalTextParameter(
            toMarkDoneUrlButtonParameter(params.markDoneUrl),
            500,
          ),
        ],
      },
    );
  }

  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: BELTRAMI_NOTIFY_TEMPLATE_NAME,
      language: {
        code: params.languageCode,
      },
      components,
    },
  };
}

function isParameterFormatMismatch(details: BeltramiMetaErrorDetails) {
  return (
    details.code === 132012 ||
    String(details.message ?? "")
      .toLowerCase()
      .includes("parameter format does not match")
  );
}

function isTemplateParameterShapeError(details: BeltramiMetaErrorDetails) {
  return (
    isParameterFormatMismatch(details) ||
    details.code === 132000 ||
    details.code === 100 ||
    String(details.message ?? "")
      .toLowerCase()
      .includes("number of parameters does not match") ||
    String(details.message ?? "").toLowerCase().includes("invalid parameter")
  );
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
}): Promise<BeltramiNotifySendResult> {
  const accessToken = process.env.BELTRAMI_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID;
  const notifyTo = process.env.BELTRAMI_WHATSAPP_NOTIFY_TO_PHONE;
  const templateName = BELTRAMI_NOTIFY_TEMPLATE_NAME;

  if (!accessToken || !phoneNumberId || !notifyTo) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      error: "configuration_missing",
      whatsappMessageId: null,
      templateName,
      toPhone: notifyTo ?? null,
      parameterFormat: null,
      errorDetails: null,
      initialErrorDetails: null,
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
      parameterFormat: null,
      errorDetails: null,
      initialErrorDetails: null,
      rawJson: null,
    };
  }

  const languageCode =
    process.env.BELTRAMI_WHATSAPP_NOTIFY_TEMPLATE_LANGUAGE ||
    NOTIFY_TEMPLATE_LANGUAGE;
  const parameterFormats: BeltramiNotifyParameterFormat[] = [
    "named",
    "positional",
    "named_url_buttons",
    "positional_url_buttons",
  ];

  try {
    const sendPayload = (payload: BeltramiNotifyTemplatePayload) =>
      fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
    let initialErrorDetails: BeltramiMetaErrorDetails | null = null;
    let lastFailure:
      | {
          parameterFormat: BeltramiNotifyParameterFormat;
          metaError: Awaited<ReturnType<typeof readMetaErrorResponse>>;
        }
      | null = null;
    let attemptCount = 0;

    for (const parameterFormat of parameterFormats) {
      const payload = buildBeltramiNotifyTemplatePayload({
        to,
        languageCode,
        parameterFormat,
        clienteNome: params.clienteNome,
        telefonoCliente: params.telefonoCliente,
        messaggioCliente: params.messaggioCliente,
        replyUrl: params.replyUrl,
        markDoneUrl: params.markDoneUrl,
      });
      const response = await sendPayload(payload);
      attemptCount += 1;

      if (response.ok) {
        const result = (await response
          .json()
          .catch(() => null)) as MetaMessageResponse | null;

        return {
          status: "sent",
          reason: "sent",
          error: null,
          whatsappMessageId: result?.messages?.[0]?.id ?? null,
          templateName,
          toPhone: to,
          parameterFormat,
          errorDetails: null,
          initialErrorDetails: attemptCount > 1 ? initialErrorDetails : null,
          rawJson: null,
        };
      }

      const metaError = await readMetaErrorResponse(response);
      initialErrorDetails ??= metaError.errorDetails;
      lastFailure = {
        parameterFormat,
        metaError,
      };

      if (!isTemplateParameterShapeError(metaError.errorDetails)) {
        break;
      }
    }

    return {
      status: "failed",
      reason: "meta_rejected",
      error: "meta_send_failed",
      whatsappMessageId: null,
      templateName,
      toPhone: to,
      parameterFormat: lastFailure?.parameterFormat ?? null,
      errorDetails: lastFailure?.metaError.errorDetails ?? null,
      initialErrorDetails: attemptCount > 1 ? initialErrorDetails : null,
      rawJson: lastFailure?.metaError.rawJson ?? null,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      error: "network_error",
      whatsappMessageId: null,
      templateName,
      toPhone: to,
      parameterFormat: null,
      errorDetails: null,
      initialErrorDetails: null,
      rawJson: null,
    };
  }
}
