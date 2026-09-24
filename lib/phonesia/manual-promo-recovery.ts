import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCustomTemplatePayload, sanitizeWhatsAppTemplateText } from "./whatsapp-template-payload.ts";
import { getRomeTodayBounds, isWhatsAppPromoOpportunity } from "./opportunita-promo-history.ts";

// This is deliberately a single authorized recovery, not a general resume override.
export const RECOVERY = {
  originalId: "e6964dee-865a-4dbf-95dc-223e0c2fece2",
  promoKey: "promo_luce_gas_202609",
  reportPath: "/Users/archimede/.config/phonesia-recovery/recovery-promo_luce_gas_202609-2026-09-23T10-11-16Z.json",
  reportSha256: "07623dfcca63e1a99629819c96263984192ff2e4568405eb7364155e64716d17",
  selectionSha256: "aca8a5360c5904f05f2d6de631e6723cd6e51626d7f2ee1580a08ad3aee3ded1",
  candidates: 209,
  authorization: "Autorizzo il recupero manuale e l’invio della promo ai 209 candidati del report, accettando il rischio residuo che qualcuno abbia ricevuto un messaggio non registrato prima del vecchio timeout.",
} as const;
export const RECOVERY_KEY = `manual-recovery:${RECOVERY.originalId}:${RECOVERY.reportSha256}`;
export const sha256 = (value: string | Uint8Array) => createHash("sha256").update(value).digest("hex");

type RecordRow = Record<string, unknown>;
export type RecoveryReport = {
  campaign_id: string; promo_key: string; selected_ids_in_order: number[];
  rows: Array<{ cliente_id: number; telefono_normalizzato: string; nome: string; cognome: string }>;
};
export type RecoveryData = {
  campaigns: RecordRow[]; recipients: RecordRow[]; attempts: RecordRow[];
  history: RecordRow[]; statuses: RecordRow[]; clients: RecordRow[]; consents: RecordRow[];
};
const obj = (v: unknown): RecordRow => v && typeof v === "object" && !Array.isArray(v) ? v as RecordRow : {};
const str = (v: unknown) => typeof v === "string" ? v : "";
const arr = (v: unknown): RecordRow[] => Array.isArray(v) ? v.map(obj) : [];

export function validateRecoveryReport(raw: unknown): RecoveryReport {
  if (typeof raw !== "string" || sha256(raw) !== RECOVERY.reportSha256) throw new Error("Report non autorizzato: SHA-256 differente.");
  const report = JSON.parse(raw) as RecoveryReport;
  const ids = report.selected_ids_in_order;
  if (report.campaign_id !== RECOVERY.originalId || report.promo_key !== RECOVERY.promoKey ||
      !Array.isArray(ids) || ids.length !== RECOVERY.candidates || new Set(ids).size !== RECOVERY.candidates ||
      !ids.every(id => Number.isSafeInteger(id) && id > 0) ||
      sha256(ids.join(",")) !== RECOVERY.selectionSha256 ||
      !Array.isArray(report.rows) || report.rows.length !== ids.length ||
      !report.rows.every((row, i) => row.cliente_id === ids[i])) throw new Error("Selezione del report incoerente.");
  return report;
}

