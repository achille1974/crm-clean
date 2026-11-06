import "server-only";
import { createHmac } from "node:crypto";

export function feedbackSecret(): string {
  const dedicated = process.env.PHONESIA_FEEDBACK_LINK_SECRET;
  if (dedicated && dedicated.length >= 32) return dedicated;
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serverKey || serverKey.length < 32) throw new Error("Feedback signing is not configured");
  // Domain-separated server-only key; neither key nor database credential appears in the URL.
  return createHmac("sha256", serverKey).update("phonesia-feedback-signing-key-v1").digest("hex");
}
