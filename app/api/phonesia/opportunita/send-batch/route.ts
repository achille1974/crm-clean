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
  cliente_id: number | null;
  negozio_id: number | null;
  data_stipula: string | null;
  created_at: string | null;
};

type SendResultRow = {
  clienteId: number;
  nome: string;
  status: "sent" | "blocked" | "error" | "not_found";
  reason: string;
};

type MarketingRow = {
  cliente_id: number | null;
};

type AlreadySentRow = {
  cliente_id: number | null;
  opportunita_code: string | null;
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

function serviceHistoryLabel(service: ServiceFamily): string {
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

function buildOfferText(service: ServiceFamily): string {
  if (service === "FISSO") return "fibra";
  if (service === "MOBILE") return "mobile";
  if (service === "ENERGIA") return "energia";
  return serviceLabel(service);
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
    responseText: string;
    negozioContatto: string;
    batchId: string;
    messageMode: "standard" | "custom";
    standardService: ServiceFamily | null;
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
  },
) {
  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "whatsapp",
      messaggio_utente: `[dashboard] invio opportunità batch (${params.messageMode})`,
      intent: "dashboard_opportunita_send_batch",
      tool_usato: "api_phonesia_opportunita_send_batch",
      risposta_agente: params.responseText,
      stato: "completato",
      handoff_richiesto: false,
      metadata: {
        batch_id: params.batchId,
        negozio_contatto: params.negozioContatto,
        message_mode: params.messageMode,
        standard_service: params.standardService,
        attachment_public_url: params.attachmentPublicUrl,
        attachment_file_name: params.attachmentFileName,
      },
    });
  } catch (error) {
    console.error("Errore log opportunità batch:", error);
  }
}

