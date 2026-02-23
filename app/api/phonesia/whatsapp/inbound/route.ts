// ⚠️ Twilio richiede Node.js runtime
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const from = formData.get("From")?.toString();
    const bodyRaw = formData.get("Body")?.toString();

    const twimlResponse = new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );

    if (!from || !bodyRaw) return twimlResponse;

    const body = bodyRaw.trim();
    const telefono = from.replace("whatsapp:", "");

    const { data: cliente } = await supabase
      .from("phonesia_clienti")
      .select("id, whatsapp_active")
      .eq("telefono", telefono)
      .maybeSingle();

    if (!cliente) return twimlResponse;

    // 🔹 Log inbound
    await supabase.from("phonesia_operazioni").insert({
      cliente_id: cliente.id,
      telefono_riferimento: telefono,
      origine: "whatsapp_inbound",
      descrizione: body,
      data_operazione: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // 🔥 SE SCRIVE OK E NON ERA ATTIVO
    if (body.toUpperCase() === "OK" && !cliente.whatsapp_active) {

      await supabase
        .from("phonesia_clienti")
        .update({
          whatsapp_active: true,
          whatsapp_activated_at: new Date().toISOString(),
        })
        .eq("id", cliente.id);

      // 🔥 INVIO WELCOME CON BIGLIETTO
      await client.messages.create({
        from: "whatsapp:+18303568731",
        to: `whatsapp:${telefono}`,
        body:
          "🎉 Benvenuto in PHONESIA!\n\n" +
          "Ora sei ufficialmente attivo su WhatsApp.\n\n" +
          "Ecco il tuo biglietto digitale:\n" +
          "https://crm-clean.vercel.app/phonesia/biglietto/" + cliente.id
      });
    }

    return twimlResponse;

  } catch (error) {
    console.error("WhatsApp inbound fatal error:", error);

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}