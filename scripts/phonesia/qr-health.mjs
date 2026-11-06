import { QR_CANONICAL_ORIGIN, QR_LEGACY_ORIGINS, QR_PUBLIC_ORIGINS } from "../../lib/phonesia/qr-origins.ts";

// All probes are deliberately invalid or read-only: no customer/consent writes or welcome messages.
export async function probeQr({ transport = fetch, localBase, allStores = false, checkReadiness = true } = {}) {
  const checks = [];
  async function check(name, operation) {
    try { checks.push({ name, ...await operation() }); }
    catch { checks.push({ name, ok: false, error: "network_or_timeout" }); }
  }
  const request = (url, options = {}) => transport(url, {
    ...options, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(12_000),
  });
  await Promise.all(QR_PUBLIC_ORIGINS.map(async (origin) => {
    await check(`registration_origin:${origin}`, async () => {
      const res = await request(`${localBase || origin}/api/phonesia/qr/register`, {
        method: "POST", headers: { "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin" }, body: "{}",
      });
      const body = await res.json().catch(() => null);
      return { ok: res.status === 400 && body?.code === "invalid_request", status: res.status,
        code: body?.code || null, request_id: body?.request_id || null };
    });
    for (const store of allStores ? [1, 2, 3, 4, 5] : [1]) {
      await check(`qr_page:${origin}:store_${store}`, async () => {
        const path = `/phonesia/qr?negozio=${store}&source=monitor`;
        const res = await request(`${localBase || origin}${path}`, {
          headers: localBase ? { Host: new URL(origin).host } : {},
        });
        const legacy = QR_LEGACY_ORIGINS.includes(origin);
        const location = res.headers.get("location");
        const html = legacy ? "" : await res.text();
        return { ok: legacy
          ? res.status === 307 && location === `${QR_CANONICAL_ORIGIN}${path}`
          : res.status === 200 && html.includes("Completa la tua registrazione") && /no-store/.test(res.headers.get("cache-control") || ""),
        status: res.status, location };
      });
    }
  }));
  await check("untrusted_origin_rejected", async () => {
    const res = await request(`${localBase || QR_CANONICAL_ORIGIN}/api/phonesia/qr/register`, {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://untrusted.example.invalid" }, body: "{}",
    });
    const body = await res.json().catch(() => null);
    return { ok: res.status === 403 && body?.code === "origin_rejected", status: res.status };
  });
  await check("private_api_requires_login", async () => {
    const res = await request(`${localBase || QR_CANONICAL_ORIGIN}/api/phonesia/stats`);
    return { ok: res.status === 401, status: res.status };
  });
  if (checkReadiness) await check("server_database_and_rpc", async () => {
    const res = await request(`${localBase || QR_CANONICAL_ORIGIN}/api/phonesia/qr/register`, {
      headers: { Origin: QR_CANONICAL_ORIGIN, "Sec-Fetch-Site": "same-origin" },
    });
    const body = await res.json().catch(() => null);
    return { ok: res.status === 200 && body?.ok === true && body?.code === "ready", status: res.status };
  });
  return { checked_at: new Date().toISOString(), ok: checks.every((item) => item.ok), checks };
}
