import assert from "node:assert/strict";
import test from "node:test";
import { probeQr } from "./qr-health.mjs";
import { qrDatabaseReady } from "../../lib/phonesia/qr-readiness.ts";
const json = (status, body) => new Response(JSON.stringify(body), { status });
const healthy = async (url, options) => {
  const parsed = new URL(url);
  if (parsed.pathname === "/api/phonesia/qr/register") {
    if (options.method !== "POST") return json(200, { ok: true, code: "ready" });
    assert.equal(options.body, "{}", "monitor cannot submit a customer");
    return options.headers.Origin.includes("untrusted")
      ? json(403, { code: "origin_rejected" }) : json(400, { code: "invalid_request" });
  }
  if (parsed.pathname === "/api/phonesia/stats") return json(401, {});
  if (parsed.host !== "app.crm-supreme.it") return new Response(null, {
    status: 307, headers: { Location: `https://app.crm-supreme.it${parsed.pathname}${parsed.search}` },
  });
  return new Response("Completa la tua registrazione", { headers: { "Cache-Control": "no-store" } });
};
test("monitor checks origin validation, redirects, public form and private API without customer data", async () => {
  const report = await probeQr({ transport: healthy, allStores: true });
  assert.equal(report.ok, true);
  assert.equal(report.checks.length, 15);
});
test("a page returning 200 does not hide a registration POST blocked by security", async () => {
  const report = await probeQr({ transport: (url, options) => url.includes("register") && options.method === "POST"
    ? Promise.resolve(json(403, { code: "origin_rejected" })) : healthy(url, options) });
  assert.equal(report.ok, false);
  assert.equal(report.checks.filter((item) => !item.ok).length, 2);
});
test("network failures and authentication redirects cannot pass health checks", async () => {
  assert.equal((await probeQr({ transport: async () => { throw new Error("offline"); } })).ok, false);
  assert.equal((await probeQr({ transport: async () => new Response(null, { status: 302 }) })).ok, false);
});
test("readiness verifies the actual server's RPC access and stores without a valid registration", async () => {
  const client = (code, stores) => ({
    rpc(name, body) {
      assert.equal(name, "phonesia_register_qr");
      assert.equal(body.p_nome, null); assert.equal(body.p_telefono, null); assert.equal(body.p_negozio_id, 0);
      return { abortSignal: async () => ({ error: { code } }) };
    },
    from: () => ({ select: () => ({ in: () => ({ abortSignal: async () => ({ data: stores.map((codice) => ({ codice })), error: null }) }) }) }),
  });
  assert.equal(await qrDatabaseReady(client("22023", [1, 2, 3, 4, 5])), true);
  assert.equal(await qrDatabaseReady(client("42501", [1, 2, 3, 4, 5])), false);
  assert.equal(await qrDatabaseReady(client("22023", [1, 2, 3, 4])), false);
});
test("a server database failure is critical even when pages and origin checks work", async () => {
  const report = await probeQr({ transport: (url, options) => url.includes("register") && options.method !== "POST"
    ? Promise.resolve(json(503, {})) : healthy(url, options) });
  assert.equal(report.ok, false);
  assert.deepEqual(report.checks.filter((check) => !check.ok).map((check) => check.name), ["server_database_and_rpc"]);
});
