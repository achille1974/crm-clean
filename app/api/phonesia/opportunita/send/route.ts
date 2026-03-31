import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERVICE_COLUMNS = [
  "MOBILE",
  "FISSO",
  "ENERGIA",
  "TV",
  "SMARTPHONE",
  "ACCESSORI",
  "SICUREZZA",
  "FOTOVOLTAICO",
] as const;

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  telegram_active: boolean | null;
  telegram_chat_id: string | null;
};

type ContrattoRow = {
  negozio_id: number | null;
  data_stipula: string | null;
  created_at: string | null;
};

const STORE_CONTACTS: Record<
  number,
  {
    label: string;
    whatsappBase: string;
    mapsUrl: string;
  }
> = {
  1: {
    label: "PHONESIA Floridia",
    whatsappBase: "https://wa.me/393349474319",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
  2: {
    label: "PHONESIA Augusta",
    whatsappBase: "https://wa.me/393202927455",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta",
  },
  3: {
    label: "PHONESIA Siracusa",
    whatsappBase: "https://wa.me/393313137775",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa",
  },
  4: {
    label: "PHONESIA Avola",
    whatsappBase: "https://wa.me/393917510115",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola",
  },
  5: {
    label: "PHONESIA Floridia",
    whatsappBase: "https://wa.me/393349474319",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

function isValidService(value: string): value is ServiceFamily {
  return SERVICE_COLUMNS.includes(value as ServiceFamily);
}

function serviceLabel(service: ServiceFamily): string {
  switch (service) {
    case "FISSO":
      return "fibra";
    case "MOBILE":
      return "mobile";
    case "ENERGIA":
      return "energia";
    case "TV":
      return "TV";
    case "SMARTPHONE":
      return "smartphone";
    case "ACCESSORI":
      return "accessori";
    case "SICUREZZA":
      return "sicurezza";
    case "FOTOVOLTAICO":
      return "fotovoltaico";
  }

  return "servizio";
}

function buildOfferText(services: ServiceFamily[]): string {
  if (services.length === 1) {
    const service = services[0];

    if (service === "FISSO") {
      return "Abbiamo un’offerta fibra esclusiva per te.";
    }

    if (service === "MOBILE") {
      return "Abbiamo un’offerta mobile dedicata per te.";
    }

    if (service === "ENERGIA") {
      return "Abbiamo un’offerta energia dedicata per te.";
    }

    return `Abbiamo un’offerta esclusiva per te su ${serviceLabel(service)}.`;
  }

  const labels = services.map((service) => serviceLabel(service));
  return `Abbiamo delle offerte dedicate per te su ${labels.join(", ")}.`;
}

function buildWhatsappUrl(baseUrl: string, services: ServiceFamily[]) {
  const labels = services.map((service) => serviceLabel(service)).join(", ");
  const text = encodeURIComponent(
    `Ciao, vorrei informazioni sull'offerta ricevuta su Telegram (${labels}).`,
  );
  return `${baseUrl}?text=${text}`;
}

async function sendTelegramMessage(params: {
  chatId: string;
  text: string;
  whatsappUrl: string;
  mapsUrl: string;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: params.text,
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [
          [
            { text: "Contattaci", url: params.whatsappUrl },
            { text: "Vieni in negozio", url: params.mapsUrl },
          ],
        ],
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${body}`);
  }
}

async function logOpportunitySend(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    services: ServiceFamily[];
    responseText: string;
    negozioContatto: string;
  },
) {
  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "telegram",
      messaggio_utente: `[dashboard] invio opportunità: ${params.services.join(", ")}`,
      intent: "dashboard_opportunita_send",
      tool_usato: "api_phonesia_opportunita_send",
      risposta_agente: params.responseText,
      stato: "completato",
      handoff_richiesto: false,
      metadata: {
        servizi: params.services,
        negozio_contatto: params.negozioContatto,
      },
    });
  } catch (error) {
    console.error("Errore log opportunità:", error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clienteId?: number;
      services?: string[];
    };

    const clienteId = Number(body.clienteId);
    const rawServices = Array.isArray(body.services) ? body.services : [];
    const services = rawServices
      .map((value) => normalizeText(value).toUpperCase())
      .filter(isValidService);

    if (!Number.isFinite(clienteId)) {
      return NextResponse.json(
        { ok: false, error: "cliente_non_valido" },
        { status: 400 },
      );
    }

    if (services.length === 0) {
      return NextResponse.json(
        { ok: false, error: "nessun_servizio_selezionato" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const [
      { data: clienteData, error: clienteError },
      { data: marketingConsentData, error: marketingConsentError },
      { data: contrattiData, error: contrattiError },
    ] = await Promise.all([
      supabase
        .from("phonesia_clienti")
        .select(
          "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, telegram_active, telegram_chat_id",
        )
        .eq("id", clienteId)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("phonesia_consensi")
        .select("id")
        .eq("cliente_id", clienteId)
        .eq("tipo_evento", "marketing_accepted")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("phonesia_contratti")
        .select("negozio_id, data_stipula, created_at")
        .eq("cliente_id", clienteId)
        .order("data_stipula", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);

    if (clienteError) {
      throw new Error(`Errore lettura cliente: ${clienteError.message}`);
    }

    if (marketingConsentError) {
      throw new Error(`Errore lettura consenso marketing: ${marketingConsentError.message}`);
    }

    if (contrattiError) {
      throw new Error(`Errore lettura contratti: ${contrattiError.message}`);
    }

    const cliente = clienteData as ClienteRow | null;
    const contratti = (contrattiData ?? []) as ContrattoRow[];

    if (!cliente) {
      return NextResponse.json(
        { ok: false, error: "cliente_non_trovato" },
        { status: 404 },
      );
    }

    if (!marketingConsentData) {
      return NextResponse.json(
        {
          ok: false,
          error: "consenso_marketing_mancante",
          message: "Il cliente non ha rilasciato il consenso marketing.",
        },
        { status: 409 },
      );
    }

    if (!cliente.telegram_active || !cliente.telegram_chat_id) {
      return NextResponse.json(
        {
          ok: false,
          error: "telegram_non_attivo",
          message: "Il cliente non ha Telegram attivo.",
        },
        { status: 409 },
      );
    }

    const negozioContrattoId =
      contratti.find((row) => row.negozio_id != null)?.negozio_id ?? null;

    const contactStoreId = negozioContrattoId ?? cliente.negozio_id ?? 1;
    const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];

    const offerText = buildOfferText(services);
    const nomeCliente = [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim();

    const text = [
      nomeCliente ? `Ciao ${nomeCliente},` : "Ciao,",
      "",
      offerText,
      "Contattaci oppure vieni in negozio per scoprire tutti i dettagli.",
    ].join("\n");

    const whatsappUrl = buildWhatsappUrl(contactStore.whatsappBase, services);

    await sendTelegramMessage({
      chatId: cliente.telegram_chat_id,
      text,
      whatsappUrl,
      mapsUrl: contactStore.mapsUrl,
    });

    await logOpportunitySend(supabase, {
      clienteId,
      services,
      responseText: text,
      negozioContatto: contactStore.label,
    });

    return NextResponse.json({
      ok: true,
      message: "Messaggio inviato correttamente.",
      negozio_contatto: contactStore.label,
      services,
    });
  } catch (error) {
    console.error("phonesia opportunita send error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
