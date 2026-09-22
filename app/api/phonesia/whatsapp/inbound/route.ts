export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  routeBeltramiInbound,
  saveBeltramiWhatsappStatusCallbacks,
} from "@/lib/beltrami/inbound";
import {
  extractInboundMessages,
  extractStatusCallbacks,
  verifyMetaWebhookRequest,
  type MetaWebhookPayload,
  type WhatsappStatusCallback,
} from "@/lib/whatsapp/meta-webhook";
import {
  createHandoffRequest,
  markHandoffNotificationFailed,
  updateHandoffNotification,
  type CreateHandoffRequestResult,
} from "@/lib/handoff/create-request";

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const PHONESIA_AGENT_SHARED_SECRET = process.env.PHONESIA_AGENT_SHARED_SECRET;
const BASE_URL = "https://app.crm-supreme.it";

const WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME = "ph_reply_done_v1";
const WHATSAPP_STORE_HANDOFF_FALLBACK_TEMPLATE_NAME = "ph_notif_negozio_reply_v1";

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

type ConversationMemory = {
  is_follow_up?: boolean;
  previous_intent?: string | null;
  previous_message?: string | null;
  previous_conversation_id?: number | string | null;
  previous_created_at?: string | null;
  confidence?: string | null;
  reason?: string | null;
};

type AgentResponse = {
  ok?: boolean;
  reply?: string;
  intent?: string;
  detected_intent?: string;
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
  conversation_memory?: ConversationMemory | null;
  error?: string;
  detail?: string;
};

type ConversationRow = {
  id: number | string;
  metadata: Record<string, unknown> | null;
};

type RecentHandoffRow = {
  id: number | string;
  created_at: string | null;
  intent: string | null;
  messaggio_utente: string | null;
  metadata: Record<string, unknown> | null;
};

type MetaMessageResponse = {
  messages?: Array<{
    id?: string;
  }>;
};

type HandoffStatus =
  | "not_required"
  | "sent_template"
  | "failed_template"
  | "skipped_no_customer"
  | "skipped_duplicate";

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
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 1)}…`;
}

function getStoreReplyName(negozioNome: string) {
  return negozioNome.replace(/^PHONESIA\s*/i, "").trim() || negozioNome;
}

function buildStoreReplyText(negozioNome: string) {
  return `Ciao, sono Marco di PHONESIA ${getStoreReplyName(
    negozioNome,
  )}. Ho letto il tuo messaggio, dimmi pure come posso aiutarti.`;
}

function buildStoreReplyWhatsappUrl(params: {
  telefonoCliente: string;
  negozioNome: string;
}): string | null {
  const telefonoCliente = normalizePhoneForMeta(params.telefonoCliente);

  if (!telefonoCliente) {
    return null;
  }

  const text = encodeURIComponent(buildStoreReplyText(params.negozioNome));

  return `https://wa.me/${telefonoCliente}?text=${text}`;
}

function getPublicBaseUrl() {
  return BASE_URL.replace(/\/+$/, "");
}

