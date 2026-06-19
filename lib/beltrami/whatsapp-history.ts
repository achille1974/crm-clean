import "server-only";

import { createBeltramiSupabaseAdmin } from "./supabase";
import type { BeltramiWelcomeSendResult } from "./whatsapp";

type BeltramiSupabaseAdmin = ReturnType<typeof createBeltramiSupabaseAdmin>;

type TrackWelcomeParams = {
  supabase: BeltramiSupabaseAdmin;
  clienteId: number;
  toPhone: string;
  welcomeResult: BeltramiWelcomeSendResult;
};

type TrackWelcomeResult = {
  ok: boolean;
  messageLogged: boolean;
  clienteUpdated: boolean;
};

type JsonRecord = Record<string, unknown>;

function logTrackingWarning(stage: string, error: unknown) {
  const message = error instanceof Error ? error.message : "errore sconosciuto";
  console.warn("Beltrami WhatsApp tracking non completato:", {
    stage,
    message,
  });
}

function buildWelcomeMetadata(result: BeltramiWelcomeSendResult): JsonRecord {
  return {
    source: "qr_registration",
    tracking_version: "beltrami_whatsapp_v1",
    welcome_status: result.status,
    welcome_reason: result.reason,
    welcome_error: result.error,
    ...(result.errorDetails
      ? {
          meta_error_details: result.errorDetails,
        }
      : {}),
  };
}

async function insertWelcomeOutboundMessage(params: TrackWelcomeParams) {
  const { error } = await params.supabase.from("beltrami_whatsapp_messages").insert({
    cliente_id: params.clienteId,
    direction: "outbound",
    message_kind: "template_welcome",
    routing_status: "beltrami",
    to_phone: params.toPhone,
    template_name: params.welcomeResult.templateName,
    whatsapp_message_id: params.welcomeResult.whatsappMessageId,
    status: params.welcomeResult.status,
    status_reason: params.welcomeResult.reason,
    raw_json: params.welcomeResult.rawJson,
    metadata: buildWelcomeMetadata(params.welcomeResult),
  });

  if (error) throw error;
}

async function updateClienteWelcomeState(params: TrackWelcomeParams) {
  const now = new Date().toISOString();
  const sent = params.welcomeResult.status === "sent";

  const { error } = await params.supabase
    .from("beltrami_clienti")
    .update({
      whatsapp_active: sent,
      whatsapp_activated_at: sent ? now : null,
      welcome_sent_at: sent ? now : null,
      welcome_status: params.welcomeResult.status,
      welcome_whatsapp_message_id: params.welcomeResult.whatsappMessageId,
      welcome_template_name: params.welcomeResult.templateName,
      last_whatsapp_outbound_at: now,
      last_whatsapp_outbound_message_id: params.welcomeResult.whatsappMessageId,
      last_whatsapp_outbound_kind: "template_welcome",
    })
    .eq("id", params.clienteId);

  if (error) throw error;
}

export async function trackBeltramiWelcomeAttempt(
  params: TrackWelcomeParams,
): Promise<TrackWelcomeResult> {
  let messageLogged = false;
  let clienteUpdated = false;

  try {
    await insertWelcomeOutboundMessage(params);
    messageLogged = true;
  } catch (error) {
    logTrackingWarning("insert_welcome_outbound", error);
  }

  try {
    await updateClienteWelcomeState(params);
    clienteUpdated = true;
  } catch (error) {
    logTrackingWarning("update_cliente_welcome", error);
  }

  return {
    ok: messageLogged && clienteUpdated,
    messageLogged,
    clienteUpdated,
  };
}
