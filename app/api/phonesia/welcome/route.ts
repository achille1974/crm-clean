// ⚠️ FONDAMENTALE: Twilio funziona SOLO in Node.js
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
    // 1️⃣ BODY
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
    // 2️⃣ CHECK: già inviato?
    // ===============================
    const { data: cliente, error } = await supabase
      .from("phonesia_clienti")
      .select("welcome_sent_at")
      .eq("id", cliente_id)
      .single();

    if (error) {
      console.error("❌ Errore DB:", error);
      return NextResponse.json({ ok: true });
    }

    if (cliente?.welcome_sent_at) {
      console.log("⛔ Welcome già inviato");
      return NextResponse.json({ ok: true });
    }

    // ===============================
    // 3️⃣ INVIO WHATSAPP TEMPLATE
    // ===============================
    console.log("📨 Invio WhatsApp a:", telefono);

    await client.messages.create({
      from: "whatsapp:+18303568731", // ✅ WhatsApp Sender Twilio approvato
      to: `whatsapp:${telefono}`,
      contentSid: process.env.TWILIO_WHATSAPP_TEMPLATE_SID!, // HX35b40b8b80f57c34676f5a5962f9cc64
    });

    // ===============================
    // 4️⃣ LOG DB
    // ===============================
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
      { error: "Errore invio welcome" },
      { status: 500 }
    );
  }
}
