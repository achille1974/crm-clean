export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createPhonesiaAdminClient } from "@/lib/phonesia/admin-client";
import { verifyFeedbackToken } from "@/lib/phonesia/feedback-token";
import { feedbackSecret } from "@/lib/phonesia/feedback-secret";

export async function POST(req: Request) {
  try {
    if (Number(req.headers.get("content-length") || 0) > 8192) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    const text = await req.text();
    if (text.length > 8192) return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
    let body;
    try { body = JSON.parse(text); } catch { return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
    const verified = verifyFeedbackToken(body?.token, feedbackSecret());
    if (!verified) return NextResponse.json({ ok: false, error: "invalid_link", message: "Link feedback non valido o scaduto. Chiedi un nuovo link al punto vendita." }, { status: 403 });
    if (!Number.isInteger(body.rating) || body.rating < 1 || body.rating > 5 ||
      (body.commento != null && (typeof body.commento !== "string" || body.commento.length > 2000)) || typeof body.ricontatto !== "boolean") {
      return NextResponse.json({ ok: false, error: "invalid_feedback" }, { status: 400 });
    }
    const db = createPhonesiaAdminClient();
    const { data: cliente, error: readError } = await db.from("phonesia_clienti").select("id,negozio_id").eq("id", verified.clienteId).maybeSingle();
    if (readError) throw readError;
    if (!cliente) return NextResponse.json({ ok: false, error: "invalid_link" }, { status: 403 });
    const { error } = await db.from("phonesia_feedback").insert({
      cliente_id: cliente.id, negozio_id: cliente.negozio_id, rating: body.rating,
      commento: body.commento?.trim() || null, ricontatto: body.ricontatto, link_token_hash: verified.hash,
    });
    // The unique token hash makes concurrent retries idempotent.
    if (error && error.code !== "23505") throw error;
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    console.error("Feedback could not be saved");
    return NextResponse.json({ ok: false, error: "temporarily_unavailable", message: "Invio non completato. Riprova tra poco." }, { status: 503 });
  }
}