function buildStoreReplySlug(negozioNome: string) {
  return getStoreReplyName(negozioNome)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function buildStoreReplyShortUrl(params: {
  telefonoCliente: string;
  negozioNome: string;
}): string | null {
  const telefonoCliente = normalizePhoneForMeta(params.telefonoCliente);

  if (!telefonoCliente) {
    return null;
  }

  const url = new URL(`/w/${telefonoCliente}`, getPublicBaseUrl());
  const negozioSlug = buildStoreReplySlug(params.negozioNome);

  if (negozioSlug) {
    url.searchParams.set("negozio", negozioSlug);
  }

  return url.toString();
}

function buildStoreHandoffRequestText(
  bodyOriginal: string,
  agentResponse: AgentResponse | null,
) {
  const memory = agentResponse?.conversation_memory;

  if (
    memory?.is_follow_up === true &&
    memory.previous_message &&
    memory.previous_intent
  ) {
    return [
      `Messaggio cliente: ${bodyOriginal}`,
      "",
      "Collegato a richiesta precedente:",
      memory.previous_message,
      "",
      `Tipo precedente: ${memory.previous_intent}`,
      memory.reason ? `Nota agent: ${memory.reason}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  return bodyOriginal;
}

function buildStoreHandoffRequestType(agentResponse: AgentResponse | null) {
  const intent = agentResponse?.intent || "richiesta_cliente";
  const memory = agentResponse?.conversation_memory;

  if (memory?.is_follow_up === true && memory.previous_intent) {
    return `${intent} collegato a ${memory.previous_intent}`;
  }

  return intent;
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
  templateName: string;
  negozioNome: string;
  clienteNome: string;
  telefonoCliente: string;
  richiestaCliente: string;
  tipoRichiesta: string;
  replyWhatsappUrl: string;
  markDoneUrl: string;
  linkSchedaCliente: string;
}): Promise<MetaMessageResponse> {
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

  const bodyParameters =
    params.templateName === WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME
      ? [
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
            parameter_name: "cliente_telefono",
            text: truncateText(params.telefonoCliente, 60),
          },
          {
            type: "text",
            parameter_name: "messaggio_cliente",
            text: truncateText(params.richiestaCliente, 320),
          },
          {
            type: "text",
            parameter_name: "link_risposta",
            text: truncateText(params.replyWhatsappUrl, 500),
          },
          {
            type: "text",
            parameter_name: "link_chiusura",
            text: truncateText(params.markDoneUrl, 500),
          },
        ]
      : [
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
            parameter_name: "reply_whatsapp_url",
            text: truncateText(params.replyWhatsappUrl, 500),
          },
          {
            type: "text",
            parameter_name: "link_scheda_cliente",
            text: truncateText(params.linkSchedaCliente, 500),
          },
        ];

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
          name: params.templateName,
          language: {
            code: WHATSAPP_STORE_HANDOFF_TEMPLATE_LANGUAGE,
          },
          components: [
            {
              type: "body",
              parameters: bodyParameters,
            },
          ],
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Meta handoff template ${params.templateName} failed: ${response.status} ${errorText}`,
    );
  }

  return (await response.json().catch(() => ({}))) as MetaMessageResponse;
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

async function saveWhatsappStatusCallbacks(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  statuses: WhatsappStatusCallback[],
) {
  if (statuses.length === 0) return;

  const rows = statuses.map((item) => ({
    whatsapp_message_id: item.whatsappMessageId,
    status: item.status,
    recipient_phone: item.recipientPhone,
    timestamp_meta: item.timestampMeta,
    conversation_id_meta: item.conversationIdMeta,
    pricing_category: item.pricingCategory,
    pricing_billable: item.pricingBillable,
    error_code: item.errorCode,
    error_title: item.errorTitle,
    error_message: item.errorMessage,
    raw_json: item.rawJson,
  }));

  const { error } = await supabase
    .from("phonesia_whatsapp_message_statuses")
    .upsert(rows, {
      onConflict: "whatsapp_message_id,status,timestamp_meta",
    });

  if (error) {
    throw error;
  }

  const { data: campaignRecipients, error: campaignLookupError } = await supabase
    .from("phonesia_whatsapp_campaign_recipients")
    .select("whatsapp_message_id")
    .in("whatsapp_message_id", statuses.map((item) => item.whatsappMessageId));
  if (campaignLookupError) {
    console.error("Persistent campaign status lookup failed.", campaignLookupError.message);
    return;
  }
  const campaignMessageIds = new Set(
    (campaignRecipients ?? []).map((row) => row.whatsapp_message_id),
  );
  for (const item of statuses) {
    if (!campaignMessageIds.has(item.whatsappMessageId)) continue;
    const { error: persistentError } = await supabase.rpc(
      "phonesia_record_whatsapp_delivery_event",
      {
        p_whatsapp_message_id: item.whatsappMessageId,
        p_status: item.status,
        p_timestamp_meta: item.timestampMeta,
        p_error_code: item.errorCode,
        p_error_title: item.errorTitle,
        p_error_message: item.errorMessage,
        p_payload: item.rawJson,
      },
    );
    if (persistentError) {
      console.error("Persistent campaign status update failed.", persistentError.message);
    }
  }
}

async function askPhonesiaAgent(params: {
  origin: string;
  telefono: string;
  message: string;
  requestOrigin?: {
    source: string;
    wa_message_id?: string | null;
    received_from?: string | null;
  };
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
      origin: params.requestOrigin ?? {
        source: "api_agent_message",
      },
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
    storeReplyShortUrl?: string | null;
    storeReplyWhatsappUrl?: string | null;
    storePhoneNotified?: string | null;
    storeNotificationTemplate?: string | null;
    storeNotificationStatus?: HandoffStatus | null;
    storeNotificationError?: string | null;
  },
): Promise<number | string | null> {
  if (!params.clienteId) return null;

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
      return null;
    }

    const metadata = {
      ...(row.metadata ?? {}),
      handoff_required: params.handoffRequired,
      handoff_status: params.handoffStatus,
      handoff_store_label: params.handoffStoreLabel,
      handoff_store_phone: params.handoffStorePhone,
      handoff_template: params.handoffTemplate ?? null,
      handoff_error: params.handoffError ?? null,
      store_reply_short_url: params.storeReplyShortUrl ?? null,
      store_reply_whatsapp_url: params.storeReplyWhatsappUrl ?? null,
      store_phone_notified: params.storePhoneNotified ?? params.handoffStorePhone,
      store_notification_template:
        params.storeNotificationTemplate ?? params.handoffTemplate ?? null,
      store_notification_status:
        params.storeNotificationStatus ?? params.handoffStatus,
      store_notification_error:
        params.storeNotificationError ?? params.handoffError ?? null,
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

    return row.id;
  } catch (error) {
    console.error("Errore update metadata handoff conversazione:", error);
    return null;
  }
}

async function findLatestConversationId(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  clienteId: number;
  customerMessage: string;
}): Promise<number | string | null> {
  try {
    const { data, error } = await params.supabase
      .from("phonesia_conversazioni")
      .select("id")
      .eq("cliente_id", params.clienteId)
      .eq("canale", "whatsapp")
      .eq("messaggio_utente", params.customerMessage)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    return (data?.[0]?.id as number | string | undefined) ?? null;
  } catch (error) {
    console.error("Errore lettura conversazione handoff Phonesia:", {
      clienteId: params.clienteId,
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });
    return null;
  }
}

