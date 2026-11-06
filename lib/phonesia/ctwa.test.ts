import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countByStore, detectCtwaArrival, parseRegistrationSource, planCtwaResponse, storeFromPrefill,
} from "./ctwa.ts";
import { isStopRequest } from "./messaging-hygiene.ts";

const BASE = "https://app.crm-supreme.it/";
const NOW = new Date("2026-11-07T10:00:00Z");
const plan = (over: Partial<Parameters<typeof planCtwaResponse>[0]>) => planCtwaResponse({
  arrival: detectCtwaArrival({ body: "Ciao Phonesia Augusta! Vorrei restare in contatto.", referral: null }),
  isStop: false, isCliente: false, clienteNegozioId: null, lastReplyAt: null, now: NOW, baseUrl: BASE, ...over,
});

test("testo precompilato: i 3 negozi, maiuscole e spazi ignorati", () => {
  assert.equal(storeFromPrefill("Ciao Phonesia Floridia! Vorrei restare in contatto."), 1);
  assert.equal(storeFromPrefill("  ciao phonesia AUGUSTA!   vorrei restare in contatto. "), 2);
  assert.equal(storeFromPrefill("Ciao Phonesia Siracusa!\nVorrei restare in contatto."), 3);
  assert.equal(storeFromPrefill("Ciao Phonesia Avola! Vorrei restare in contatto."), null);
  assert.equal(storeFromPrefill("Ciao, info su una linea"), null);
  assert.equal(detectCtwaArrival({ body: "Buongiorno", referral: null }), null);
  const arrival = detectCtwaArrival({ body: "Ciao Phonesia Siracusa! Vorrei restare in contatto.", referral: null });
  assert.deepEqual({ negozio: arrival?.negozioId, via: arrival?.via }, { negozio: 3, via: "testo" });
});

test("referral da annuncio: salva source_id, ctwa_clid, headline", () => {
  const arrival = detectCtwaArrival({
    body: "Ciao Phonesia Floridia! Vorrei restare in contatto.",
    referral: { source_type: "ad", source_id: "120200000001", ctwa_clid: "ARAkLk", headline: "Phonesia Floridia è su WhatsApp" },
  });
  assert.deepEqual(arrival, {
    negozioId: 1, via: "referral", negozioNonDeterminato: false, sourceType: "ad",
    sourceId: "120200000001", ctwaClid: "ARAkLk", headline: "Phonesia Floridia è su WhatsApp",
  });
  const fromHeadline = detectCtwaArrival({
    body: "Avete il nuovo iPhone?", referral: { source_type: "ad", source_id: "9", headline: "Phonesia Augusta è su WhatsApp" },
  });
  assert.equal(fromHeadline?.negozioId, 2);
  assert.equal(fromHeadline?.negozioNonDeterminato, false);
});

test("referral senza negozio riconoscibile: negozio 1 marcato non determinato", () => {
  const arrival = detectCtwaArrival({ body: "Info", referral: { source_type: "ad", source_id: "7", headline: "Restiamo in contatto" } });
  assert.equal(arrival?.negozioId, 1);
  assert.equal(arrival?.negozioNonDeterminato, true);
  assert.equal(detectCtwaArrival({ body: "Info", referral: {} }), null, "referral vuoto ignorato");
});

test("non registrato: link di registrazione del negozio con src=ctwa", () => {
  const result = plan({});
  assert.equal(result.action, "reply");
  if (result.action !== "reply") return;
  assert.equal(result.kind, "registrazione");
  assert.match(result.text, /^Ciao, grazie per averci scritto!\n/);
  assert.match(result.text, /negozio Phonesia di Augusta, registrati qui in 20 secondi:\nhttps:\/\/app\.crm-supreme\.it\/phonesia\/qr\?negozio=2&src=ctwa\n\nNel modulo/);
});

test("cliente già registrato: conferma con il suo negozio, nessun link", () => {
  const result = plan({ isCliente: true, clienteNegozioId: 1 });
  assert.deepEqual(result, {
    action: "reply", kind: "gia_registrato",
    text: "Ciao! Sei già registrato con Phonesia Floridia: puoi scriverci qui per qualsiasi necessità.",
  });
  const unknownStore = plan({ isCliente: true, clienteNegozioId: null });
  assert.match(unknownStore.action === "reply" ? unknownStore.text : "", /Phonesia Augusta:/);
});

test("massimo una risposta automatica per numero ogni 24 ore", () => {
  assert.deepEqual(plan({ lastReplyAt: "2026-11-06T10:00:01Z" }), { action: "skip_24h" });
  assert.deepEqual(plan({ lastReplyAt: "2026-11-07T09:59:00Z", isCliente: true }), { action: "skip_24h" });
  assert.equal(plan({ lastReplyAt: "2026-11-06T10:00:00Z" }).action, "reply");
});

test("STOP: nessuna risposta da annuncio, vale l'opt-out esistente", () => {
  for (const body of ["STOP", "basta", "cancellami"]) {
    assert.equal(isStopRequest(body), true, body);
    const arrival = detectCtwaArrival({ body, referral: { source_type: "ad", source_id: "1" } });
    assert.deepEqual(plan({ arrival, isStop: isStopRequest(body) }), { action: "none" });
  }
});

test("origine registrazione: solo slug validi, assente = come oggi", () => {
  assert.equal(parseRegistrationSource("ctwa"), "ctwa");
  for (const bad of [undefined, null, "", "CTWA", "x".repeat(33), "a b", "<script>", 5]) {
    assert.equal(parseRegistrationSource(bad), null);
  }
});

test("conteggio per negozio", () => {
  assert.deepEqual(countByStore([{ negozio_id: 1 }, { negozio_id: 3 }, { negozio_id: 3 }, { negozio_id: 4 }]).map((r) => r.totale), [1, 0, 2]);
});
