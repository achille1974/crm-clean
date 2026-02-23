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

    // 1️⃣ Check welcome già inviato
    const { data: cliente } = await supabase
      .from("phonesia_clienti")
      .select("welcome_sent_at")
      .eq("id", cliente_id)
      .single();

    if (cliente?.welcome_sent_at) {
      console.log("⛔ Welcome già inviato");
      return NextResponse.json({ ok: true });
    }

    // 2️⃣ COSTRUZIONE LINK WHATSAPP
    const numeroClean = telefono.replace("+", "");
    const waLink = `https://wa.me/${numeroClean}?text=OK`;

    console.log("📨 Invio SMS a:", telefono);
    console.log("🔗 Link WA:", waLink);

    // 3️⃣ INVIO SMS (NON PIÙ WHATSAPP DIRETTO)
    await client.messages.create({
      from: process.env.TWILIO_SMS_NUMBER!, // 🔥 IMPORTANTE
      to: telefono,
      body:
        "👋 PHONESIA\n\n" +
        "Grazie per la registrazione.\n\n" +
        "Clicca qui per attivare WhatsApp:\n" +
        waLink,
    });

    // 4️⃣ LOG DB
    await supabase
      .from("phonesia_clienti")
      .update({
        welcome_sent_at: new Date().toISOString(),
        welcome_channel: "sms",
        welcome_status: "sent",
      })
      .eq("id", cliente_id);

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