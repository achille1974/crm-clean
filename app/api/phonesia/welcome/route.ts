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
  console.log("🚀 WELCOME API CHIAMATA");

  try {
    const body = await req.json();
    console.log("📦 BODY:", body);

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

    // 2️⃣ INVIO WHATSAPP (FORZANDO FROM)
    console.log("📨 Invio WhatsApp a:", telefono);

    await client.messages.create({
      from: "whatsapp:+18303568731", // 🔥 QUESTO ERA IL BLOCCO
      to: `whatsapp:${telefono}`,
      body:
        "👋 Benvenuto in PHONESIA!\n\n" +
        "La tua registrazione è avvenuta con successo.\n" +
        "Tra poco riceverai il tuo biglietto digitale.\n\n" +
        "Rispondi *OK* per continuare 💬",
    });

    // 3️⃣ LOG DB
    await supabase
      .from("phonesia_clienti")
      .update({
        welcome_sent_at: new Date().toISOString(),
        welcome_channel: "whatsapp",
        welcome_status: "sent",
      })
      .eq("id", cliente_id);

    console.log("✅ Welcome inviato correttamente");
    return NextResponse.json({ ok: true });

  } catch (err) {
    console.error("🔥 ERRORE INVIO WELCOME:", err);
    return NextResponse.json(
      { error: "Errore invio messaggio" },
      { status: 500 }
    );
  }
}
