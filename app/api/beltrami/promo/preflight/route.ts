export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

import { getBeltramiDashboardAuth } from "@/lib/beltrami-auth";
import { runBeltramiPromoPreflight } from "@/lib/beltrami/promo";

type PromoPreflightBody = {
  clienteIds?: unknown;
  promoName?: unknown;
  messageText?: unknown;
  imageUrl?: unknown;
  templateName?: unknown;
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
    const body = (await request.json().catch(() => null)) as PromoPreflightBody | null;
    const preflight = await runBeltramiPromoPreflight({
      clienteIds: parseClienteIds(body?.clienteIds),
      promoName: String(body?.promoName ?? ""),
      messageText: String(body?.messageText ?? ""),
      imageUrl: String(body?.imageUrl ?? ""),
      templateName: String(body?.templateName ?? ""),
    });

    return NextResponse.json(preflight, { status: preflight.errors.length > 0 ? 400 : 200 });
  } catch (error) {
    console.error("beltrami promo preflight error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        message: error instanceof Error ? error.message : "Errore preflight promo.",
      },
      { status: 500 },
    );
  }
}
