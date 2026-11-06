// Arrivi da annuncio Facebook/Instagram "clic su WhatsApp" (CTWA).
// Logica pura, senza I/O: il webhook decide se e cosa rispondere con planCtwaResponse.
// Si risponde solo a chi ha scritto per primo (finestra di servizio aperta dal cliente).

export const CTWA_STORES: Record<1 | 2 | 3, string> = { 1: "Floridia", 2: "Augusta", 3: "Siracusa" };
export type CtwaStoreId = keyof typeof CTWA_STORES;
export const CTWA_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CTWA_SOURCE = "ctwa";

export type CtwaReferral = {
  source_type?: string;
  source_id?: string;
  source_url?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
};

export type CtwaArrival = {
  negozioId: CtwaStoreId;
  via: "referral" | "testo";
  negozioNonDeterminato: boolean;
  sourceType: string | null;
  sourceId: string | null;
  ctwaClid: string | null;
  headline: string | null;
};

const STORE_IDS = [1, 2, 3] as const;
const compact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
const PREFILLS = new Map<string, CtwaStoreId>(STORE_IDS.map((id) => [
  compact(`Ciao Phonesia ${CTWA_STORES[id]}! Vorrei restare in contatto.`), id,
]));

/** Negozio dal messaggio precompilato dell'annuncio (maiuscole e spazi ignorati). */
export function storeFromPrefill(body: string | null | undefined): CtwaStoreId | null {
  return PREFILLS.get(compact(body ?? "")) ?? null;
}

function storeFromReferralText(referral: CtwaReferral): CtwaStoreId | null {
  const text = `${referral.headline ?? ""} ${referral.body ?? ""}`.toLowerCase();
  const found = STORE_IDS.filter((id) => text.includes(CTWA_STORES[id].toLowerCase()));
  return found.length === 1 ? found[0] : null;
}

const clean = (value: unknown, max = 200) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

function asReferral(value: unknown): CtwaReferral | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const referral = value as CtwaReferral;
  return clean(referral.source_id) || clean(referral.ctwa_clid) || clean(referral.source_type) ? referral : null;
}

/** null se il messaggio non arriva da un annuncio. */
export function detectCtwaArrival(input: { body: string | null | undefined; referral: unknown }): CtwaArrival | null {
  const textStore = storeFromPrefill(input.body);
  const referral = asReferral(input.referral);
  if (referral) {
    const store = textStore ?? storeFromReferralText(referral);
    return {
      negozioId: store ?? 1,
      via: "referral",
      negozioNonDeterminato: store === null,
      sourceType: clean(referral.source_type, 40),
      sourceId: clean(referral.source_id, 100),
      ctwaClid: clean(referral.ctwa_clid, 500),
      headline: clean(referral.headline, 200),
    };
  }
  if (!textStore) return null;
  return {
    negozioId: textStore, via: "testo", negozioNonDeterminato: false,
    sourceType: null, sourceId: null, ctwaClid: null, headline: null,
  };
}

export function buildCtwaRegistrationReply(negozioId: CtwaStoreId, baseUrl: string) {
  const base = baseUrl.replace(/\/+$/, "");
  return [
    "Ciao, grazie per averci scritto!",
    `Per ricevere assistenza e offerte dal tuo negozio Phonesia di ${CTWA_STORES[negozioId]}, registrati qui in 20 secondi:`,
    `${base}/phonesia/qr?negozio=${negozioId}&src=${CTWA_SOURCE}`,
    "",
    "Nel modulo scegli tu quali comunicazioni ricevere. Puoi scriverci qui anche per qualsiasi domanda.",
  ].join("\n");
}

export function buildCtwaRegisteredReply(negozioNome: string) {
  return `Ciao! Sei già registrato con Phonesia ${negozioNome}: puoi scriverci qui per qualsiasi necessità.`;
}

const NEGOZI_NOMI: Record<number, string> = { ...CTWA_STORES, 4: "Avola", 5: "Tabacchino Floridia" };

export type CtwaPlan =
  | { action: "none" }
  | { action: "skip_24h" }
  | { action: "reply"; kind: "registrazione" | "gia_registrato"; text: string };

/**
 * - STOP/basta/cancellami: "none", gestisce l'opt-out esistente (nessuna risposta promozionale);
 * - al massimo una risposta automatica per numero ogni 24 ore;
 * - cliente già registrato: nessun link, solo conferma.
 */
export function planCtwaResponse(params: {
  arrival: CtwaArrival | null;
  isStop: boolean;
  clienteNegozioId: number | null | undefined;
  isCliente: boolean;
  lastReplyAt: string | Date | null | undefined;
  now: Date;
  baseUrl: string;
}): CtwaPlan {
  if (!params.arrival || params.isStop) return { action: "none" };
  if (params.lastReplyAt) {
    const last = new Date(params.lastReplyAt).getTime();
    if (Number.isFinite(last) && params.now.getTime() - last < CTWA_REPLY_WINDOW_MS) return { action: "skip_24h" };
  }
  if (params.isCliente) {
    const nome = NEGOZI_NOMI[Number(params.clienteNegozioId)] ?? CTWA_STORES[params.arrival.negozioId];
    return { action: "reply", kind: "gia_registrato", text: buildCtwaRegisteredReply(nome) };
  }
  return { action: "reply", kind: "registrazione", text: buildCtwaRegistrationReply(params.arrival.negozioId, params.baseUrl) };
}

/** Origine registrazione dal parametro src: solo slug brevi, altrimenti ignorata. */
export function parseRegistrationSource(value: unknown): string | null {
  return typeof value === "string" && /^[a-z0-9_-]{1,32}$/.test(value) ? value : null;
}

export type CtwaStatsRow = { negozio_id: number | null };
export function countByStore(rows: CtwaStatsRow[]) {
  return STORE_IDS.map((id) => ({
    negozioId: id, negozio: CTWA_STORES[id],
    totale: rows.filter((row) => Number(row.negozio_id) === id).length,
  }));
}
