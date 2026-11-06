export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import {
  routeBeltramiInbound,
  saveBeltramiWhatsappStatusCallbacks,
} from "@/lib/beltrami/inbound";
import {
  extractInboundMessages,
  extractStatusCallbacks,
  okMetaWebhookResponse,
  verifyMetaWebhookRequest,
  type MetaWebhookPayload,
} from "@/lib/whatsapp/meta-webhook";
import { checkMetaSignature } from "@/lib/whatsapp/meta-signature";

const BASE_URL = "https://app.crm-supreme.it";

export async function GET(request: Request) {
  return verifyMetaWebhookRequest(request);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();
    const signature = checkMetaSignature(
      rawBody, request.headers.get("x-hub-signature-256"), process.env.BELTRAMI_META_APP_SECRET,
    );
    if (signature.status === "invalid") {
      console.warn("WA BELTRAMI WEBHOOK: firma Meta non valida, richiesta rifiutata.", { reason: signature.reason });
      return new Response("invalid signature", { status: 401 });
    }
    if (signature.status === "not_configured") {
      console.warn("WA BELTRAMI WEBHOOK: BELTRAMI_META_APP_SECRET non configurato, firma non verificata.");
    }
    const payload = JSON.parse(rawBody) as MetaWebhookPayload;
    const statusCallbacks = extractStatusCallbacks(payload);

    if (statusCallbacks.length > 0) {
      await saveBeltramiWhatsappStatusCallbacks(statusCallbacks);
      console.log("WA BELTRAMI STATUS CALLBACKS PROCESSED:", {
        count: statusCallbacks.length,
        statuses: Array.from(new Set(statusCallbacks.map((item) => item.status))),
      });
    }

    const inboundMessages = extractInboundMessages(payload);

    if (inboundMessages.length === 0) {
      return okMetaWebhookResponse();
    }

    for (const inbound of inboundMessages) {
      console.log("WA BELTRAMI INBOUND:", {
        telefono: inbound.waId,
        messageId: inbound.messageId,
        contextMessageId: inbound.contextMessageId,
        crmPhoneNumberId: inbound.crmPhoneNumberId,
        type: inbound.type,
      });

      const beltramiRouting = await routeBeltramiInbound({
        waId: inbound.waId,
        body: inbound.body,
        inboundMessageId: inbound.messageId,
        contextMessageId: inbound.contextMessageId,
        crmPhone: inbound.crmPhone,
        crmPhoneNumberId: inbound.crmPhoneNumberId,
        rawMessage: inbound.rawMessage,
        publicBaseUrl: BASE_URL,
        hasPhonesiaMatch: false,
      });

      console.log("WA BELTRAMI ROUTING:", {
        telefono: inbound.waId,
        handled: beltramiRouting.handled,
        routingStatus: beltramiRouting.routingStatus,
        reason: beltramiRouting.reason,
      });
    }

    return okMetaWebhookResponse();
  } catch (error) {
    console.error("WhatsApp Meta Beltrami inbound fatal error:", error);
    return okMetaWebhookResponse();
  }
}
