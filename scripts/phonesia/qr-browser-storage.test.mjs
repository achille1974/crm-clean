import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import assert from "node:assert/strict";
import test from "node:test";

const payload = { nome: "Ada", cognome: "Prova", telefono: "0000000000", email: "ada@example.invalid",
  codice_fiscale: "AAAAAA00A00A000A", negozio_id: 1, privacy_accepted: true, marketing_accepted: false };

test("actual IndexedDB adapter commits encrypted forms and recovers its nonextractable key after reload", async () => {
  let status = 503; let requests = 0;
  globalThis.fetch = async (_, options) => {
    requests++;
    assert.deepEqual(JSON.parse(options.body), payload);
    return new Response(JSON.stringify(status === 202 ? { ok: true } : {}), { status });
  };
  const first = (await import("../../lib/phonesia/qr-browser-storage.ts?tab=first")).browserQrOutbox();
  const id = await first.enqueue(payload);
  assert.equal((await first.attempt(id)).state, "waiting");
  const second = (await import("../../lib/phonesia/qr-browser-storage.ts?tab=reopened")).browserQrOutbox();
  assert.deepEqual(await second.resumeForEditing(id, 1), payload);
  await second.enqueue(payload, id);
  status = 202;
  assert.equal((await second.attempt(id)).state, "saved");
  assert.equal((await first.list()).length, 0);
  assert.equal(requests, 2);
});

test("separate adapters without Web Locks create a single usable encryption key atomically", async () => {
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis.navigator, "locks", { value: undefined, configurable: true });
  const first = (await import("../../lib/phonesia/qr-browser-storage.ts?tab=fallback1")).browserQrOutbox();
  const second = (await import("../../lib/phonesia/qr-browser-storage.ts?tab=fallback2")).browserQrOutbox();
  const [a, b] = await Promise.all([first.enqueue(payload), second.enqueue({ ...payload, negozio_id: 2 })]);
  assert.equal((await first.list()).length, 2);
  assert.deepEqual(await second.resumeForEditing(a, 1), payload);
  assert.deepEqual(await first.resumeForEditing(b, 2), { ...payload, negozio_id: 2 });
  await first.remove(a); await second.remove(b);
});

test("an unavailable IndexedDB is reported instead of falsely promising persistence", async () => {
  const saved = globalThis.indexedDB;
  globalThis.indexedDB = undefined;
  try {
    const unavailable = (await import("../../lib/phonesia/qr-browser-storage.ts?tab=unavailable")).browserQrOutbox();
    await assert.rejects(unavailable.enqueue(payload));
    await assert.rejects(unavailable.list());
  } finally { globalThis.indexedDB = saved; }
});
