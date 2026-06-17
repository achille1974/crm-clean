import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ telefono: string }> | { telefono: string };
};

const REPLY_TEXT =
  "Ciao, ti scriviamo da Beltrami 1876 in merito alla tua richiesta.";

function normalizePhoneForWhatsapp(rawPhone: string | null | undefined): string | null {
  let digits = String(rawPhone ?? "").replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (!digits) {
    return null;
  }

  if (digits.startsWith("39") && digits.length >= 11 && digits.length <= 15) {
    return digits;
  }

  if (digits.startsWith("3") && digits.length >= 9 && digits.length <= 10) {
    return `39${digits}`;
  }

  if (digits.length >= 8 && digits.length <= 15) {
    return digits;
  }

  return null;
}

async function resolveParams(context: RouteContext) {
  return await context.params;
}

export async function GET(_request: Request, context: RouteContext) {
  const { telefono } = await resolveParams(context);
  const normalizedPhone = normalizePhoneForWhatsapp(telefono);

  if (!normalizedPhone) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone" },
      { status: 400 },
    );
  }

  const whatsappUrl = new URL(`https://wa.me/${normalizedPhone}`);
  whatsappUrl.searchParams.set("text", REPLY_TEXT);

  return NextResponse.redirect(whatsappUrl, { status: 302 });
}
