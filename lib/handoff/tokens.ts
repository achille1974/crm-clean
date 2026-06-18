import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const DEFAULT_TOKEN_BYTES = 32;

function normalizeToken(value: string) {
  return value.trim();
}

export function generateHandoffToken(bytes = DEFAULT_TOKEN_BYTES): string {
  if (!Number.isInteger(bytes) || bytes < 16) {
    throw new Error("Handoff token must use at least 16 random bytes.");
  }

  return randomBytes(bytes).toString("base64url");
}

export function hashHandoffToken(token: string): string {
  const normalized = normalizeToken(token);

  if (!normalized) {
    throw new Error("Handoff token is required.");
  }

  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export function verifyHandoffToken(params: {
  token: string;
  expectedHash: string;
}): boolean {
  const tokenHash = hashHandoffToken(params.token);
  const expectedHash = normalizeToken(params.expectedHash);

  if (!/^[a-f0-9]{64}$/i.test(expectedHash)) {
    return false;
  }

  return timingSafeEqual(Buffer.from(tokenHash, "hex"), Buffer.from(expectedHash, "hex"));
}

