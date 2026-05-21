export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_WEBHOOK_VERIFY_TOKEN = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
const PHONESIA_AGENT_SHARED_SECRET = process.env.PHONESIA_AGENT_SHARED_SECRET;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crm-clean.vercel.app";

const WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME =
  process.env.WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME ||
  "phonesia_notifica_negozio_v1";

const WHATSAPP_STORE_HANDOFF_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_STORE_HANDOFF_TEMPLATE_LANGUAGE || "it";

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
  whatsapp_activated_at: string | null;
};

type AgentResponse = {
  ok?: boolean;
  reply?: string;
  intent?: string;
  handoff_richiesto?: boolean;
  used_local_agent?: boolean;
  matched_customer?: {
    id?: number;
    nome?: string | null;
    cognome?: string | null;
    telefono?: string | null;
    negozio_id?: number | null;
    whatsapp_active?: boolean | null;
  } | null;
  contract_count?: number;
  active_services?: string[];
  latest_feedback?: {
    rating?: number | null;
    ricontatto?: boolean | null;
    created_at?: string | null;
  } | null;
  marketing_consent?: boolean;
  error?: string;
  detail?: string;
};

type ConversationRow = {
  id: number | string;
  metadata: Record<string, unknown> | null;
};

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

type HandoffStatus =
  | "not_required"
  | "sent_template"
  | "failed_template"
  | "skipped_no_customer";

const STORE_CONTACTS: Record<
  number,
  {
    label: string;
    phone: string;
    mapsUrl: string;
  }
