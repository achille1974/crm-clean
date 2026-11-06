import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { checkMetaSignature } from "./meta-signature.ts";

const secret = "test-app-secret";
const body = '{"object":"whatsapp_business_account","entry":[]}';
const sign = (raw: string, key = secret) =>
  "sha256=" + createHmac("sha256", key).update(raw, "utf8").digest("hex");

test("firma Meta valida accettata", () => {
  assert.deepEqual(checkMetaSignature(body, sign(body), secret), { status: "valid" });
});

test("corpo alterato rifiutato", () => {
  assert.equal(checkMetaSignature(body + " ", sign(body), secret).status, "invalid");
});

test("firma con altro segreto rifiutata", () => {
  assert.deepEqual(checkMetaSignature(body, sign(body, "altro"), secret), { status: "invalid", reason: "mismatch" });
});

test("header mancante o malformato rifiutato", () => {
  assert.deepEqual(checkMetaSignature(body, null, secret), { status: "invalid", reason: "missing_header" });
  assert.deepEqual(checkMetaSignature(body, "sha1=abc", secret), { status: "invalid", reason: "malformed_header" });
});

test("senza App Secret: non configurato", () => {
  assert.deepEqual(checkMetaSignature(body, null, undefined), { status: "not_configured" });
});
