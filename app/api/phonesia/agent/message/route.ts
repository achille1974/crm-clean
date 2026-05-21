import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AgentRequestBody = {
  message?: string;
  telefono?: string;
  codice_fiscale?: string;
  email?: string;
  nome?: string;
  cognome?: string;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  whatsapp_active?: boolean | null;
  created_at: string | null;
};

type ContrattoRow = {
  id: string;
  cliente_id: number | null;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  operatore: string | null;
  categoria: string | null;
  tipo_contratto: string | null;
  numero_contratto: string | null;
  codice_cliente: string | null;
  offerta: string | null;
  prodotto: string | null;
  costo: string | null;
  data_stipula: string | null;
  data_attivazione: string | null;
  negozio_id: number | null;
  origine_cliente: string | null;
  created_at: string | null;
};

type ServizioClienteRow = {
  id: string | number;
  cliente_id: number | null;
  service_family: string | null;
  service_code: string | null;
  provider_cluster: string | null;
  brand_raw: string | null;
  service_status: string | null;
  created_at: string | null;
};

type FeedbackRow = {
  id: string | number;
  cliente_id: number | null;
  rating: number | null;
  commento: string | null;
  ricontatto: boolean | null;
  negozio_id: number | null;
  created_at: string | null;
};

type MarketingConsentRow = {
  id: string | number;
  cliente_id: number | null;
  tipo_evento: string | null;
  created_at: string | null;
};

type Intent =
  | "smartphone"
  | "fibra"
  | "energia"
  | "assistenza"
  | "ricontatto"
  | "offerte_generiche"
  | "saluto"
  | "altro";

type AgentContext = {
  cliente: ClienteRow | null;
  contratti: ContrattoRow[];
  servizi: ServizioClienteRow[];
  ultimoFeedback: FeedbackRow | null;
  marketingConsent: boolean;
};

const NEGOZI: Record<
  number,
  {
    label: string;
    mapsQuery: string;
    mapsUrl: string;
  }
