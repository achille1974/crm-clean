// ⚠️ Runtime Node necessario
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

// ===============================
// POST /api/phonesia/welcome
// ===============================
export async function POST(req: Request) {
  console.log("🚀 WELCOME API CHIAMATA (SMS MODE - PROMY)");

  try {
    // 🔥 ENV runtime
    const promyApiKey = process.env.PROMY_API_KEY;
    const promySender = process.env.PROMY_SMS_SENDER;
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!promyApiKey || !whatsappNumber) {
      console.error("❌ Variabili ambiente mancanti");
      return NextResponse.json(
        { error: "Configurazione server incompleta" },
        { status: 500 }
      );
    }

    const body = await req.json();
    const { cliente_id, telefono } = body;

    if (!cliente_id || !telefono) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    // 1️⃣ Check welcome già inviato
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

    // 2️⃣ Link WhatsApp
    const whatsappNumberClean = whatsappNumber.replace("+", "");
    const waLink = `https://wa.me/${whatsappNumberClean}?text=OK`;

    console.log("📨 Invio SMS Promy a:", telefono);

    // 3️⃣ Invio SMS tramite Promy
    const promyResponse = await fetch(
      "https://api.promy.it/rest/v1/sms",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${promyApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sender: promySender || "PHONESIA",
          recipients: [telefono],
          message:
            "👋 Benvenuto in PHONESIA\n\n" +
            "La tua registrazione è stata completata con successo.\n\n" +
            "Per attivare il canale WhatsApp e ricevere il tuo biglietto digitale,\n" +
            "clicca sul link qui sotto e invia il messaggio automatico:\n\n" +
            waLink +
            "\n\n" +
            "— Team PHONESIA",
        }),
      }
    );

    const promyData = await promyResponse.text();
    console.log("📬 Promy response:", promyData);

    if (!promyResponse.ok) {
      console.error("❌ Errore Promy SMS:", promyData);
      return NextResponse.json(
        { error: "Errore invio SMS Promy" },
        { status: 500 }
      );
    }

    // 4️⃣ Update DB
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

    console.log("✅ SMS Promy inviato correttamente");
    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error("🔥 ERRORE INVIO SMS:", err?.message || err);
    return NextResponse.json(
      { error: "Errore invio SMS" },
      { status: 500 }
    );
  }
}