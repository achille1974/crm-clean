import "server-only";

import { NextResponse } from "next/server";

const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

type MetaWebhookText = {
  body?: string;
};

type MetaWebhookMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: MetaWebhookText;
  context?: {
    id?: string;
    from?: string;
  };
};

type MetaWebhookStatusName = "sent" | "delivered" | "read" | "failed";

export type MetaWebhookStatus = {
  id?: string;
  status?: string;
  timestamp?: string;
  recipient_id?: string;
  conversation?: {
    id?: string;
    origin?: {
      type?: string;
    };
  };
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
    type?: string;
  };
  errors?: Array<{
    code?: number | string;
    title?: string;
    message?: string;
    error_data?: {
      details?: string;
    };
  }>;
};

type MetaWebhookValue = {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: {
      name?: string;
    };
    wa_id?: string;
  }>;
  messages?: MetaWebhookMessage[];
  statuses?: MetaWebhookStatus[];
};

type MetaWebhookChange = {
  field?: string;
  value?: MetaWebhookValue;
};

type MetaWebhookEntry = {
  id?: string;
  changes?: MetaWebhookChange[];
};

export type MetaWebhookPayload = {
  object?: string;
  entry?: MetaWebhookEntry[];
};

export type WhatsappInboundMessage = {
  waId: string;
  body: string;
  messageId: string | null;
  contextMessageId: string | null;
  crmPhone: string | null;
  crmPhoneNumberId: string | null;
  type: string | null;
  rawMessage: MetaWebhookMessage;
};

export type WhatsappStatusCallback = {
  whatsappMessageId: string;
  status: MetaWebhookStatusName;
  recipientPhone: string | null;
  timestampMeta: string | null;
  conversationIdMeta: string | null;
  pricingCategory: string | null;
  pricingBillable: boolean | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
  rawJson: MetaWebhookStatus;
};

export function okMetaWebhookResponse() {
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

export function verifyMetaWebhookRequest(request: Request) {
  const { searchParams } = new URL(request.url);

  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token &&
    challenge &&
    token === WHATSAPP_WEBHOOK_VERIFY_TOKEN
  ) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Webhook verification failed" }, { status: 403 });
}

function normalizePhoneForMeta(rawPhone: string | null | undefined): string | null {
  const digits = String(rawPhone ?? "").replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("39") && digits.length > 10) {
    return digits;
  }

  if (digits.startsWith("3") && digits.length >= 9 && digits.length <= 10) {
    return `39${digits}`;
  }

  return digits;
}

function readWebhookStatus(value: string | undefined): MetaWebhookStatusName | null {
  if (
    value === "sent" ||
    value === "delivered" ||
    value === "read" ||
    value === "failed"
  ) {
    return value;
  }

  return null;
}

function formatMetaTimestamp(value: string | undefined): string | null {
  const timestamp = Number(value);

  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return null;
  }

  return new Date(timestamp * 1000).toISOString();
}

export function extractInboundMessages(payload: MetaWebhookPayload): WhatsappInboundMessage[] {
  const results: WhatsappInboundMessage[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const messages = value?.messages ?? [];

      for (const message of messages) {
        const waId = message.from?.trim();
        const type = message.type?.trim() ?? null;
        const body = message.text?.body?.trim() ?? "";

        if (!waId) continue;

        if (type && type !== "text") {
          console.log("WA META INBOUND ignored non-text message:", {
            waId,
            messageId: message.id ?? null,
            type,
          });
          continue;
        }

        if (!body) continue;

        results.push({
          waId,
          body,
          messageId: message.id ?? null,
          contextMessageId: message.context?.id ?? null,
          crmPhone:
            value?.metadata?.display_phone_number ??
            value?.metadata?.phone_number_id ??
            null,
          crmPhoneNumberId: value?.metadata?.phone_number_id ?? null,
          type,
          rawMessage: message,
        });
      }
    }
  }

  return results;
}

export function extractStatusCallbacks(payload: MetaWebhookPayload): WhatsappStatusCallback[] {
  const results: WhatsappStatusCallback[] = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const statuses = change.value?.statuses ?? [];

      for (const item of statuses) {
        const whatsappMessageId = item.id?.trim();
        const status = readWebhookStatus(item.status);

        if (!whatsappMessageId || !status) {
          continue;
        }

        const firstError = item.errors?.[0] ?? null;

        results.push({
          whatsappMessageId,
          status,
          recipientPhone: normalizePhoneForMeta(item.recipient_id),
          timestampMeta: formatMetaTimestamp(item.timestamp),
          conversationIdMeta: item.conversation?.id ?? null,
          pricingCategory:
            item.pricing?.category ?? item.pricing?.type ?? item.conversation?.origin?.type ?? null,
          pricingBillable:
            typeof item.pricing?.billable === "boolean" ? item.pricing.billable : null,
          errorCode: firstError?.code ? String(firstError.code) : null,
          errorTitle: firstError?.title ?? null,
          errorMessage: firstError?.message ?? firstError?.error_data?.details ?? null,
          rawJson: item,
        });
      }
    }
  }

  return results;
}
