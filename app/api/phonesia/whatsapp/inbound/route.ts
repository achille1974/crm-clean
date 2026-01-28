import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

export async function POST(req: Request) {
  // Twilio invia dati come form-data
  const formData = await req.formData();

  const from = formData.get("From")?.toString(); // es: whatsapp:+39333...
  const body = formData
    .get("Body")
    ?.toString()
    ?.trim()
    ?.toUpperCase();

  // sicurezza: se manca qualcosa, usciamo
  if (!from || !body) {
    return NextResponse.json({ ok: true });
  }

  // normalizziamo il numero
  const telefono = from.replace("whatsapp:", "");

  // cerchiamo il cliente
  const { data: cliente } = await supabase
    .from("phonesia_clienti")
    .select("id")
    .eq("telefono", telefono)
    .single();

  // se il cliente non esiste, non facciamo nulla
  if (!cliente) {
    return NextResponse.json({ ok: true });
  }

  // LOGICA CHIAVE:
  // il cliente ha letto il welcome e risponde "OK"
  if (body === "OK") {
    await supabase
      .from("phonesia_clienti")
      .update({
        whatsapp_active: true,
        whatsapp_activated_at: new Date().toISOString(),
      })
      .eq("id", cliente.id);
  }

  // Twilio vuole sempre una risposta 200
  return NextResponse.json({ ok: true });
}