async function saveOpportunitySentRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId: number;
    batchId: string;
    messageMode: "standard" | "custom";
    standardService: ServiceFamily | null;
    messageText: string;
    attachmentPublicUrl: string | null;
    attachmentFileName: string | null;
    negozioContatto: string;
    whatsappUrl: string;
    mapsUrl: string;
  },
) {
  const opportunityCode =
    params.messageMode === "standard" && params.standardService
      ? params.standardService
      : `CUSTOM:${params.batchId}`;

  const opportunityLabel =
    params.messageMode === "standard" && params.standardService
      ? serviceHistoryLabel(params.standardService)
      : "Messaggio personalizzato";

  const row: OpportunityInsertRow = {
    cliente_id: params.clienteId,
    opportunita_code: opportunityCode,
    opportunita_label: opportunityLabel,
    send_mode: params.messageMode,
    batch_id: params.batchId,
    messaggio: params.messageText,
    attachment_public_url: params.attachmentPublicUrl,
    attachment_file_name: params.attachmentFileName,
    negozio_contatto: params.negozioContatto,
    metadata: {
      standard_service: params.standardService,
      whatsapp_url: params.whatsappUrl,
      maps_url: params.mapsUrl,
    },
  };

  const { error } = await supabase.from("phonesia_opportunita_inviate").upsert(row, {
    onConflict: "cliente_id,opportunita_code",
  });

  if (error) {
    throw new Error(`Errore salvataggio opportunità inviata: ${error.message}`);
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const rawClienteIds = formData.getAll("clienti");
    const clienteIds = [
      ...new Set(
        rawClienteIds
          .map((value) => Number(String(value)))
          .filter((value): value is number => Number.isFinite(value)),
      ),
    ];

    const messageModeRaw = normalizeText(String(formData.get("messageMode") ?? "")).toLowerCase();
    const messageMode = messageModeRaw === "custom" ? "custom" : "standard";

    const standardServiceRaw = normalizeText(
      String(formData.get("standardService") ?? ""),
    ).toUpperCase();
    const standardService = isValidService(standardServiceRaw) ? standardServiceRaw : null;

    const customMessage = normalizeText(String(formData.get("customMessage") ?? ""));
    const attachmentPublicUrl = normalizeText(String(formData.get("attachmentPublicUrl") ?? ""));
    normalizeText(String(formData.get("attachmentFileName") ?? ""));
    const attachmentMimeType = normalizeText(String(formData.get("attachmentMimeType") ?? ""));
    const hasAttachment = Boolean(attachmentPublicUrl && attachmentMimeType);

    if (clienteIds.length === 0) {
      return NextResponse.json(
        { ok: false, error: "nessun_cliente_selezionato" },
        { status: 400 },
      );
    }

    if (messageMode === "standard" && !standardService) {
      return NextResponse.json(
        { ok: false, error: "servizio_standard_non_valido" },
        { status: 400 },
      );
    }

    if (messageMode === "custom" && !customMessage) {
      return NextResponse.json(
        { ok: false, error: "messaggio_personalizzato_vuoto" },
        { status: 400 },
      );
    }

    if (messageMode === "custom") {
      return NextResponse.json(
        {
          ok: false,
          error: "custom_batch_non_supportato",
          message:
            "L'invio batch personalizzato non è ancora supportato con Meta Cloud API senza template dedicato.",
        },
        { status: 409 },
      );
    }

    if (hasAttachment) {
      return NextResponse.json(
        {
          ok: false,
          error: "attachment_batch_non_supportato",
          message:
            "L'invio batch con allegati non è ancora supportato con il template WhatsApp attuale.",
        },
        { status: 409 },
      );
    }

    const supabase = getSupabaseAdmin();
    const batchId = crypto.randomUUID();

    const [
      { data: clientiData, error: clientiError },
      { data: marketingRows, error: marketingError },
      { data: contrattiData, error: contrattiError },
      { data: alreadySentRows, error: alreadySentError },
    ] = await Promise.all([
      supabase
        .from("phonesia_clienti")
        .select(
          "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active",
        )
        .in("id", clienteIds),
      supabase
        .from("phonesia_consensi")
        .select("cliente_id")
        .eq("tipo_evento", "marketing_accepted")
        .in("cliente_id", clienteIds),
      supabase
        .from("phonesia_contratti")
        .select("cliente_id, negozio_id, data_stipula, created_at")
        .in("cliente_id", clienteIds)
        .order("data_stipula", { ascending: false })
        .order("created_at", { ascending: false }),
      standardService
        ? supabase
            .from("phonesia_opportunita_inviate")
            .select("cliente_id, opportunita_code")
            .eq("opportunita_code", standardService)
            .in("cliente_id", clienteIds)
        : Promise.resolve({ data: [], error: null } as { data: AlreadySentRow[]; error: null }),
    ]);

    if (clientiError) {
      throw new Error(`Errore lettura clienti: ${clientiError.message}`);
    }

    if (marketingError) {
      throw new Error(`Errore lettura consensi marketing: ${marketingError.message}`);
    }

    if (contrattiError) {
      throw new Error(`Errore lettura contratti: ${contrattiError.message}`);
    }

    if (alreadySentError) {
      throw new Error(`Errore lettura opportunità già inviate: ${alreadySentError.message}`);
    }

    const clienti = (clientiData ?? []) as ClienteRow[];
    const contratti = (contrattiData ?? []) as ContrattoRow[];
    const marketingData = (marketingRows ?? []) as MarketingRow[];
    const alreadySentData = (alreadySentRows ?? []) as AlreadySentRow[];

    const clientiMap = new Map<number, ClienteRow>();
    for (const cliente of clienti) {
      clientiMap.set(cliente.id, cliente);
    }

    const marketingIds = new Set<number>(
      marketingData
        .map((row) => Number(row.cliente_id))
        .filter((value): value is number => Number.isFinite(value)),
    );

    const contrattiByCliente = new Map<number, ContrattoRow[]>();
    for (const row of contratti) {
      const key = Number(row.cliente_id);
      if (!Number.isFinite(key)) continue;
      const list = contrattiByCliente.get(key) ?? [];
      list.push(row);
      contrattiByCliente.set(key, list);
    }

    const alreadySentIds = new Set<number>(
      alreadySentData
        .map((row) => Number(row.cliente_id))
        .filter((value): value is number => Number.isFinite(value)),
    );

    const results: SendResultRow[] = [];

    for (const clienteId of clienteIds) {
      const cliente = clientiMap.get(clienteId);

      if (!cliente) {
        results.push({
          clienteId,
          nome: `Cliente ${clienteId}`,
          status: "not_found",
          reason: "Cliente non trovato.",
        });
        continue;
      }

      const nomeCompleto =
        [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() || `Cliente ${cliente.id}`;

      if (!marketingIds.has(cliente.id)) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Consenso marketing mancante.",
        });
        continue;
      }

      if (!cliente.whatsapp_active) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "WhatsApp non attivo.",
        });
        continue;
      }

      if (!cliente.telefono) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Telefono mancante o non valido.",
        });
        continue;
      }

      if (standardService && alreadySentIds.has(cliente.id)) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Opportunità già inviata in precedenza.",
        });
        continue;
      }

      try {
        const contrattiCliente = contrattiByCliente.get(cliente.id) ?? [];
        const negozioContrattoId =
          contrattiCliente.find((row) => row.negozio_id != null)?.negozio_id ?? null;

        const contactStoreId = negozioContrattoId ?? cliente.negozio_id ?? 1;
        const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];

        const metaRecipient = toMetaRecipient(cliente.telefono);

        if (!metaRecipient) {
          results.push({
            clienteId: cliente.id,
            nome: nomeCompleto,
            status: "blocked",
            reason: "Numero non valido per WhatsApp.",
          });
          continue;
        }

        const offerText = buildOfferText(standardService!);
        const whatsappUrl = buildWhatsappUrl(contactStore.whatsappBase);

        await sendWhatsAppTemplate({
          to: metaRecipient,
          templateName: WHATSAPP_TEMPLATE_OPPORTUNITA_NAME,
          languageCode: WHATSAPP_TEMPLATE_OPPORTUNITA_LANGUAGE,
          bodyValues: [nomeCompleto, offerText, whatsappUrl, contactStore.mapsUrl],
        });

        const text =
          `Ciao ${nomeCompleto}, abbiamo un'offerta dedicata per te su ${offerText}.\n\n` +
          `Contattaci qui: ${whatsappUrl}\n` +
          `Oppure vieni in negozio: ${contactStore.mapsUrl}\n\n` +
          "— PHONESIA";

        await saveOpportunitySentRow(supabase, {
          clienteId: cliente.id,
          batchId,
          messageMode,
          standardService,
          messageText: text,
          attachmentPublicUrl: null,
          attachmentFileName: null,
          negozioContatto: contactStore.label,
          whatsappUrl,
          mapsUrl: contactStore.mapsUrl,
        });

        await logOpportunitySend(supabase, {
          clienteId: cliente.id,
          responseText: text,
          negozioContatto: contactStore.label,
          batchId,
          messageMode,
          standardService,
          attachmentPublicUrl: null,
          attachmentFileName: null,
        });

        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "sent",
          reason: "Messaggio inviato correttamente.",
        });
      } catch (error) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "error",
          reason: error instanceof Error ? error.message : "Errore imprevisto.",
        });
      }
    }

    const sentCount = results.filter((row) => row.status === "sent").length;
    const blockedCount = results.filter((row) => row.status === "blocked").length;
    const errorCount = results.filter(
      (row) => row.status === "error" || row.status === "not_found",
    ).length;

    return NextResponse.json({
      ok: true,
      batchId,
      sentCount,
      blockedCount,
      errorCount,
      results,
    });
  } catch (error) {
    console.error("phonesia opportunita send-batch error:", error);

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
