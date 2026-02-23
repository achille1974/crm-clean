// ⚠️ Twilio richiede Node.js runtime
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabaseClient";

// ===============================
// TWILIO CLIENT
// ===============================
const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// 🔥 NUMERO WHATSAPP CRM (Twilio)
const CRM_WHATSAPP_NUMBER = "+18303568731";

// ===============================
// POST /api/phonesia/welcome
// ===============================
export async function POST(req: Request) {
  console.log("🚀 WELCOME API CHIAMATA (SMS MODE)");

  try {
    const body = await req.json();
    const { cliente_id, telefono } = body;

    if (!cliente_id || !telefono) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    // 1️⃣ Verifica se welcome già inviato
    const { data: cliente, error: checkError } = await supabase
      .from("phonesia_clienti")
      .select("welcome_sent_at")
      .eq("id", cliente_id)
      .single();

    if (checkError) {
      console.error("❌ Errore check cliente:", checkError);
      return NextResponse.json(
        { error: "Errore check cliente" },
        { status: 500 }
      );
    }

    if (cliente?.welcome_sent_at) {
      console.log("⛔ Welcome già inviato");
      return NextResponse.json({ ok: true });
    }

    // 2️⃣ Costruzione link WhatsApp verso CRM
    const crmNumberClean = CRM_WHATSAPP_NUMBER.replace("+", "");
    const waLink = `https://wa.me/${crmNumberClean}?text=OK`;

    console.log("📨 Invio SMS a:", telefono);
    console.log("🔗 Link WA:", waLink);

    // 3️⃣ INVIO SMS
    const smsResponse = await client.messages.create({
      from: CRM_WHATSAPP_NUMBER,
      to: telefono,
      body:
        "👋 Benvenuto in PHONESIA\n\n" +
        "La tua registrazione è stata completata con successo.\n\n" +
        "Per attivare il canale WhatsApp e ricevere il tuo biglietto digitale,\n" +
        "clicca sul link qui sotto e invia il messaggio automatico:\n\n" +
        waLink +
        "\n\n" +
        "— Team PHONESIA",
    });

    console.log("📬 Twilio SID:", smsResponse.sid);

    // 4️⃣ Aggiornamento DB
    const { error: updateError } = await supabase
      .from("phonesia_clienti")
      .update({
        welcome_sent_at: new Date().toISOString(),
        welcome_channel: "sms",
        welcome_status: "sent",
      })
      .eq("id", cliente_id);

    if (updateError) {
      console.error("❌ Errore update DB:", updateError);
      return NextResponse.json(
        { error: "Errore update DB" },
        { status: 500 }
      );
    }

    console.log("✅ SMS inviato correttamente");
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("🔥 ERRORE INVIO SMS:", err);
    return NextResponse.json(
      { error: "Errore invio SMS" },
      { status: 500 }
    );
  }
}