async function hasRecentStoreHandoff(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  clienteId: number;
  intent: string | null | undefined;
  customerMessage: string;
  minutes: number;
}): Promise<boolean> {
  if (!params.intent) return false;

  const cutoff = new Date(Date.now() - params.minutes * 60 * 1000).toISOString();

  const { data, error } = await params.supabase
    .from("phonesia_conversazioni")
    .select("id, created_at, intent, messaggio_utente, metadata")
    .eq("cliente_id", params.clienteId)
    .eq("canale", "whatsapp")
    .eq("handoff_richiesto", true)
    .eq("intent", params.intent)
    .eq("messaggio_utente", params.customerMessage)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    throw error;
  }

  const rows = (data ?? []) as RecentHandoffRow[];

  return rows.some((row) => {
    const metadata = row.metadata ?? {};
    const handoffStatus =
      typeof metadata.handoff_status === "string" ? metadata.handoff_status : null;

    return handoffStatus === "sent_template";
  });
}

async function createPhonesiaHandoffRequest(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  clienteId: number;
  clienteNome: string;
  clientePhone: string;
  negozioId: number | null;
  storeLabel: string;
  storePhone: string;
  inboundMessageId: string | null;
  inboundBody: string;
  conversationId: number | string | null;
  replyLink: string;
  templateName: string;
  tipoRichiesta: string;
  agentResponse: AgentResponse | null;
}): Promise<CreateHandoffRequestResult | null> {
  try {
    const result = await createHandoffRequest({
      supabase: params.supabase,
      tableName: "phonesia_handoff_richieste",
      businessArea: "phonesia",
      clienteId: params.clienteId,
      clientePhone: params.clientePhone,
      clienteNome: params.clienteNome,
      negozioId: params.negozioId,
      destinazioneNome: params.storeLabel,
      destinazionePhone: params.storePhone,
      inboundMessageId: params.inboundMessageId,
      inboundBody: params.inboundBody,
      conversationId: params.conversationId,
      replyLink: params.replyLink,
      metadata: {
        source: "whatsapp_inbound",
        template_name: params.templateName,
        tipo_richiesta: params.tipoRichiesta,
        intent: params.agentResponse?.intent ?? null,
        detected_intent: params.agentResponse?.detected_intent ?? null,
      },
    });

    console.log("PHONESIA HANDOFF REQUEST CREATED:", {
      handoffId: result.id,
      clienteId: params.clienteId,
      storeLabel: params.storeLabel,
      dueAt: result.dueAt,
    });

    return result;
  } catch (error) {
    console.error("Errore creazione handoff Phonesia:", {
      clienteId: params.clienteId,
      storeLabel: params.storeLabel,
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });
    return null;
  }
}

