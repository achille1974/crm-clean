import "server-only";

import { createBeltramiSupabaseAdmin } from "./supabase";
import {
  BELTRAMI_NOTIFY_TEMPLATE_NAME,
  sendBeltramiNotifyMessage,
  type BeltramiNotifySendResult,
} from "./whatsapp";
import {
  createHandoffRequest,
  markHandoffNotificationFailed,
  updateHandoffNotification,
  type CreateHandoffRequestResult,
} from "@/lib/handoff/create-request";

const LAST_TOUCH_WINDOW_DAYS = 14;
const CANONICAL_WHATSAPP_BASE_URL = "https://app.crm-supreme.it";

type BeltramiSupabaseAdmin = ReturnType<typeof createBeltramiSupabaseAdmin>;

type BeltramiClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  telefono_normalizzato: string | null;
  last_whatsapp_outbound_at: string | null;
  last_whatsapp_outbound_message_id: string | null;
  last_whatsapp_outbound_kind: string | null;
};

type BeltramiOutboundRow = {
  id: number;
  cliente_id: number | null;
  created_at: string | null;
  to_phone: string | null;
  from_phone: string | null;
  template_name: string | null;
  whatsapp_message_id: string | null;
  message_kind: string | null;
};

type BeltramiStatusCallback = {
  whatsappMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  recipientPhone: string | null;
  timestampMeta: string | null;
  conversationIdMeta: string | null;
  pricingCategory: string | null;
  pricingBillable: boolean | null;
  errorCode: string | null;
  errorTitle: string | null;
  errorMessage: string | null;
  rawJson: unknown;
};

export type BeltramiInboundRoutingResult = {
  handled: boolean;
  routingStatus: "beltrami" | "ambiguous" | "ignored";
  reason: string;
};

export type RouteBeltramiInboundParams = {
  waId: string;
  body: string;
  inboundMessageId: string | null;
  contextMessageId: string | null;
  crmPhone: string | null;
  crmPhoneNumberId: string | null;
  rawMessage: unknown;
  publicBaseUrl: string;
  hasPhonesiaMatch: boolean;
};

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

function buildPhoneCandidates(rawPhone: string): string[] {
  const normalized = normalizePhoneForMeta(rawPhone);
  const candidates = new Set<string>();

  if (!normalized) {
    return [];
  }

  candidates.add(normalized);
  candidates.add(`+${normalized}`);

  if (normalized.startsWith("39") && normalized.length > 10) {
    const national = normalized.slice(2);
    candidates.add(national);
    candidates.add(`+39${national}`);
  }

  return Array.from(candidates);
}

function getFullName(cliente: BeltramiClienteRow | null): string {
  const fullName = [cliente?.nome, cliente?.cognome].filter(Boolean).join(" ").trim();
  return fullName || "Cliente Beltrami";
}

function getLastTouchCutoff() {
  return Date.now() - LAST_TOUCH_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function isRecentTimestamp(value: string | null | undefined): boolean {
  if (!value) return false;

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= getLastTouchCutoff();
}

function normalizeMetaId(value: string | null | undefined): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

function isDedicatedBeltramiPhoneNumberId(value: string | null | undefined): boolean {
  const incomingPhoneNumberId = normalizeMetaId(value);
  const beltramiPhoneNumberId = normalizeMetaId(
    process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID,
  );

  return Boolean(
    incomingPhoneNumberId &&
      beltramiPhoneNumberId &&
      incomingPhoneNumberId === beltramiPhoneNumberId,
  );
}

function buildBeltramiReplyUrl(params: {
  telefonoCliente: string;
}): string {
  const telefono = normalizePhoneForMeta(params.telefonoCliente) || params.telefonoCliente;
  const url = new URL(`/beltrami/w/${telefono}`, CANONICAL_WHATSAPP_BASE_URL);
  return url.toString();
}

function buildNotificationKey(inboundMessageId: string | null): string | null {
  if (!inboundMessageId) {
    return null;
  }

  return `beltrami_inbound_notify:${inboundMessageId}`;
}

async function findClienteById(
  supabase: BeltramiSupabaseAdmin,
  clienteId: number | null,
): Promise<BeltramiClienteRow | null> {
  if (!clienteId) return null;

  const { data, error } = await supabase
    .from("beltrami_clienti")
    .select(
      [
        "id",
        "nome",
        "cognome",
        "telefono",
        "telefono_normalizzato",
        "last_whatsapp_outbound_at",
        "last_whatsapp_outbound_message_id",
        "last_whatsapp_outbound_kind",
      ].join(", "),
    )
    .eq("id", clienteId)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as BeltramiClienteRow | null) ?? null;
}

