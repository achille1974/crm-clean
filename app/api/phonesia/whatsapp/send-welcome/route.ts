export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabaseClient";

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://crm-clean.vercel.app";

async function sendWhatsAppText(params: {
  to: string;
  body: string;
}) {
  if (!WHATSAPP_ACCESS_TOKEN) {
    throw new Error("Missing WHATSAPP_ACCESS_TOKEN");
  }

  if (!WHATSAPP_PHONE_NUMBER_ID) {
    throw new Error("Missing WHATSAPP_PHONE_NUMBER_ID");
  }

  const response = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: params.to,
        type: "text",
        text: {
          body: params.body,
        },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Meta send message failed: ${response.status} ${errorText}`);
  }

  return response.json();
}

function buildWelcomeMessage(clienteId: number | string) {
  return (
    "Benvenuto in Phonesia!\n\n" +
    "Il tuo canale WhatsApp è attivo.\n\n" +
    "Ecco il nostro contatto ufficiale e il tuo biglietto digitale:\n" +
    `${BASE_URL}/phonesia/biglietto/${clienteId}\n\n` +
    "Salva questo numero per ricevere assistenza e aggiornamenti dedicati.\n\n" +
    "— Team Phonesia"
  );
}

function buildPhoneCandidates(rawPhone: string) {
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, "");
  const variants = new Set<string>();

  if (!cleaned) return [];

  variants.add(cleaned);

  if (cleaned.startsWith("+")) {
    variants.add(cleaned.slice(1));
  } else {
    variants.add(`+${cleaned}`);
  }

  return Array.from(variants);
}

export async function POST(req: Request) {
  try {
    const { cliente_id } = await req.json();

    if (!cliente_id) {
      return NextResponse.json({ error: "cliente_id required" }, { status: 400 });
    }

    const { data: cliente, error: clienteError } = await supabase
      .from("phonesia_clienti")
      .select("id, telefono, whatsapp_active, welcome_sent_at")
      .eq("id", cliente_id)
      .maybeSingle();

    if (clienteError) {
      console.error("Errore recupero cliente:", clienteError);
      return NextResponse.json({ error: "database error" }, { status: 500 });
    }

    if (!cliente) {
      return NextResponse.json({ error: "cliente not found" }, { status: 404 });
    }

    if (!cliente.telefono) {
      return NextResponse.json({ error: "cliente telefono mancante" }, { status: 400 });
    }

    if (cliente.welcome_sent_at) {
      return NextResponse.json({ message: "welcome already sent" });
    }

    const phoneCandidates = buildPhoneCandidates(cliente.telefono);
    const whatsappTo = phoneCandidates.find((value) => /^\d+$/.test(value.replace(/^\+/, "")));

    if (!whatsappTo) {
      return NextResponse.json({ error: "telefono cliente non valido" }, { status: 400 });
    }

    await sendWhatsAppText({
      to: whatsappTo.replace(/^\+/, ""),
      body: buildWelcomeMessage(cliente.id),
    });

    const now = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("phonesia_clienti")
      .update({
        whatsapp_active: cliente.whatsapp_active === true ? true : true,
        whatsapp_activated_at: cliente.whatsapp_active ? undefined : now,
        welcome_sent_at: now,
        welcome_status: "sent",
      })
      .eq("id", cliente.id);

    if (updateError) {
      console.error("Errore update cliente dopo welcome:", updateError);
      return NextResponse.json(
        { error: "welcome sent but update failed" },
        { status: 500 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Send welcome Meta error:", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
