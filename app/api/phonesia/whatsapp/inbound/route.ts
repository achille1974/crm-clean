export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crm-clean.vercel.app";

type MetaWebhookText = {
  body?: string;
};

type MetaWebhookMessage = {
  from?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: MetaWebhookText;
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
};

type MetaWebhookChange = {
  field?: string;
  value?: MetaWebhookValue;
};

type MetaWebhookEntry = {
  id?: string;
  changes?: MetaWebhookChange[];
};

type MetaWebhookPayload = {
  object?: string;
  entry?: MetaWebhookEntry[];
};

function okResponse() {
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

function normalizeBodyForCommand(body: string) {
  return body.trim().toUpperCase().replace(/\s+/g, " ");
}

function buildPhoneCandidates(rawWaId: string): string[] {
  const cleaned = rawWaId.replace(/[^\d+]/g, "");
  const variants = new Set<string>();

  if (!cleaned) return [];

  variants.add(cleaned);

  if (!cleaned.startsWith("+")) {
    variants.add(`+${cleaned}`);
  }

  const noPlus = cleaned.replace(/^\+/, "");
  if (noPlus) {
    variants.add(noPlus);
    variants.add(`+${noPlus}`);
  }

  return Array.from(variants);
}

async function findClienteByWhatsAppNumber(rawWaId: string) {
  const candidates = buildPhoneCandidates(rawWaId);

  if (candidates.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telefono, whatsapp_active, whatsapp_activated_at")
    .in("telefono", candidates)
    .limit(1);

  if (error) {
    throw error;
  }

  return data?.[0] ?? null;
}

async function logOperazione(params: {
  clienteId: number | string;
  telefono: string;
  descrizione: string;
  origine?: string;
}) {
  const now = new Date().toISOString();

  const { error } = await supabase.from("phonesia_operazioni").insert({
    cliente_id: params.clienteId,
    telefono_riferimento: params.telefono,
    origine: params.origine ?? "whatsapp_inbound_meta",
    descrizione: params.descrizione,
    data_operazione: now,
    created_at: now,
  });

  if (error) {
    console.error("Errore log operazione WhatsApp:", error);
  }
}

async function activateWhatsAppIfNeeded(
  clienteId: number | string,
  alreadyActive: boolean | null,
) {
  if (alreadyActive) return;

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("phonesia_clienti")
    .update({
      whatsapp_active: true,
      whatsapp_activated_at: now,
    })
    .eq("id", clienteId);

  if (error) {
    throw error;
  }
}

async function sendWhatsAppText(params: {
  to: string;
  body: string;
}) {
  if (!WHATSAPP_ACCESS_TOKEN) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: {
          body: params.body,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta send message failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

function buildWelcomeMessage(clienteId: number | string) {
  return (
    "🎉 Benvenuto in PHONESIA!\n\n" +
    "Il tuo canale WhatsApp è ora attivo.\n\n" +
    "Ecco il tuo biglietto digitale:\n" +
    `${BASE_URL}/phonesia/biglietto/${clienteId}\n\n` +
    "Salva questo contatto per ricevere aggiornamenti e assistenza dedicata.\n\n" +
    "— Team PHONESIA"
  );
}

function extractInboundMessages(payload: MetaWebhookPayload) {
  const results: Array<{
    waId: string;
    body: string;
    messageId: string | null;
    type: string | null;
  }> = [];

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const messages = value?.messages ?? [];

      for (const message of messages) {
        const waId = message.from?.trim();
        const type = message.type?.trim() ?? null;
        const body = message.text?.body?.trim() ?? "";

        if (!waId) continue;
        if (!body) continue;

        results.push({
          waId,
          body,
          messageId: message.id ?? null,
          type,
        });
      }
    }
  }

  return results;
}

export async function GET(request: Request) {
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

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MetaWebhookPayload;

    const inboundMessages = extractInboundMessages(payload);

    if (inboundMessages.length === 0) {
      return okResponse();
    }

    for (const inbound of inboundMessages) {
      const telefono = inbound.waId;
      const bodyOriginal = inbound.body;
      const bodyCommand = normalizeBodyForCommand(bodyOriginal);

      console.log("WA META INBOUND:", {
        telefono,
        bodyOriginal,
        messageId: inbound.messageId,
        type: inbound.type,
      });

      const cliente = await findClienteByWhatsAppNumber(telefono);

      if (!cliente) {
        console.log("Cliente non trovato per WhatsApp inbound:", telefono);
        continue;
      }

      await logOperazione({
        clienteId: cliente.id,
        telefono,
        descrizione: bodyOriginal,
      });

      if (bodyCommand === "OK" || bodyCommand === "OK.") {
        await activateWhatsAppIfNeeded(cliente.id, cliente.whatsapp_active);

        try {
          await sendWhatsAppText({
            to: telefono,
            body: buildWelcomeMessage(cliente.id),
          });

          const now = new Date().toISOString();

          const { error: updateWelcomeError } = await supabase
            .from("phonesia_clienti")
            .update({
              welcome_sent_at: now,
              welcome_status: "sent",
            })
            .eq("id", cliente.id);

          if (updateWelcomeError) {
            console.error("Errore aggiornamento welcome WhatsApp:", updateWelcomeError);
          }
        } catch (sendError) {
          console.error("Errore invio welcome Meta WhatsApp:", sendError);

          const { error: failedWelcomeError } = await supabase
            .from("phonesia_clienti")
            .update({
              welcome_status: "failed",
            })
            .eq("id", cliente.id);

          if (failedWelcomeError) {
            console.error("Errore update welcome_status failed:", failedWelcomeError);
          }
        }
      }
    }

    return okResponse();
  } catch (error) {
    console.error("WhatsApp Meta inbound fatal error:", error);
    return okResponse();
  }
}
