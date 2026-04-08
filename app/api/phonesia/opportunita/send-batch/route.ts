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

  return "servizio";
}

function buildStandardText(service: ServiceFamily): string {
  if (service === "FISSO") {
    return "Abbiamo un’offerta fibra esclusiva per te. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.";
  }

  if (service === "MOBILE") {
    return "Abbiamo un’offerta mobile dedicata per te. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.";
  }

  if (service === "ENERGIA") {
    return "Abbiamo un’offerta energia dedicata per te. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.";
  }

  return `Abbiamo un’offerta esclusiva per te su ${serviceLabel(service)}. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.`;
}

function buildWhatsappUrl(baseUrl: string, contextLabel: string) {
  const text = encodeURIComponent(
    `Ciao, vorrei informazioni sull'opportunità ricevuta su Telegram (${contextLabel}).`,
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

async function sendTelegramMedia(params: {
  chatId: string;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
}) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    throw new Error("Missing TELEGRAM_BOT_TOKEN");
  }

  const isImage = params.mimeType.startsWith("image/");
  const endpoint = isImage ? "sendPhoto" : "sendDocument";
  const fieldName = isImage ? "photo" : "document";

  const formData = new FormData();
  formData.append("chat_id", params.chatId);

  const safeBytes = new Uint8Array(params.bytes);
  const blob = new Blob([safeBytes], {
    type: params.mimeType || "application/octet-stream",
  });

  formData.append(fieldName, blob, params.fileName);

  const response = await fetch(`https://api.telegram.org/bot${botToken}/${endpoint}`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram ${endpoint} failed: ${response.status} ${body}`);
  }
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
    fileName: string | null;
  },
) {
  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "telegram",
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
        file_name: params.fileName,
      },
    });
  } catch (error) {
    console.error("Errore log opportunità batch:", error);
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
          .filter((value) => Number.isFinite(value)),
      ),
    ];

    const messageModeRaw = normalizeText(String(formData.get("messageMode") ?? "")).toLowerCase();
    const messageMode = messageModeRaw === "custom" ? "custom" : "standard";

    const standardServiceRaw = normalizeText(
      String(formData.get("standardService") ?? ""),
    ).toUpperCase();
    const standardService = isValidService(standardServiceRaw)
      ? standardServiceRaw
      : null;

    const customMessage = normalizeText(String(formData.get("customMessage") ?? ""));
    const locandina = formData.get("locandina");

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

    const hasFile = locandina instanceof File && locandina.size > 0;
    const fileBytes = hasFile ? new Uint8Array(await locandina.arrayBuffer()) : null;
    const fileName = hasFile ? locandina.name : null;
    const mimeType =
      hasFile && locandina.type
        ? locandina.type
        : hasFile
          ? "application/octet-stream"
          : null;

    const supabase = getSupabaseAdmin();
    const batchId = crypto.randomUUID();

    const [
      { data: clientiData, error: clientiError },
      { data: marketingRows, error: marketingError },
      { data: contrattiData, error: contrattiError },
    ] = await Promise.all([
      supabase
        .from("phonesia_clienti")
        .select(
          "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, telegram_active, telegram_chat_id",
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

    const clienti = (clientiData ?? []) as ClienteRow[];
    const contratti = (contrattiData ?? []) as ContrattoRow[];

    const clientiMap = new Map<number, ClienteRow>();
    for (const cliente of clienti) {
      clientiMap.set(cliente.id, cliente);
    }

    const marketingIds = new Set<number>(
      (marketingRows ?? [])
        .map((row: any) => Number(row.cliente_id))
        .filter((value) => Number.isFinite(value)),
    );

    const contrattiByCliente = new Map<number, ContrattoRow[]>();
    for (const row of contratti) {
      const key = Number(row.cliente_id);
      if (!Number.isFinite(key)) continue;
      const list = contrattiByCliente.get(key) ?? [];
      list.push(row);
      contrattiByCliente.set(key, list);
    }

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

      if (!cliente.telegram_active || !cliente.telegram_chat_id) {
        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "blocked",
          reason: "Telegram non attivo.",
        });
        continue;
      }

      try {
        const contrattiCliente = contrattiByCliente.get(cliente.id) ?? [];
        const negozioContrattoId =
          contrattiCliente.find((row) => row.negozio_id != null)?.negozio_id ?? null;

        const contactStoreId = negozioContrattoId ?? cliente.negozio_id ?? 1;
        const contactStore = STORE_CONTACTS[contactStoreId] ?? STORE_CONTACTS[1];

        const bodyText =
          messageMode === "standard" && standardService
            ? buildStandardText(standardService)
            : customMessage;

        const text = [
          nomeCompleto ? `Ciao ${nomeCompleto},` : "Ciao,",
          "",
          bodyText,
        ].join("\n");

        const contextLabel =
          messageMode === "standard" && standardService
            ? serviceLabel(standardService)
            : "opportunità ricevuta";
        const whatsappUrl = buildWhatsappUrl(contactStore.whatsappBase, contextLabel);

        if (hasFile && fileBytes && fileName && mimeType) {
          await sendTelegramMedia({
            chatId: cliente.telegram_chat_id,
            fileName,
            mimeType,
            bytes: fileBytes,
          });
        }

        await sendTelegramMessage({
          chatId: cliente.telegram_chat_id,
          text,
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
          fileName,
        });

        results.push({
          clienteId: cliente.id,
          nome: nomeCompleto,
          status: "sent",
          reason: hasFile
            ? "Messaggio e locandina inviati correttamente."
            : "Messaggio inviato correttamente.",
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
