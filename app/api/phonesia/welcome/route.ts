export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

/* =========================================================
   🔵 SKEBBY SEND
========================================================= */
async function sendWithSkebby(telefono: string, message: string) {
  const username = process.env.SKEBBY_USERNAME;
  const password = process.env.SKEBBY_PASSWORD;
  const sender = process.env.SKEBBY_SENDER;

  if (!username || !password || !sender) {
    throw new Error("Skebby ENV mancanti");
  }

  // LOGIN
  const loginRes = await fetch(
    "https://api.skebby.it/API/v1.0/REST/login",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        username,
        password,
      }),
    }
  );

  if (!loginRes.ok) {
    const err = await loginRes.text();
    console.error("Skebby login error:", err);
    throw new Error("Skebby login failed");
  }

  const { user_key, session_key } = await loginRes.json();

  // SEND SMS
  const smsRes = await fetch(
    "https://api.skebby.it/API/v1.0/REST/sms",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        user_key,
        Session_key: session_key,
      },
      body: JSON.stringify({
        message_type: "GP",
        message,
        recipient: [telefono],
        sender,
      }),
    }
  );

  if (!smsRes.ok) {
    const err = await smsRes.text();
    console.error("Skebby send error:", err);
    throw new Error("Skebby send failed");
  }

  return "skebby";
}

/* =========================================================
   🟠 ARUBA SEND
========================================================= */
async function sendWithAruba(telefono: string, message: string) {
  const username = process.env.ARUBA_SMS_USERNAME;
  const password = process.env.ARUBA_SMS_PASSWORD;
  const sender = process.env.ARUBA_SMS_SENDER;

  if (!username || !password || !sender) {
    throw new Error("Aruba ENV mancanti");
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");

  const res = await fetch("https://sms.aruba.it/API/SendSMS", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${auth}`,
    },
    body: new URLSearchParams({
      sender,
      recipient: telefono,
      message,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Aruba send error:", err);
    throw new Error("Aruba send failed");
  }

  return "aruba";
}

/* =========================================================
   🚀 WELCOME ROUTE
========================================================= */
export async function POST(req: Request) {
  try {
    const { cliente_id, telefono } = await req.json();

    if (!cliente_id || !telefono) {
      return NextResponse.json(
        { error: "Parametri mancanti" },
        { status: 400 }
      );
    }

    // Check cliente
    const { data: cliente, error: checkError } = await supabase
      .from("phonesia_clienti")
      .select("welcome_sent_at")
      .eq("id", cliente_id)
      .single();

    if (checkError) {
      console.error("Errore check cliente:", checkError);
      return NextResponse.json(
        { error: "Errore verifica cliente" },
        { status: 500 }
      );
    }

    if (cliente?.welcome_sent_at) {
      return NextResponse.json({ ok: true, alreadySent: true });
    }

    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;

    if (!whatsappNumber) {
      return NextResponse.json(
        { error: "WhatsApp number mancante" },
        { status: 500 }
      );
    }

    const waLink = `https://wa.me/${whatsappNumber.replace("+", "")}?text=OK`;

    const message =
      "👋 Benvenuto in PHONESIA\n\n" +
      "La tua registrazione è stata completata con successo.\n\n" +
      "Clicca qui per attivare WhatsApp:\n" +
      waLink;

    let providerUsed = "";
    const provider = process.env.SMS_PROVIDER || "aruba";

    console.log("Provider selezionato:", provider);

    if (provider === "skebby") {
      try {
        providerUsed = await sendWithSkebby(telefono, message);
      } catch (err) {
        console.error("Skebby fallito, provo Aruba...");
        providerUsed = await sendWithAruba(telefono, message);
      }
    } else {
      try {
        providerUsed = await sendWithAruba(telefono, message);
      } catch (err) {
        console.error("Aruba fallito, provo Skebby...");
        providerUsed = await sendWithSkebby(telefono, message);
      }
    }

    await supabase
      .from("phonesia_clienti")
      .update({
        welcome_sent_at: new Date().toISOString(),
        welcome_channel: providerUsed,
        welcome_status: "sent",
      })
      .eq("id", cliente_id);

    return NextResponse.json({
      ok: true,
      provider: providerUsed,
    });

  } catch (err: any) {
    console.error("Errore generale welcome:", err);
    return NextResponse.json(
      { error: err.message || "Errore invio SMS" },
      { status: 500 }
    );
  }
}