async function notifyStoreIfNeeded(params: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  cliente: ClienteRow | null;
  telefono: string;
  inboundMessageId: string | null;
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
      storeReplyWhatsappUrl: null,
      storePhoneNotified: null,
      storeNotificationTemplate: null,
      storeNotificationStatus: "not_required",
      storeNotificationError: null,
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
      storeReplyWhatsappUrl: null,
      storePhoneNotified: null,
      storeNotificationTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      storeNotificationStatus: "skipped_no_customer",
      storeNotificationError: "Cliente non identificato: notifica negozio non inviata.",
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
      storeReplyWhatsappUrl: null,
      storePhoneNotified: store.phone,
      storeNotificationTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      storeNotificationStatus: "failed_template",
      storeNotificationError: "Numero negozio non valido.",
    });
    return;
  }

  const hasDuplicateHandoff = await hasRecentStoreHandoff({
    supabase: params.supabase,
    clienteId,
    intent: agentResponse.intent,
    customerMessage: params.bodyOriginal,
    minutes: 15,
  });

  const clienteNome = getFullName(params.cliente, agentResponse);
  const telefonoCliente =
    agentResponse.matched_customer?.telefono ||
    params.cliente?.telefono ||
    `+${params.telefono}`;
  const telefonoClienteMeta = normalizePhoneForMeta(telefonoCliente);
  const replyWhatsappUrl = telefonoClienteMeta
    ? buildStoreReplyWhatsappUrl({
        telefonoCliente: telefonoClienteMeta,
        negozioNome: store.label,
      })
    : null;
  const replyShortUrl = telefonoClienteMeta
    ? buildStoreReplyShortUrl({
        telefonoCliente: telefonoClienteMeta,
        negozioNome: store.label,
      })
    : null;
  const linkSchedaCliente = `${BASE_URL}/phonesia/dashboard/clienti/${clienteId}`;
  const richiestaCliente = buildStoreHandoffRequestText(params.bodyOriginal, agentResponse);
  const tipoRichiesta = buildStoreHandoffRequestType(agentResponse);

  if (hasDuplicateHandoff) {
    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "skipped_duplicate",
      handoffStoreLabel: store.label,
      handoffStorePhone: storePhone,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      handoffError:
        "Notifica negozio non inviata: richiesta simile già notificata negli ultimi 15 minuti.",
      storeReplyShortUrl: replyShortUrl,
      storeReplyWhatsappUrl: replyWhatsappUrl,
      storePhoneNotified: storePhone,
      storeNotificationTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      storeNotificationStatus: "skipped_duplicate",
      storeNotificationError:
        "Notifica negozio non inviata: richiesta simile già notificata negli ultimi 15 minuti.",
    });
    return;
  }

  if (!replyWhatsappUrl || !replyShortUrl) {
    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "failed_template",
      handoffStoreLabel: store.label,
      handoffStorePhone: storePhone,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      handoffError: "Numero cliente non valido per link WhatsApp.",
      storeReplyShortUrl: replyShortUrl,
      storeReplyWhatsappUrl: null,
      storePhoneNotified: storePhone,
      storeNotificationTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      storeNotificationStatus: "failed_template",
      storeNotificationError: "Numero cliente non valido per link WhatsApp.",
    });
    return;
  }

  const conversationId = await findLatestConversationId({
    supabase: params.supabase,
    clienteId,
    customerMessage: params.bodyOriginal,
  });
  const handoffRequest = await createPhonesiaHandoffRequest({
    supabase: params.supabase,
    clienteId,
    clienteNome,
    clientePhone: telefonoClienteMeta || telefonoCliente,
    negozioId: storeId,
    storeLabel: store.label,
    storePhone,
    inboundMessageId: params.inboundMessageId,
    inboundBody: params.bodyOriginal,
    conversationId,
    replyLink: replyShortUrl,
    templateName: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
    tipoRichiesta,
    agentResponse,
  });

  try {
    let sentTemplate = handoffRequest
      ? WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME
      : WHATSAPP_STORE_HANDOFF_FALLBACK_TEMPLATE_NAME;
    let storeNotificationError: string | null = null;
    let sentResponse: MetaMessageResponse | null = null;

    try {
      sentResponse = await sendStoreHandoffTemplate({
        to: storePhone,
        templateName: sentTemplate,
        negozioNome: store.label,
        clienteNome,
        telefonoCliente,
        richiestaCliente,
        tipoRichiesta,
        replyWhatsappUrl: replyShortUrl,
        markDoneUrl: handoffRequest?.markDoneUrl ?? "",
        linkSchedaCliente,
      });
    } catch (primaryError) {
      if (sentTemplate === WHATSAPP_STORE_HANDOFF_FALLBACK_TEMPLATE_NAME) {
        throw primaryError;
      }

      storeNotificationError =
        primaryError instanceof Error ? primaryError.message : "Errore template primario.";

      console.error("Errore invio template handoff WhatsApp negozio primario:", primaryError);

      sentResponse = await sendStoreHandoffTemplate({
        to: storePhone,
        templateName: WHATSAPP_STORE_HANDOFF_FALLBACK_TEMPLATE_NAME,
        negozioNome: store.label,
        clienteNome,
        telefonoCliente,
        richiestaCliente,
        tipoRichiesta,
        replyWhatsappUrl: replyShortUrl,
        markDoneUrl: "",
        linkSchedaCliente,
      });

      sentTemplate = WHATSAPP_STORE_HANDOFF_FALLBACK_TEMPLATE_NAME;
    }

    const notificationWhatsappMessageId = sentResponse?.messages?.[0]?.id ?? null;
    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "sent_template",
      handoffStoreLabel: store.label,
      handoffStorePhone: storePhone,
      handoffTemplate: sentTemplate,
      handoffError: storeNotificationError,
      storeReplyShortUrl: replyShortUrl,
      storeReplyWhatsappUrl: replyWhatsappUrl,
      storePhoneNotified: storePhone,
      storeNotificationTemplate: sentTemplate,
      storeNotificationStatus: "sent_template",
      storeNotificationError,
    });

    if (handoffRequest) {
      try {
        await updateHandoffNotification({
          supabase: params.supabase,
          tableName: "phonesia_handoff_richieste",
          id: handoffRequest.id,
          notificationWhatsappMessageId,
        });
      } catch (handoffError) {
        console.error("Errore update handoff Phonesia notificato:", {
          handoffId: handoffRequest.id,
          message: handoffError instanceof Error ? handoffError.message : "errore sconosciuto",
        });
      }
    }

    console.log("WA STORE HANDOFF TEMPLATE SENT:", {
      clienteId,
      storeLabel: store.label,
      storePhone,
      template: sentTemplate,
      notificationWhatsappMessageId,
      handoffId: handoffRequest?.id ?? null,
      replyShortUrl,
      replyWhatsappUrl,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Errore sconosciuto";

    if (handoffRequest) {
      try {
        await markHandoffNotificationFailed({
          supabase: params.supabase,
          tableName: "phonesia_handoff_richieste",
          id: handoffRequest.id,
        });
      } catch (handoffError) {
        console.error("Errore update handoff Phonesia fallito:", {
          handoffId: handoffRequest.id,
          message: handoffError instanceof Error ? handoffError.message : "errore sconosciuto",
        });
      }
    }

    await updateLatestConversationHandoff(params.supabase, {
      clienteId,
      customerMessage: params.bodyOriginal,
      handoffRequired: true,
      handoffStatus: "failed_template",
      handoffStoreLabel: store.label,
      handoffStorePhone: storePhone,
      handoffTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      handoffError: errorMessage,
      storeReplyShortUrl: replyShortUrl,
      storeReplyWhatsappUrl: replyWhatsappUrl,
      storePhoneNotified: storePhone,
      storeNotificationTemplate: WHATSAPP_STORE_HANDOFF_TEMPLATE_NAME,
      storeNotificationStatus: "failed_template",
      storeNotificationError: errorMessage,
    });

    console.error("Errore invio template handoff WhatsApp negozio:", error);
  }
}