> = {
  1: {
    label: "PHONESIA Floridia",
    phone: "393917000017",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
  2: {
    label: "PHONESIA Augusta",
    phone: "393202927455",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta",
  },
  3: {
    label: "PHONESIA Siracusa",
    phone: "393313137775",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa",
  },
  4: {
    label: "PHONESIA Avola",
    phone: "393917510115",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola",
  },
  5: {
    label: "PHONESIA Floridia / Tabacchino Floridia",
    phone: "393473214561",
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
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function okResponse() {
  return new NextResponse("EVENT_RECEIVED", { status: 200 });
}

function normalizeBodyForCommand(body: string) {
  return body.trim().toUpperCase().replace(/\s+/g, " ");
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

    if (noPlus.startsWith("39") && noPlus.length > 10) {
      const national = noPlus.slice(2);
      variants.add(national);
      variants.add(`+39${national}`);
    } else {
      variants.add(`+39${noPlus}`);
    }
  }

  return Array.from(variants);
}

function truncateText(value: string, maxLength: number) {
  const text = String(value ?? "").trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function getFullName(cliente: ClienteRow | null, agentResponse?: AgentResponse | null) {
  const fromAgent = [
    agentResponse?.matched_customer?.nome,
    agentResponse?.matched_customer?.cognome,
  ]
    .filter(Boolean)
    .join(" ")
    .trim();

  if (fromAgent) return fromAgent;

  const fromCliente = [cliente?.nome, cliente?.cognome]
    .filter(Boolean)
    .join(" ")
    .trim();

  return fromCliente || "Cliente non identificato";
}

function getStoreById(negozioId: number | null | undefined) {
  if (!negozioId) return STORE_CONTACTS[1];
  return STORE_CONTACTS[negozioId] ?? STORE_CONTACTS[1];
}

function getStoreId(cliente: ClienteRow | null, agentResponse?: AgentResponse | null) {
  return (
    agentResponse?.matched_customer?.negozio_id ??
    cliente?.negozio_id ??
    null
  );
}

async function findClienteByWhatsAppNumber(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  rawWaId: string,
): Promise<ClienteRow | null> {
  const candidates = buildPhoneCandidates(rawWaId);

  if (candidates.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telefono, negozio_id, whatsapp_active, whatsapp_activated_at")
    .in("telefono", candidates)
    .limit(1);

  if (error) {
    throw error;
  }

  return (data?.[0] as ClienteRow | undefined) ?? null;
}

async function logOperazione(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number | string;
    telefono: string;
    descrizione: string;
    origine?: string;
    messageId?: string | null;
  },
) {
  const now = new Date().toISOString();

  const descrizione = params.messageId
    ? `${params.descrizione}\n\n[wa_message_id: ${params.messageId}]`
    : params.descrizione;

  const { error } = await supabase.from("phonesia_operazioni").insert({
    cliente_id: params.clienteId,
    telefono_riferimento: params.telefono,
    origine: params.origine ?? "whatsapp_inbound_meta",
    descrizione,
    data_operazione: now,
    created_at: now,
  });

  if (error) {
    console.error("Errore log operazione WhatsApp:", error);
  }
}

async function activateWhatsAppIfNeeded(
  supabase: ReturnType<typeof getSupabaseAdmin>,
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

  const to = normalizePhoneForMeta(params.to);

  if (!to) {
    throw new Error(`Invalid WhatsApp recipient: ${params.to}`);
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
        to,
        type: "text",
        text: {
          preview_url: false,
          body: params.body,
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta send message failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

async function sendStoreHandoffTemplate(params: {
  to: string;
  negozioNome: string;
  clienteNome: string;
  telefonoCliente: string;
  richiestaCliente: string;
  tipoRichiesta: string;
  linkSchedaCliente: string;
}) {
  if (!WHATSAPP_ACCESS_TOKEN) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  }

  const to = normalizePhoneForMeta(params.to);

  if (!to) {
    throw new Error(`Invalid WhatsApp recipient: ${params.to}`);
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
        to,
        type: "template",
        template: {
          name: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
          language: {
            code: WHATSAPP_STORE_HANDOFF_TEMPLATE_LANGUAGE,
          },
          components: [
            {
              type: "body",
              parameters: [
                {
                  type: "text",
                  parameter_name: "negozio_nome",
                  text: truncateText(params.negozioNome, 120),
                },
                {
                  type: "text",
                  parameter_name: "cliente_nome",
                  text: truncateText(params.clienteNome, 120),
                },
                {
                  type: "text",
                  parameter_name: "telefono_cliente",
                  text: truncateText(params.telefonoCliente, 60),
                },
                {
                  type: "text",
                  parameter_name: "richiesta_cliente",
                  text: truncateText(params.richiestaCliente, 500),
                },
                {
                  type: "text",
                  parameter_name: "tipo_richiesta",
                  text: truncateText(params.tipoRichiesta, 80),
                },
                {
                  type: "text",
                  parameter_name: "link_scheda_cliente",
                  text: truncateText(params.linkSchedaCliente, 500),
                },
              ],
            },
          ],
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta handoff template failed: ${response.status} ${errorText}`);
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

function buildAgentFallbackReply(cliente: ClienteRow | null) {
  const nome = cliente?.nome?.trim() || "cliente";

  if (!cliente) {
    return [
      "Ciao 💙",
      "abbiamo ricevuto il tuo messaggio, ma non riesco ancora a collegare questo numero a una scheda cliente PHONESIA.",
      "Scrivimi nome e cognome oppure passa in negozio: così possiamo verificare meglio la tua richiesta.",
    ].join("\n");
  }

  return [
    `Ciao ${nome} 💙`,
    "abbiamo ricevuto il tuo messaggio.",
    "In questo momento non riesco a completare la risposta automatica, ma il negozio potrà aiutarti appena possibile.",
  ].join("\n");
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
          type,
        });
      }
    }
  }

  return results;
}

async function askPhonesiaAgent(params: {
  origin: string;
  telefono: string;
  message: string;
}): Promise<AgentResponse> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (PHONESIA_AGENT_SHARED_SECRET) {
    headers["x-phonesia-secret"] = PHONESIA_AGENT_SHARED_SECRET;
  }

  const response = await fetch(`${params.origin}/api/phonesia/agent/message`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      telefono: params.telefono,
      message: params.message,
    }),
    cache: "no-store",
  });

  const text = await response.text();

  let json: AgentResponse | null = null;

  try {
    json = JSON.parse(text) as AgentResponse;
  } catch {
    throw new Error(`Agent response is not JSON: ${text.slice(0, 500)}`);
  }

  if (!response.ok || !json.ok) {
    throw new Error(
      `Agent failed: ${response.status} ${json.error ?? ""} ${json.detail ?? ""}`.trim(),
    );
  }

  return json;
}

async function updateLatestConversationHandoff(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number | null;
    customerMessage: string;
    handoffRequired: boolean;
    handoffStatus: HandoffStatus;
    handoffStoreLabel: string | null;
    handoffStorePhone: string | null;
    handoffTemplate?: string | null;
    handoffError?: string | null;
  },
) {
  if (!params.clienteId) return;

  try {
    const { data, error } = await supabase
      .from("phonesia_conversazioni")
      .select("id, metadata")
      .eq("cliente_id", params.clienteId)
      .eq("canale", "whatsapp")
      .eq("messaggio_utente", params.customerMessage)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) {
      throw error;
    }

    const row = (data?.[0] as ConversationRow | undefined) ?? null;

    if (!row) {
      return;
    }

    const metadata = {
      ...(row.metadata ?? {}),
      handoff_required: params.handoffRequired,
      handoff_status: params.handoffStatus,
      handoff_store_label: params.handoffStoreLabel,
      handoff_store_phone: params.handoffStorePhone,
      handoff_template: params.handoffTemplate ?? null,
      handoff_error: params.handoffError ?? null,
      handoff_updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabase
      .from("phonesia_conversazioni")
      .update({
        handoff_richiesto: params.handoffRequired,
        metadata,
      })
      .eq("id", row.id);

    if (updateError) {
      throw updateError;
    }
  } catch (error) {
    console.error("Errore update metadata handoff conversazione:", error);
  }
}

async function notifyStoreIfNeeded(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  cliente: ClienteRow | null;
  telefono: string;
  bodyOriginal: string;
  reply: string;
  agentResponse: AgentResponse | null;
}) {
  const agentResponse = params.agentResponse;

  if (!agentResponse?.handoff_richiesto) {
    await updateLatestConversationHandoff(params.supabase, {
      clienteId: agentResponse?.matched_customer?.id ?? params.cliente?.id ?? null,
      customerMessage: params.bodyOriginal,
      handoffRequired: false,
      handoffStatus: "not_required",
      handoffStoreLabel: null,
      handoffStorePhone: null,
      handoffTemplate: null,
    });
    return;
  }

  const clienteId = agentResponse.matched_customer?.id ?? params.cliente?.id ?? null;

  if (!clienteId) {
    await updateLatestConversationHandoff(params.supabase, {
      clienteId: null,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "skipped_no_customer",
      handoffStoreLabel: null,
      handoffStorePhone: null,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      handoffError: "Cliente non identificato: notifica negozio non inviata.",
    });
    return;
  }

  const storeId = getStoreId(params.cliente, agentResponse);
  const store = getStoreById(storeId);
  const storePhone = normalizePhoneForMeta(store.phone);

  if (!storePhone) {
    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "failed_template",
      handoffStoreLabel: store.label,
      handoffStorePhone: store.phone,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      handoffError: "Numero negozio non valido.",
    });
    return;
  }

  const clienteNome = getFullName(params.cliente, agentResponse);
  const telefonoCliente =
    agentResponse.matched_customer?.telefono ||
    params.cliente?.telefono ||
    `+${params.telefono}`;

  const linkSchedaCliente = `${BASE_URL}/phonesia/dashboard/clienti/${clienteId}`;

  try {
    await sendStoreHandoffTemplate({
      to: storePhone,
      negozioNome: store.label,
      clienteNome,
      telefonoCliente,
      richiestaCliente: params.bodyOriginal,
      tipoRichiesta: agentResponse.intent || "richiesta_cliente",
      linkSchedaCliente,
    });

    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "sent_template",
      handoffStoreLabel: store.label,
      handoffStorePhone: storePhone,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
    });

    console.log("WA STORE HANDOFF TEMPLATE SENT:", {
      clienteId,
      storeLabel: store.label,
      storePhone,
      template: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";

    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "failed_template",
      handoffStoreLabel: store.label,
      handoffStorePhone: storePhone,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      handoffError: errorMessage,
    });

    console.error("Errore invio template handoff WhatsApp negozio:", error);
  }
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
    const origin = new URL(request.url).origin;
    const supabase = getSupabaseAdmin();

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

      const cliente = await findClienteByWhatsAppNumber(supabase, telefono);

      if (cliente) {
        await logOperazione(supabase, {
          clienteId: cliente.id,
          telefono,
          descrizione: bodyOriginal,
          messageId: inbound.messageId,
        });
      } else {
        console.log("Cliente non trovato per WhatsApp inbound:", telefono);
      }

      if (bodyCommand === "OK" || bodyCommand === "OK.") {
        if (!cliente) {
          continue;
        }

        await activateWhatsAppIfNeeded(
          supabase,
          cliente.id,
          cliente.whatsapp_active,
        );

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

        continue;
      }

      let reply = buildAgentFallbackReply(cliente);
      let agentResponse: AgentResponse | null = null;

      try {
        agentResponse = await askPhonesiaAgent({
          origin,
          telefono,
          message: bodyOriginal,
        });

        if (agentResponse.reply?.trim()) {
          reply = agentResponse.reply.trim();
        }

        console.log("WA META AGENT RESPONSE:", {
          telefono,
          clienteId: agentResponse.matched_customer?.id ?? cliente?.id ?? null,
          intent: agentResponse.intent ?? null,
          handoffRichiesto: agentResponse.handoff_richiesto ?? null,
          usedLocalAgent: agentResponse.used_local_agent ?? null,
        });
      } catch (agentError) {
        console.error("Errore chiamata agent da WhatsApp inbound:", agentError);
      }

      try {
        await sendWhatsAppText({
          to: telefono,
          body: reply,
        });
      } catch (sendError) {
        console.error("Errore invio risposta agent WhatsApp:", sendError);
      }

      await notifyStoreIfNeeded({
        supabase,
        cliente,
        telefono,
        bodyOriginal,
        reply,
        agentResponse,
      });
    }

    return okResponse();
  } catch (error) {
    console.error("WhatsApp Meta inbound fatal error:", error);
    return okResponse();
  }
}
