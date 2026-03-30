import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TelegramUser = {
  id: number;
  is_bot?: boolean;
  first_name?: string;
  last_name?: string;
  username?: string;
};

type TelegramChat = {
  id: number;
  type: string;
};

type TelegramMessage = {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
};

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
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

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function extractEmail(text: string): string | null {
  const match = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match ? match[0].toLowerCase() : null;
}

function extractCodiceFiscale(text: string): string | null {
  const match = text.match(
    /\b[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]\b/i,
  );
  return match ? match[0].toUpperCase() : null;
}

function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");

  if (!digits) return null;

  if (digits.startsWith("39") && digits.length > 10) {
    return `+${digits}`;
  }

  if (digits.startsWith("3") && (digits.length === 9 || digits.length === 10)) {
    return `+39${digits}`;
  }

  if (digits.startsWith("0") && digits.length >= 9 && digits.length <= 11) {
    return `+39${digits}`;
  }

  return null;
}

function extractPhone(text: string): string | null {
  const candidates = text.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) ?? [];

  for (const candidate of candidates) {
    const normalized = normalizePhone(candidate);
    if (normalized) return normalized;
  }

  return null;
}

function buildHelpText(): string {
  return [
    "Ciao, sono il bot CRM interno di Phonesia.",
    "",
    "Per questa prima versione scrivimi la domanda insieme a un identificativo cliente.",
    "",
    "Esempi:",
    "• Qual è la mia offerta per +393331939636",
    "• Qual è la mia offerta per LDRSST68C42D636H",
    "• Qual è la mia offerta per mario@email.it",
  ].join("\n");
}

async function sendTelegramMessage(chatId: number, text: string): Promise<void> {
  const token = getEnv("PHONESIA_TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${errorText}`);
  }
}

async function callAgent(
  request: NextRequest,
  payload: {
    message: string;
    telefono?: string | null;
    codice_fiscale?: string | null;
    email?: string | null;
  },
): Promise<AgentResponse> {
  const secret = process.env.PHONESIA_AGENT_SHARED_SECRET;
  const url = new URL("/api/phonesia/agent/message", request.url);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (secret) {
    headers["x-phonesia-secret"] = secret;
  }

  const response = await fetch(url.toString(), {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const data = (await response.json()) as AgentResponse;

  if (!response.ok) {
    throw new Error(data.detail || data.error || "Unknown agent error");
  }

  return data;
}

function pickMessage(update: TelegramUpdate): TelegramMessage | null {
  return update.message ?? update.edited_message ?? null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/phonesia/telegram/webhook",
    status: "ready",
  });
}

export async function POST(request: NextRequest) {
  try {
    const update = (await request.json()) as TelegramUpdate;
    const message = pickMessage(update);

    if (!message?.text) {
      return NextResponse.json({ ok: true, ignored: "no_text_message" });
    }

    const text = message.text.trim();
    const chatId = message.chat.id;

    if (text === "/start" || text === "/help") {
      await sendTelegramMessage(chatId, buildHelpText());
      return NextResponse.json({ ok: true, handled: "help" });
    }

    const telefono = extractPhone(text);
    const codiceFiscale = extractCodiceFiscale(text);
    const email = extractEmail(text);

    if (!telefono && !codiceFiscale && !email) {
      await sendTelegramMessage(
        chatId,
        [
          "Per questa versione iniziale devo ricevere anche un identificativo cliente.",
          "Puoi scrivermi il messaggio con numero di telefono, codice fiscale oppure email.",
          "",
          "Esempio:",
          "Qual è la mia offerta per +393331939636",
        ].join("\n"),
      );

      return NextResponse.json({ ok: true, handled: "missing_identifier" });
    }

    const agent = await callAgent(request, {
      message: text,
      telefono,
      codice_fiscale: codiceFiscale,
      email,
    });

    const reply =
      agent.reply ||
      "Ho ricevuto la richiesta, ma non sono riuscito a costruire una risposta utile.";

    await sendTelegramMessage(chatId, reply);

    return NextResponse.json({
      ok: true,
      handled: "agent_reply",
      used_local_agent: agent.used_local_agent ?? false,
    });
  } catch (error) {
    console.error("phonesia telegram webhook error:", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
