import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { HandoffTableName } from "./mark-done";
import { generateHandoffToken, hashHandoffToken } from "./tokens";

type HandoffBusinessArea = "phonesia" | "beltrami";

export type CreateHandoffRequestResult = {
  id: number | string;
  markDoneUrl: string;
  dueAt: string;
};

type JsonRecord = Record<string, unknown>;

function getPublicBaseUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL || "https://app.crm-supreme.it").replace(/\/+$/, "");
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function buildMarkDoneUrl(params: {
  businessArea: HandoffBusinessArea;
  id: number | string;
  token: string;
}) {
  const url = new URL(
    `/${params.businessArea}/handoff/${params.id}/done`,
    getPublicBaseUrl(),
  );
  url.searchParams.set("token", params.token);
  return url.toString();
}

export async function createHandoffRequest(params: {
  supabase: SupabaseClient;
  tableName: HandoffTableName;
  businessArea: HandoffBusinessArea;
  clienteId?: number | string | null;
  clientePhone: string;
  clienteNome?: string | null;
  negozioId?: number | null;
  destinazioneNome: string;
  destinazionePhone: string;
  inboundMessageId?: string | null;
  inboundBody?: string | null;
  conversationId?: number | string | null;
  agentTaskId?: number | string | null;
  notificationWhatsappMessageId?: string | null;
  replyLink?: string | null;
  metadata?: JsonRecord;
}): Promise<CreateHandoffRequestResult> {
  const now = new Date();
  const nowIso = now.toISOString();
  const dueAt = addHours(now, 24).toISOString();
  const token = generateHandoffToken();
  const tokenHash = hashHandoffToken(token);

  const { data, error } = await params.supabase
    .from(params.tableName)
    .insert({
      business_area: params.businessArea,
      cliente_id: params.clienteId ?? null,
      cliente_phone: params.clientePhone,
      cliente_nome: params.clienteNome ?? null,
      negozio_id: params.negozioId ?? null,
      destinazione_nome: params.destinazioneNome,
      destinazione_phone: params.destinazionePhone,
      inbound_message_id: params.inboundMessageId ?? null,
      inbound_body: params.inboundBody ?? null,
      conversation_id: params.conversationId ?? null,
      agent_task_id: params.agentTaskId ?? null,
      notified_at: nowIso,
      notification_whatsapp_message_id: params.notificationWhatsappMessageId ?? null,
      reply_link: params.replyLink ?? null,
      mark_done_token_hash: tokenHash,
      status: "pending",
      due_at: dueAt,
      reminder_count: 0,
      metadata: params.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) throw error;

  const id = data.id as number | string;
  const markDoneUrl = buildMarkDoneUrl({
    businessArea: params.businessArea,
    id,
    token,
  });

  const { error: updateError } = await params.supabase
    .from(params.tableName)
    .update({
      mark_done_url: markDoneUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) throw updateError;

  return {
    id,
    markDoneUrl,
    dueAt,
  };
}

export async function updateHandoffNotification(params: {
  supabase: SupabaseClient;
  tableName: HandoffTableName;
  id: number | string;
  notificationWhatsappMessageId?: string | null;
  metadata?: JsonRecord;
}) {
  const updates: JsonRecord = {
    updated_at: new Date().toISOString(),
  };

  if (params.notificationWhatsappMessageId) {
    updates.notification_whatsapp_message_id = params.notificationWhatsappMessageId;
  }

  if (params.metadata) {
    updates.metadata = params.metadata;
  }

  const { error } = await params.supabase
    .from(params.tableName)
    .update(updates)
    .eq("id", params.id);

  if (error) throw error;
}

export async function markHandoffNotificationFailed(params: {
  supabase: SupabaseClient;
  tableName: HandoffTableName;
  id: number | string;
}) {
  const { error } = await params.supabase
    .from(params.tableName)
    .update({
      status: "ignored",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) throw error;
}
