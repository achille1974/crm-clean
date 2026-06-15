import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ telefono: string }> | { telefono: string };
};

const GENERIC_REPLY_TEXT =
  "Ciao, sono di PHONESIA. Ho letto il tuo messaggio, dimmi pure come posso aiutarti.";

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

function normalizeStoreName(value: string | null): string | null {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^phonesia[\s_-]+/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) {
    return null;
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`)
    .join(" ");
}

function buildReplyText(negozio: string | null): string {
  const storeName = normalizeStoreName(negozio);

  if (!storeName) {
    return GENERIC_REPLY_TEXT;
  }

  return `Ciao, sono Marco di PHONESIA ${storeName}. Ho letto il tuo messaggio, dimmi pure come posso aiutarti.`;
}

async function resolveParams(context: RouteContext) {
  return await context.params;
}

export async function GET(request: Request, context: RouteContext) {
  const { telefono } = await resolveParams(context);
  const normalizedPhone = normalizePhoneForWhatsapp(telefono);

  if (!normalizedPhone) {
    return NextResponse.json(
      { ok: false, error: "invalid_phone" },
      { status: 400 },
    );
  }

  const { searchParams } = new URL(request.url);
  const replyText = buildReplyText(searchParams.get("negozio"));
  const whatsappUrl = new URL(`https://wa.me/${normalizedPhone}`);
  whatsappUrl.searchParams.set("text", replyText);

  return NextResponse.redirect(whatsappUrl, { status: 302 });
}
