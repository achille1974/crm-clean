import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  const formData = await req.formData();

  const from = formData.get("From")?.toString();
  const body = formData.get("Body")?.toString()?.trim();

  if (!from || !body) {
    return NextResponse.json({ ok: true });
  }

  const telefono = from.replace("whatsapp:", "");

  // 🔹 Cerchiamo il cliente
  const { data: cliente } = await supabase
    .from("phonesia_clienti")
    .select("id")
    .eq("telefono", telefono)
    .single();

  if (!cliente) {
    return NextResponse.json({ ok: true });
  }

  // 🔹 Salviamo SEMPRE il messaggio ricevuto
  await supabase.from("phonesia_operazioni").insert({
    cliente_id: cliente.id,
    tipo_operazione: "whatsapp_inbound",
    descrizione: body,
    data_operazione: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });

  // 🔹 Se scrive OK attiviamo WhatsApp
  if (body.toUpperCase() === "OK") {
    await supabase
      .from("phonesia_clienti")
      .update({
        whatsapp_active: true,
        whatsapp_activated_at: new Date().toISOString(),
      })
      .eq("id", cliente.id);
  }

  return NextResponse.json({ ok: true });
}
