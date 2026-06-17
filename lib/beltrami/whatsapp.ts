const GRAPH_API_VERSION = "v23.0";
const DEFAULT_WELCOME_TEMPLATE_NAME = "beltrami_benvenuto_v1";
const DEFAULT_NOTIFY_TEMPLATE_NAME = "beltrami_notifica_risposta_cliente_v1";
const WELCOME_TEMPLATE_LANGUAGE = "it";
const NOTIFY_TEMPLATE_LANGUAGE = "it";

type MetaMessageResponse = {
  messages?: Array<{
    id?: string;
  }>;
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
};

export type BeltramiNotifySendResult = {
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
  toPhone: string | null;
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

export async function sendBeltramiWelcomeMessage(params: {
  telefono: string;
}): Promise<BeltramiWelcomeSendResult> {
  const accessToken = process.env.BELTRAMI_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID;
  const templateName =
    process.env.BELTRAMI_WHATSAPP_WELCOME_TEMPLATE_NAME || DEFAULT_WELCOME_TEMPLATE_NAME;

  if (!accessToken || !phoneNumberId) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      error: "configuration_missing",
      whatsappMessageId: null,
      templateName,
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
          },
        }),
      },
    );

    if (!response.ok) {
      return {
        status: "failed",
        reason: "meta_rejected",
        error: "meta_send_failed",
        whatsappMessageId: null,
        templateName,
      };
    }

    const result = (await response.json().catch(() => null)) as MetaMessageResponse | null;

    return {
      status: "sent",
      reason: "sent",
      error: null,
      whatsappMessageId: result?.messages?.[0]?.id ?? null,
      templateName,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      error: "network_error",
      whatsappMessageId: null,
      templateName,
    };
  }
}

export async function sendBeltramiNotifyMessage(params: {
  clienteNome: string;
  telefonoCliente: string;
  messaggioCliente: string;
  replyUrl: string;
}): Promise<BeltramiNotifySendResult> {
  const accessToken = process.env.BELTRAMI_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID;
  const notifyTo = process.env.BELTRAMI_WHATSAPP_NOTIFY_TO_PHONE;
  const templateName =
    process.env.BELTRAMI_WHATSAPP_NOTIFY_TEMPLATE_NAME || DEFAULT_NOTIFY_TEMPLATE_NAME;

  if (!accessToken || !phoneNumberId || !notifyTo) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      error: "configuration_missing",
      whatsappMessageId: null,
      templateName,
      toPhone: notifyTo ?? null,
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
              code: process.env.BELTRAMI_WHATSAPP_NOTIFY_TEMPLATE_LANGUAGE || NOTIFY_TEMPLATE_LANGUAGE,
            },
            components: [
              {
                type: "body",
                parameters: [
                  {
                    type: "text",
                    text: compactTemplateText(params.clienteNome, 120),
                  },
                  {
                    type: "text",
                    text: compactTemplateText(params.telefonoCliente, 60),
                  },
                  {
                    type: "text",
                    text: compactTemplateText(params.messaggioCliente, 320),
                  },
                  {
                    type: "text",
                    text: compactTemplateText(params.replyUrl, 500),
                  },
                ],
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      return {
        status: "failed",
        reason: "meta_rejected",
        error: "meta_send_failed",
        whatsappMessageId: null,
        templateName,
        toPhone: to,
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
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      error: "network_error",
      whatsappMessageId: null,
      templateName,
      toPhone: to,
    };
  }
}
