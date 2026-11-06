import assert from "node:assert/strict";
import test from "node:test";
import { QrOutbox, QR_PENDING_TTL_MS, QR_PENDING_LIMIT, qrRetryDelay, sendQrSubmission } from "../../lib/phonesia/qr-outbox.ts";

const payload = { nome: "Ada", cognome: "Prova", telefono: "0000000000", email: "ada@example.invalid",
  codice_fiscale: "AAAAAA00A00A000A", negozio_id: 1, privacy_accepted: true, marketing_accepted: false };
const response = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers });
function fixture(transport) {
  const rows = new Map(); let clock = 1000; let lock = Promise.resolve(); let key;
  const storage = {
    exclusive(work) { const pending = lock.then(work, work); lock = pending.catch(() => {}); return pending; },
    async key() { return key ||= await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]); },
    async all() { return structuredClone([...rows.values()]); },
    async put(entry) { rows.set(entry.id, structuredClone(entry)); },
    async remove(id) { rows.delete(id); },
  };
  return { storage, rows, outbox: new QrOutbox(storage, transport, () => clock), now: () => clock,
    advance(ms) { clock += ms; } };
}

test("the full submitted form and original consents are encrypted before the first HTTP request", async () => {
  let sent;
  const f = fixture(async (_, options) => {
    assert.equal(f.rows.size, 1);
    sent = JSON.parse(options.body);
    assert.ok(options.signal instanceof AbortSignal);
    return response(503, {});
  });
  const id = await f.outbox.enqueue(payload);
  const raw = f.rows.get(id);
  assert.ok(raw.ciphertext instanceof ArrayBuffer);
  assert.equal(raw.nome, undefined);
  assert.equal(new TextDecoder().decode(raw.ciphertext).includes(payload.telefono), false);
  assert.equal((await f.storage.key()).extractable, false);
  await assert.rejects(crypto.subtle.exportKey("raw", await f.storage.key()));
  await f.outbox.attempt(id);
  assert.deepEqual(sent, payload);
  assert.equal(f.rows.size, 1);
});

test("reload recovers a pending submission without inventing or changing consent", async () => {
  const f = fixture(async () => { throw new TypeError("offline"); });
  const id = await f.outbox.enqueue(payload);
  assert.equal((await f.outbox.attempt(id)).state, "waiting");
  const reopened = new QrOutbox(f.storage, async () => response(202, { ok: true }), f.now);
  assert.deepEqual(await reopened.resumeForEditing(id, 1), payload);
  await reopened.enqueue(payload, id);
  assert.equal((await reopened.attempt(id)).state, "saved");
  assert.equal(f.rows.size, 0);
});

test("a lost response retains the same payload until a subsequent server acknowledgement", async () => {
  let calls = 0; const received = [];
  const f = fixture(async (_, options) => {
    received.push(JSON.parse(options.body));
    if (++calls === 1) throw new Error("response lost after commit");
    return response(202, { ok: true });
  });
  const id = await f.outbox.enqueue(payload);
  assert.equal((await f.outbox.attempt(id)).state, "waiting");
  assert.equal((await f.outbox.attempt(id)).state, "waiting");
  assert.equal(calls, 1, "backoff prevents immediate automatic resubmission");
  f.advance(60_000);
  assert.equal((await f.outbox.attempt(id)).state, "saved");
  assert.deepEqual(received, [payload, payload]);
});

test("403/503 responses and malformed success responses never discard a submission", async () => {
  for (const result of [response(403, {}), response(503, {}), response(202, {}), response(200, { ok: true }), new Response("bad", { status: 202 })]) {
    const f = fixture(async () => result);
    const id = await f.outbox.enqueue(payload);
    assert.equal((await f.outbox.attempt(id)).state, "waiting");
    assert.equal(f.rows.size, 1);
  }
});

test("invalid input is retained for correction and not automatically retried", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return response(400, { error: "Controlla il codice fiscale." }); });
  const id = await f.outbox.enqueue(payload);
  assert.equal((await f.outbox.attempt(id)).state, "review");
  f.advance(24 * 3600_000);
  assert.equal((await f.outbox.attempt(id, true)).state, "review");
  assert.equal(calls, 1);
  const edited = { ...payload, cognome: "Corretto" };
  await f.outbox.enqueue(edited, id);
  assert.equal(f.rows.size, 1);
  assert.deepEqual(await f.outbox.resumeForEditing(id, 1), edited);
});

test("editing pauses automatic retries and cannot change a different store's pending form", async () => {
  const f = fixture(async () => { throw new Error("must not send"); });
  const id = await f.outbox.enqueue(payload);
  await assert.rejects(f.outbox.resumeForEditing(id, 2));
  await assert.rejects(f.outbox.enqueue(payload, id));
  await f.outbox.resumeForEditing(id, 1);
  await assert.rejects(f.outbox.enqueue({ ...payload, negozio_id: 2 }, id));
  assert.equal((await f.outbox.attempt(id, true)).state, "review");
});

test("Retry-After is respected even for manual retries", async () => {
  let calls = 0;
  const f = fixture(async () => { calls++; return response(429, {}, { "Retry-After": "3600" }); });
  const id = await f.outbox.enqueue(payload);
  await f.outbox.attempt(id);
  f.advance(60_000);
  await f.outbox.attempt(id, true);
  assert.equal(calls, 1);
  f.advance(3600_000);
  await f.outbox.attempt(id);
  assert.equal(calls, 2);
  assert.equal(qrRetryDelay(1, "invalid", 0), 60_000);
  assert.equal(qrRetryDelay(1, "Thu, 01 Jan 1970 01:00:00 GMT", 0), 3600_000);
});

test("concurrent tabs sharing a lock cannot send the same pending entry twice", async () => {
  let calls = 0;
  const send = async () => { calls++; await new Promise((resolve) => setTimeout(resolve, 10)); return response(202, { ok: true }); };
  const f = fixture(send);
  const otherTab = new QrOutbox(f.storage, send, f.now);
  const id = await f.outbox.enqueue(payload);
  await Promise.all([f.outbox.attempt(id, true), otherTab.attempt(id, true)]);
  assert.equal(calls, 1);
  assert.equal(f.rows.size, 0);
});

test("full queues do not evict recent submissions and expired entries are purged on reopening", async () => {
  const f = fixture(async () => response(503, {}));
  for (let i = 0; i < QR_PENDING_LIMIT; i++) await f.outbox.enqueue(payload);
  await assert.rejects(f.outbox.enqueue(payload));
  assert.equal(f.rows.size, QR_PENDING_LIMIT);
  f.advance(QR_PENDING_TTL_MS);
  assert.deepEqual(await f.outbox.list(), []);
  assert.equal(f.rows.size, 0);
});

test("tampered ciphertext or authenticated metadata cannot be submitted", async () => {
  const f = fixture(async () => { assert.fail("must not send corrupted data"); });
  const id = await f.outbox.enqueue(payload);
  f.rows.get(id).storeId = 2;
  assert.equal((await f.outbox.attempt(id)).state, "review");
  assert.equal(f.rows.size, 1);
});

test("storage failure never starts a hidden HTTP request, and direct submission remains possible", async () => {
  let calls = 0;
  const send = async () => { calls++; return response(202, { ok: true }); };
  const f = fixture(send);
  f.storage.put = async () => { throw new Error("quota exceeded"); };
  await assert.rejects(f.outbox.enqueue(payload));
  assert.equal(calls, 0);
  assert.equal((await sendQrSubmission(payload, send)).saved, true);
});