> = {
  1: {
    label: "PHONESIA Floridia",
    mapsQuery: "Corso+Vittorio+Emanuele+735+Floridia",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
  2: {
    label: "PHONESIA Augusta",
    mapsQuery: "Viale+Italia+195+Augusta",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Viale+Italia+195+Augusta",
  },
  3: {
    label: "PHONESIA Siracusa",
    mapsQuery: "Corso+Gelone+41+Siracusa",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Gelone+41+Siracusa",
  },
  4: {
    label: "PHONESIA Avola",
    mapsQuery: "Corso+Vittorio+Emanuele+281+Avola",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+281+Avola",
  },
  5: {
    label: "PHONESIA Floridia / Tabacchino Floridia",
    mapsQuery: "Corso+Vittorio+Emanuele+735+Floridia",
    mapsUrl:
      "https://www.google.com/maps/search/?api=1&query=Corso+Vittorio+Emanuele+735+Floridia",
  },
};

const INACTIVE_SERVICE_STATUSES = new Set([
  "CESSATO",
  "DISATTIVO",
  "CHIUSO",
  "ANNULLATO",
]);

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

function buildPhoneCandidates(value?: string | null): string[] {
  const text = normalizeText(value);
  if (!text) return [];

  const digits = text.replace(/\D/g, "");
  const variants = new Set<string>();

  if (text.startsWith("+")) {
    variants.add(text);
  }

  if (digits) {
    variants.add(digits);
    variants.add(`+${digits}`);

    if (digits.startsWith("39") && digits.length > 10) {
      const national = digits.slice(2);
      variants.add(national);
      variants.add(`+39${national}`);
    } else {
      variants.add(`+39${digits}`);
    }
  }

  return Array.from(variants).filter(Boolean);
}

function normalizePhone(value?: string | null): string | null {
  const candidates = buildPhoneCandidates(value);
  const preferred = candidates.find((candidate) => candidate.startsWith("+39"));

  return preferred ?? candidates[0] ?? null;
}

function compact<T>(value: T | null | undefined): T | null {
  return value == null ? null : value;
}

function getFirstName(cliente: ClienteRow | null, fallback?: ContrattoRow | null): string {
  const nome =
    normalizeText(cliente?.nome) ||
    normalizeText(fallback?.nome) ||
    "cliente";

  return nome.split(/\s+/)[0] || "cliente";
}

function getStoreLabel(negozioId?: number | null): string {
  if (!negozioId) return "il tuo punto vendita PHONESIA";
  return NEGOZI[negozioId]?.label ?? "il tuo punto vendita PHONESIA";
}

function getLatestOperator(contratti: ContrattoRow[], servizi: ServizioClienteRow[]): string | null {
  const fromContratti = contratti.find((contratto) => normalizeText(contratto.operatore));
  if (fromContratti?.operatore) return fromContratti.operatore;

  const fromServizi = servizi.find(
    (servizio) => normalizeText(servizio.brand_raw) || normalizeText(servizio.provider_cluster),
  );

  return fromServizi?.brand_raw || fromServizi?.provider_cluster || null;
}

function getActiveServiceFamilies(servizi: ServizioClienteRow[]): string[] {
  const families = new Set<string>();

  for (const servizio of servizi) {
    const status = normalizeText(servizio.service_status)?.toUpperCase() ?? null;

    if (status && INACTIVE_SERVICE_STATUSES.has(status)) {
      continue;
    }

    const family = normalizeText(servizio.service_family)?.toUpperCase();

    if (family) {
      families.add(family);
    }
  }

  return Array.from(families).sort();
}

function detectIntent(message: string): Intent {
  const text = message.toLowerCase();

  if (/\b(ciao|buongiorno|buonasera|salve)\b/.test(text) && text.length <= 30) {
    return "saluto";
  }

  if (
    /problema|non funziona|assistenza|guasto|sim|scheda|linea|internet non|telefono non|errore|blocc/i.test(
      text,
    )
  ) {
    return "assistenza";
  }

  if (/richiam|ricontatt|parlare con qualcuno|operatore|persona/i.test(text)) {
    return "ricontatto";
  }

  if (/smartphone|telefono nuovo|cellulare|iphone|samsung|xiaomi|oppo|cambiare telefono/i.test(text)) {
    return "smartphone";
  }

  if (/fibra|wifi|wi-fi|internet casa|adsl|modem|copertura|fisso|telefono fisso/i.test(text)) {
    return "fibra";
  }

  if (/energia|luce|gas|bolletta|pago troppo|consumi|fornitura/i.test(text)) {
    return "energia";
  }

  if (/offert|promo|promozion|tariff|prezzo|costo|conveniente/i.test(text)) {
    return "offerte_generiche";
  }

  return "altro";
}

function hasNegativeFeedback(context: AgentContext): boolean {
  const rating = context.ultimoFeedback?.rating;
  return typeof rating === "number" && rating <= 3;
}

function wantsCallback(context: AgentContext): boolean {
  return context.ultimoFeedback?.ricontatto === true;
}

function buildSafeCommercialReply(
  message: string,
  intent: Intent,
  context: AgentContext,
): {
  reply: string;
  handoffRichiesto: boolean;
} {
  const cliente = context.cliente;
  const firstName = getFirstName(cliente, context.contratti[0] ?? null);
  const storeLabel = getStoreLabel(cliente?.negozio_id ?? context.contratti[0]?.negozio_id ?? null);
  const latestOperator = getLatestOperator(context.contratti, context.servizi);
  const activeFamilies = getActiveServiceFamilies(context.servizi);
  const negativeFeedback = hasNegativeFeedback(context);
  const callbackFromFeedback = wantsCallback(context);

  if (!cliente) {
    return {
      handoffRichiesto: true,
      reply: [
        "Ciao 💙",
        "posso aiutarti, ma non riesco ancora a collegare questo numero a una scheda cliente PHONESIA.",
        "Scrivimi nome e cognome oppure passa in negozio: così possiamo verificare meglio la tua richiesta.",
      ].join("\n"),
    };
  }

  if (negativeFeedback || callbackFromFeedback) {
    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        "grazie per averci scritto.",
        "Vedo che c’è già una richiesta di attenzione/ricontatto collegata alla tua scheda, quindi preferisco non proporti offerte adesso.",
        `Avviso il punto vendita ${storeLabel} così potete gestire prima la tua esigenza nel modo corretto.`,
      ].join("\n"),
    };
  }

  if (intent === "assistenza") {
    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        "mi dispiace per il problema.",
        "Per aiutarti bene è meglio partire dall’assistenza, senza proporti offerte in questo momento.",
        `Ti consiglio di passare dal punto vendita ${storeLabel}, oppure scrivimi qualche dettaglio in più sul problema così possiamo indirizzarti meglio.`,
      ].join("\n"),
    };
  }

  if (intent === "ricontatto") {
    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        `va bene, preparo una richiesta di ricontatto per il punto vendita ${storeLabel}.`,
        "Ti ricontatteranno appena possibile per capire meglio la tua esigenza.",
      ].join("\n"),
    };
  }

  if (intent === "smartphone") {
    const operatorLine = latestOperator
      ? `Nel CRM risulta come ultimo operatore/brand collegato: ${latestOperator}.`
      : "Nel CRM non ho un operatore aggiornato certo da comunicarti.";

    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        "sì, possiamo valutare alcune soluzioni smartphone interessanti.",
        operatorLine,
        `Sei seguito dal punto vendita ${storeLabel}: ti consiglio di passare in negozio così controlliamo insieme la tua tariffa attuale e vediamo se è possibile abbinare uno smartphone a una soluzione più conveniente.`,
        "Vuoi che ti faccia ricontattare dal negozio?",
      ].join("\n"),
    };
  }

  if (intent === "fibra") {
    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        "sì, possiamo verificare le soluzioni fibra disponibili.",
        `Per darti una risposta corretta serve controllare copertura e indirizzo: ti consiglio di passare dal punto vendita ${storeLabel}.`,
        "Se hai già una linea casa, porta anche una vecchia bolletta o i dati dell’attuale operatore.",
        "Vuoi che ti faccia ricontattare dal negozio?",
      ].join("\n"),
    };
  }

  if (intent === "energia") {
    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        "possiamo fare una valutazione sulla tua bolletta luce/gas.",
        "Per non darti informazioni imprecise, è meglio controllare i dati reali della fornitura.",
        `Passa dal punto vendita ${storeLabel} portando una bolletta recente: verifichiamo insieme se c’è una soluzione più conveniente.`,
        "Vuoi che ti faccia ricontattare dal negozio?",
      ].join("\n"),
    };
  }

  if (intent === "offerte_generiche") {
    const serviceLine =
      activeFamilies.length > 0
        ? `Nella tua scheda risultano questi servizi: ${activeFamilies.join(", ")}.`
        : "Nella tua scheda non vedo ancora un quadro completo dei servizi attivi.";

    return {
      handoffRichiesto: true,
      reply: [
        `Ciao ${firstName} 💙`,
        "possiamo sicuramente fare una verifica sulle offerte disponibili.",
        serviceLine,
        "Per evitare di indicarti promozioni non adatte, ti consiglio di fare un controllo con il negozio.",
        `Il tuo riferimento è ${storeLabel}. Vuoi che ti faccia ricontattare?`,
      ].join("\n"),
    };
  }

  if (intent === "saluto") {
    return {
      handoffRichiesto: false,
      reply: [
        `Ciao ${firstName} 💙`,
        "sono l’assistente PHONESIA.",
        "Dimmi pure se ti serve assistenza, vuoi verificare un’offerta o desideri essere ricontattato dal negozio.",
      ].join("\n"),
    };
  }

  return {
    handoffRichiesto: true,
    reply: [
      `Ciao ${firstName} 💙`,
      "ho ricevuto il tuo messaggio.",
      "Per aiutarti bene preferisco far verificare la richiesta dal negozio, così evitiamo informazioni imprecise.",
      `Il tuo riferimento è ${storeLabel}. Vuoi che ti faccia ricontattare?`,
    ].join("\n"),
  };
}

