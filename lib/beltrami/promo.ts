import "server-only";

import { createBeltramiSupabaseAdmin } from "./supabase";

const ROME_TIME_ZONE = "Europe/Rome";
const GRAPH_API_VERSION = "v23.0";
export const BELTRAMI_EXPECTED_PHONE_NUMBER_ID = "1175220209011211";
export const BELTRAMI_PROMO_TEMPLATE_NAME = "bel_promo_img_v1";
export const BELTRAMI_PROMO_TEMPLATE_LANGUAGE = "it";
export const BELTRAMI_PROMO_SOURCE = "beltrami_dashboard_promo";
export const BELTRAMI_PROMO_BODY_PARAMETER_NAME = "messaggio_promo";
const MAX_PROMO_NAME_LENGTH = 120;
const MAX_PROMO_MESSAGE_LENGTH = 900;
const STOP_WORDS = new Set(["STOP", "ANNULLA", "DISISCRIVI", "BASTA", "NO"]);

type BeltramiSupabaseAdmin = ReturnType<typeof createBeltramiSupabaseAdmin>;

export type BeltramiPromoClienteRow = {
  id: number;
  created_at: string | null;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  telefono_normalizzato: string | null;
  email: string | null;
  privacy_consent: boolean | null;
  whatsapp_consent: boolean | null;
  whatsapp_active: boolean | null;
};

export type BeltramiPromoCandidate = BeltramiPromoClienteRow & {
  nome_completo: string;
  has_marketing_consent: boolean;
  has_stop_opt_out: boolean;
  promo_eligible: boolean;
};

export type BeltramiPromoDashboardData = {
  q: string;
  rows: BeltramiPromoCandidate[];
  counts: {
    total: number;
    idonei: number;
    senzaConsensoMarketing: number;
    senzaWhatsappOTelefono: number;
    optOut: number;
  };
  warnings: string[];
};

export type BeltramiPromoPreflightInput = {
  clienteIds: number[];
  promoName: string;
  messageText: string;
  imageUrl: string;
  templateName?: string;
};

export type BeltramiPromoPreflightItem = {
  clienteId: number;
  clienteNome: string;
  telefono: string | null;
  status:
    | "sendable"
    | "not_found"
    | "missing_privacy"
    | "missing_whatsapp_or_phone"
    | "missing_marketing"
    | "opt_out"
    | "duplicate_promo";
  reason: string;
};

export type BeltramiPromoPreflightResult = {
  ok: boolean;
  promoKey: string;
  promoName: string;
  messageText: string;
  imageUrl: string;
  imagePresent: boolean;
  templateName: string;
  counts: {
    selezionati: number;
    trovati: number;
    idonei: number;
    senzaConsensoPrivacy: number;
    senzaConsensoMarketing: number;
    senzaWhatsappOTelefono: number;
    optOut: number;
    giaContattatiPromo: number;
    inviabiliEffettivi: number;
  };
  items: BeltramiPromoPreflightItem[];
  errors: string[];
};

type PromoMetaSendResult = {
  status: "sent" | "failed" | "skipped";
  reason: string;
  whatsappMessageId: string | null;
  parameterFormat: "named" | null;
  rawJson: Record<string, unknown> | null;
  errorDetails: Record<string, unknown> | null;
};

type PromoMessageRow = {
  id: number;
  cliente_id: number | null;
  metadata: Record<string, unknown> | null;
};

type StopMessageRow = {
  cliente_id: number | null;
  body: string | null;
};

function compactSpaces(value: unknown): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function normalizePromoName(value: unknown): string {
  return compactSpaces(value).slice(0, MAX_PROMO_NAME_LENGTH);
}

export function sanitizeBeltramiPromoMessage(value: unknown): string {
  return compactSpaces(value).slice(0, MAX_PROMO_MESSAGE_LENGTH);
}

function removeDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function slugifyPromoName(value: string): string {
  return removeDiacritics(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72);
}

