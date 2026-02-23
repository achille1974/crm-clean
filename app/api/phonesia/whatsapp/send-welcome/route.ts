import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";
import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(req: Request) {
  try {
    const { cliente_id } = await req.json();

    if (!cliente_id) {
      return NextResponse.json({ error: "cliente_id required" }, { status: 400 });
    }

    // 🔹 Recuperiamo cliente
    const { data: cliente } = await supabase
      .from("phonesia_clienti")
      .select("id, telefono, welcome_sent_at")
      .eq("id", cliente_id)
      .maybeSingle();

    if (!cliente) {
      return NextResponse.json({ error: "cliente not found" }, { status: 404 });
    }

    // 🔹 Evitiamo doppio invio
    if (cliente.welcome_sent_at) {
      return NextResponse.json({ message: "welcome already sent" });
    }

    // 🔹 Invio WhatsApp welcome
    await client.messages.create({
      from: "whatsapp:+18303568731",
      to: `whatsapp:${cliente.telefono}`,
      body: `Benvenuto in Phonesia!

Ecco il nostro contatto ufficiale 👇
https://https://app.crm-supreme.it/biglietto-digitale`,
    });

    // 🔹 Aggiorniamo cliente
    await supabase
      .from("phonesia_clienti")
      .update({
        welcome_sent_at: new Date().toISOString(),
        welcome_status: "sent",
      })
      .eq("id", cliente.id);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Send welcome error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}