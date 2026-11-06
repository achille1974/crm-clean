// Browser-only persistence. No customer data is written in plaintext to storage.
export const QR_PENDING_TTL_MS = 72 * 60 * 60 * 1000;
export const QR_PENDING_LIMIT = 100;
export type QrSubmission = {
  nome: string; cognome: string; telefono: string; email: string; codice_fiscale: string;
  negozio_id: number; privacy_accepted: boolean; marketing_accepted: boolean;
};
export type PendingQr = {
  id: string; storeId: number; createdAt: number; expiresAt: number;
  attempts: number; nextAttemptAt: number; needsReview: boolean; lastStatus: number;
};
export type SealedQr = PendingQr & { iv: Uint8Array<ArrayBuffer>; ciphertext: ArrayBuffer };
export type QrStorage = {
  exclusive<T>(work: () => Promise<T>): Promise<T>;
  key(): Promise<CryptoKey>;
  all(): Promise<SealedQr[]>;
  put(entry: SealedQr): Promise<void>;
  remove(id: string): Promise<void>;
};
export type QrAttempt = { id: string; state: "saved" | "waiting" | "review" | "missing"; message?: string };

export async function sendQrSubmission(payload: QrSubmission, transport: typeof fetch = fetch) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await transport("/api/phonesia/qr/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload), signal: controller.signal, cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    return { saved: response.status === 202 && body?.ok === true, status: response.status,
      retryAfter: response.headers.get("retry-after"),
      message: typeof body?.error === "string" ? body.error.slice(0, 200) : undefined };
  } finally { clearTimeout(timer); }
}

export function qrRetryDelay(attempts: number, retryAfter: string | null, now: number) {
  const delays = [60_000, 300_000, 900_000, 3_600_000, 10_800_000, 21_600_000];
  const delay = delays[Math.min(Math.max(0, attempts - 1), delays.length - 1)];
  if (!retryAfter) return delay;
  const seconds = Number(retryAfter);
  const requested = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - now;
  return Number.isFinite(requested) ? Math.max(delay, Math.min(requested, QR_PENDING_TTL_MS)) : delay;
}

function metadata(entry: SealedQr): PendingQr {
  const { id, storeId, createdAt, expiresAt, attempts, nextAttemptAt, needsReview, lastStatus } = entry;
  return { id, storeId, createdAt, expiresAt, attempts, nextAttemptAt, needsReview, lastStatus };
}
function authenticatedMetadata(entry: PendingQr) {
  return new TextEncoder().encode(`${entry.id}:${entry.storeId}:${entry.createdAt}:${entry.expiresAt}`);
}

export class QrOutbox {
  private storage: QrStorage;
  private transport: typeof fetch;
  private now: () => number;
  constructor(storage: QrStorage, transport: typeof fetch = fetch, now = Date.now) {
    this.storage = storage; this.transport = transport; this.now = now;
  }

  private async entries() {
    const entries = await this.storage.all();
    const fresh: SealedQr[] = [];
    for (const entry of entries) {
      if (entry.expiresAt <= this.now()) await this.storage.remove(entry.id);
      else fresh.push(entry);
    }
    return fresh.sort((a, b) => a.createdAt - b.createdAt);
  }

  list(): Promise<PendingQr[]> {
    return this.storage.exclusive(async () => (await this.entries()).map(metadata));
  }

  enqueue(payload: QrSubmission, replacingId?: string): Promise<string> {
    return this.storage.exclusive(async () => {
      const encoded = new TextEncoder().encode(JSON.stringify(payload));
      if (encoded.length > 8192 || payload.privacy_accepted !== true) throw new Error("Invalid submission");
      const entries = await this.entries();
      const previous = replacingId ? entries.find((entry) => entry.id === replacingId) : undefined;
      // An edited form can replace only a paused submission for this store.
      if (previous && (!previous.needsReview || previous.storeId !== payload.negozio_id)) {
        throw new Error("Submission is not paused");
      }
      if (!previous && entries.length >= QR_PENDING_LIMIT) throw new Error("Pending submissions full");
      const createdAt = this.now();
      const entry: PendingQr = {
        id: previous?.id || crypto.randomUUID(), storeId: payload.negozio_id,
        createdAt, expiresAt: createdAt + QR_PENDING_TTL_MS, attempts: 0,
        nextAttemptAt: createdAt, needsReview: false, lastStatus: 0,
      };
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv, additionalData: authenticatedMetadata(entry) }, await this.storage.key(), encoded,
      );
      // Wait for the storage transaction to commit BEFORE making a network request.
      await this.storage.put({ ...entry, iv, ciphertext });
      return entry.id;
    });
  }

  private async decrypt(entry: SealedQr): Promise<QrSubmission> {
    const clear = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: entry.iv, additionalData: authenticatedMetadata(entry) },
      await this.storage.key(), entry.ciphertext,
    );
    return JSON.parse(new TextDecoder().decode(clear));
  }

  resumeForEditing(id: string, storeId: number): Promise<QrSubmission> {
    return this.storage.exclusive(async () => {
      const entry = (await this.entries()).find((candidate) => candidate.id === id && candidate.storeId === storeId);
      if (!entry) throw new Error("Submission not found");
      const payload = await this.decrypt(entry);
      await this.storage.put({ ...entry, needsReview: true });
      return payload;
    });
  }

  remove(id: string): Promise<void> {
    return this.storage.exclusive(() => this.storage.remove(id));
  }

  attempt(id: string, force = false): Promise<QrAttempt> {
    return this.storage.exclusive(async () => {
      const entry = (await this.entries()).find((candidate) => candidate.id === id);
      if (!entry) return { id, state: "missing" };
      if (entry.needsReview) return { id, state: "review" };
      if (entry.nextAttemptAt > this.now() && (!force || entry.lastStatus === 429)) return { id, state: "waiting" };
      let payload: QrSubmission;
      try { payload = await this.decrypt(entry); }
      catch {
        await this.storage.put({ ...entry, needsReview: true });
        return { id, state: "review", message: "Impossibile riaprire il modulo conservato su questo dispositivo." };
      }
      let status = 0; let retryAfter: string | null = null; let message: string | undefined;
      try {
        const result = await sendQrSubmission(payload, this.transport);
        if (result.saved) {
          await this.storage.remove(id);
          return { id, state: "saved" };
        }
        ({ status, retryAfter, message } = result);
      } catch { /* Preserve the submission also when the response is lost after a server commit. */ }
      const needsReview = [400, 413, 415, 422].includes(status);
      const attempts = entry.attempts + 1;
      await this.storage.put({ ...entry, attempts, lastStatus: status, needsReview,
        nextAttemptAt: this.now() + qrRetryDelay(attempts, retryAfter, this.now()) });
      return { id, state: needsReview ? "review" : "waiting", message };
    });
  }
}