function getRomeYearMonth(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  return `${year}${month}`;
}

export function buildBeltramiPromoKey(promoName: string, date = new Date()): string {
  const slug = slugifyPromoName(promoName).replace(/^promo_+/, "");
  if (!slug) return "";
  return `bel_promo_${slug}_${getRomeYearMonth(date)}`;
}

export function normalizeBeltramiPromoImageUrl(value: unknown): string | null {
  const text = compactSpaces(value);
  if (!text) return null;

  try {
    const url = new URL(text);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeTemplateName(value: unknown): string {
  const text = compactSpaces(value || BELTRAMI_PROMO_TEMPLATE_NAME).toLowerCase();
  return text || BELTRAMI_PROMO_TEMPLATE_NAME;
}

function getClienteName(row: BeltramiPromoClienteRow | null | undefined): string {
  return [row?.nome, row?.cognome].filter(Boolean).join(" ").trim() || "Cliente Beltrami";
}

function getClientePhone(row: BeltramiPromoClienteRow | null | undefined): string | null {
  return row?.telefono_normalizzato || row?.telefono || null;
}

function normalizeStopBody(value: string | null): string {
  return compactSpaces(value).toUpperCase();
}

function toMetaRecipient(rawPhone: string | null): string | null {
  const cleaned = String(rawPhone ?? "").trim().replace(/[^\d+]/g, "");
  const numeric = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;
  return /^\d+$/.test(numeric) ? numeric : null;
}

function buildClienteQuery(supabase: BeltramiSupabaseAdmin, q: string, limit: number) {
  let query = supabase
    .from("beltrami_clienti")
    .select(
      "id, created_at, nome, cognome, telefono, telefono_normalizzato, email, privacy_consent, whatsapp_consent, whatsapp_active",
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  const search = compactSpaces(q);
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    const pattern = `%${escaped}%`;
    query = query.or(
      [
        `nome.ilike.${pattern}`,
        `cognome.ilike.${pattern}`,
        `telefono.ilike.${pattern}`,
        `telefono_normalizzato.ilike.${pattern}`,
        `email.ilike.${pattern}`,
      ].join(","),
    );
  }

  return query;
}

async function fetchMarketingIds(supabase: BeltramiSupabaseAdmin, clienteIds: number[]) {
  if (clienteIds.length === 0) return new Set<number>();

  const { data, error } = await supabase
    .from("beltrami_consensi")
    .select("cliente_id")
    .eq("tipo_evento", "marketing_accepted")
    .in("cliente_id", clienteIds);

  if (error) throw error;

  return new Set(
    ((data ?? []) as Array<{ cliente_id: number | null }>)
      .map((row) => Number(row.cliente_id))
      .filter((id) => Number.isFinite(id)),
  );
}

async function fetchStopOptOutIds(supabase: BeltramiSupabaseAdmin, clienteIds: number[]) {
  if (clienteIds.length === 0) return new Set<number>();

  const { data, error } = await supabase
    .from("beltrami_whatsapp_messages")
    .select("cliente_id, body")
    .eq("direction", "inbound")
    .in("cliente_id", clienteIds)
    .order("created_at", { ascending: false })
    .limit(Math.max(100, clienteIds.length * 10));

  if (error) throw error;

  const ids = new Set<number>();
  for (const row of (data ?? []) as StopMessageRow[]) {
    const clienteId = Number(row.cliente_id);
    if (!Number.isFinite(clienteId)) continue;
    if (STOP_WORDS.has(normalizeStopBody(row.body))) {
      ids.add(clienteId);
    }
  }

  return ids;
}

async function fetchDuplicatePromoIds(
  supabase: BeltramiSupabaseAdmin,
  clienteIds: number[],
  promoKey: string,
) {
  if (clienteIds.length === 0 || !promoKey) return new Set<number>();

  const { data, error } = await supabase
    .from("beltrami_whatsapp_messages")
    .select("id, cliente_id, metadata")
    .eq("direction", "outbound")
    .eq("message_kind", "template_promo")
    .contains("metadata", { promo_key: promoKey })
    .in("cliente_id", clienteIds)
    .limit(Math.max(100, clienteIds.length * 5));

  if (error) throw error;

  return new Set(
    ((data ?? []) as PromoMessageRow[])
      .filter((row) => row.metadata?.source === BELTRAMI_PROMO_SOURCE)
      .map((row) => Number(row.cliente_id))
      .filter((id) => Number.isFinite(id)),
  );
}

function isBasePromoEligible(
  cliente: BeltramiPromoClienteRow,
  marketingIds: Set<number>,
  stopOptOutIds: Set<number>,
) {
  return (
    cliente.privacy_consent === true &&
    cliente.whatsapp_consent === true &&
    Boolean(getClientePhone(cliente)) &&
    marketingIds.has(cliente.id) &&
    !stopOptOutIds.has(cliente.id)
  );
}

export async function getBeltramiPromoDashboardData(params: {
  q?: string;
  limit?: number;
} = {}): Promise<BeltramiPromoDashboardData> {
  const q = compactSpaces(params.q);
  const supabase = createBeltramiSupabaseAdmin();
  const warnings: string[] = [];
  const { data, error } = await buildClienteQuery(supabase, q, params.limit ?? 500);

  if (error) throw error;

  const clienti = ((data ?? []) as BeltramiPromoClienteRow[]).map((row) => ({
    ...row,
    id: Number(row.id),
  }));
  const clienteIds = clienti.map((row) => row.id);
  const [marketingIds, stopOptOutIds] = await Promise.all([
    fetchMarketingIds(supabase, clienteIds),
    fetchStopOptOutIds(supabase, clienteIds),
  ]);

  const allRows = clienti.map((cliente) => {
    const hasMarketingConsent = marketingIds.has(cliente.id);
    const hasStopOptOut = stopOptOutIds.has(cliente.id);
    return {
      ...cliente,
      nome_completo: getClienteName(cliente),
      has_marketing_consent: hasMarketingConsent,
      has_stop_opt_out: hasStopOptOut,
      promo_eligible: isBasePromoEligible(cliente, marketingIds, stopOptOutIds),
    };
  });

  if (marketingIds.size === 0) {
    warnings.push(
      "Nessun consenso promozionale WhatsApp risulta ancora registrato per i clienti caricati.",
    );
  }

  return {
    q,
    rows: allRows.filter((row) => row.promo_eligible),
    counts: {
      total: allRows.length,
      idonei: allRows.filter((row) => row.promo_eligible).length,
      senzaConsensoMarketing: allRows.filter((row) => !row.has_marketing_consent).length,
      senzaWhatsappOTelefono: allRows.filter(
        (row) => row.whatsapp_consent !== true || !getClientePhone(row),
      ).length,
      optOut: allRows.filter((row) => row.has_stop_opt_out).length,
    },
    warnings,
  };
}

function makePreflightErrorResult(input: {
  promoName: string;
  messageText: string;
  imageUrl: string | null;
  templateName: string;
  promoKey: string;
  clienteIds: number[];
  errors: string[];
}): BeltramiPromoPreflightResult {
  return {
    ok: false,
    promoKey: input.promoKey,
    promoName: input.promoName,
    messageText: input.messageText,
    imageUrl: input.imageUrl ?? "",
    imagePresent: Boolean(input.imageUrl),
    templateName: input.templateName,
    counts: {
      selezionati: input.clienteIds.length,
      trovati: 0,
      idonei: 0,
      senzaConsensoPrivacy: 0,
      senzaConsensoMarketing: 0,
      senzaWhatsappOTelefono: 0,
      optOut: 0,
      giaContattatiPromo: 0,
      inviabiliEffettivi: 0,
    },
    items: [],
    errors: input.errors,
  };
}

export async function runBeltramiPromoPreflight(
  input: BeltramiPromoPreflightInput,
): Promise<BeltramiPromoPreflightResult> {
  const clienteIds = [
    ...new Set(
      input.clienteIds
        .map((id) => Number(id))
        .filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  const promoName = normalizePromoName(input.promoName);
  const messageText = sanitizeBeltramiPromoMessage(input.messageText);
  const imageUrl = normalizeBeltramiPromoImageUrl(input.imageUrl);
  const templateName = normalizeTemplateName(input.templateName);
  const promoKey = buildBeltramiPromoKey(promoName);
  const errors: string[] = [];

  if (clienteIds.length === 0) errors.push("Seleziona almeno un cliente idoneo.");
  if (promoName.length < 3) errors.push("Nome promo obbligatorio.");
  if (!promoKey) errors.push("promo_key non generabile dal nome promo.");
  if (!messageText) errors.push("Messaggio promo obbligatorio.");
  if (!imageUrl) errors.push("URL immagine pubblico HTTPS obbligatorio.");
  if (templateName !== BELTRAMI_PROMO_TEMPLATE_NAME) {
    errors.push(`Template non valido per V1: usa ${BELTRAMI_PROMO_TEMPLATE_NAME}.`);
  }

  if (errors.length > 0) {
    return makePreflightErrorResult({
      promoName,
      messageText,
      imageUrl,
      templateName,
      promoKey,
      clienteIds,
      errors,
    });
  }

  const supabase = createBeltramiSupabaseAdmin();
  const [
    { data: clientiData, error: clientiError },
    marketingIds,
    stopOptOutIds,
    duplicatePromoIds,
  ] = await Promise.all([
    supabase
      .from("beltrami_clienti")
      .select(
        "id, created_at, nome, cognome, telefono, telefono_normalizzato, email, privacy_consent, whatsapp_consent, whatsapp_active",
      )
      .in("id", clienteIds),
    fetchMarketingIds(supabase, clienteIds),
    fetchStopOptOutIds(supabase, clienteIds),
    fetchDuplicatePromoIds(supabase, clienteIds, promoKey),
  ]);

  if (clientiError) throw clientiError;

  const clientiById = new Map<number, BeltramiPromoClienteRow>();
  for (const row of (clientiData ?? []) as BeltramiPromoClienteRow[]) {
    clientiById.set(Number(row.id), { ...row, id: Number(row.id) });
  }

  const items: BeltramiPromoPreflightItem[] = clienteIds.map((clienteId) => {
    const cliente = clientiById.get(clienteId) ?? null;
    const clienteNome = getClienteName(cliente);
    const telefono = getClientePhone(cliente);

    if (!cliente) {
      return {
        clienteId,
        clienteNome,
        telefono,
        status: "not_found",
        reason: "Cliente non trovato.",
      };
    }

    if (cliente.privacy_consent !== true) {
      return {
        clienteId,
        clienteNome,
        telefono,
        status: "missing_privacy",
        reason: "Consenso privacy assente.",
      };
    }

    if (cliente.whatsapp_consent !== true || !telefono) {
      return {
        clienteId,
        clienteNome,
        telefono,
        status: "missing_whatsapp_or_phone",
        reason: "Consenso WhatsApp/contatto o telefono assente.",
      };
    }

    if (!marketingIds.has(clienteId)) {
      return {
        clienteId,
        clienteNome,
        telefono,
        status: "missing_marketing",
        reason: "Consenso promozionale WhatsApp assente.",
      };
    }

    if (stopOptOutIds.has(clienteId)) {
      return {
        clienteId,
        clienteNome,
        telefono,
        status: "opt_out",
        reason: "Cliente escluso per STOP/opt-out WhatsApp.",
      };
    }

    if (duplicatePromoIds.has(clienteId)) {
      return {
        clienteId,
        clienteNome,
        telefono,
        status: "duplicate_promo",
        reason: "Promo gia inviata a questo cliente.",
      };
    }

    return {
      clienteId,
      clienteNome,
      telefono,
      status: "sendable",
      reason: "Inviabile.",
    };
  });

  const countStatus = (status: BeltramiPromoPreflightItem["status"]) =>
    items.filter((item) => item.status === status).length;
  const idonei =
    items.length -
    countStatus("not_found") -
    countStatus("missing_privacy") -
    countStatus("missing_whatsapp_or_phone") -
    countStatus("missing_marketing") -
    countStatus("opt_out");

  return {
    ok: countStatus("sendable") > 0,
    promoKey,
    promoName,
    messageText,
    imageUrl: imageUrl ?? "",
    imagePresent: Boolean(imageUrl),
    templateName,
    counts: {
      selezionati: clienteIds.length,
      trovati: clientiById.size,
      idonei,
      senzaConsensoPrivacy: countStatus("missing_privacy"),
      senzaConsensoMarketing: countStatus("missing_marketing"),
      senzaWhatsappOTelefono: countStatus("missing_whatsapp_or_phone"),
      optOut: countStatus("opt_out"),
      giaContattatiPromo: countStatus("duplicate_promo"),
      inviabiliEffettivi: countStatus("sendable"),
    },
    items,
    errors: [],
  };
}

function buildMetaPromoPayload(params: {
  to: string;
  templateName: string;
  imageUrl: string;
  messageText: string;
}) {
  return {
    messaging_product: "whatsapp",
    to: params.to,
    type: "template",
    template: {
      name: params.templateName,
      language: {
        code: BELTRAMI_PROMO_TEMPLATE_LANGUAGE,
      },
      components: [
        {
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                link: params.imageUrl,
              },
            },
          ],
        },
        {
          type: "body",
          parameters: [
            {
              type: "text",
              parameter_name: BELTRAMI_PROMO_BODY_PARAMETER_NAME,
              text: params.messageText,
            },
          ],
        },
      ],
    },
  };
}

function isMetaParameterShapeError(errorDetails: Record<string, unknown> | null) {
  const code = errorDetails?.code;
  const message = String(errorDetails?.message ?? "").toLowerCase();
  return (
    code === 132012 ||
    code === 132000 ||
    code === 100 ||
    message.includes("parameter format does not match") ||
    message.includes("number of parameters does not match") ||
    message.includes("invalid parameter")
  );
}

async function readMetaErrorResponse(response: Response) {
  const text = await response.text().catch(() => "");
  const parsed = text
    ? await Promise.resolve()
        .then(() => JSON.parse(text) as Record<string, unknown>)
        .catch(() => null)
    : null;
  const rawError =
    parsed && typeof parsed.error === "object" && parsed.error !== null
      ? (parsed.error as Record<string, unknown>)
      : {};
  const errorDetails = {
    message: typeof rawError.message === "string" ? rawError.message : null,
    type: typeof rawError.type === "string" ? rawError.type : null,
    code:
      typeof rawError.code === "number" || typeof rawError.code === "string"
        ? rawError.code
        : null,
    error_subcode:
      typeof rawError.error_subcode === "number" || typeof rawError.error_subcode === "string"
        ? rawError.error_subcode
        : null,
    fbtrace_id: typeof rawError.fbtrace_id === "string" ? rawError.fbtrace_id : null,
    http_status: response.status,
    response_status: response.statusText || null,
  };

  return {
    errorDetails,
    rawJson: {
      response: {
        http_status: response.status,
        response_status: response.statusText || null,
      },
      ...(Object.keys(rawError).length > 0 ? { error: rawError } : {}),
    },
  };
}

export async function sendBeltramiPromoImageMessage(params: {
  telefono: string | null;
  templateName: string;
  imageUrl: string;
  messageText: string;
}): Promise<PromoMetaSendResult> {
  const accessToken = process.env.BELTRAMI_WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID;

  if (!accessToken || !phoneNumberId) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      whatsappMessageId: null,
      parameterFormat: null,
      rawJson: null,
      errorDetails: null,
    };
  }

  if (phoneNumberId !== BELTRAMI_EXPECTED_PHONE_NUMBER_ID) {
    return {
      status: "skipped",
      reason: "unexpected_phone_number_id",
      whatsappMessageId: null,
      parameterFormat: null,
      rawJson: null,
      errorDetails: {
        expected_phone_number_id: BELTRAMI_EXPECTED_PHONE_NUMBER_ID,
        configured_phone_number_id: phoneNumberId,
      },
    };
  }

  const to = toMetaRecipient(params.telefono);
  if (!to) {
    return {
      status: "skipped",
      reason: "invalid_phone",
      whatsappMessageId: null,
      parameterFormat: null,
      rawJson: null,
      errorDetails: null,
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          buildMetaPromoPayload({
            to,
            templateName: params.templateName,
            imageUrl: params.imageUrl,
            messageText: params.messageText,
          }),
        ),
      },
    );

    if (response.ok) {
      const result = (await response.json().catch(() => null)) as
        | { messages?: Array<{ id?: string }> }
        | null;

      return {
        status: "sent",
        reason: "sent",
        whatsappMessageId: result?.messages?.[0]?.id ?? null,
        parameterFormat: "named",
        rawJson: null,
        errorDetails: null,
      };
    }

    const metaError = await readMetaErrorResponse(response);
    return {
      status: "failed",
      reason: isMetaParameterShapeError(metaError.errorDetails)
        ? "meta_template_parameter_mismatch"
        : "meta_rejected",
      whatsappMessageId: null,
      parameterFormat: "named",
      rawJson: metaError.rawJson,
      errorDetails: metaError.errorDetails,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      whatsappMessageId: null,
      parameterFormat: "named",
      rawJson: null,
      errorDetails: null,
    };
  }
}

