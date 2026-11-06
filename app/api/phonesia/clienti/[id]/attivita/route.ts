import { NextResponse } from "next/server";
import { authorizePhonesiaAdminApi } from "@/lib/phonesia/api-auth";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^[1-9][0-9]*$/.test(id)) return NextResponse.json({ error: "Cliente non valido." }, { status: 400 });
  const { data, error } = await auth.supabase.from("phonesia_attivita")
    .select("id, descrizione:note, created_at").eq("cliente_id", id)
    .order("created_at", { ascending: false }).limit(500);
  if (error) return NextResponse.json({ error: "Lettura delle attività non riuscita." }, { status: 500 });
  return NextResponse.json({ attivita: data || [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: Context) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^[1-9][0-9]*$/.test(id)) return NextResponse.json({ error: "Cliente non valido." }, { status: 400 });
  const body = await request.json().catch(() => null);
  const note = typeof body?.descrizione === "string" ? body.descrizione.trim() : "";
  if (!note || note.length > 4000) {
    return NextResponse.json({ error: "Inserisci una descrizione entro 4.000 caratteri." }, { status: 400 });
  }
  const { error } = await auth.supabase.from("phonesia_attivita").insert({ cliente_id: id, note });
  if (error) return NextResponse.json({ error: "Salvataggio non riuscito." }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 201 });
}
