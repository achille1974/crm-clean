import { NextResponse } from "next/server";
import { authorizePhonesiaAdminApi } from "@/lib/phonesia/api-auth";
import { signFeedbackToken } from "@/lib/phonesia/feedback-token";
import { feedbackSecret } from "@/lib/phonesia/feedback-secret";

export async function POST(request: Request) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  const body = await request.json().catch(() => null);
  const id = body?.cliente_id;
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "invalid_customer" }, { status: 400 });
  const { data, error } = await auth.supabase.from("phonesia_clienti").select("id").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  if (!data) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const url = new URL("https://app.crm-supreme.it/phonesia/feedback");
  url.searchParams.set("cliente_id", signFeedbackToken(id, feedbackSecret()));
  return NextResponse.json({ url: url.toString(), expires_in_days: 30 }, { headers: { "Cache-Control": "no-store" } });
}
