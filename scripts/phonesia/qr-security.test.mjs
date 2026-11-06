import assert from "node:assert/strict";
import test from "node:test";
import { QR_PRODUCTION_ORIGINS, QR_LEGACY_ORIGINS, qrCanonicalRedirect } from "../../lib/phonesia/qr-origins.ts";
import {
  parseQrRegistration, QrRequestError, qrRequestHashes, readQrJson, verifyQrOrigin,
} from "../../lib/phonesia/qr-registration.ts";

const valid = {
  nome: " Ada ", cognome: " Test ", telefono: "0000000000",
  email: " ADA@EXAMPLE.INVALID ", codice_fiscale: "aaaaaa00a00a000a",
  negozio_id: 1, privacy_accepted: true, marketing_accepted: false,
};
const env = {
  NEXT_PUBLIC_BASE_URL: "https://app.example.invalid", VERCEL: "1", NODE_ENV: "production",
  SUPABASE_SERVICE_ROLE_KEY: "test-only-not-a-real-key",
};
const request = (headers = {}, body = JSON.stringify(valid)) => new Request("https://app.example.invalid/api/phonesia/qr/register", {
  method: "POST", headers: { origin: "https://app.example.invalid", "content-type": "application/json", ...headers }, body,
});
const status = (expected) => (error) => error instanceof QrRequestError && error.status === expected;

test("registration canonicalizes inputs and never forwards arbitrary database fields", () => {
  const parsed = parseQrRegistration({ ...valid, role: "admin", active: true, id: 7, welcome_sent_at: "forged" });
  assert.equal(parsed.nome, "Ada");
  assert.equal(parsed.telefono, "+390000000000");
  assert.equal(parsed.email, "ada@example.invalid");
  assert.equal(parsed.codiceFiscale, "AAAAAA00A00A000A");
  for (const key of ["id", "role", "active", "welcome_sent_at"]) assert.equal(key in parsed, false);
});

test("privacy consent is mandatory and boolean consent strings are rejected", () => {
  for (const privacy of [false, "true", 1, null, undefined]) {
    assert.throws(() => parseQrRegistration({ ...valid, privacy_accepted: privacy }), status(400));
  }
  assert.throws(() => parseQrRegistration({ ...valid, marketing_accepted: "false" }), status(400));
});

test("rejects malformed payloads, oversized fields and unknown stores", () => {
  for (const body of [null, [], "string", { ...valid, nome: "" }, { ...valid, nome: "x".repeat(101) },
    { ...valid, cognome: "line\nbreak" }, { ...valid, telefono: "%%%" }, { ...valid, codice_fiscale: "%" },
    { ...valid, email: "not-an-email" }, { ...valid, negozio_id: "1" }, { ...valid, negozio_id: 99 }]) {
    assert.throws(() => parseQrRegistration(body), status(400));
  }
});

test("supports an optional email and a business fiscal code", () => {
  const parsed = parseQrRegistration({ ...valid, email: "", codice_fiscale: "00000000000" });
  assert.equal(parsed.email, null);
  assert.equal(parsed.codiceFiscale, "00000000000");
});

test("public registration requires the configured exact origin", () => {
  verifyQrOrigin(request(), env);
  for (const origin of ["https://attacker.invalid", "null", "https://app.example.invalid.attacker.invalid"]) {
    assert.throws(() => verifyQrOrigin(request({ origin }), env), status(403));
  }
  const noOrigin = request(); noOrigin.headers.delete("origin");
  assert.throws(() => verifyQrOrigin(noOrigin, env), status(403));
  assert.throws(() => verifyQrOrigin(request({ "sec-fetch-site": "cross-site" }), env), status(403));
});

test("a forged request host cannot authorize an origin in production", () => {
  const forged = new Request("https://attacker.invalid/api/phonesia/qr/register", { headers: { origin: "https://attacker.invalid" } });
  assert.throws(() => verifyQrOrigin(forged, env), status(403));
});

