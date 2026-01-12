import { NextResponse } from "next/server";
import twilio from "twilio";
import { supabase } from "@/lib/supabaseClient";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { cliente_id, telefono } = body;

    if (!cliente_id || !telefono) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    const bigliettoLink = "http://localhost:3000/phonesia/biglietto";

    const message = `Ciao 👋
grazie per essere passato da PHONESIA.

Siamo un negozio su strada:
ci trovi qui oggi, domani e nel tempo.

Qui trovi il tuo biglietto PHONESIA,
con tutti i nostri riferimenti:

👉 ${bigliettoLink}

Puoi contattarci telefonicamente o su WhatsApp
quando hai bisogno: risponde sempre una persona reale.

A presto,
PHONESIA`;

    // INVIO WHATSAPP
    await client.messages.create({
      from: "whatsapp:+14155238886",
      to: `whatsapp:${telefono}`,
      body: message,
    });

    // SEGNA COME INVIATO
    await supabase
      .from("phonesia_consensi")
      .update({ welcome_message_pending: false })
      .eq("cliente_id", cliente_id)
      .eq("welcome_message_type", "welcome");

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Errore invio welcome:", err);
    return NextResponse.json(
      { error: "Errore invio messaggio" },
      { status: 500 }
    );
  }
}
