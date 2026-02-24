// ⚠️ Twilio richiede Node.js runtime
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

const CRM_WHATSAPP_NUMBER = "whatsapp:+18303568731";
const BASE_URL = "https://crm-clean.vercel.app";

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

    const body = bodyRaw.trim().toUpperCase();
    const telefono = from.replace("whatsapp:", "");

    console.log("📩 WA INBOUND DA:", telefono, "MESSAGGIO:", body);

    // 🔎 Cerco cliente
    const { data: cliente, error: clienteError } = await supabase
      .from("phonesia_clienti")
      .select("id, whatsapp_active")
      .eq("telefono", telefono)
      .maybeSingle();

    if (clienteError) {
      console.error("❌ Errore ricerca cliente:", clienteError);
      return twimlResponse;
    }

    if (!cliente) {
      console.log("⚠️ Cliente non trovato per numero:", telefono);
      return twimlResponse;
    }

    // 📝 Log inbound
    await supabase.from("phonesia_operazioni").insert({
      cliente_id: cliente.id,
      telefono_riferimento: telefono,
      origine: "whatsapp_inbound",
      descrizione: body,
      data_operazione: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // 🔥 SE RICEVE OK → ATTIVA + INVIA WELCOME
    if (body === "OK") {

      // Attivazione (solo se non attivo)
      if (!cliente.whatsapp_active) {
        await supabase
          .from("phonesia_clienti")
          .update({
            whatsapp_active: true,
            whatsapp_activated_at: new Date().toISOString(),
          })
          .eq("id", cliente.id);

        console.log("✅ Cliente attivato WhatsApp:", cliente.id);
      }

      // Invio welcome WA
      try {
        const response = await client.messages.create({
          from: CRM_WHATSAPP_NUMBER,
          to: `whatsapp:${telefono}`,
          body:
            "🎉 Benvenuto in PHONESIA!\n\n" +
            "Il tuo canale WhatsApp è ora attivo.\n\n" +
            "Ecco il tuo biglietto digitale:\n" +
            `${BASE_URL}/phonesia/biglietto/${cliente.id}\n\n` +
            "Salva questo contatto per ricevere aggiornamenti e assistenza dedicata.\n\n" +
            "— Team PHONESIA",
        });

        console.log("📬 WA Welcome inviato. SID:", response.sid);

      } catch (twilioError) {
        console.error("🔥 Errore invio WA welcome:", twilioError);
      }
    }

    return twimlResponse;

  } catch (error) {
    console.error("🔥 WhatsApp inbound fatal error:", error);

    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );
  }
}