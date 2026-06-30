export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { getBeltramiDashboardAuth } from "@/lib/beltrami-auth";
import { createBeltramiSupabaseAdmin } from "@/lib/beltrami/supabase";
import {
  insertBeltramiPromoMessage,
  runBeltramiPromoPreflight,
  sendBeltramiPromoImageMessage,
} from "@/lib/beltrami/promo";

type PromoSendBody = {
  clienteIds?: unknown;
  promoName?: unknown;
  messageText?: unknown;
  imageUrl?: unknown;
  templateName?: unknown;
  confirmation?: unknown;
};

function parseClienteIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((item) => Number(item))
        .filter((item) => Number.isInteger(item) && item > 0),
    ),
  ];
}

export async function POST(request: NextRequest) {
  const auth = await getBeltramiDashboardAuth();
  if (!auth) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => null)) as PromoSendBody | null;

    if (String(body?.confirmation ?? "").trim().toUpperCase() !== "INVIA") {
      return NextResponse.json(
        {
          ok: false,
          error: "confirmation_required",
          message: "Scrivi INVIA per confermare l'invio reale.",
        },
        { status: 400 },
      );
    }

    const preflight = await runBeltramiPromoPreflight({
      clienteIds: parseClienteIds(body?.clienteIds),
      promoName: String(body?.promoName ?? ""),
      messageText: String(body?.messageText ?? ""),
      imageUrl: String(body?.imageUrl ?? ""),
      templateName: String(body?.templateName ?? ""),
    });

    if (!preflight.ok || preflight.counts.inviabiliEffettivi <= 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "preflight_not_ok",
          preflight,
        },
        { status: 409 },
      );
    }

    const supabase = createBeltramiSupabaseAdmin();
    const sendableItems = preflight.items.filter((item) => item.status === "sendable");
    const results = [];

    for (const item of sendableItems) {
      const sendResult = await sendBeltramiPromoImageMessage({
        telefono: item.telefono,
        templateName: preflight.templateName,
        imageUrl: preflight.imageUrl,
        messageText: preflight.messageText,
      });

      await insertBeltramiPromoMessage({
        supabase,
        clienteId: item.clienteId,
        toPhone: item.telefono,
        promoKey: preflight.promoKey,
        promoName: preflight.promoName,
        messageText: preflight.messageText,
        imageUrl: preflight.imageUrl,
        templateName: preflight.templateName,
        sendResult,
      });

      results.push({
        clienteId: item.clienteId,
        clienteNome: item.clienteNome,
        status: sendResult.status,
        reason: sendResult.reason,
        whatsappMessageId: sendResult.whatsappMessageId,
      });
    }

    return NextResponse.json({
      ok: true,
      promoKey: preflight.promoKey,
      promoName: preflight.promoName,
      templateName: preflight.templateName,
      imageUrl: preflight.imageUrl,
      sent: results.filter((item) => item.status === "sent").length,
      failed: results.filter((item) => item.status === "failed").length,
      skipped: results.filter((item) => item.status === "skipped").length,
      results,
      preflight,
    });
  } catch (error) {
    console.error("beltrami promo send-batch error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: error instanceof Error ? error.message : "Errore invio promo.",
      },
      { status: 500 },
    );
  }
}