async function findCliente(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  input: {
    telefono?: string | null;
    codiceFiscale?: string | null;
    email?: string | null;
  },
): Promise<ClienteRow | null> {
  if (input.codiceFiscale) {
    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select(
        "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active, created_at",
      )
      .ilike("codice_fiscale", input.codiceFiscale)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ClienteRow;
  }

  if (input.telefono) {
    const candidates = buildPhoneCandidates(input.telefono);

    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select(
        "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active, created_at",
      )
      .in("telefono", candidates)
      .limit(1);

    if (error) throw error;
    if (data?.[0]) return data[0] as ClienteRow;
  }

  if (input.email) {
    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select(
        "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active, created_at",
      )
      .ilike("email", input.email)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ClienteRow;
  }

  return null;
}

async function findContratti(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId?: number | null;
    telefono?: string | null;
    codiceFiscale?: string | null;
    email?: string | null;
  },
): Promise<ContrattoRow[]> {
  const collected: ContrattoRow[] = [];
  const seen = new Set<string>();

  const pushRows = (rows: any[] | null) => {
    (rows ?? []).forEach((row) => {
      const id = String(row.id);
      if (!seen.has(id)) {
        seen.add(id);
        collected.push(row as ContrattoRow);
      }
    });
  };

  const selectFields =
    "id, cliente_id, nome, cognome, telefono, email, codice_fiscale, operatore, categoria, tipo_contratto, numero_contratto, codice_cliente, offerta, prodotto, costo, data_stipula, data_attivazione, negozio_id, origine_cliente, created_at";

  if (params.clienteId) {
    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(selectFields)
      .eq("cliente_id", params.clienteId)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  if (collected.length === 0 && params.codiceFiscale) {
    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(selectFields)
      .ilike("codice_fiscale", params.codiceFiscale)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  if (collected.length === 0 && params.telefono) {
    const candidates = buildPhoneCandidates(params.telefono);

    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(selectFields)
      .in("telefono", candidates)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  if (collected.length === 0 && params.email) {
    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(selectFields)
      .ilike("email", params.email)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  return collected;
}

async function findServiziCliente(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteId?: number | null,
): Promise<ServizioClienteRow[]> {
  if (!clienteId) return [];

  const { data, error } = await supabase
    .from("phonesia_servizi_cliente")
    .select(
      "id, cliente_id, service_family, service_code, provider_cluster, brand_raw, service_status, created_at",
    )
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) throw error;

  return (data ?? []) as ServizioClienteRow[];
}

async function findUltimoFeedback(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteId?: number | null,
): Promise<FeedbackRow | null> {
  if (!clienteId) return null;

  const { data, error } = await supabase
    .from("phonesia_feedback")
    .select("id, cliente_id, rating, commento, ricontatto, negozio_id, created_at")
    .eq("cliente_id", clienteId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return (data as FeedbackRow | null) ?? null;
}

async function hasMarketingConsent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteId?: number | null,
): Promise<boolean> {
  if (!clienteId) return false;

  const { data, error } = await supabase
    .from("phonesia_consensi")
    .select("id, cliente_id, tipo_evento, created_at")
    .eq("cliente_id", clienteId)
    .eq("tipo_evento", "marketing_accepted")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

  return Boolean(data as MarketingConsentRow | null);
}

async function askLocalAgent(prompt: string): Promise<string | null> {
  const orchestratorUrl = process.env.PHONESIA_AGENT_ORCHESTRATOR_URL;
  const orchestratorToken = process.env.PHONESIA_AGENT_ORCHESTRATOR_TOKEN;

  if (!orchestratorUrl) {
    return null;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (orchestratorToken) {
    headers.Authorization = `Bearer ${orchestratorToken}`;
  }

  const res = await fetch(orchestratorUrl, {
    method: "POST",
    headers,
    body: JSON.stringify({
      message: prompt,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Local agent error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as Record<string, unknown>;

  const response =
    (typeof data.response === "string" && data.response) ||
    (typeof data.answer === "string" && data.answer) ||
    (typeof data.output === "string" && data.output) ||
    null;

  return response;
}

function buildAgentPrompt(
  message: string,
  intent: Intent,
  context: AgentContext,
): string {
  const crmContext = {
    cliente: context.cliente
      ? {
          id: context.cliente.id,
          nome: context.cliente.nome,
          cognome: context.cliente.cognome,
          telefono: context.cliente.telefono,
          email: context.cliente.email,
          codice_fiscale: context.cliente.codice_fiscale,
          negozio_id: context.cliente.negozio_id,
          whatsapp_active: context.cliente.whatsapp_active,
          created_at: context.cliente.created_at,
        }
      : null,
    intent,
    marketing_consent: context.marketingConsent,
    ultimo_feedback: context.ultimoFeedback
      ? {
          rating: context.ultimoFeedback.rating,
          commento: context.ultimoFeedback.commento,
          ricontatto: context.ultimoFeedback.ricontatto,
          created_at: context.ultimoFeedback.created_at,
        }
      : null,
    servizi_attivi: getActiveServiceFamilies(context.servizi),
    contratti: context.contratti.map((c) => ({
      id: c.id,
      operatore: c.operatore,
      categoria: c.categoria,
      tipo_contratto: c.tipo_contratto,
      numero_contratto: c.numero_contratto,
      codice_cliente: c.codice_cliente,
      offerta: c.offerta,
      prodotto: c.prodotto,
      costo: c.costo,
      data_stipula: c.data_stipula,
      data_attivazione: c.data_attivazione,
      created_at: c.created_at,
    })),
  };

  return [
    "Sei l'assistente CRM operativo di PHONESIA.",
    "Rispondi al cliente su WhatsApp.",
    "Regole obbligatorie:",
    "- usa solo i dati CRM forniti;",
    "- non inventare prezzi, offerte, disponibilità smartphone o promozioni;",
    "- se il cliente chiede assistenza, dai priorità all'assistenza e non fare promo;",
    "- se il cliente è insoddisfatto o ha feedback basso, fai recupero cliente e non fare promo;",
    "- se il cliente chiede offerte, usa formule prudenti: possiamo valutare, verifichiamo, passa in negozio, ti facciamo ricontattare;",
    "- il consenso marketing serve per campagne outbound, ma se il cliente scrive inbound puoi rispondere alla sua richiesta;",
    "- risposta breve, gentile, commerciale ma prudente;",
    "- italiano naturale.",
    "",
    `Messaggio cliente: ${message}`,
    "",
    `Contesto CRM JSON: ${JSON.stringify(crmContext)}`,
  ].join("\n");
}

function isSafeAiReply(reply: string): boolean {
  const text = reply.toLowerCase();

  const riskyPatterns = [
    /€\s?\d+/i,
    /\d+\s?euro/i,
    /solo oggi/i,
    /offerta garantita/i,
    /sicuro al 100/i,
    /gratis/i,
    /iphone\s?\d+\s?a/i,
  ];

  return !riskyPatterns.some((pattern) => pattern.test(text));
}

async function logAgentConversation(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  params: {
    clienteId?: number | null;
    message: string;
    intent: Intent;
    reply: string;
    usedLocalAgent: boolean;
    handoffRichiesto: boolean;
    telefono?: string | null;
    marketingConsent: boolean;
    source: string;
  },
) {
  if (!params.clienteId) return;

  try {
    await supabase.from("phonesia_conversazioni").insert({
      cliente_id: params.clienteId,
      canale: "whatsapp",
      messaggio_utente: params.message,
      intent: params.intent,
      tool_usato: params.usedLocalAgent
        ? "api_phonesia_agent_message_local_orchestrator"
        : "api_phonesia_agent_message_deterministic",
      risposta_agente: params.reply,
      stato: "completato",
      handoff_richiesto: params.handoffRichiesto,
      metadata: {
        telefono: params.telefono,
        marketing_consent: params.marketingConsent,
        source: params.source,
      },
    });
  } catch (error) {
    console.error("Errore log conversazione agent:", error);
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/phonesia/agent/message",
    status: "ready",
  });
}

export async function POST(request: NextRequest) {
  try {
    const sharedSecret = process.env.PHONESIA_AGENT_SHARED_SECRET;
    const requestSecret = request.headers.get("x-phonesia-secret");

    if (sharedSecret && requestSecret !== sharedSecret) {
      return NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401 },
      );
    }

    const body = (await request.json()) as AgentRequestBody;

    const message = normalizeText(body.message);
    if (!message) {
      return NextResponse.json(
        { ok: false, error: "message is required" },
        { status: 400 },
      );
    }

    const telefono = normalizePhone(body.telefono);
    const codiceFiscale = normalizeCf(body.codice_fiscale);
    const email = normalizeEmail(body.email);
    const intent = detectIntent(message);

    const supabase = getSupabaseAdmin();

    const cliente = await findCliente(supabase, {
      telefono,
      codiceFiscale,
      email,
    });

    const contratti = await findContratti(supabase, {
      clienteId: cliente?.id ?? null,
      telefono,
      codiceFiscale,
      email,
    });

    const servizi = await findServiziCliente(supabase, cliente?.id ?? null);
    const ultimoFeedback = await findUltimoFeedback(supabase, cliente?.id ?? null);
    const marketingConsent = await hasMarketingConsent(supabase, cliente?.id ?? null);

    const context: AgentContext = {
      cliente,
      contratti,
      servizi,
      ultimoFeedback,
      marketingConsent,
    };

    const deterministic = buildSafeCommercialReply(message, intent, context);

    let finalReply = deterministic.reply;
    let usedLocalAgent = false;

    try {
      const agentPrompt = buildAgentPrompt(message, intent, context);
      const aiReply = await askLocalAgent(agentPrompt);

      if (aiReply && aiReply.trim() && isSafeAiReply(aiReply.trim())) {
        finalReply = aiReply.trim();
        usedLocalAgent = true;
      }
    } catch (agentError) {
      console.error("phonesia agent local fallback:", agentError);
    }

    await logAgentConversation(supabase, {
      clienteId: cliente?.id ?? null,
      message,
      intent,
      reply: finalReply,
      usedLocalAgent,
      handoffRichiesto: deterministic.handoffRichiesto,
      telefono,
      marketingConsent,
      source: "api_agent_message",
    });

    return NextResponse.json({
      ok: true,
      reply: finalReply,
      intent,
      handoff_richiesto: deterministic.handoffRichiesto,
      used_local_agent: usedLocalAgent,
      matched_customer: cliente
        ? {
            id: cliente.id,
            nome: compact(cliente.nome),
            cognome: compact(cliente.cognome),
            telefono: compact(cliente.telefono),
            email: compact(cliente.email),
            codice_fiscale: compact(cliente.codice_fiscale),
            negozio_id: compact(cliente.negozio_id),
            whatsapp_active: compact(cliente.whatsapp_active),
          }
        : null,
      contract_count: contratti.length,
      active_services: getActiveServiceFamilies(servizi),
      latest_feedback: ultimoFeedback
        ? {
            rating: ultimoFeedback.rating,
            ricontatto: ultimoFeedback.ricontatto,
            created_at: ultimoFeedback.created_at,
          }
        : null,
      marketing_consent: marketingConsent,
    });
  } catch (error) {
    console.error("phonesia agent route error:", error);

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
