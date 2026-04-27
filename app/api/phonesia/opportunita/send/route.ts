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

const GRAPH_API_VERSION = process.env.WHATSAPP_GRAPH_API_VERSION || "v23.0";
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;
const WHATSAPP_TEMPLATE_OPPORTUNITA_NAME =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_NAME || "phonesia_opportunita_marketing";
const WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE =
  process.env.WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE || "it";

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
};

type ContrattoRow = {
  negozio_id: number | null;
  data_stipula: string | null;
  created_at: string | null;
};

type OpportunityInsertRow = {
  cliente_id: number;
  opportunita_code: string;
  opportunita_label: string;
  send_mode: string;
  batch_id: string | null;
  messaggio: string | null;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  negozio_contatto: string | null;
  metadata: Record<string, unknown>;
};

type OpportunitySentRow = {
  id: number | string | null;
  opportunita_code: string | null;
  opportunita_label: string | null;
  send_mode: string | null;
  batch_id: string | null;
  messaggio: string | null;
  attachment_public_url: string | null;
  attachment_file_name: string | null;
  negozio_contatto: string | null;
  inviato_at: string | null;
};

type AlreadySentRow = {
  opportunita_code: string | null;
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
    whatsappBase: "https://wa.me/393917000017",
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
    whatsappBase: "https://wa.me/393473214561",
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
      return "Fibra";
    case "MOBILE":
      return "Mobile";
    case "ENERGIA":
      return "Energia";
    case "TV":
      return "TV";
    case "SMARTPHONE":
      return "Smartphone";
    case "ACCESSORI":
      return "Accessori";
    case "SICUREZZA":
      return "Sicurezza";
    case "FOTOVOLTAICO":
      return "Fotovoltaico";
  }
}

function serviceMessageLabel(service: ServiceFamily): string {
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
}

function buildOfferText(services: ServiceFamily[]): string {
  if (services.length === 1) {
    const service = services[0];

    if (service === "FISSO") return "fibra";
    if (service === "MOBILE") return "mobile";
    if (service === "ENERGIA") return "energia";

    return serviceMessageLabel(service);
  }

  const labels = services.map((service) => serviceMessageLabel(service));
  return labels.join(", ");
}