test("the verified Phonesia production QR alias passes the origin check", () => {
  const phonesiaEnv = { ...env, NEXT_PUBLIC_BASE_URL: "https://app.crm-supreme.it" };
  const from = (origin) => new Request(`${origin}/api/phonesia/qr/register`, {
    headers: { origin, "sec-fetch-site": "same-origin" },
  });
  verifyQrOrigin(from("https://app.crm-supreme.it"), phonesiaEnv);
  verifyQrOrigin(from("https://crm-clean.vercel.app"), phonesiaEnv);
  for (const origin of QR_PRODUCTION_ORIGINS) verifyQrOrigin(from(origin), phonesiaEnv);
  for (const origin of ["https://crm-clean.vercel.app.attacker.invalid", "https://other.vercel.app", "http://crm-clean.vercel.app"]) {
    assert.throws(() => verifyQrOrigin(from(origin), phonesiaEnv), status(403));
  }
  assert.throws(() => verifyQrOrigin(from("https://crm-clean.vercel.app"), env), status(403));
  assert.throws(() => verifyQrOrigin(from("https://crm-clean.vercel.app"), { ...phonesiaEnv, VERCEL: undefined }), status(403));
  const crossSite = from("https://crm-clean.vercel.app");
  crossSite.headers.set("sec-fetch-site", "cross-site");
  assert.throws(() => verifyQrOrigin(crossSite, phonesiaEnv), status(403));
});

test("legacy QR redirects preserve every store and query, with a fixed destination", () => {
  const production = { ...env, NEXT_PUBLIC_BASE_URL: "https://app.crm-supreme.it" };
  for (const origin of QR_LEGACY_ORIGINS) {
    for (let store = 1; store <= 5; store++) {
      const search = `?negozio=${store}&next=https%3A%2F%2Fevil.invalid&source=qr`;
      assert.equal(qrCanonicalRedirect(new URL(origin).host, "/phonesia/qr", search, "GET", production),
        `https://app.crm-supreme.it/phonesia/qr${search}`);
    }
  }
  for (const host of ["app.crm-supreme.it", "crm-clean.vercel.app.evil.invalid", "other.vercel.app", null]) {
    assert.equal(qrCanonicalRedirect(host, "/phonesia/qr", "?negozio=1", "GET", production), null);
  }
  assert.equal(qrCanonicalRedirect("crm-clean.vercel.app", "/phonesia/qr", "", "POST", production), null);
  assert.equal(qrCanonicalRedirect("crm-clean.vercel.app", "/api/phonesia/qr/register", "", "POST", production), null);
  assert.equal(qrCanonicalRedirect("crm-clean.vercel.app", "/phonesia/qr", "", "GET", env), null);
});

test("Vercel requests require a valid platform client IP", () => {
  assert.throws(() => qrRequestHashes(request(), "+390000000000", env), status(400));
  assert.throws(() => qrRequestHashes(request({ "x-vercel-forwarded-for": "forged" }), "+390000000000", env), status(400));
  const hashes = qrRequestHashes(request({ "x-vercel-forwarded-for": "192.0.2.10", "x-forwarded-for": "192.0.2.99" }), "+390000000000", env);
  const same = qrRequestHashes(request({ "x-vercel-forwarded-for": "192.0.2.10" }), "+390000000000", env);
  assert.deepEqual(hashes, same);
  assert.match(hashes.ipHash, /^[a-f0-9]{64}$/);
  assert.notEqual(hashes.ipHash, hashes.phoneHash);
});

test("untrusted forwarding headers do not change the self-hosted rate bucket", () => {
  const localEnv = { ...env, VERCEL: undefined };
  const a = qrRequestHashes(request({ "x-forwarded-for": "192.0.2.1" }), "+390000000000", localEnv);
  const b = qrRequestHashes(request({ "x-forwarded-for": "192.0.2.2" }), "+390000000000", localEnv);
  assert.deepEqual(a, b);
});

test("body parser accepts JSON and rejects unsupported types and malformed data", async () => {
  assert.deepEqual(await readQrJson(request({ "content-type": "application/json; charset=utf-8" })), valid);
  await assert.rejects(readQrJson(request({ "content-type": "text/plain" })), status(415));
  await assert.rejects(readQrJson(request({}, "{")), status(400));
});

test("body size cap applies even without Content-Length", async () => {
  await assert.rejects(readQrJson(request({}, JSON.stringify({ value: "x".repeat(9000) }))), status(413));
  await assert.rejects(readQrJson(request({ "content-length": "9000" })), status(413));
});

test("registration source is optional and only short slugs are kept", () => {
  assert.equal(parseQrRegistration(valid).src, null);
  assert.equal(parseQrRegistration({ ...valid, src: "ctwa" }).src, "ctwa");
  for (const src of ["CTWA", "x".repeat(33), "a b", "<x>", 7, null]) {
    assert.equal(parseQrRegistration({ ...valid, src }).src, null);
  }
});
