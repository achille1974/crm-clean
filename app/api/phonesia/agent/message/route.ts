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

function normalizePhone(value?: string | null): string | null {
  const text = normalizeText(value);
  if (!text) return null;

  let digits = text.replace(/\D/g, "");

  if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.slice(2);
  }

  if (digits.length >= 9 && digits.length <= 11) {
    return `+39${digits.startsWith("0") || digits.length === 9 || digits.length === 10 || digits.length === 11 ? digits : digits}`;
  }

  return text;
}

function formatDate(value?: string | null): string {
  if (!value) return "n.d.";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function compact<T>(value: T | null | undefined): T | null {
  return value == null ? null : value;
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
      .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, created_at")
      .ilike("codice_fiscale", input.codiceFiscale)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ClienteRow;
  }

  if (input.telefono) {
    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, created_at")
      .eq("telefono", input.telefono)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    if (data) return data as ClienteRow;
  }

  if (input.email) {
    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, created_at")
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

  if (params.clienteId) {
    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(
        "id, cliente_id, nome, cognome, telefono, email, codice_fiscale, operatore, categoria, tipo_contratto, numero_contratto, codice_cliente, offerta, prodotto, costo, data_stipula, data_attivazione, negozio_id, origine_cliente, created_at",
      )
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
      .select(
        "id, cliente_id, nome, cognome, telefono, email, codice_fiscale, operatore, categoria, tipo_contratto, numero_contratto, codice_cliente, offerta, prodotto, costo, data_stipula, data_attivazione, negozio_id, origine_cliente, created_at",
      )
      .ilike("codice_fiscale", params.codiceFiscale)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  if (collected.length === 0 && params.telefono) {
    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(
        "id, cliente_id, nome, cognome, telefono, email, codice_fiscale, operatore, categoria, tipo_contratto, numero_contratto, codice_cliente, offerta, prodotto, costo, data_stipula, data_attivazione, negozio_id, origine_cliente, created_at",
      )
      .eq("telefono", params.telefono)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  if (collected.length === 0 && params.email) {
    const { data, error } = await supabase
      .from("phonesia_contratti")
      .select(
        "id, cliente_id, nome, cognome, telefono, email, codice_fiscale, operatore, categoria, tipo_contratto, numero_contratto, codice_cliente, offerta, prodotto, costo, data_stipula, data_attivazione, negozio_id, origine_cliente, created_at",
      )
      .ilike("email", params.email)
      .order("data_stipula", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw error;
    pushRows(data);
  }

  return collected;
}

function buildDeterministicReply(
  message: string,
  cliente: ClienteRow | null,
  contratti: ContrattoRow[],
): string {
  if (contratti.length === 0) {
    return [
      "Al momento non trovo un contratto associato ai dati inviati.",
      "Se vuoi, nel prossimo step possiamo migliorare il riconoscimento cercando con altri identificativi.",
    ].join(" ");
  }

  const top = contratti.slice(0, 3);

  const introName = cliente
    ? [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim()
    : [top[0]?.nome, top[0]?.cognome].filter(Boolean).join(" ").trim();

  const intro = introName
    ? `Ho trovato questi dati per ${introName}:`
    : "Ho trovato questi dati:";

  const lines = top.map((c, index) => {
    const pezzi = [
      `${index + 1}) ${c.operatore ?? "Operatore n.d."}`,
      c.categoria ?? null,
      c.tipo_contratto ?? null,
      c.offerta ? `offerta ${c.offerta}` : null,
      c.prodotto ? `prodotto ${c.prodotto}` : null,
      c.numero_contratto ? `n. ${c.numero_contratto}` : null,
      `stipula ${formatDate(c.data_stipula || c.created_at)}`,
    ].filter(Boolean);

    return pezzi.join(" · ");
  });

  const guidance =
    /offerta/i.test(message)
      ? "Questa è la migliore lettura disponibile nel CRM al momento."
      : "Se vuoi, nel prossimo step posso risponderti in modo ancora più preciso su offerta, operatore o data stipula.";

  return [intro, ...lines, guidance].join("\n");
}

async function askLocalAgent(
  prompt: string,
): Promise<string | null> {
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
  cliente: ClienteRow | null,
  contratti: ContrattoRow[],
): string {
  const context = {
    cliente: cliente
      ? {
          id: cliente.id,
          nome: cliente.nome,
          cognome: cliente.cognome,
          telefono: cliente.telefono,
          email: cliente.email,
          codice_fiscale: cliente.codice_fiscale,
          negozio_id: cliente.negozio_id,
          created_at: cliente.created_at,
        }
      : null,
    contratti: contratti.map((c) => ({
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
    "Sei l'assistente CRM Phonesia.",
    "Rispondi solo usando i dati CRM forniti qui sotto.",
    "Non inventare offerte, date o contratti mancanti.",
    "Se non hai un dato, dillo chiaramente.",
    "Rispondi in italiano, in modo utile e breve.",
    "",
    `Domanda utente: ${message}`,
    "",
    `Contesto CRM JSON: ${JSON.stringify(context)}`,
  ].join("\n");
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

    const deterministicReply = buildDeterministicReply(message, cliente, contratti);

    let finalReply = deterministicReply;
    let usedLocalAgent = false;

    try {
      const agentPrompt = buildAgentPrompt(message, cliente, contratti);
      const aiReply = await askLocalAgent(agentPrompt);

      if (aiReply && aiReply.trim()) {
        finalReply = aiReply.trim();
        usedLocalAgent = true;
      }
    } catch (agentError) {
      console.error("phonesia agent local fallback:", agentError);
    }

    return NextResponse.json({
      ok: true,
      reply: finalReply,
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
          }
        : null,
      contract_count: contratti.length,
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