function buildWhatsappUrl(baseUrl: string) {
  return baseUrl;
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

function toMetaRecipient(rawPhone: string) {
  const candidates = buildPhoneCandidates(rawPhone);
  const numeric = candidates.find((value) => /^\d+$/.test(value.replace(/^\+/, "")));

  return numeric ? numeric.replace(/^\+/, "") : null;
}

async function sendWhatsAppTemplate(params: {
  to: string;
  templateName: string;
  languageCode: string;
  bodyValues: string[];
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
        type: "template",
        template: {
          name: params.templateName,
          language: {
            code: params.languageCode,
          },
          components: [
            {
              type: "body",
              parameters: params.bodyValues.map((value) => ({
                type: "text",
                text: value,
              })),
            },
          ],
        },
      }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta template send failed: ${response.status} ${body}`);
  }

  return response.json();
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
      canale: "whatsapp",
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

async function saveSentOpportunities(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    services: ServiceFamily[];
    text: string;
    negozioContatto: string;
    whatsappUrl: string;
    mapsUrl: string;
  },
) {
  const rows: OpportunityInsertRow[] = params.services.map((service) => ({
    cliente_id: params.clienteId,
    opportunita_code: service,
    opportunita_label: serviceLabel(service),
    send_mode: "standard",
    batch_id: null,
    messaggio: params.text,
    attachment_public_url: null,
    attachment_file_name: null,
    negozio_contatto: params.negozioContatto,
    metadata: {
      services: params.services,
      whatsapp_url: params.whatsappUrl,
      maps_url: params.mapsUrl,
    },
  }));

  const { data, error } = await supabase
    .from("phonesia_opportunita_inviate")
    .upsert(rows, {
      onConflict: "cliente_id,opportunita_code",
    })
    .select(
      "id, opportunita_code, opportunita_label, send_mode, batch_id, messaggio, attachment_public_url, attachment_file_name, negozio_contatto, inviato_at",
    );

  if (error) {
    throw new Error(`Errore salvataggio opportunità inviate: ${error.message}`);
  }

  return ((data ?? []) as OpportunitySentRow[]).map((row) => ({
    id: Number(row.id),
    opportunityCode: normalizeText(row.opportunita_code),
    opportunityLabel: normalizeText(row.opportunita_label),
    sendMode: normalizeText(row.send_mode),
    batchId: normalizeText(row.batch_id),
    message: normalizeText(row.messaggio),
    attachmentPublicUrl: normalizeText(row.attachment_public_url),
    attachmentFileName: normalizeText(row.attachment_file_name),
    negozioContatto: normalizeText(row.negozio_contatto),
    sentAt: normalizeText(row.inviato_at),
  }));
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      clienteId?: number;
      services?: string[];
    };

    const clienteId = Number(body.clienteId);
    const rawServices = Array.isArray(body.services) ? body.services : [];
    const services = [
      ...new Set(
        rawServices
          .map((value) => normalizeText(value).toUpperCase())
          .filter(isValidService),
      ),
    ];

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
      { data: alreadySentData, error: alreadySentError },
    ] = await Promise.all([
      supabase
        .from("phonesia_clienti")
        .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active")
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
      supabase
        .from("phonesia_opportunita_inviate")
        .select("opportunita_code")
        .eq("cliente_id", clienteId)
        .in("opportunita_code", services),
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

    if (alreadySentError) {
      throw new Error(`Errore lettura opportunità già inviate: ${alreadySentError.message}`);
    }

    const cliente = clienteData as ClienteRow | null;
    const contratti = (contrattiData ?? []) as ContrattoRow[];
    const alreadySentRows = (alreadySentData ?? []) as AlreadySentRow[];

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

    if (!cliente.whatsapp_active) {
      return NextResponse.json(
        {
          ok: false,
          error: "whatsapp_non_attivo",
          message: "Il cliente non ha WhatsApp attivo.",
        },
        { status: 409 },
      );
    }

    if (!cliente.telefono) {
      return NextResponse.json(
        {
          ok: false,
          error: "telefono_mancante",
          message: "Il cliente non ha un numero di telefono valido.",
        },
        { status: 409 },
      );
    }

    const alreadySentCodes = new Set<string>(
      alreadySentRows
        .map((row) => normalizeText(row.opportunita_code).toUpperCase())
        .filter(Boolean),
    );

    const servicesToSend = services.filter((service) => !alreadySentCodes.has(service));

    if (servicesToSend.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "opportunita_gia_inviata",
          message: "Le opportunità selezionate risultano già inviate a questo cliente.",
        },
        { status: 409 },
      );
    }

    const negozioContrattoId =
      contratti.find((row) => row.negozio_id != null)?.negozio_id ?? null;

    const contactStoreId = negozioContrattoId ?? cliente.negozio_id ?? 1;
    const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];

    const nomeCliente =
      normalizeText([cliente.nome, cliente.cognome].filter(Boolean).join(" ")) || "cliente";
    const offerText = buildOfferText(servicesToSend);
    const whatsappUrl = buildWhatsappUrl(contactStore.whatsappBase);

    const metaRecipient = toMetaRecipient(cliente.telefono);

    if (!metaRecipient) {
      return NextResponse.json(
        {
          ok: false,
          error: "telefono_non_valido",
          message: "Il numero di telefono del cliente non è valido per WhatsApp.",
        },
        { status: 409 },
      );
    }

    await sendWhatsAppTemplate({
      to: metaRecipient,
      templateName: WHATSAPP_TEMPLATE_OPPORTUNITA_NAME,
      languageCode: WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE,
      bodyValues: [nomeCliente, offerText, whatsappUrl, contactStore.mapsUrl],
    });

    const text =
      `Ciao ${nomeCliente}, abbiamo un'offerta dedicata per te su ${offerText}.\n\n` +
      `Contattaci qui: ${whatsappUrl}\n` +
      `Oppure vieni in negozio: ${contactStore.mapsUrl}\n\n` +
      "— PHONESIA";

    const sentOpportunities = await saveSentOpportunities(supabase, {
      clienteId,
      services: servicesToSend,
      text,
      negozioContatto: contactStore.label,
      whatsappUrl,
      mapsUrl: contactStore.mapsUrl,
    });

    await logOpportunitySend(supabase, {
      clienteId,
      services: servicesToSend,
      responseText: text,
      negozioContatto: contactStore.label,
    });

    return NextResponse.json({
      ok: true,
      message:
        servicesToSend.length === 1
          ? "Opportunità inviata correttamente."
          : "Opportunità inviate correttamente.",
      negozio_contatto: contactStore.label,
      services: servicesToSend,
      sentOpportunities,
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
