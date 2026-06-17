export const BELTRAMI_QR_ID = "beltrami_1876_qr";
export const BELTRAMI_SOURCE = "qr_beltrami_1876";
export const BELTRAMI_PRIVACY_VERSION = "beltrami_privacy_v1";

// Catalogo servizi per backoffice/import futuri: non viene mostrato nel form QR cliente.
export const BELTRAMI_SERVICES = [
  "Prima Assicurazioni",
  "Conte.it",
  "Namirial PEC",
  "Namirial SPID",
  "Namirial Firma Digitale",
] as const;

export type BeltramiService = (typeof BELTRAMI_SERVICES)[number];

export function isBeltramiService(value: string): value is BeltramiService {
  return BELTRAMI_SERVICES.includes(value as BeltramiService);
}

export function normalizeBeltramiServiceInterest(value: unknown): BeltramiService | null {
  const normalized = String(value ?? "").trim();
  return normalized && isBeltramiService(normalized) ? normalized : null;
}
