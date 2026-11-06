import { createHmac, timingSafeEqual } from "node:crypto";

export type MetaSignatureCheck =
  | { status: "valid" }
  | { status: "invalid"; reason: "missing_header" | "malformed_header" | "mismatch" }
  | { status: "not_configured" };

/**
 * Verifica l'header X-Hub-Signature-256 inviato da Meta sui webhook:
 * "sha256=" + HMAC-SHA256 del corpo grezzo con l'App Secret dell'app Meta.
 * Senza App Secret configurato restituisce "not_configured": il chiamante
 * decide se accettare (rollout graduale) o rifiutare.
 */
export function checkMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string | undefined,
): MetaSignatureCheck {
  if (!appSecret) return { status: "not_configured" };
  if (!signatureHeader) return { status: "invalid", reason: "missing_header" };

  const match = /^sha256=([0-9a-f]{64})$/i.exec(signatureHeader.trim());
  if (!match) return { status: "invalid", reason: "malformed_header" };

  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const received = Buffer.from(match[1], "hex");
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) {
    return { status: "invalid", reason: "mismatch" };
  }
  return { status: "valid" };
}
