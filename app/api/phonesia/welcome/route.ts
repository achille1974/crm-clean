export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

/* =========================================================
   🔵 SKEBBY SEND (VERSIONE STABILE)
========================================================= */
async function sendWithSkebby(telefono: string, message: string) {
  const username = process.env.SKEBBY_USERNAME;
  const password = process.env.SKEBBY_PASSWORD;
  const sender = process.env.SKEBBY_SENDER;

  if (!username || !password || !sender) {
    throw new Error("Skebby ENV mancanti");
  }

  // Normalizza numero (Skebby non vuole +)
  const telefonoClean = telefono.replace("+", "");

  console.log("Numero normalizzato:", telefonoClean);

  /* =========================
     LOGIN
  ========================== */
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

  const loginText = await loginRes.text();

  if (!loginRes.ok) {
    console.error("Skebby login error:", loginText);
    throw new Error("Skebby login failed");
  }

  console.log("Skebby login response:", loginText);

  // Skebby restituisce: user_key;session_key
  const [user_key, session_key] = loginText.split(";");

  if (!user_key || !session_key) {
    throw new Error("Skebby login parsing failed");
  }

  /* =========================
     SEND SMS
  ========================== */
  const smsRes = await fetch(
    "https://api.skebby.it/API/v1.0/REST/sms",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "user_key": user_key,
        "session_key": session_key,
      },
      body: JSON.stringify({
        message_type: "GP",
        message,
        recipient: [telefonoClean],
        sender,
      }),
    }
  );

  const smsText = await smsRes.text();

  if (!smsRes.ok) {
    console.error("Skebby send error:", smsText);
    throw new Error("Skebby send failed");
  }

  console.log("Skebby send response:", smsText);

  return "skebby";
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

    /* =========================
       CHECK CLIENTE
    ========================== */
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

    /* =========================
       LINK WHATSAPP
    ========================== */
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

    console.log("Invio SMS con Skebby...");

    /* =========================
       INVIO SMS
    ========================== */
    const providerUsed = await sendWithSkebby(telefono, message);

    /* =========================
       UPDATE DB
    ========================== */
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