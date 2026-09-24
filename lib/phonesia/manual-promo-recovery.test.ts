import assert from "node:assert/strict";
import test from "node:test";
import { RECOVERY, RECOVERY_KEY, evaluateRecoveryRecipients, executeManualRecovery, existingRecovery, prepareRecovery, recoveryPhone, validateRecoveryReport, verifyOriginalContent, type RecoveryData, type RecoveryReport } from "./manual-promo-recovery.ts";

const now = new Date("2026-09-24T06:00:00Z");
function fixture() {
  const report: RecoveryReport = { campaign_id: RECOVERY.originalId, promo_key: RECOVERY.promoKey, selected_ids_in_order: [1, 2], rows: [1, 2].map(id => ({ cliente_id: id, telefono_normalizzato: `39333000000${id}`, nome: "Test", cognome: "Example" })) };
  const original = { id: RECOVERY.originalId, promo_key: RECOVERY.promoKey, state: "needs_review", historical: true, snapshot_complete: false, selected_declared: 497, documented_recipients: 286, unreconstructable_count: 211,
    send_mode: "custom_message_image", template_name: "ph_msg_img_v1", template_language: "it", normalized_message: "Contenuto originale invariato", attachment_file_name: "original.jpg", attachment_mime_type: "image/jpeg",
    attachment_public_url: "https://vqtoxgcacosdqtoxihko.supabase.co/storage/v1/object/public/media/phonesia/opportunita/original.jpg" };
  const data: RecoveryData = {
    campaigns: [original], attempts: [], statuses: [],
    recipients: Array.from({ length: 286 }, (_, i) => ({ id: `old-${i}`, cliente_id: i + 100, campaign_id: original.id, send_state: "accepted", whatsapp_message_id: `wamid-${i}`, normalized_phone: `3933400${String(i).padStart(5, "0")}`, accepted_at: "2026-09-18T09:00:00Z" })),
    history: Array.from({ length: 286 }, (_, i) => ({ id: i + 100, cliente_id: i + 100, batch_id: original.id, promo_key: RECOVERY.promoKey,
      send_mode: original.send_mode, messaggio: original.normalized_message, attachment_public_url: original.attachment_public_url, attachment_file_name: original.attachment_file_name, created_at: "2026-09-18T09:00:00Z",
      metadata: { template_name: original.template_name, whatsapp_message_id: `wamid-${i}`, meta_send_attempts: [{ status: "success", whatsapp_message_id: `wamid-${i}`, payload_summary: { template: { name: original.template_name, language: { code: "it" }, components: [
        { type: "header", parameters: [{ type: "image", image: { link: original.attachment_public_url } }] },
        { type: "body", parameters: [{ parameter_name: "nome_cliente" }, { parameter_name: "messaggio" }] },
      ] } } }] } })),
    clients: [1, 2].map(id => ({ id, nome: "Test", cognome: "Example", telefono: `+39333000000${id}`, whatsapp_active: true })),
    consents: [1, 2].map(id => ({ id, cliente_id: id, tipo_evento: "marketing_accepted", created_at: "2026-09-01T00:00:00Z" })),
  };
  return { report, original, data };
}