export async function insertBeltramiPromoMessage(params: {
  supabase: BeltramiSupabaseAdmin;
  clienteId: number;
  toPhone: string | null;
  promoKey: string;
  promoName: string;
  messageText: string;
  imageUrl: string;
  templateName: string;
  sendResult: PromoMetaSendResult;
}) {
  const metadata = {
    promo_key: params.promoKey,
    promo_name: params.promoName,
    template_name: params.templateName,
    message_text: params.messageText,
    image_url: params.imageUrl,
    cliente_id: params.clienteId,
    source: BELTRAMI_PROMO_SOURCE,
    header_kind: "image",
    template_language: BELTRAMI_PROMO_TEMPLATE_LANGUAGE,
    body_parameter_names: [BELTRAMI_PROMO_BODY_PARAMETER_NAME],
    parameter_format: params.sendResult.parameterFormat,
    meta_error_details: params.sendResult.errorDetails,
  };

  const { error } = await params.supabase.from("beltrami_whatsapp_messages").insert({
    cliente_id: params.clienteId,
    direction: "outbound",
    message_kind: "template_promo",
    routing_status: "beltrami",
    to_phone: params.toPhone,
    body: params.messageText,
    template_name: params.templateName,
    whatsapp_message_id: params.sendResult.whatsappMessageId,
    status: params.sendResult.status,
    status_reason: params.sendResult.reason,
    raw_json: params.sendResult.rawJson,
    metadata,
  });

  if (error) throw error;

  if (params.sendResult.status === "sent") {
    const { error: updateError } = await params.supabase
      .from("beltrami_clienti")
      .update({
        last_whatsapp_outbound_at: new Date().toISOString(),
        last_whatsapp_outbound_message_id: params.sendResult.whatsappMessageId,
        last_whatsapp_outbound_kind: "template_promo",
      })
      .eq("id", params.clienteId);

    if (updateError) throw updateError;
  }
}
