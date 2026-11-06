import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { qrAllowedOrigins } from "./qr-origins.ts";
import { parseRegistrationSource } from "./ctwa.ts";

export class QrRequestError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type QrRegistration = {
  nome: string;
  cognome: string;
  telefono: string;
  email: string | null;
  codiceFiscale: string;
  negozioId: number;
  marketingAccepted: boolean;
  /** Origine della registrazione (es. "ctwa"); null = QR in negozio come oggi. */
  src: string | null;
};

export function parseQrRegistration(body: unknown): QrRegistration {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new QrRequestError("Dati di registrazione non validi.");
  }
  const value = body as Record<string, unknown>;
  const field = (key: string, max: number) => {
    const input = value[key];
    if (typeof input !== "string" || input.trim().length > max || /[\u0000-\u001f\u007f]/.test(input)) {
      throw new QrRequestError("Dati di registrazione non validi.");
    }
    return input.trim();
  };
  const nome = field("nome", 100);
  const cognome = field("cognome", 100);
  const telefono = field("telefono", 10);
  const codiceFiscale = field("codice_fiscale", 16).toUpperCase();
  const email = field("email", 254).toLowerCase() || null;
  const negozioId = value.negozio_id;
  if (!nome || !cognome || !/^[0-9]{9,10}$/.test(telefono)) {
    throw new QrRequestError("Controlla nome, cognome e numero di telefono.");
  }
  if (!/^(?:[A-Z0-9]{16}|[0-9]{11})$/.test(codiceFiscale)) {
    throw new QrRequestError("Controlla il codice fiscale.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new QrRequestError("Controlla l’indirizzo email.");
  }
  if (typeof negozioId !== "number" || !Number.isInteger(negozioId) || negozioId < 1 || negozioId > 5) {
    throw new QrRequestError("Punto vendita non valido.");
  }
  if (value.privacy_accepted !== true || typeof value.marketing_accepted !== "boolean") {
    throw new QrRequestError("Conferma la lettura dell’informativa privacy.");
  }
  return { nome, cognome, telefono: `+39${telefono}`, email, codiceFiscale, negozioId, marketingAccepted: value.marketing_accepted,
    src: parseRegistrationSource(value.src) };
}

type QrEnvironment = {
  NEXT_PUBLIC_BASE_URL?: string;
  VERCEL_URL?: string;
  VERCEL?: string;
  NODE_ENV?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function verifyQrOrigin(request: Request, env: QrEnvironment) {
  const origin = request.headers.get("origin");
  const allowed = qrAllowedOrigins(env);
  if (env.NODE_ENV !== "production") allowed.add(new URL(request.url).origin);
  if (!origin || !allowed.has(origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new QrRequestError("Origine della richiesta non valida.", 403);
  }
}

// Trust forwarding headers only on Vercel, where the platform overwrites them.
// Self-hosted deployments share a conservative bucket until a trusted proxy is configured.
export function qrRequestHashes(request: Request, telefono: string, env: QrEnvironment) {
  const secret = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Missing Phonesia server configuration");
  let clientIp = "self-hosted";
  if (env.VERCEL === "1") {
    clientIp = (request.headers.get("x-vercel-forwarded-for") || request.headers.get("x-forwarded-for") || "")
      .split(",")[0].trim();
    if (!isIP(clientIp)) throw new QrRequestError("Richiesta non verificabile.", 400);
  }
  const hash = (kind: string, input: string) => createHmac("sha256", secret)
    .update(`phonesia-qr:${kind}:${input}`).digest("hex");
  return { ipHash: hash("ip", clientIp), phoneHash: hash("phone", telefono) };
}

export async function readQrJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new QrRequestError("Formato della richiesta non valido.", 415);
  }
  const limit = 8192;
  if (Number(request.headers.get("content-length")) > limit) {
    throw new QrRequestError("Richiesta troppo grande.", 413);
  }
  const reader = request.body?.getReader();
  if (!reader) throw new QrRequestError("Dati di registrazione mancanti.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new QrRequestError("Richiesta troppo grande.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new QrRequestError("Dati di registrazione non validi.");
  }
}