test("rejects any report other than the exact authorized bytes, including a forged matching selection", () => {
  for (const raw of [null, "{}", JSON.stringify(fixture().report), " " ]) assert.throws(() => validateRecoveryReport(raw), /Report non autorizzato/);
});
test("normalizes full international phones without suffix matching or accepting malformed numbers", () => {
  assert.equal(recoveryPhone("+39 333 000 0001"), "393330000001");
  assert.equal(recoveryPhone("00393330000001"), "393330000001");
  assert.equal(recoveryPhone("3330000001"), "393330000001");
  assert.notEqual(recoveryPhone("443330000001"), recoveryPhone("393330000001"));
  for (const p of ["***0001", "call 393330000001", "++393330000001", "000", "+1234567890123456"]) assert.equal(recoveryPhone(p), null);
});
test("snapshot preserves only the report selection, original content, admin and audit evidence", () => {
  const { report, data, original } = fixture();
  data.clients.push({ id: 999, nome: "Outside", telefono: "+393339999999", whatsapp_active: true });
  const plan = prepareRecovery(report, data, "admin-uuid", now, { sha256: "image-hash" });
  assert.equal(plan.queued, 2);
  assert.deepEqual(plan.snapshot.map(r => r.cliente_id), [1, 2]);
  const s = plan.snapshot[0].eligibility_snapshot;
  assert.equal(s.manual_recovery.residual_risk_accepted, true);
  assert.equal(s.manual_recovery.report_sha256, RECOVERY.reportSha256);
  assert.equal(s.manual_recovery.authorized_admin_id, "admin-uuid");
  assert.deepEqual(s.recovery_manifest?.selected_ids_in_order, [1, 2]);
  assert.equal(JSON.stringify(s.payload).includes(original.normalized_message), true);
  assert.equal(data.campaigns[0].state, "needs_review");
});
test("accepted matches by customer ID and by full phone through delivery evidence", () => {
  const { report, data } = fixture();
  data.recipients[0].cliente_id = 1;
  data.statuses.push({ whatsapp_message_id: "wamid-1", recipient_phone: "+393330000002" });
  assert(evaluateRecoveryRecipients(report, data, now).every(r => r.reasons.includes("promo_gia_accepted")));
});
test("pending, processing and uncertain recipients or attempts are never eligible", () => {
  for (const state of ["pending", "processing", "uncertain"]) {
    const { report, data } = fixture();
    data.recipients.push({ id: "open", cliente_id: 1, normalized_phone: "393330000002", send_state: state, campaign_id: "another" });
    assert(evaluateRecoveryRecipients(report, data, now).every(r => r.reasons.includes("tentativo_in_corso_o_incerto")));
  }
  const { report, data } = fixture();
  data.recipients.push({ id: "open", cliente_id: 1, send_state: "rejected", campaign_id: "another" });
  data.attempts.push({ recipient_id: "open", outcome: "uncertain", finished_at: now.toISOString() });
  assert(evaluateRecoveryRecipients(report, data, now)[0].reasons.includes("tentativo_in_corso_o_incerto"));
});
test("current consent respects revocation, inactive WhatsApp and invalid or changed phone", () => {
  const { report, data } = fixture();
  data.consents.push({ id: 3, cliente_id: 1, tipo_evento: "marketing_revoked", created_at: now.toISOString() });
  data.clients[0].whatsapp_active = false;
  data.clients[1].telefono = "bad";
  const results = evaluateRecoveryRecipients(report, data, now);
  assert(results[0].reasons.includes("consenso_marketing_attuale_assente"));
  assert(results[0].reasons.includes("whatsapp_non_attivo"));
  assert(results[1].reasons.includes("telefono_non_valido"));
  data.clients[1].telefono = "+393330000009";
  assert(evaluateRecoveryRecipients(report, data, now)[1].reasons.includes("telefono_cambiato_dal_report"));
});
test("all duplicate phones are excluded, retained in audit, and cannot violate snapshot uniqueness", () => {
  const { report, data } = fixture();
  data.clients[1].telefono = data.clients[0].telefono;
  const p = prepareRecovery(report, data, "admin", now, {});
  assert.equal(p.queued, 0);
  assert(p.snapshot.every(r => r.normalized_phone === null && r.exclusion_reason?.includes("telefono_duplicato")));
});
test("daily promo block uses Europe/Rome midnight, including DST", () => {
  for (const date of ["2026-09-24T00:01:00+02:00", "2026-10-25T23:50:00+01:00"]) {
    const { report, data } = fixture();
    const day = date.slice(0, 10);
    data.history.push({ id: 999, cliente_id: 1, channel: "whatsapp", created_at: `${day}T00:01:00+02:00` });
    assert(evaluateRecoveryRecipients(report, data, new Date(date))[0].reasons.includes("blocco_promo_giornaliero_Europe_Rome"));
  }
});
test("unreconciled old or current status is a documented exclusion", () => {
  const { report, data } = fixture();
  data.statuses.push({ id: 1, whatsapp_message_id: "unknown", recipient_phone: "393330000001", timestamp_meta: "2026-09-18T09:05:00Z" });
  assert(evaluateRecoveryRecipients(report, data, now)[0].reasons.includes("stato_whatsapp_storico_non_riconciliato"));
});
test("content mismatch or missing historical proof stops before enqueue", () => {
  for (const field of ["template_name", "normalized_message", "attachment_public_url", "template_language"]) {
    const { data } = fixture(); data.campaigns[0][field] = "changed";
    assert.throws(() => verifyOriginalContent(data));
  }
  const { data } = fixture(); data.history.pop(); assert.throws(() => verifyOriginalContent(data));
});
test("another campaign for the same promo blocks a second recovery", () => {
  const { report, data } = fixture();
  data.campaigns.push({ id: "another", promo_key: RECOVERY.promoKey, idempotency_key: "different" });
  assert.throws(() => existingRecovery(data, report), /Esiste già/);
});
test("dry run never writes, and enqueue reloads exclusions immediately before the one persistent RPC", async () => {
  const { report, data } = fixture();
  let writes = 0, reads = 0;
  const options = { report, adminId: "admin", dryRun: true, now: () => now,
    load: async () => { reads++; return data; }, inspectAttachment: async () => ({}),
    createSnapshot: async (args: Record<string, unknown>) => { writes++; assert.equal(args.p_idempotency_key, RECOVERY_KEY); assert.equal(args.p_promo_key, RECOVERY.promoKey); return "recovery-id"; } };
  await executeManualRecovery(options); assert.equal(writes, 0);
  reads = 0;
  const result = await executeManualRecovery({ ...options, dryRun: false, load: async () => { reads++; if (reads === 2) data.clients[0].whatsapp_active = false; return data; } });
  assert.equal(reads, 2); assert.equal(writes, 1); assert.equal(result.queued, 1);
});
test("an uncertain RPC response is not automatically retried", async () => {
  const { report, data } = fixture(); let writes = 0;
  await assert.rejects(executeManualRecovery({ report, adminId: "admin", dryRun: false, load: async () => data, inspectAttachment: async () => ({}),
    createSnapshot: async () => { writes++; throw new Error("timeout"); } }), /timeout/);
  assert.equal(writes, 1);
});
test("an existing matching recovery is verified without resetting accepted or uncertain", async () => {
  const { report, data, original } = fixture();
  const p = prepareRecovery(report, data, "admin", now, {});
  data.campaigns.push({ ...original, id: "existing", idempotency_key: RECOVERY_KEY, historical: false, snapshot_complete: true, state: "needs_review" });
  data.recipients.push(...p.snapshot.map((r, i) => ({ ...r, id: `new-${i}`, campaign_id: "existing", send_state: i ? "uncertain" : "accepted" })));
  const result = await executeManualRecovery({ report, adminId: "admin", dryRun: false, load: async () => data,
    inspectAttachment: async () => { throw new Error("must not run"); }, createSnapshot: async () => { throw new Error("must not run"); } });
  assert.equal(result.campaignId, "existing"); assert.equal(result.existing, true);
});
test("database read failure prevents any campaign mutation", async () => {
  let writes = 0;
  await assert.rejects(executeManualRecovery({ report: fixture().report, adminId: "admin", dryRun: false,
    load: async () => { throw new Error("read failed"); }, inspectAttachment: async () => ({}), createSnapshot: async () => { writes++; return "id"; } }), /read failed/);
  assert.equal(writes, 0);
});