export async function GET(request: Request) {
  return verifyMetaWebhookRequest(request);
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as MetaWebhookPayload;
    const origin = new URL(request.url).origin;
    const supabase = getSupabaseAdmin();

    const statusCallbacks = extractStatusCallbacks(payload);
    if (statusCallbacks.length > 0) {
      try {
        await saveWhatsappStatusCallbacks(supabase, statusCallbacks);
        console.log("WA META STATUS CALLBACKS SAVED:", {
          count: statusCallbacks.length,
          statuses: Array.from(new Set(statusCallbacks.map((item) => item.status))),
        });
      } catch (statusError) {
        console.error("Errore salvataggio status WhatsApp Meta:", statusError);
      }

      await saveBeltramiWhatsappStatusCallbacks(statusCallbacks);
    }

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
        contextMessageId: inbound.contextMessageId,
        crmPhoneNumberId: inbound.crmPhoneNumberId,
        type: inbound.type,
      });

      const cliente = await findClienteByWhatsAppNumber(supabase, telefono);

      const beltramiRouting = await routeBeltramiInbound({
        waId: telefono,
        body: bodyOriginal,
        inboundMessageId: inbound.messageId,
        contextMessageId: inbound.contextMessageId,
        crmPhone: inbound.crmPhone,
        crmPhoneNumberId: inbound.crmPhoneNumberId,
        rawMessage: inbound.rawMessage,
        publicBaseUrl: BASE_URL,
        hasPhonesiaMatch: Boolean(cliente),
      });

      if (beltramiRouting.handled) {
        console.log("WA BELTRAMI ROUTING:", {
          telefono,
          routingStatus: beltramiRouting.routingStatus,
          reason: beltramiRouting.reason,
        });
        continue;
      }

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
          requestOrigin: {
            source: "whatsapp_inbound",
            wa_message_id: inbound.messageId,
            received_from: telefono,
          },
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
        inboundMessageId: inbound.messageId,
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
