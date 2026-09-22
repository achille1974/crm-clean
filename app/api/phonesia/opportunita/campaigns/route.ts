import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type SnapshotRecipient = {
  clienteId: number;
  inputPosition: number;
  normalizedPhone: string | null;
  exclusionReason?: string | null;
  eligibilitySnapshot: Record<string, unknown>;
};

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configurazione Supabase mancante.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function validRecipient(value: unknown): value is SnapshotRecipient {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SnapshotRecipient>;
  return (
    Number.isInteger(item.clienteId) &&
    Number.isInteger(item.inputPosition) &&
    ((typeof item.normalizedPhone === "string" && /^[0-9]{8,20}$/.test(item.normalizedPhone)) ||
      (item.normalizedPhone == null && Boolean(item.exclusionReason))) &&
    Boolean(item.eligibilitySnapshot) &&
    typeof item.eligibilitySnapshot === "object"
  );
}

export async function POST(request: NextRequest) {
  if (process.env.PHONESIA_BATCH_WORKER_ENABLED !== "true") {
    return NextResponse.json(
      { ok: false, error: "batch_worker_disabled", message: "Invio WhatsApp batch temporaneamente sospeso. Nessuna campagna è stata accodata." },
      { status: 503 },
    );
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    if (!recipients.length || !recipients.every(validRecipient)) {
      return NextResponse.json(
        { ok: false, error: "snapshot_destinatari_non_valido" },
        { status: 400 },
      );
    }

    const idempotencyKey = String(body.idempotencyKey ?? "").trim();
    const required = ["promoKey", "promoName", "sendMode", "templateName"] as const;
    if (!idempotencyKey || required.some((key) => !String(body[key] ?? "").trim())) {
      return NextResponse.json(
        { ok: false, error: "dati_campagna_incompleti" },
        { status: 400 },
      );
    }

    const { data, error } = await adminClient().rpc(
      "phonesia_create_whatsapp_campaign_snapshot",
      {
        p_idempotency_key: idempotencyKey,
        p_promo_key: String(body.promoKey),
        p_promo_name: String(body.promoName),
        p_send_mode: String(body.sendMode),
        p_template_name: String(body.templateName),
        p_template_language: String(body.templateLanguage ?? "it"),
        p_normalized_message: body.normalizedMessage
          ? String(body.normalizedMessage)
          : null,
        p_attachment_public_url: body.attachmentPublicUrl
          ? String(body.attachmentPublicUrl)
          : null,
        p_attachment_file_name: body.attachmentFileName
          ? String(body.attachmentFileName)
          : null,
        p_attachment_mime_type: body.attachmentMimeType
          ? String(body.attachmentMimeType)
          : null,
        p_created_by: body.createdBy ? String(body.createdBy) : null,
        p_recipients: recipients.map((recipient) => ({
          cliente_id: recipient.clienteId,
          input_position: recipient.inputPosition,
          normalized_phone: recipient.normalizedPhone,
          exclusion_reason: recipient.exclusionReason ?? null,
          eligibility_snapshot: recipient.eligibilitySnapshot,
        })),
      },
    );

    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, campaignId: data, snapshotCount: recipients.length });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: "salvataggio_snapshot_fallito",
        message: error instanceof Error ? error.message : "Errore sconosciuto.",
      },
      { status: 500 },
    );
  }
}
