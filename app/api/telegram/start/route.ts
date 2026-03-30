import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for Telegram route.",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

type TelegramUser = {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  text?: string;
  from?: TelegramUser;
  chat?: TelegramChat;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
};

type ClienteRow = {
  id: number;
  nome?: string | null;
  cognome?: string | null;
  telefono?: string | null;
  email?: string | null;
  codice_fiscale?: string | null;
  negozio_id?: number | null;
  telegram_user_id?: string | null;
  telegram_chat_id?: string | null;
  telegram_active?: boolean | null;
};

type AgentResponse = {
  ok: boolean;
  reply?: string;
  used_local_agent?: boolean;
  matched_customer?: {
    id: number;
    nome: string | null;
    cognome: string | null;
    telefono: string | null;
    email: string | null;
    codice_fiscale: string | null;
    negozio_id: number | null;
  } | null;
  contract_count?: number;
  error?: string;
  detail?: string;
};

async function sendTelegramMessage(chatId: number | string, text: string) {
  if (!telegramBotToken) {
    console.error("Missing TELEGRAM_BOT_TOKEN");
    return;
  }

  const url = `https://api.telegram.org/bot${telegramBotToken}/sendMessage`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: false,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Telegram sendMessage error:", body);
  }
}

function extractStartPayload(text?: string): string | null {
  if (!text) return null;

  const trimmed = text.trim();

  if (!trimmed.startsWith("/start")) {
    return null;
  }

  const parts = trimmed.split(/\s+/);

  if (parts.length < 2) {
    return null;
  }

  return parts[1] || null;
}

function normalizeText(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeEmail(value?: string | null): string | null {
  const text = normalizeText(value);
  return text ? text.toLowerCase() : null;
}

function normalizeCf(value?: string | null): string | null {
  const text = normalizeText(value);
  return text ? text.toUpperCase() : null;
}

function normalizePhone(value?: string | null): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  let digits = text.replace(/\D/g, "");

  if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.slice(2);
  }

  if (digits.length >= 9 && digits.length <= 11) {
    return `+39${digits}`;
  }

  return text;
}

async function logConversation(params: {
  clienteId?: number | null;
  canale?: string;
  channelUserId?: string | null;
  channelChatId?: string | null;
  channelUsername?: string | null;
  messaggioUtente: string;
  intent?: string | null;
  toolUsato?: string | null;
  rispostaAgente?: string | null;
  stato?: string;
  errore?: string | null;
  handoffRichiesto?: boolean;
  metadata?: Record<string, unknown>;
}) {
  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId ?? null,
      canale: params.canale ?? "telegram",
      channel_user_id: params.channelUserId ?? null,
      channel_chat_id: params.channelChatId ?? null,
      channel_username: params.channelUsername ?? null,
      messaggio_utente: params.messaggioUtente,
      intent: params.intent ?? null,
      tool_usato: params.toolUsato ?? null,
      risposta_agente: params.rispostaAgente ?? null,
      stato: params.stato ?? "ricevuto",
      errore: params.errore ?? null,
      handoff_richiesto: params.handoffRichiesto ?? false,
      metadata: params.metadata ?? {},
    });
  } catch (error) {
    console.error("Errore log conversazione:", error);
  }
}

async function findClienteByTelegramUserId(
  telegramUserId: string,
): Promise<ClienteRow | null> {
  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select(
      "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, telegram_user_id, telegram_chat_id, telegram_active",
    )
    .eq("telegram_user_id", telegramUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ClienteRow | null) ?? null;
}

async function findClienteById(clienteId: number): Promise<ClienteRow | null> {
  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select(
      "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, telegram_user_id, telegram_chat_id, telegram_active",
    )
    .eq("id", clienteId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ClienteRow | null) ?? null;
}

async function linkClienteTelegram(params: {
  clienteId: number;
  telegramUserId: string;
  telegramChatId: string;
  telegramUsername?: string | null;
}) {
  const { error } = await supabase
    .from("phonesia_clienti")
    .update({
      telegram_user_id: params.telegramUserId,
      telegram_chat_id: params.telegramChatId,
      telegram_username: params.telegramUsername ?? null,
      telegram_active: true,
      telegram_linked_at: new Date().toISOString(),
    })
    .eq("id", params.clienteId);

  if (error) {
    throw error;
  }
}

