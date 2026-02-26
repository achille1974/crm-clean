// ⚠️ Twilio richiede Node.js runtime
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import twilio from "twilio";

/* ===============================
   CONFIGURAZIONE
   =============================== */

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// ⚠ Deve essere salvato in ENV come +39XXXXXXXXXX (senza whatsapp:)
const CRM_WHATSAPP_NUMBER = `whatsapp:${process.env.TWILIO_WHATSAPP_FROM}`;

const BASE_URL = "https://crm-clean.vercel.app";

/* ===============================
   WEBHOOK INBOUND WHATSAPP
   =============================== */

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const from = formData.get("From")?.toString();
    const bodyRaw = formData.get("Body")?.toString();

    const emptyResponse = new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      {
        status: 200,
        headers: { "Content-Type": "text/xml" },
      }
    );

    if (!from || !bodyRaw) {
      return emptyResponse;
    }

    const body = bodyRaw.trim().toUpperCase();
    const telefono = from.replace("whatsapp:", "");

    console.log("📩 WA INBOUND:", telefono, body);

    /* ===============================
       1️⃣ CERCA CLIENTE
       =============================== */

    const { data: cliente, error: clienteError } = await supabase
      .from("phonesia_clienti")
      .select("id, whatsapp_active")
      .eq("telefono", telefono)
      .maybeSingle();

    if (clienteError) {
      console.error("❌ Errore ricerca cliente:", clienteError);
      return emptyResponse;
    }

    if (!cliente) {
      console.log("⚠ Cliente non trovato:", telefono);
      return emptyResponse;
    }

    /* ===============================
       2️⃣ LOG INBOUND
       =============================== */

    await supabase.from("phonesia_operazioni").insert({
      cliente_id: cliente.id,
      telefono_riferimento: telefono,
      origine: "whatsapp_inbound",
      descrizione: body,
      data_operazione: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    /* ===============================
       3️⃣ SE RICEVE OK → ATTIVA + INVIA WELCOME
       =============================== */

    if (body === "OK" || body === "OK.") {

      // Attiva solo se non già attivo
      if (!cliente.whatsapp_active) {
        const { error: updateError } = await supabase
          .from("phonesia_clienti")
          .update({
            whatsapp_active: true,
            whatsapp_activated_at: new Date().toISOString(),
          })
          .eq("id", cliente.id);

        if (updateError) {
          console.error("❌ Errore attivazione:", updateError);
        } else {
          console.log("✅ WhatsApp attivato per cliente:", cliente.id);
        }
      }

      /* ===============================
         4️⃣ INVIO BIGLIETTO DIGITALE
         =============================== */

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

        console.log("📬 Welcome inviato. SID:", response.sid);

      } catch (twilioError) {
        console.error("🔥 Errore invio welcome:", twilioError);
      }
    }

    return emptyResponse;

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