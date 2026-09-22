import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  processPersistentBatchBlock,
  type ClaimedRecipient,
  type MetaSendResult,
  type PersistentBatchRepository,
} from "@/lib/phonesia/persistent-batch";
import { authorizeBatchWorker } from "@/lib/phonesia/batch-worker-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const META_TIMEOUT_MS = 15_000;
const WORKER_BUDGET_MS = 45_000;
const SAVE_MARGIN_MS = 5_000;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configurazione Supabase mancante.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function mapClaim(row: Record<string, unknown>): ClaimedRecipient {
  return {
    id: String(row.id),
    campaignId: String(row.campaign_id),
    clienteId: Number(row.cliente_id),
    normalizedPhone: String(row.normalized_phone),
    leaseToken: String(row.lease_token),
  };
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authorization = authorizeBatchWorker(
    request.headers.get("authorization"),
    process.env,
  );
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.error },
      { status: authorization.status },
    );
  }
  const { id: campaignId } = await context.params;
  const supabase = adminClient();
  const { data: campaign, error: campaignError } = await supabase
    .from("phonesia_whatsapp_campaigns")
    .select("id,promo_key,template_name,state,historical,snapshot_complete")
    .eq("id", campaignId)
    .maybeSingle();
  if (campaignError || !campaign) {
    return NextResponse.json({ ok: false, error: "campagna_non_trovata" }, { status: 404 });
  }
  if (campaign.historical || !campaign.snapshot_complete) {
    return NextResponse.json(
      { ok: false, error: "campagna_non_elaborabile" },
      { status: 409 },
    );
  }

  const repository: PersistentBatchRepository = {
    async claim(id, limit, leaseSeconds) {
      const { data, error } = await supabase.rpc("phonesia_claim_whatsapp_recipients", {
        p_campaign_id: id,
        p_limit: limit,
        p_lease_seconds: leaseSeconds,
      });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Record<string, unknown>[]).map(mapClaim);
    },
    async startAttempt(recipient) {
      const { error } = await supabase.rpc("phonesia_start_whatsapp_attempt", {
        p_recipient_id: recipient.id,
        p_lease_token: recipient.leaseToken,
      });
      if (error) throw new Error(error.message);
    },
    async release(recipient) {
      const { error } = await supabase.rpc("phonesia_release_whatsapp_recipient", {
        p_recipient_id: recipient.id,
        p_lease_token: recipient.leaseToken,
      });
      if (error) throw new Error(error.message);
    },
    async skip(recipient, message) {
      const { error } = await supabase.rpc("phonesia_skip_whatsapp_recipient", {
        p_recipient_id: recipient.id,
        p_lease_token: recipient.leaseToken,
        p_message: message,
      });
      if (error) throw new Error(error.message);
    },
    async recheckEligibility(recipient) {
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const [{ data: cliente }, { count: consentCount }, { count: todayCount }, { count: promoCount }] =
        await Promise.all([
          supabase.from("phonesia_clienti").select("whatsapp_active").eq("id", recipient.clienteId).maybeSingle(),
          supabase.from("phonesia_consensi").select("cliente_id", { count: "exact", head: true })
            .eq("cliente_id", recipient.clienteId).eq("tipo_evento", "marketing_accepted"),
          supabase.from("phonesia_opportunita_inviate").select("cliente_id", { count: "exact", head: true })
            .eq("cliente_id", recipient.clienteId).gte("created_at", startOfToday.toISOString()),
          supabase.from("phonesia_opportunita_inviate").select("cliente_id", { count: "exact", head: true })
            .eq("cliente_id", recipient.clienteId).eq("promo_key", campaign.promo_key),
        ]);
      if (!cliente?.whatsapp_active) return { eligible: false, reason: "WhatsApp non attivo." };
      if (!consentCount) return { eligible: false, reason: "Consenso marketing mancante." };
      if (todayCount) return { eligible: false, reason: "Promo WhatsApp già inviata oggi." };
      if (promoCount) return { eligible: false, reason: "Destinatario già accettato nella campagna." };
      return { eligible: true };
    },
    async finish(recipient, result) {
      const { error } = await supabase.rpc("phonesia_finish_whatsapp_attempt", {
        p_recipient_id: recipient.id,
        p_lease_token: recipient.leaseToken,
        p_outcome: result.state,
        p_whatsapp_message_id: result.state === "accepted" ? result.whatsappMessageId : null,
        p_http_status: "httpStatus" in result ? result.httpStatus : null,
        p_error_code: "code" in result ? result.code ?? null : null,
        p_error_message: "message" in result ? result.message : null,
        p_response_summary: null,
      });
      if (error) throw new Error(error.message);
    },
  };

  async function sendToMeta(recipient: ClaimedRecipient): Promise<MetaSendResult> {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new Error("Configurazione Meta mancante.");

    const { data: stored, error } = await supabase
      .from("phonesia_whatsapp_campaign_recipients")
      .select("eligibility_snapshot")
      .eq("id", recipient.id)
      .single();
    if (error) throw new Error(error.message);
    const payload = stored?.eligibility_snapshot?.payload as Record<string, unknown> | undefined;
    if (!payload || payload.to !== recipient.normalizedPhone) {
      throw new Error("Payload immutabile del destinatario mancante o incoerente.");
    }

    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        cache: "no-store",
        signal: AbortSignal.timeout(META_TIMEOUT_MS),
      },
    );
    const text = await response.text();
    let json: Record<string, unknown> = {};
    try { json = JSON.parse(text) as Record<string, unknown>; } catch { /* preserve raw error below */ }
    if (!response.ok) {
      const metaError = json.error as Record<string, unknown> | undefined;
      return {
        kind: "rejected",
        httpStatus: response.status,
        code: metaError?.code == null ? undefined : String(metaError.code),
        message: String(metaError?.message ?? (text || `HTTP ${response.status}`)),
      };
    }
    const messages = Array.isArray(json.messages) ? json.messages : [];
    const messageId = (messages[0] as Record<string, unknown> | undefined)?.id;
    if (typeof messageId !== "string" || !messageId) {
      throw new Error("Meta ha risposto senza whatsapp_message_id.");
    }
    return { kind: "accepted", whatsappMessageId: messageId, httpStatus: response.status };
  }

  const result = await processPersistentBatchBlock({
    campaignId,
    repository,
    sendToMeta,
    blockSize: 10,
    leaseSeconds: 30,
    callTimeoutMs: META_TIMEOUT_MS + 1_000,
    budgetMs: WORKER_BUDGET_MS,
    saveMarginMs: SAVE_MARGIN_MS,
  });
  return NextResponse.json({ ok: true, campaignId, ...result });
}