function buildLinkedWelcomeMessage(cliente: ClienteRow) {
  const nomeCliente = [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim();
  const saluto = nomeCliente ? `Ciao ${nomeCliente}!` : "Ciao!";

  return `${saluto}

Il tuo profilo PHONESIA è attivo correttamente su Telegram.

Da questo momento puoi scriverci direttamente qui per ricevere informazioni sui tuoi servizi e sulla tua offerta.

Esempi:
• Qual è la mia offerta?
• Che contratti ho con voi?
• Quando ho firmato l’ultimo contratto?`;
}

async function callAgent(req: Request, params: {
  message: string;
  telefono?: string | null;
  codice_fiscale?: string | null;
  email?: string | null;
}): Promise<AgentResponse> {
  const sharedSecret = process.env.PHONESIA_AGENT_SHARED_SECRET;
  const url = new URL("/api/phonesia/agent/message", req.url);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (sharedSecret) {
    headers["x-phonesia-secret"] = sharedSecret;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(params),
    cache: "no-store",
  });

  const data = (await response.json()) as AgentResponse;

  if (!response.ok) {
    throw new Error(data.detail || data.error || "Unknown agent error");
  }

  return data;
}

export async function POST(req: Request) {
  try {
    console.log("TELEGRAM WEBHOOK HIT");

    const update = (await req.json()) as TelegramUpdate;
    const message = update.message;
    const text = message?.text?.trim() || "";
    const from = message?.from;
    const chat = message?.chat;

    if (!message || !from || !chat) {
      return NextResponse.json({ ok: true });
    }

    const telegramUserId = String(from.id);
    const telegramChatId = String(chat.id);
    const telegramUsername = from.username || null;

    const startPayload = extractStartPayload(text);

    if (startPayload) {
      const clienteId = Number(startPayload);

      if (!Number.isFinite(clienteId)) {
        const risposta =
          "Link non valido. Per favore registrati di nuovo tramite il QR del negozio.";
        await sendTelegramMessage(chat.id, risposta);

        await logConversation({
          clienteId: null,
          channelUserId: telegramUserId,
          channelChatId: telegramChatId,
          channelUsername: telegramUsername,
          messaggioUtente: text,
          intent: "telegram_start_link",
          toolUsato: "link_start_payload",
          rispostaAgente: risposta,
          stato: "errore",
          errore: "start_payload_non_numerico",
          metadata: { startPayload },
        });

        return NextResponse.json({ ok: true });
      }

      const cliente = await findClienteById(clienteId);

      if (!cliente) {
        const risposta =
          "Non trovo la tua registrazione. Per favore torna al QR del negozio e ripeti la registrazione.";
        await sendTelegramMessage(chat.id, risposta);

        await logConversation({
          clienteId: null,
          channelUserId: telegramUserId,
          channelChatId: telegramChatId,
          channelUsername: telegramUsername,
          messaggioUtente: text,
          intent: "telegram_start_link",
          toolUsato: "find_cliente_by_id",
          rispostaAgente: risposta,
          stato: "errore",
          errore: "cliente_non_trovato",
          metadata: { clienteId },
        });

        return NextResponse.json({ ok: true });
      }

      const existingByTelegram = await findClienteByTelegramUserId(telegramUserId);

      if (existingByTelegram && Number(existingByTelegram.id) !== clienteId) {
        const risposta =
          "Questo account Telegram risulta già collegato a un altro profilo. Ti facciamo richiamare da un operatore.";
        await sendTelegramMessage(chat.id, risposta);

        await logConversation({
          clienteId,
          channelUserId: telegramUserId,
          channelChatId: telegramChatId,
          channelUsername: telegramUsername,
          messaggioUtente: text,
          intent: "telegram_start_link",
          toolUsato: "find_cliente_by_telegram_user_id",
          rispostaAgente: risposta,
          stato: "errore",
          errore: "telegram_gia_collegato_altro_cliente",
          handoffRichiesto: true,
          metadata: {
            clienteId,
            existingClienteId: existingByTelegram.id,
          },
        });

        return NextResponse.json({ ok: true });
      }

      await linkClienteTelegram({
        clienteId,
        telegramUserId,
        telegramChatId,
        telegramUsername,
      });

      const link = `https://crm-clean.vercel.app/phonesia/card/${clienteId}`;

      const risposta = `Benvenuto in PHONESIA! 🎉

La tua registrazione è stata completata con successo.

Da questo momento puoi contattarci direttamente qui su Telegram ogni volta che hai bisogno di informazioni, assistenza o consigli sui nostri servizi.

Qui trovi il nostro biglietto da visita digitale:
${link}

Puoi anche scrivermi domande come:
• Qual è la mia offerta?
• Che contratti ho con voi?
• Quando ho firmato l’ultimo contratto?`;

      await sendTelegramMessage(chat.id, risposta);

      await logConversation({
        clienteId,
        channelUserId: telegramUserId,
        channelChatId: telegramChatId,
        channelUsername: telegramUsername,
        messaggioUtente: text,
        intent: "telegram_start_link",
        toolUsato: "link_cliente_telegram",
        rispostaAgente: risposta,
        stato: "completato",
        metadata: {
          clienteId,
          telegramUserId,
          telegramChatId,
        },
      });

      return NextResponse.json({ ok: true });
    }

    const cliente = await findClienteByTelegramUserId(telegramUserId);

    if (!cliente) {
      const risposta =
        "Per iniziare devi prima registrarti tramite il QR del negozio. Dopo la registrazione torna qui e premi Avvia.";
      await sendTelegramMessage(chat.id, risposta);

      await logConversation({
        clienteId: null,
        channelUserId: telegramUserId,
        channelChatId: telegramChatId,
        channelUsername: telegramUsername,
        messaggioUtente: text || "(messaggio vuoto)",
        intent: "telegram_non_identificato",
        toolUsato: "find_cliente_by_telegram_user_id",
        rispostaAgente: risposta,
        stato: "completato",
      });

      return NextResponse.json({ ok: true });
    }

    if (!text || text === "/start" || text === "/help") {
      const risposta = buildLinkedWelcomeMessage(cliente);
      await sendTelegramMessage(chat.id, risposta);

      await logConversation({
        clienteId: Number(cliente.id),
        channelUserId: telegramUserId,
        channelChatId: telegramChatId,
        channelUsername: telegramUsername,
        messaggioUtente: text || "(messaggio vuoto)",
        intent: "telegram_help",
        toolUsato: "build_linked_welcome_message",
        rispostaAgente: risposta,
        stato: "completato",
      });

      return NextResponse.json({ ok: true });
    }

    try {
      const agentResponse = await callAgent(req, {
        message: text,
        telefono: normalizePhone(cliente.telefono),
        codice_fiscale: normalizeCf(cliente.codice_fiscale),
        email: normalizeEmail(cliente.email),
      });

      const risposta =
        agentResponse.reply ||
        "Ho ricevuto la tua richiesta, ma in questo momento non sono riuscito a preparare una risposta utile.";

      await sendTelegramMessage(chat.id, risposta);

      await logConversation({
        clienteId: Number(cliente.id),
        channelUserId: telegramUserId,
        channelChatId: telegramChatId,
        channelUsername: telegramUsername,
        messaggioUtente: text,
        intent: "telegram_agent_customer_message",
        toolUsato: agentResponse.used_local_agent
          ? "phonesia_agent_message_route_local_agent"
          : "phonesia_agent_message_route_crm_fallback",
        rispostaAgente: risposta,
        stato: "completato",
        metadata: {
          used_local_agent: agentResponse.used_local_agent ?? false,
          contract_count: agentResponse.contract_count ?? 0,
        },
      });

      return NextResponse.json({ ok: true });
    } catch (agentError) {
      console.error("Errore chiamata agent Telegram cliente:", agentError);

      const risposta =
        "Sto avendo un problema temporaneo nel recuperare i tuoi dati. Riprova tra poco oppure contatta il punto vendita PHONESIA.";

      await sendTelegramMessage(chat.id, risposta);

      await logConversation({
        clienteId: Number(cliente.id),
        channelUserId: telegramUserId,
        channelChatId: telegramChatId,
        channelUsername: telegramUsername,
        messaggioUtente: text,
        intent: "telegram_agent_customer_message",
        toolUsato: "phonesia_agent_message_route_error",
        rispostaAgente: risposta,
        stato: "errore",
        errore: agentError instanceof Error ? agentError.message : "unknown_agent_error",
        handoffRichiesto: true,
      });

      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    console.error("Telegram /start route error:", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
