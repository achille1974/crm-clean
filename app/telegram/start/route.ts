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
  auth: { persistSession: false, autoRefreshToken: false },
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
    }),
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

async function findClienteByTelegramUserId(telegramUserId: string) {
  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telegram_user_id, telegram_chat_id, telegram_active")
    .eq("telegram_user_id", telegramUserId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

async function findClienteById(clienteId: number) {
  const { data, error } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, telegram_user_id, telegram_chat_id")
    .eq("id", clienteId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
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

export async function POST(req: Request) {
  try {
    const update = (await req.json()) as TelegramUpdate;

    const message = update.message;
    const text = message?.text?.trim() || "";
    const from = message?.from;
    const chat = message?.chat;

    if (!message || !from || !chat) {
      return Response.json({ ok: true });
    }

    const telegramUserId = String(from.id);
    const telegramChatId = String(chat.id);
    const telegramUsername = from.username || null;

    const startPayload = extractStartPayload(text);

    if (startPayload) {
      const clienteId = Number(startPayload);

      if (!Number.isFinite(clienteId)) {
        const risposta = "Link non valido. Per favore registrati di nuovo tramite il QR del negozio.";
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

        return Response.json({ ok: true });
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

        return Response.json({ ok: true });
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

        return Response.json({ ok: true });
      }

      await linkClienteTelegram({
        clienteId,
        telegramUserId,
        telegramChatId,
        telegramUsername,
      });

      const risposta =
        `Ciao ${cliente.nome ?? ""}, il tuo profilo Phonesia è stato collegato correttamente a Telegram.\n\n` +
        `Da questo momento puoi scrivermi messaggi come:\n` +
        `- Qual è la mia offerta?\n` +
        `- Ho un contratto registrato?\n` +
        `- In quale negozio sono associato?\n\n` +
        `Se non riesco ad aiutarti, ti passo a un operatore.`;

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

      return Response.json({ ok: true });
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

      return Response.json({ ok: true });
    }

    const risposta =
      "Ti ho riconosciuto correttamente. La prossima fase sarà l’agente Phonesia, così potrò rispondere sulla tua offerta e sui tuoi contratti.";
    await sendTelegramMessage(chat.id, risposta);

    await logConversation({
      clienteId: Number(cliente.id),
      channelUserId: telegramUserId,
      channelChatId: telegramChatId,
      channelUsername: telegramUsername,
      messaggioUtente: text || "(messaggio vuoto)",
      intent: "telegram_message_placeholder",
      toolUsato: "find_cliente_by_telegram_user_id",
      rispostaAgente: risposta,
      stato: "completato",
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram /start route error:", error);
    return Response.json({ ok: false }, { status: 200 });
  }
}
