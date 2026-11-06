import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export function signFeedbackToken(clienteId: number, secret: string, now = Date.now()): string {
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0 || secret.length < 32) throw new Error("Invalid feedback signing configuration");
  const value = `${clienteId}.${Math.floor(now / 1000) + 30 * 86400}.${randomBytes(16).toString("base64url")}`;
  const signature = createHmac("sha256", secret).update(`phonesia-feedback-v1:${value}`).digest("base64url");
  return `${value}.${signature}`;
}

export function verifyFeedbackToken(token: unknown, secret: string, now = Date.now()): { clienteId: number; hash: string } | null {
  if (typeof token !== "string" || token.length > 200 || secret.length < 32) return null;
  const match = /^(\d{1,16})\.(\d{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return null;
  const clienteId = Number(match[1]);
  const expiry = Number(match[2]);
  if (!Number.isSafeInteger(clienteId) || clienteId <= 0 || expiry <= Math.floor(now / 1000) || expiry > Math.floor(now / 1000) + 31 * 86400) return null;
  const value = token.slice(0, token.lastIndexOf("."));
  const expected = createHmac("sha256", secret).update(`phonesia-feedback-v1:${value}`).digest();
  const received = Buffer.from(match[4], "base64url");
  if (received.toString("base64url") !== match[4] || expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  return { clienteId, hash: createHash("sha256").update(token).digest("hex") };
}