async function findClienteByPhone(
  supabase: BeltramiSupabaseAdmin,
  rawPhone: string,
): Promise<BeltramiClienteRow | null> {
  const candidates = buildPhoneCandidates(rawPhone);

  if (candidates.length === 0) {
    return null;
  }

  const { data, error } = await supabase
    .from("beltrami_clienti")
    .select(
      [
        "id",
        "nome",
        "cognome",
        "telefono",
        "telefono_normalizzato",
        "last_whatsapp_outbound_at",
        "last_whatsapp_outbound_message_id",
        "last_whatsapp_outbound_kind",
      ].join(", "),
    )
    .in("telefono_normalizzato", candidates)
    .limit(1);

  if (error) throw error;
  return (data?.[0] as unknown as BeltramiClienteRow | undefined) ?? null;
}

async function findOutboundByContext(
  supabase: BeltramiSupabaseAdmin,
  contextMessageId: string | null,
): Promise<BeltramiOutboundRow | null> {
  if (!contextMessageId) {
    return null;
  }

  const { data, error } = await supabase
    .from("beltrami_whatsapp_messages")
    .select(
      "id, cliente_id, created_at, to_phone, from_phone, template_name, whatsapp_message_id, message_kind",
    )
    .eq("whatsapp_message_id", contextMessageId)
    .eq("direction", "outbound")
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as unknown as BeltramiOutboundRow | null) ?? null;
}

async function findRecentOutboundByCliente(
  supabase: BeltramiSupabaseAdmin,
  clienteId: number,
): Promise<BeltramiOutboundRow | null> {
  const cutoff = new Date(getLastTouchCutoff()).toISOString();

  const { data, error } = await supabase
    .from("beltrami_whatsapp_messages")
    .select(
      "id, cliente_id, created_at, to_phone, from_phone, template_name, whatsapp_message_id, message_kind",
    )
    .eq("cliente_id", clienteId)
    .eq("direction", "outbound")
    .eq("status", "sent")
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) throw error;
  return (data?.[0] as unknown as BeltramiOutboundRow | undefined) ?? null;
}

async function saveInboundMessage(params: {
  supabase: BeltramiSupabaseAdmin;
  cliente: BeltramiClienteRow | null;
  inbound: RouteBeltramiInboundParams;
  routingStatus: "beltrami" | "ambiguous";
  reason: string;
}) {
  const { error } = await params.supabase.from("beltrami_whatsapp_messages").insert({
    cliente_id: params.cliente?.id ?? null,
    direction: "inbound",
    message_kind: "inbound_text",
    routing_status: params.routingStatus,
    from_phone: normalizePhoneForMeta(params.inbound.waId) ?? params.inbound.waId,
    to_phone: params.inbound.crmPhone,
    body: params.inbound.body,
    whatsapp_message_id: params.inbound.inboundMessageId,
    context_message_id: params.inbound.contextMessageId,
    raw_json: params.inbound.rawMessage,
    metadata: {
      routing_reason: params.reason,
      has_phonesia_match: params.inbound.hasPhonesiaMatch,
      crm_phone_number_id: params.inbound.crmPhoneNumberId,
      source: "meta_whatsapp_inbound",
    },
  });

  if (error && error.code !== "23505") {
    throw error;
  }
}

