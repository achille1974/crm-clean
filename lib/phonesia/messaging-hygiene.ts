// Regole di igiene degli invii WhatsApp marketing Phonesia.
// Funzioni pure: nessun accesso a rete o database, testate in messaging-hygiene.test.ts.

/** Giorni minimi tra due messaggi marketing allo stesso cliente. */
export const MARKETING_COOLDOWN_DAYS = 14;
/** Dopo quanti "undeliverable" (131026) consecutivi il numero viene sospeso. */
export const UNDELIVERABLE_THRESHOLD = 2;

/** 131050: il cliente ha bloccato i messaggi marketing dell'azienda su WhatsApp. */
export const META_ERROR_MARKETING_OPT_OUT = "131050";
/** 131026: numero senza WhatsApp, app vecchia o che ha bloccato l'azienda. */
export const META_ERROR_UNDELIVERABLE = "131026";

export type DeliveryFailureKind = "marketing_opt_out" | "undeliverable" | null;

export function classifyDeliveryFailure(status: string | null | undefined, errorCode: string | number | null | undefined): DeliveryFailureKind {
  if (status !== "failed") return null;
  const code = errorCode == null ? "" : String(errorCode).trim();
  if (code === META_ERROR_MARKETING_OPT_OUT) return "marketing_opt_out";
  if (code === META_ERROR_UNDELIVERABLE) return "undeliverable";
  return null;
}

const STOP_PATTERNS = [
  /^stop$/, /^stop\s+(promo|messaggi|marketing|offerte)$/, /^basta$/, /^basta\s+(messaggi|promo|offerte)$/,
  /^cancellami$/, /^disiscrivimi$/, /^unsubscribe$/, /^annulla iscrizione$/,
  /^non (voglio|desidero) piu (ricevere )?(messaggi|promo|offerte|pubblicita)$/,
  /^non mandatemi piu (messaggi|promo|offerte)$/, /^no (promo|pubblicita|offerte)$/,
];

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

/** Riconosce una richiesta esplicita di non ricevere più messaggi. Solo frasi brevi e inequivocabili. */
export function isStopRequest(body: string | null | undefined): boolean {
  if (!body) return false;
  const text = normalizeText(body);
  if (!text || text.length > 60) return false;
  return STOP_PATTERNS.some((pattern) => pattern.test(text));
}

export type ConsentEvent = { tipo_evento: string; created_at?: string | null; id?: number | string | null };

/** Consenso marketing attivo = l'ultimo evento tra accepted/revoked è "marketing_accepted". */
export function hasActiveMarketingConsent(events: ConsentEvent[]): boolean {
  const relevant = events.filter((e) => e.tipo_evento === "marketing_accepted" || e.tipo_evento === "marketing_revoked");
  if (relevant.length === 0) return false;
  const sorted = [...relevant].sort((a, b) => {
    const ta = a.created_at ? Date.parse(a.created_at) : 0;
    const tb = b.created_at ? Date.parse(b.created_at) : 0;
    if (ta !== tb) return ta - tb;
    return Number(a.id ?? 0) - Number(b.id ?? 0);
  });
  return sorted[sorted.length - 1].tipo_evento === "marketing_accepted";
}

/** true se l'ultimo invio marketing è più recente del periodo di pausa. */
export function isWithinMarketingCooldown(lastMarketingAt: string | null | undefined, now: Date = new Date(), days = MARKETING_COOLDOWN_DAYS): boolean {
  if (!lastMarketingAt) return false;
  const last = Date.parse(lastMarketingAt);
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < days * 24 * 60 * 60 * 1000;
}

export function cooldownStartIso(now: Date = new Date(), days = MARKETING_COOLDOWN_DAYS): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Riceve gli ultimi esiti "failed/delivered/read" del numero, dal più recente.
 * Sospende quando gli ultimi N esiti sono tutti 131026 (nessuna consegna nel mezzo).
 */
export function shouldSuspendUndeliverable(recent: Array<{ status: string; error_code?: string | null }>, threshold = UNDELIVERABLE_THRESHOLD): boolean {
  let consecutive = 0;
  for (const item of recent) {
    if (item.status === "delivered" || item.status === "read") return false;
    if (item.status === "failed" && String(item.error_code ?? "") === META_ERROR_UNDELIVERABLE) {
      consecutive += 1;
      if (consecutive >= threshold) return true;
    }
  }
  return false;
}
