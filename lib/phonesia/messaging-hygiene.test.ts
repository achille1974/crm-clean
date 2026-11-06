import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyDeliveryFailure, isStopRequest, hasActiveMarketingConsent,
  isWithinMarketingCooldown, shouldSuspendUndeliverable,
} from "./messaging-hygiene.ts";

test("classifica gli errori Meta", () => {
  assert.equal(classifyDeliveryFailure("failed", "131050"), "marketing_opt_out");
  assert.equal(classifyDeliveryFailure("failed", 131026), "undeliverable");
  assert.equal(classifyDeliveryFailure("failed", "131049"), null);
  assert.equal(classifyDeliveryFailure("delivered", "131050"), null);
});

test("riconosce STOP senza falsi positivi", () => {
  for (const t of ["STOP", "stop.", "Basta", "basta messaggi!", "Cancellami", "non voglio più ricevere messaggi", "No promo"]) assert.equal(isStopRequest(t), true, t);
  for (const t of ["", "ok", "fermati un attimo che passo", "stop al prezzo? quanto costa", "basta che funzioni il telefono", "Buongiorno, vorrei info sulla fibra"]) assert.equal(isStopRequest(t), false, t);
});

test("consenso marketing: vale l'ultimo evento", () => {
  assert.equal(hasActiveMarketingConsent([]), false);
  assert.equal(hasActiveMarketingConsent([{ tipo_evento: "privacy_accepted" }]), false);
  assert.equal(hasActiveMarketingConsent([{ tipo_evento: "marketing_accepted", created_at: "2026-05-01T10:00:00Z" }]), true);
  assert.equal(hasActiveMarketingConsent([
    { tipo_evento: "marketing_accepted", created_at: "2026-05-01T10:00:00Z" },
    { tipo_evento: "marketing_revoked", created_at: "2026-10-30T10:00:00Z" },
  ]), false);
  assert.equal(hasActiveMarketingConsent([
    { tipo_evento: "marketing_revoked", created_at: "2026-10-30T10:00:00Z" },
    { tipo_evento: "marketing_accepted", created_at: "2026-11-02T10:00:00Z" },
  ]), true);
});

test("pausa 14 giorni", () => {
  const now = new Date("2026-11-06T10:00:00Z");
  assert.equal(isWithinMarketingCooldown("2026-10-30T09:00:00Z", now), true);
  assert.equal(isWithinMarketingCooldown("2026-10-22T09:00:00Z", now), false);
  assert.equal(isWithinMarketingCooldown(null, now), false);
});

test("sospensione dopo 2 undeliverable consecutivi", () => {
  assert.equal(shouldSuspendUndeliverable([{ status: "failed", error_code: "131026" }]), false);
  assert.equal(shouldSuspendUndeliverable([{ status: "failed", error_code: "131026" }, { status: "failed", error_code: "131026" }]), true);
  assert.equal(shouldSuspendUndeliverable([{ status: "failed", error_code: "131026" }, { status: "delivered" }, { status: "failed", error_code: "131026" }]), false);
});
