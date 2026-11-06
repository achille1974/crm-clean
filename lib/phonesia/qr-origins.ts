// Keep registration, redirects, deployment tests and monitoring on one allowlist.
export const QR_CANONICAL_ORIGIN = "https://app.crm-supreme.it";
const QR_STABLE_ORIGIN = "https://crm-clean.vercel.app";
export const QR_LEGACY_ORIGINS = [
  QR_STABLE_ORIGIN,
  "https://crm-clean-achille-beltramis-projects.vercel.app",
] as const;
export const QR_PRODUCTION_ORIGINS = [QR_CANONICAL_ORIGIN, ...QR_LEGACY_ORIGINS];
// The team alias is behind Vercel SSO. Only these two domains are public QR entry points.
export const QR_PUBLIC_ORIGINS = [QR_CANONICAL_ORIGIN, QR_STABLE_ORIGIN];

export type QrOriginEnvironment = {
  NEXT_PUBLIC_BASE_URL?: string;
  VERCEL_URL?: string;
  VERCEL?: string;
  NODE_ENV?: string;
};

export function qrAllowedOrigins(env: QrOriginEnvironment): Set<string> {
  const allowed = new Set<string>();
  if (env.NEXT_PUBLIC_BASE_URL) {
    const base = new URL(env.NEXT_PUBLIC_BASE_URL).origin;
    allowed.add(base);
    if (env.VERCEL === "1" && base === QR_CANONICAL_ORIGIN) {
      for (const origin of QR_LEGACY_ORIGINS) allowed.add(origin);
    }
  }
  if (env.VERCEL_URL) allowed.add(new URL(`https://${env.VERCEL_URL}`).origin);
  return allowed;
}

export function qrCanonicalRedirect(
  host: string | null, pathname: string, search: string, method: string, env: QrOriginEnvironment,
): string | null {
  if (pathname !== "/phonesia/qr" || !["GET", "HEAD"].includes(method)) return null;
  if (env.VERCEL !== "1" || !env.NEXT_PUBLIC_BASE_URL
    || new URL(env.NEXT_PUBLIC_BASE_URL).origin !== QR_CANONICAL_ORIGIN) return null;
  if (!QR_LEGACY_ORIGINS.some((origin) => new URL(origin).host === host)) return null;
  // The destination is fixed; neither Host nor query parameters can choose it.
  return `${QR_CANONICAL_ORIGIN}${pathname}${search}`;
}
