const GRAPH_API_VERSION = "v23.0";
const DEFAULT_WELCOME_TEMPLATE_NAME = "beltrami_benvenuto_v1";
const WELCOME_TEMPLATE_LANGUAGE = "it";

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
  whatsappMessageId: string | null;
  templateName: string;
};

function toMetaRecipient(rawPhone: string): string | null {
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, "");
  const numeric = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  return /^\d+$/.test(numeric) ? numeric : null;
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
      whatsappMessageId: null,
      templateName,
    };
  }

  const to = toMetaRecipient(params.telefono);

  if (!to) {
    return {
      status: "skipped",
      reason: "invalid_phone",
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
        whatsappMessageId: null,
        templateName,
      };
    }

    const result = (await response.json().catch(() => null)) as MetaMessageResponse | null;

    return {
      status: "sent",
      reason: "sent",
      whatsappMessageId: result?.messages?.[0]?.id ?? null,
      templateName,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      whatsappMessageId: null,
      templateName,
    };
  }
}
