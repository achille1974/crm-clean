// ⚠️ FONDAMENTALE: forziamo il runtime Node.js
// (Twilio NON funziona in Edge Runtime)
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
    // ===============================
    // LETTURA BODY
    // ===============================
    const body = await req.json();
    console.log("📦 BODY:", body);

    const { cliente_id, telefono } = body;

    if (!cliente_id || !telefono) {
      console.log("❌ Parametri mancanti");
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    // ===============================
    // 1️⃣ VERIFICA: WELCOME GIÀ INVIATO?
    // ===============================
    const { data: cliente, error: errCliente } = await supabase
      .from("phonesia_clienti")
      .select("welcome_sent_at")
      .eq("id", cliente_id)
      .single();

    if (errCliente) {
      console.error("❌ Errore lettura cliente:", errCliente);
      return NextResponse.json({ ok: true });
    }

    if (cliente?.welcome_sent_at) {
      console.log("⛔ Welcome già inviato, stop");
      return NextResponse.json({ ok: true });
    }

    // ===============================
    // 2️⃣ INVIO WHATSAPP (TWILIO) ✅
    // ===============================
    console.log("📨 Invio WhatsApp a:", telefono);

    await client.messages.create({
      from: "whatsapp:+18303568731", // NUMERO WHATSAPP TWILIO APPROVATO
      to: `whatsapp:${telefono}`,
      contentSid: process.env.TWILIO_WHATSAPP_TEMPLATE_SID!,
      contentVariables: {}, // ⚠️ OBBLIGATORIO PER I TEMPLATE WHATSAPP
    });

    // ===============================
    // 3️⃣ LOG INVIO (UNA SOLA VOLTA)
    // ===============================
    await supabase
      .from("phonesia_clienti")
      .update({
        welcome_sent_at: new Date().toISOString(),
        welcome_channel: "whatsapp",
        welcome_status: "sent",
      })
      .eq("id", cliente_id);

    console.log("✅ Welcome inviato e loggato");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("🔥 ERRORE INVIO WELCOME:", err);

    return NextResponse.json(
      { error: "Errore invio messaggio" },
      { status: 500 }
    );
  }
}