// Compare the entire international number. Never match only its last digits.
export function recoveryPhone(value: unknown): string | null {
  const raw = str(value).trim();
  if (!raw || !/^[+\d\s().-]+$/.test(raw)) return null;
  let phone = raw.replace(/[\s().-]/g, "");
  if (phone.startsWith("00")) phone = phone.slice(2);
  else if (phone.startsWith("+")) phone = phone.slice(1);
  // Existing local Italian numbers have an unambiguous ten digit mobile format.
  else if (/^3\d{9}$/.test(phone)) phone = `39${phone}`;
  return /^[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

async function readAll(client: SupabaseClient, table: string, columns: string) {
  const rows: RecordRow[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from(table).select(columns).order("id").range(offset, offset + 499);
    if (error) throw new Error(`Lettura ${table} fallita: ${error.message}`);
    if (!data) throw new Error(`Lettura ${table} incompleta.`);
    rows.push(...data as unknown as RecordRow[]);
    if (data.length < 500) return rows;
    if (rows.length >= 100_000) throw new Error(`Limite di verifica ${table}: recupero bloccato.`);
  }
}

export async function loadRecoveryData(client: SupabaseClient, report: RecoveryReport): Promise<RecoveryData> {
  const [campaigns, recipients, attempts, history, statuses] = await Promise.all([
    readAll(client, "phonesia_whatsapp_campaigns", "*"),
    readAll(client, "phonesia_whatsapp_campaign_recipients", "*"),
    readAll(client, "phonesia_whatsapp_campaign_attempts", "*"),
    readAll(client, "phonesia_opportunita_inviate", "*"),
    readAll(client, "phonesia_whatsapp_message_statuses", "id,whatsapp_message_id,recipient_phone,status,timestamp_meta,created_at"),
  ]);
  // Other customer rows are used only to resolve historical phone matches, never to select recipients.
  const evidenceIds = [...new Set([...report.selected_ids_in_order, ...history.map(r => Number(r.cliente_id))])].filter(id => Number.isSafeInteger(id) && id > 0);
  const clients: RecordRow[] = [];
  const consents: RecordRow[] = [];
  for (let i = 0; i < evidenceIds.length; i += 100) {
    const { data, error } = await client.from("phonesia_clienti").select("id,nome,cognome,telefono,whatsapp_active").in("id", evidenceIds.slice(i, i + 100));
    if (error || !data) throw new Error(`Lettura clienti fallita: ${error?.message}`);
    clients.push(...data);
  }
  for (let i = 0; i < report.selected_ids_in_order.length; i += 50) {
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await client.from("phonesia_consensi").select("id,cliente_id,tipo_evento,created_at")
        .in("cliente_id", report.selected_ids_in_order.slice(i, i + 50)).order("id").range(offset, offset + 499);
      if (error || !data) throw new Error(`Lettura consensi fallita: ${error?.message}`);
      consents.push(...data);
      if (data.length < 500) break;
      if (offset >= 100_000) throw new Error("Consensi non verificabili integralmente.");
    }
  }
  return { campaigns, recipients, attempts, history, statuses, clients, consents };
}

const CONTENT_FIELDS = ["send_mode", "template_name", "template_language", "normalized_message", "attachment_public_url", "attachment_file_name", "attachment_mime_type"] as const;
export function campaignContent(campaign: RecordRow) {
  return Object.fromEntries(CONTENT_FIELDS.map(key => [key, campaign[key]]));
}

export function verifyOriginalContent(data: RecoveryData) {
  const original = data.campaigns.find(c => c.id === RECOVERY.originalId);
  if (!original || original.promo_key !== RECOVERY.promoKey || original.state !== "needs_review" ||
      original.historical !== true || original.snapshot_complete !== false ||
      original.selected_declared !== 497 || original.documented_recipients !== 286 || original.unreconstructable_count !== 211) {
    throw new Error("Campagna storica differente dall’autorizzazione.");
  }
  const accepted = data.recipients.filter(r => r.campaign_id === original.id && r.send_state === "accepted" && r.whatsapp_message_id);
  const history = data.history.filter(r => r.batch_id === original.id);
  if (accepted.length !== 286 || history.length !== 286 ||
      original.send_mode !== "custom_message_image" || original.template_name !== "ph_msg_img_v1" || original.template_language !== "it" ||
      !str(original.normalized_message) || sanitizeWhatsAppTemplateText(str(original.normalized_message)) !== original.normalized_message ||
      original.attachment_mime_type !== "image/jpeg" || !str(original.attachment_file_name)) {
    throw new Error("Contenuto originale o prove accepted non verificabili.");
  }
  const url = new URL(str(original.attachment_public_url));
  if (url.origin !== "https://vqtoxgcacosdqtoxihko.supabase.co" || !url.pathname.startsWith("/storage/v1/object/public/media/phonesia/opportunita/")) throw new Error("Allegato originale non verificabile.");
  for (const row of history) {
    const meta = obj(row.metadata);
    const attempts = arr(meta.meta_send_attempts);
    const proof = attempts.find(a => a.status === "success" && a.whatsapp_message_id === meta.whatsapp_message_id);
    const template = obj(obj(proof?.payload_summary).template);
    const components = arr(template.components);
    const header = components.find(c => c.type === "header");
    const body = components.find(c => c.type === "body");
    const names = arr(body?.parameters).map(p => p.parameter_name);
    if (row.send_mode !== original.send_mode || row.messaggio !== original.normalized_message ||
        row.attachment_public_url !== original.attachment_public_url || row.attachment_file_name !== original.attachment_file_name ||
        meta.template_name !== original.template_name || template.name !== original.template_name || obj(template.language).code !== original.template_language ||
        obj(arr(header?.parameters)[0]?.image).link !== original.attachment_public_url || names.join(",") !== "nome_cliente,messaggio") {
      throw new Error("Il payload originale non coincide con le prove storiche: nessun accodamento.");
    }
  }
  return original;
}

function historyMessageIds(row: RecordRow): string[] {
  const m = obj(row.metadata);
  return [...new Set([str(m.whatsapp_message_id), str(m.meta_message_id), ...arr(m.meta_messages).map(x => str(x.id)),
    ...arr(m.meta_send_attempts).map(a => str(a.whatsapp_message_id) || str(a.meta_message_id))].filter(Boolean))];
}
function rowPromo(row: RecordRow) { return str(row.promo_key) || str(obj(row.metadata).promo_key); }

export function evaluateRecoveryRecipients(report: RecoveryReport, data: RecoveryData, now: Date) {
  const { start, end } = getRomeTodayBounds(now);
  const inToday = (v: unknown) => Boolean(str(v)) && Date.parse(str(v)) >= +start && Date.parse(str(v)) < +end;
  const clients = new Map(data.clients.map(c => [Number(c.id), c]));
  const campaignPromos = new Map(data.campaigns.map(c => [str(c.id), str(c.promo_key)]));
  const statuses = new Map<string, RecordRow[]>();
  for (const s of data.statuses) statuses.set(str(s.whatsapp_message_id), [...(statuses.get(str(s.whatsapp_message_id)) ?? []), s]);
  const phones = report.selected_ids_in_order.map(id => recoveryPhone(clients.get(id)?.telefono));
  const duplicatePhones = new Set(phones.filter((p, i) => p && phones.indexOf(p) !== i));
  const attemptsByRecipient = new Map<string, RecordRow[]>();
  for (const a of data.attempts) attemptsByRecipient.set(str(a.recipient_id), [...(attemptsByRecipient.get(str(a.recipient_id)) ?? []), a]);
  return report.selected_ids_in_order.map((id, inputPosition) => {
    const client = clients.get(id);
    const phone = phones[inputPosition];
    const matches = (row: RecordRow, additional: unknown[] = []) => Number(row.cliente_id) === id ||
      Boolean(phone && [row.normalized_phone, ...additional].some(p => recoveryPhone(p) === phone));
    const reasons = new Set<string>();
    const evidence: RecordRow[] = [];
    const add = (reason: string, row?: RecordRow) => { reasons.add(reason); if (row) evidence.push(row); };
    if (!client) add("cliente_non_trovato");
    if (client?.whatsapp_active !== true) add("whatsapp_non_attivo");
    if (!phone) add("telefono_non_valido");
    if (phone && phone !== recoveryPhone(report.rows[inputPosition].telefono_normalizzato)) add("telefono_cambiato_dal_report");
    if (phone && duplicatePhones.has(phone)) add("telefono_duplicato_nella_selezione");
    const marketing = data.consents.filter(c => Number(c.cliente_id) === id && str(c.tipo_evento).toLowerCase().includes("marketing"))
      .sort((a, b) => Date.parse(str(b.created_at)) - Date.parse(str(a.created_at)) || Number(b.id) - Number(a.id));
    if (marketing[0]?.tipo_evento !== "marketing_accepted") add("consenso_marketing_attuale_assente");
    for (const r of data.recipients) {
      const linked = statuses.get(str(r.whatsapp_message_id)) ?? [];
      if (!matches(r, linked.map(s => s.recipient_phone))) continue;
      const promo = campaignPromos.get(str(r.campaign_id));
      const proof = { table: "phonesia_whatsapp_campaign_recipients", id: r.id, campaign_id: r.campaign_id, state: r.send_state };
      if (promo === RECOVERY.promoKey && (r.send_state === "accepted" || r.whatsapp_message_id)) add("promo_gia_accepted", proof);
      if (["pending", "processing", "uncertain"].includes(str(r.send_state)) || r.lease_token) add("tentativo_in_corso_o_incerto", proof);
      if (r.send_state === "accepted" && inToday(r.accepted_at)) add("blocco_promo_giornaliero_Europe_Rome", proof);
      for (const a of attemptsByRecipient.get(str(r.id)) ?? []) {
        if (["processing", "uncertain"].includes(str(a.outcome)) || !a.finished_at) add("tentativo_in_corso_o_incerto", { table: "phonesia_whatsapp_campaign_attempts", id: a.id, outcome: a.outcome });
        if (a.outcome === "accepted" && promo === RECOVERY.promoKey) add("promo_gia_accepted", { table: "phonesia_whatsapp_campaign_attempts", id: a.id });
      }
    }
    for (const h of data.history) {
      const ids = historyMessageIds(h);
      const linked = ids.flatMap(mid => statuses.get(mid) ?? []);
      const m = obj(h.metadata);
      if (!matches(h, [clients.get(Number(h.cliente_id))?.telefono, m.to, m.recipient_phone, ...linked.map(s => s.recipient_phone)])) continue;
      const proof = { table: "phonesia_opportunita_inviate", id: h.id, batch_id: h.batch_id, message_ids: ids };
      if (rowPromo(h) === RECOVERY.promoKey) add(ids.length ? "promo_gia_accepted" : "storico_promo_esito_incerto", proof);
      if (isWhatsAppPromoOpportunity(h as { cliente_id: number }) && [h.inviato_at, h.sent_at, h.created_at].some(inToday)) add("blocco_promo_giornaliero_Europe_Rome", proof);
      if (arr(m.meta_send_attempts).some(a => ["processing", "uncertain", "timeout"].includes(str(a.status)))) add("tentativo_in_corso_o_incerto", proof);
    }
    // An unlinked status near the old send window is documented evidence, not the accepted residual absence of evidence.
    const originalHistory = data.history.filter(h => h.batch_id === RECOVERY.originalId);
    const times = originalHistory.map(h => Date.parse(str(h.created_at))).filter(Number.isFinite);
    const oldStart = times.length ? Math.min(...times) - 60_000 : NaN;
    const oldEnd = times.length ? Math.max(...times) + 20 * 60_000 : NaN;
    const knownIds = new Set([...data.history.flatMap(historyMessageIds), ...data.recipients.map(r => str(r.whatsapp_message_id))]);
    for (const s of data.statuses) {
      if (!phone || recoveryPhone(s.recipient_phone) !== phone) continue;
      const time = Date.parse(str(s.timestamp_meta) || str(s.created_at));
      if (!knownIds.has(str(s.whatsapp_message_id)) && time >= oldStart && time <= oldEnd) add("stato_whatsapp_storico_non_riconciliato", { table: "phonesia_whatsapp_message_statuses", id: s.id });
      if (!knownIds.has(str(s.whatsapp_message_id)) && inToday(s.timestamp_meta)) add("stato_whatsapp_odierno_non_riconciliato", { table: "phonesia_whatsapp_message_statuses", id: s.id });
    }
    return { clienteId: id, inputPosition, phone, client: client ?? null, marketingEvent: marketing[0] ?? null, reasons: [...reasons], evidence };
  });
}

export function existingRecovery(data: RecoveryData, report: RecoveryReport) {
  const existing = data.campaigns.find(c => c.idempotency_key === RECOVERY_KEY);
  const related = data.campaigns.filter(c => c.id !== RECOVERY.originalId && (c.promo_key === RECOVERY.promoKey ||
    data.recipients.some(r => r.campaign_id === c.id && obj(obj(r.eligibility_snapshot).manual_recovery).original_campaign_id === RECOVERY.originalId)));
  if (related.some(c => c.id !== existing?.id)) throw new Error(`Esiste già un’altra campagna collegata alla promo: ${related.map(c => c.id).join(",")}. Verificare, senza creare un secondo recupero.`);
  if (!existing) return null;
  const rows = data.recipients.filter(r => r.campaign_id === existing.id).sort((a, b) => Number(a.input_position) - Number(b.input_position));
  const original = data.campaigns.find(c => c.id === RECOVERY.originalId)!;
  if (existing.historical !== false || existing.snapshot_complete !== true || rows.length !== report.selected_ids_in_order.length ||
      existing.promo_key !== RECOVERY.promoKey || JSON.stringify(campaignContent(existing)) !== JSON.stringify(campaignContent(original)) ||
      rows.some((r, i) => {
        const snapshot = obj(r.eligibility_snapshot); const audit = obj(snapshot.manual_recovery);
        return Number(snapshot.authorized_cliente_id) !== report.selected_ids_in_order[i] || (r.cliente_id != null && Number(r.cliente_id) !== report.selected_ids_in_order[i]) ||
          audit.report_sha256 !== RECOVERY.reportSha256 || audit.original_campaign_id !== RECOVERY.originalId ||
          audit.residual_risk_accepted !== true || (!r.exclusion_reason && obj(snapshot.payload).to !== r.normalized_phone);
      })) throw new Error("Recupero esistente incoerente con il report: nessuna modifica o ripetizione.");
  return { campaign: existing, rows };
}

export async function inspectOriginalAttachment(original: RecordRow) {
  const response = await fetch(str(original.attachment_public_url), { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== original.attachment_mime_type) throw new Error("Allegato originale non accessibile o tipo differente.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Allegato JPEG originale non valido.");
  return { url: original.attachment_public_url, content_type: original.attachment_mime_type, bytes: bytes.length, sha256: sha256(bytes) };
}

export function prepareRecovery(report: RecoveryReport, data: RecoveryData, adminId: string, now: Date, attachment: RecordRow) {
  const original = verifyOriginalContent(data);
  const evaluated = evaluateRecoveryRecipients(report, data, now);
  const exclusions = evaluated.filter(r => r.reasons.length).map(r => ({ cliente_id: r.clienteId, reasons: r.reasons }));
  const audit = {
    original_campaign_id: RECOVERY.originalId, promo_key: RECOVERY.promoKey, report_path: RECOVERY.reportPath,
    report_sha256: RECOVERY.reportSha256, selection_sha256_ordered_csv: RECOVERY.selectionSha256, idempotency_key: RECOVERY_KEY,
    residual_risk_accepted: true, manual_authorization: RECOVERY.authorization, authorized_admin_id: adminId,
    checked_at: now.toISOString(), timezone: "Europe/Rome", attachment,
  };
  const snapshot = evaluated.map((row, i) => ({
    cliente_id: row.client ? row.clienteId : null,
    input_position: row.inputPosition,
    normalized_phone: row.reasons.length ? null : row.phone,
    exclusion_reason: row.reasons.length ? row.reasons.join("; ") : null,
    eligibility_snapshot: {
      authorized_cliente_id: row.clienteId, manual_recovery: audit,
      ...(i === 0 ? { recovery_manifest: { selected_ids_in_order: report.selected_ids_in_order, exclusions, original_campaign: original, content: campaignContent(original) } } : {}),
      client: row.client, normalized_phone: row.phone, latest_marketing_event: row.marketingEvent, exclusion_reasons: row.reasons, exclusion_evidence: row.evidence,
      payload: row.phone && row.client ? buildCustomTemplatePayload({
        to: row.phone, mode: "image", templateName: str(original.template_name), language: str(original.template_language),
        nomeCliente: str(row.client.nome), messaggio: str(original.normalized_message), mediaUrl: str(original.attachment_public_url),
      }) : null,
    },
  }));
  const reasons: Record<string, number> = {};
  for (const e of exclusions) for (const reason of e.reasons) reasons[reason] = (reasons[reason] ?? 0) + 1;
  return { original, snapshot, exclusions, reasons, candidates: report.selected_ids_in_order.length, queued: evaluated.length - exclusions.length, checkedAt: now.toISOString() };
}

export async function executeManualRecovery(options: {
  report: RecoveryReport; adminId: string; dryRun: boolean;
  load: () => Promise<RecoveryData>;
  inspectAttachment: (original: RecordRow) => Promise<RecordRow>;
  createSnapshot: (args: RecordRow) => Promise<string>;
  now?: () => Date;
}) {
  const data = await options.load();
  const original = verifyOriginalContent(data);
  const existing = existingRecovery(data, options.report);
  if (existing) return { ok: true, existing: true, campaignId: existing.campaign.id, state: existing.campaign.state, candidates: options.report.selected_ids_in_order.length,
    queued: existing.rows.filter(r => !r.exclusion_reason).length, recipients: existing.rows };
  const attachment = await options.inspectAttachment(original);
  const now = (options.now ?? (() => new Date()))();
  const plan = prepareRecovery(options.report, data, options.adminId, now, attachment);
  if (options.dryRun) return { ok: true, dryRun: true, ...plan };
  // Re-read immediately before enqueue. Never enqueue a stale dry-run selection.
  const fresh = await options.load();
  const raced = existingRecovery(fresh, options.report);
  if (raced) return { ok: true, existing: true, campaignId: raced.campaign.id, state: raced.campaign.state };
  const checked = prepareRecovery(options.report, fresh, options.adminId, (options.now ?? (() => new Date()))(), attachment);
  if (JSON.stringify(campaignContent(checked.original)) !== JSON.stringify(campaignContent(original))) throw new Error("Contenuto originale cambiato durante la verifica.");
  if (!checked.queued) return { ok: true, campaignId: null, ...checked, message: "Tutti i candidati esclusi: nessuna campagna creata." };
  const c = checked.original;
  const campaignId = await options.createSnapshot({
    p_idempotency_key: RECOVERY_KEY, p_promo_key: RECOVERY.promoKey,
    p_promo_name: `Recupero manuale Luce&Gas — ${RECOVERY.originalId}`,
    p_send_mode: c.send_mode, p_template_name: c.template_name, p_template_language: c.template_language,
    p_normalized_message: c.normalized_message, p_attachment_public_url: c.attachment_public_url,
    p_attachment_file_name: c.attachment_file_name, p_attachment_mime_type: c.attachment_mime_type,
    p_created_by: options.adminId, p_recipients: checked.snapshot,
  });
  return { ok: true, dryRun: false, campaignId, ...checked };
}
