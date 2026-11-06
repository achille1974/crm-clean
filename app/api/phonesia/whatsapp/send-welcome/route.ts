import { NextResponse } from "next/server";
import { authorizePhonesiaAdminApi } from "@/lib/phonesia/api-auth";
import { sendPhonesiaWelcome } from "@/lib/phonesia/welcome-message";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const id = body?.cliente_id;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    return NextResponse.json({ error: "cliente non valido" }, { status: 400 });
  }
  try {
    await sendPhonesiaWelcome(id);
    return NextResponse.json({ ok: true });
  } catch {
    console.error("Phonesia welcome delivery failed");
    return NextResponse.json({ error: "Invio non disponibile." }, { status: 502 });
  }
}
