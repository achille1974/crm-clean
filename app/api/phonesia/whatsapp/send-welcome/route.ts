export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

const WHATSAPP_WELCOME_TEMPLATE_NAME =
  process.env.WHATSAPP_WELCOME_TEMPLATE_NAME || "phonesia_benvenuto_feedback_v1";

const WHATSAPP_WELCOME_TEMPLATE_LANGUAGE =
  process.env.WHATSAPP_WELCOME_TEMPLATE_LANGUAGE || "it";

const WELCOME_HEADER_IMAGE_URL =
  "https://crm-clean.vercel.app/phonesia/welcome-header.jpg";

const STORE_CONTACTS: Record<number, { label: string; mapsUrl: string }> = {
  1: {
    label: "PHONESIA Floridia",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
  2: {
    label: "PHONESIA Augusta",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta",
  },
  3: {
    label: "PHONESIA Siracusa",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa",
  },
  4: {
    label: "PHONESIA Avola",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola",
  },
  5: {
    label: "PHONESIA Floridia",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
};

type ClienteRow = {
  id: number;
  telefono: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
  whatsapp_activated_at: string | null;
  welcome_sent_at: string | null;
};

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

function toMetaRecipient(rawPhone: string) {
  const cleaned = rawPhone.trim().replace(/[^\d+]/g, "");
  const numeric = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  return /^\d+$/.test(numeric) ? numeric : null;
}

async function sendTemplate(params: {
  to: string;
  mapsUrl: string;
  clienteId: number;
}) {
  const feedbackUrl = `https://crm-clean.vercel.app/phonesia/feedback?cliente_id=${params.clienteId}`;

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
        type: "template",
        template: {
          name: WHATSAPP_WELCOME_TEMPLATE_NAME,
          language: {
            code: WHATSAPP_WELCOME_TEMPLATE_LANGUAGE,
          },
          components: [
            {
              type: "header",
              parameters: [
                {
                  type: "image",
                  image: {
                    link: WELCOME_HEADER_IMAGE_URL,
                  },
                },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "0",
              parameters: [
                {
                  type: "text",
                  text: params.mapsUrl,
                },
              ],
            },
            {
              type: "button",
              sub_type: "url",
              index: "1",
              parameters: [
                {
                  type: "text",
                  text: String(params.clienteId),
                },
              ],
            },
          ],
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }
}

export async function POST(req: Request) {
  try {
    const { cliente_id } = await req.json();

    const supabase = getSupabaseAdmin();

    const { data: cliente } = await supabase
      .from("phonesia_clienti")
      .select("*")
      .eq("id", cliente_id)
      .single();

    if (!cliente || !cliente.telefono) {
      return NextResponse.json({ error: "cliente non valido" }, { status: 400 });
    }

    if (cliente.welcome_sent_at) {
      return NextResponse.json({ ok: true });
    }

    const to = toMetaRecipient(cliente.telefono);

    const store = STORE_CONTACTS[cliente.negozio_id || 1];

    await sendTemplate({
      to: to!,
      mapsUrl: store.mapsUrl,
      clienteId: cliente.id,
    });

    await supabase
      .from("phonesia_clienti")
      .update({
        whatsapp_active: true,
        welcome_sent_at: new Date().toISOString(),
      })
      .eq("id", cliente.id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("ERROR SEND WELCOME:", e);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }
}
