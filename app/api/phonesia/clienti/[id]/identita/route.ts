import { NextResponse } from "next/server";
import { authorizePhonesiaAdminApi } from "@/lib/phonesia/api-auth";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!/^[1-9][0-9]*$/.test(id)) return NextResponse.json({ error: "Cliente non valido." }, { status: 400 });
  const body = await request.json().catch(() => null);
  if (typeof body?.telefono !== "string" || typeof body?.email !== "string") {
    return NextResponse.json({ error: "Dati non validi." }, { status: 400 });
  }
  const telefono = body.telefono.trim();
  const email = body.email.trim().toLowerCase();
  if ((telefono && !/^\+?[0-9 ()-]{6,30}$/.test(telefono)) || email.length > 254 ||
      (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
    return NextResponse.json({ error: "Controlla telefono ed email." }, { status: 400 });
  }
  const { data, error } = await auth.supabase.from("phonesia_clienti")
    .update({ telefono: telefono || null, email: email || null }).eq("id", id).select("id").maybeSingle();
  if (error) return NextResponse.json({ error: "Modifica non riuscita." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Cliente non trovato." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