async function hasNotificationAlreadyBeenHandled(
  supabase: BeltramiSupabaseAdmin,
  notificationKey: string | null,
): Promise<boolean> {
  if (!notificationKey) {
    return false;
  }

  const { data, error } = await supabase
    .from("beltrami_whatsapp_messages")
    .select("id")
    .eq("notification_key", notificationKey)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

async function saveNotificationOutbound(params: {
  supabase: BeltramiSupabaseAdmin;
  cliente: BeltramiClienteRow | null;
  inbound: RouteBeltramiInboundParams;
  notifyResult: BeltramiNotifySendResult;
  replyUrl: string;
  markDoneUrl: string | null;
  notificationKey: string | null;
}): Promise<number | string | null> {
  const { data, error } = await params.supabase
    .from("beltrami_whatsapp_messages")
    .insert({
      cliente_id: params.cliente?.id ?? null,
      direction: "outbound",
      message_kind: "notify_beltrami",
      routing_status: "beltrami",
      to_phone: params.notifyResult.toPhone,
      template_name: params.notifyResult.templateName,
      whatsapp_message_id: params.notifyResult.whatsappMessageId,
      context_message_id: params.inbound.inboundMessageId,
      status: params.notifyResult.status,
      status_reason: params.notifyResult.reason,
      notification_key: params.notificationKey,
      raw_json: params.notifyResult.rawJson,
      metadata: {
        source: "meta_whatsapp_inbound",
        reply_url: params.replyUrl,
        mark_done_url: params.markDoneUrl,
        notify_error: params.notifyResult.error,
        meta_error_details: params.notifyResult.errorDetails,
      },
    })
    .select("id")
    .maybeSingle();

  if (error && error.code !== "23505") {
    throw error;
  }

  return (data?.id as number | string | undefined) ?? null;
}

async function createBeltramiHandoffRequest(params: {
  supabase: BeltramiSupabaseAdmin;
  cliente: BeltramiClienteRow | null;
  inbound: RouteBeltramiInboundParams;
  replyUrl: string;
  notificationKey: string | null;
  destinazionePhone: string | null;
}): Promise<CreateHandoffRequestResult | null> {
  if (!params.destinazionePhone) {
    return null;
  }

  const clientePhone =
    params.cliente?.telefono_normalizzato ||
    normalizePhoneForMeta(params.inbound.waId) ||
    params.inbound.waId;

  try {
    const result = await createHandoffRequest({
      supabase: params.supabase,
      tableName: "beltrami_handoff_richieste",
      businessArea: "beltrami",
      clienteId: params.cliente?.id ?? null,
      clientePhone,
      clienteNome: getFullName(params.cliente),
      destinazioneNome: "Beltrami 1876",
      destinazionePhone: params.destinazionePhone,
      inboundMessageId: params.inbound.inboundMessageId,
      inboundBody: params.inbound.body,
      replyLink: params.replyUrl,
      metadata: {
        source: "meta_whatsapp_inbound",
        notification_key: params.notificationKey,
        context_message_id: params.inbound.contextMessageId,
      },
    });

    console.log("BELTRAMI HANDOFF REQUEST CREATED:", {
      handoffId: result.id,
      clienteId: params.cliente?.id ?? null,
      dueAt: result.dueAt,
    });

    return result;
  } catch (error) {
    console.error("Errore creazione handoff Beltrami:", {
      clienteId: params.cliente?.id ?? null,
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });
    return null;
  }
}

async function notifyBeltramiIfNeeded(params: {
  supabase: BeltramiSupabaseAdmin;
  cliente: BeltramiClienteRow | null;
  inbound: RouteBeltramiInboundParams;
}) {
  const notificationKey = buildNotificationKey(params.inbound.inboundMessageId);
  const alreadyHandled = await hasNotificationAlreadyBeenHandled(
    params.supabase,
    notificationKey,
  );

  if (alreadyHandled) {
    return;
  }

  const telefonoCliente =
    params.cliente?.telefono_normalizzato ||
    normalizePhoneForMeta(params.inbound.waId) ||
    params.inbound.waId;
  const replyUrl = buildBeltramiReplyUrl({
    telefonoCliente,
  });
  const handoffRequest = await createBeltramiHandoffRequest({
    supabase: params.supabase,
    cliente: params.cliente,
    inbound: params.inbound,
    replyUrl,
    notificationKey,
    destinazionePhone: process.env.BELTRAMI_WHATSAPP_NOTIFY_TO_PHONE ?? null,
  });

  const notifyResult: BeltramiNotifySendResult = handoffRequest
    ? await sendBeltramiNotifyMessage({
        clienteNome: getFullName(params.cliente),
        telefonoCliente,
        messaggioCliente: params.inbound.body,
        replyUrl,
        markDoneUrl: handoffRequest.markDoneUrl,
        templateName: BELTRAMI_NOTIFY_TEMPLATE_NAME,
      })
    : {
        status: "skipped",
        reason: "handoff_unavailable",
        error: "handoff_request_unavailable",
        whatsappMessageId: null,
        templateName: BELTRAMI_NOTIFY_TEMPLATE_NAME,
        toPhone: process.env.BELTRAMI_WHATSAPP_NOTIFY_TO_PHONE ?? null,
        errorDetails: null,
        rawJson: null,
      };

  if (notifyResult.status !== "sent") {
    console.error("Errore invio template handoff Beltrami:", {
      status: notifyResult.status,
      reason: notifyResult.reason,
      templateName: notifyResult.templateName,
      metaError: notifyResult.errorDetails,
    });
  }

  const beltramiWhatsappNotifyId = await saveNotificationOutbound({
    supabase: params.supabase,
    cliente: params.cliente,
    inbound: params.inbound,
    notifyResult,
    replyUrl,
    markDoneUrl: handoffRequest?.markDoneUrl ?? null,
    notificationKey,
  });

  if (handoffRequest && notifyResult.status === "sent") {
    try {
      await updateHandoffNotification({
        supabase: params.supabase,
        tableName: "beltrami_handoff_richieste",
        id: handoffRequest.id,
        notificationWhatsappMessageId: notifyResult.whatsappMessageId,
        metadata: {
          source: "meta_whatsapp_inbound",
          notification_key: notificationKey,
          beltrami_whatsapp_notify_id: beltramiWhatsappNotifyId,
          context_message_id: params.inbound.contextMessageId,
        },
      });
    } catch (error) {
      console.error("Errore update handoff Beltrami notificato:", {
        handoffId: handoffRequest.id,
        message: error instanceof Error ? error.message : "errore sconosciuto",
      });
    }
  } else if (handoffRequest) {
    try {
      await markHandoffNotificationFailed({
        supabase: params.supabase,
        tableName: "beltrami_handoff_richieste",
        id: handoffRequest.id,
      });
    } catch (error) {
      console.error("Errore update handoff Beltrami fallito:", {
        handoffId: handoffRequest.id,
        message: error instanceof Error ? error.message : "errore sconosciuto",
      });
    }
  }
}

function resolveLastTouchReason(params: {
  cliente: BeltramiClienteRow;
  recentOutbound: BeltramiOutboundRow | null;
}): string | null {
  if (
    params.cliente.last_whatsapp_outbound_message_id &&
    isRecentTimestamp(params.cliente.last_whatsapp_outbound_at)
  ) {
    return "last_touch_cliente";
  }

  if (params.recentOutbound) {
    return "last_touch_message";
  }

  return null;
}

export async function routeBeltramiInbound(
  params: RouteBeltramiInboundParams,
): Promise<BeltramiInboundRoutingResult> {
  let supabase: BeltramiSupabaseAdmin;

  try {
    supabase = createBeltramiSupabaseAdmin();
  } catch (error) {
    console.warn("Beltrami inbound ignored: configurazione Supabase non disponibile.", {
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });
    return {
      handled: false,
      routingStatus: "ignored",
      reason: "beltrami_supabase_unavailable",
    };
  }

  try {
    if (isDedicatedBeltramiPhoneNumberId(params.crmPhoneNumberId)) {
      const cliente = await findClienteByPhone(supabase, params.waId);

      await saveInboundMessage({
        supabase,
        cliente,
        inbound: params,
        routingStatus: "beltrami",
        reason: "metadata_phone_number_id",
      });
      await notifyBeltramiIfNeeded({ supabase, cliente, inbound: params });

      return {
        handled: true,
        routingStatus: "beltrami",
        reason: "metadata_phone_number_id",
      };
    }

    const contextOutbound = await findOutboundByContext(supabase, params.contextMessageId);

    if (contextOutbound) {
      const cliente =
        (await findClienteById(supabase, contextOutbound.cliente_id)) ||
        (await findClienteByPhone(supabase, params.waId));

      await saveInboundMessage({
        supabase,
        cliente,
        inbound: params,
        routingStatus: "beltrami",
        reason: "context_message_id",
      });
      await notifyBeltramiIfNeeded({ supabase, cliente, inbound: params });

      return {
        handled: true,
        routingStatus: "beltrami",
        reason: "context_message_id",
      };
    }

    const cliente = await findClienteByPhone(supabase, params.waId);

    if (!cliente) {
      return {
        handled: false,
        routingStatus: "ignored",
        reason: "no_beltrami_customer",
      };
    }

    const recentOutbound = await findRecentOutboundByCliente(supabase, cliente.id);
    const lastTouchReason = resolveLastTouchReason({ cliente, recentOutbound });

    if (lastTouchReason) {
      await saveInboundMessage({
        supabase,
        cliente,
        inbound: params,
        routingStatus: "beltrami",
        reason: lastTouchReason,
      });
      await notifyBeltramiIfNeeded({ supabase, cliente, inbound: params });

      return {
        handled: true,
        routingStatus: "beltrami",
        reason: lastTouchReason,
      };
    }

    if (params.hasPhonesiaMatch) {
      await saveInboundMessage({
        supabase,
        cliente,
        inbound: params,
        routingStatus: "ambiguous",
        reason: "beltrami_and_phonesia_without_context",
      });

      return {
        handled: true,
        routingStatus: "ambiguous",
        reason: "beltrami_and_phonesia_without_context",
      };
    }

    await saveInboundMessage({
      supabase,
      cliente,
      inbound: params,
      routingStatus: "beltrami",
      reason: "beltrami_only_phone_match",
    });
    await notifyBeltramiIfNeeded({ supabase, cliente, inbound: params });

    return {
      handled: true,
      routingStatus: "beltrami",
      reason: "beltrami_only_phone_match",
    };
  } catch (error) {
    console.error("Beltrami inbound routing error:", {
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });

    return {
      handled: false,
      routingStatus: "ignored",
      reason: "beltrami_routing_error",
    };
  }
}

export async function saveBeltramiWhatsappStatusCallbacks(
  statuses: BeltramiStatusCallback[],
) {
  if (statuses.length === 0) return;

  try {
    const supabase = createBeltramiSupabaseAdmin();
    const ids = statuses.map((item) => item.whatsappMessageId).filter(Boolean);

    if (ids.length === 0) return;

    const { data, error } = await supabase
      .from("beltrami_whatsapp_messages")
      .select("whatsapp_message_id")
      .in("whatsapp_message_id", ids);

    if (error) throw error;

    const beltramiIds = new Set(
      (data ?? [])
        .map((row) => String(row.whatsapp_message_id ?? ""))
        .filter(Boolean),
    );
    const rows = statuses
      .filter((item) => beltramiIds.has(item.whatsappMessageId))
      .map((item) => ({
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

    if (rows.length === 0) return;

    const { error: upsertError } = await supabase
      .from("beltrami_whatsapp_statuses")
      .upsert(rows, {
        onConflict: "whatsapp_message_id,status,timestamp_meta",
      });

    if (upsertError) throw upsertError;
  } catch (error) {
    console.warn("Beltrami status WhatsApp non salvati:", {
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });
  }
}
