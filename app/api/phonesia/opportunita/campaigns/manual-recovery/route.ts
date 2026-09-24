import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getPhonesiaAuth } from "@/lib/phonesia-auth";
import { executeManualRecovery, inspectOriginalAttachment, loadRecoveryData, validateRecoveryReport } from "@/lib/phonesia/manual-promo-recovery";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const headers = { "Cache-Control": "no-store" };
  try {
    const { user, profile } = await getPhonesiaAuth();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers });
    if (!profile?.active || profile.role !== "admin") return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers });
    if (request.headers.get("origin") !== "https://app.crm-supreme.it" || request.headers.get("sec-fetch-site") === "cross-site") {
      return NextResponse.json({ ok: false, error: "origin_non_valida" }, { status: 403, headers });
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ ok: false, error: "json_richiesto" }, { status: 415, headers });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 300_000) return NextResponse.json({ ok: false, error: "report_troppo_grande" }, { status: 413, headers });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (typeof body.dryRun !== "boolean" || body.acceptResidualRisk !== true || Object.keys(body).some(k => !["reportText", "dryRun", "acceptResidualRisk"].includes(k))) {
      return NextResponse.json({ ok: false, error: "autorizzazione_o_richiesta_non_valida" }, { status: 400, headers });
    }
    const report = validateRecoveryReport(body.reportText);
    if (process.env.PHONESIA_BATCH_WORKER_ENABLED !== "true") return NextResponse.json({ ok: false, error: "batch_worker_disabled" }, { status: 503, headers });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key || new URL(url).hostname !== "vqtoxgcacosdqtoxihko.supabase.co") throw new Error("Configurazione progetto non valida.");
    const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await executeManualRecovery({
      report, adminId: user.id, dryRun: body.dryRun,
      load: () => loadRecoveryData(client, report), inspectAttachment: inspectOriginalAttachment,
      createSnapshot: async args => {
        const { data, error } = await client.rpc("phonesia_create_whatsapp_campaign_snapshot", args);
        if (error || typeof data !== "string") throw new Error(`Accodamento non confermato: ${error?.message ?? "UUID assente"}. Verificare la chiave idempotente prima di qualsiasi altra azione.`);
        return data;
      },
    });
    return NextResponse.json(result, { headers });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "recupero_bloccato", message: error instanceof Error ? error.message : "Verifica incompleta." }, { status: 409, headers });
  }
}
