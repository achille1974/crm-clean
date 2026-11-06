import { after, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createPhonesiaAdminClient } from "@/lib/phonesia/admin-client";
import { sendPhonesiaWelcome } from "@/lib/phonesia/welcome-message";
import { qrDatabaseReady } from "@/lib/phonesia/qr-readiness";
import {
  parseQrRegistration, QrRequestError, qrRequestHashes, readQrJson, verifyQrOrigin,
} from "@/lib/phonesia/qr-registration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Non-mutating readiness check for monitoring; exact origin protection also applies to GET.
export async function GET(request: Request) {
  try {
    verifyQrOrigin(request, process.env);
    const ready = await qrDatabaseReady(createPhonesiaAdminClient());
    if (!ready) console.error(JSON.stringify({ event: "phonesia_qr_readiness", status: 503 }));
    return NextResponse.json({ ok: ready, code: ready ? "ready" : "temporarily_unavailable" }, {
      status: ready ? 200 : 503, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const status = error instanceof QrRequestError ? error.status : 503;
    return NextResponse.json({ ok: false, code: status === 403 ? "origin_rejected" : "temporarily_unavailable" },
      { status, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  const startedAt = Date.now();
  let storeId: number | undefined;
  const reply = (status: number, code: string, body: Record<string, unknown>, headers = {}) => {
    // No request body, customer identifiers, IPs, user agents or consent values in logs.
    const event = { event: "phonesia_qr_registration", request_id: requestId,
      status, code, store_id: storeId, duration_ms: Date.now() - startedAt };
    if (status >= 500) console.error(JSON.stringify(event));
    else console.info(JSON.stringify(event));
    return NextResponse.json({ ...body, code, request_id: requestId }, {
      status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId, ...headers },
    });
  };
  try {
    verifyQrOrigin(request, process.env);
    const registration = parseQrRegistration(await readQrJson(request));
    storeId = registration.negozioId;
    const hashes = qrRequestHashes(request, registration.telefono, process.env);
    const supabase = createPhonesiaAdminClient();
    const { data, error } = await supabase.rpc("phonesia_register_qr", {
      p_nome: registration.nome,
      p_cognome: registration.cognome,
      p_telefono: registration.telefono,
      p_email: registration.email,
      p_codice_fiscale: registration.codiceFiscale,
      p_negozio_id: registration.negozioId,
      p_marketing_accepted: registration.marketingAccepted,
      p_user_agent: (request.headers.get("user-agent") || "").slice(0, 512),
      p_ip_hash: hashes.ipHash,
      p_phone_hash: hashes.phoneHash,
    });
    if (error || !data) {
      return reply(503, "temporarily_unavailable", { error: "Registrazione temporaneamente non disponibile. Riprova più tardi." });
    }
    if (data.status === "rate_limited") {
      return reply(429, "rate_limited", { error: "Troppe richieste. Attendi prima di riprovare." },
        { "Retry-After": String(data.retry_after || 600) });
    }
    if (data.status !== "created" && data.status !== "accepted") {
      throw new Error("Unexpected registration result");
    }
    if (data.status === "created") {
      const clienteId = Number(data.cliente_id);
      if (!Number.isSafeInteger(clienteId) || clienteId <= 0) throw new Error("Invalid registration result");
      after(async () => {
        try { await sendPhonesiaWelcome(clienteId); }
        catch { console.error("Phonesia QR welcome delivery failed; registration is saved"); }
      });
    }
    // Identical response for new and existing customers; no personal data or IDs.
    return reply(202, "accepted", { ok: true });
  } catch (error) {
    if (error instanceof QrRequestError) {
      return reply(error.status, error.status === 403 ? "origin_rejected" : "invalid_request", { error: error.message });
    }
    return reply(503, "temporarily_unavailable", { error: "Registrazione temporaneamente non disponibile." });
  }
}
