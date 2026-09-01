#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const DEFAULT_APP_URL = "https://app.crm-supreme.it";
const GRAPH_API_VERSION = "v23.0";
const PHONESIA_REMINDER_TEMPLATE_NAME = "ph_rem_24h_v2";
const BELTRAMI_REMINDER_TEMPLATE_NAME = "bel_rem_24h_v1";
const TEMPLATE_LANGUAGE = "it";
const MAX_ROWS_PER_AREA = 200;

const DUE_STATUSES = ["pending", "taken"];

const HANDOFF_COLUMNS = [
  "id",
  "created_at",
  "updated_at",
  "business_area",
  "cliente_id",
  "cliente_phone",
  "cliente_nome",
  "negozio_id",
  "destinazione_nome",
  "destinazione_phone",
  "inbound_message_id",
  "inbound_body",
  "notification_whatsapp_message_id",
  "reply_link",
  "mark_done_url",
  "marked_done_at",
  "status",
  "due_at",
  "reminder_sent_at",
  "reminder_count",
  "metadata",
].join(", ");

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (arg === "--apply") {
      args.dryRun = false;
      args.apply = true;
    } else {
      throw new Error(`Argomento non riconosciuto: ${arg}`);
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const text = fs.readFileSync(filePath, "utf8");

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;

    const separator = trimmed.indexOf("=");
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    env[key] = value;
  }

  return env;
}

function loadEnv() {
  return {
    ...loadEnvFile(path.resolve(".env.production.local")),
    ...loadEnvFile(path.resolve(".env.local")),
    ...process.env,
  };
}

function requireEnv(env, keys, label) {
  const missing = keys.filter((key) => !env[key]);

  if (missing.length > 0) {
    throw new Error(`${label}: env mancanti: ${missing.join(", ")}`);
  }
}

function hasEnv(env, keys) {
  return keys.every((key) => Boolean(env[key]));
}

function createSupabaseAdmin(url, serviceRoleKey) {
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function compactTemplateText(value, maxLength) {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= maxLength) {
    return text;
  }

  return text.slice(0, maxLength - 1).trimEnd();
}

function toMetaRecipient(rawPhone) {
  const cleaned = String(rawPhone ?? "").trim().replace(/[^\d+]/g, "");
  const numeric = cleaned.startsWith("+") ? cleaned.slice(1) : cleaned;

  return /^\d+$/.test(numeric) ? numeric : null;
}

function getPublicBaseUrl() {
  return DEFAULT_APP_URL;
}

function toAbsoluteUrl(value, baseUrl) {
  const text = compactTemplateText(value, 500);
  if (!text) return "";

  try {
    return new URL(text).toString();
  } catch {
    try {
      return new URL(text, baseUrl).toString();
    } catch {
      return text;
    }
  }
}

function safeMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value;
}

function buildTemplateParameters(area, row, baseUrl) {
  const commonParameters = [
    {
      type: "text",
      parameter_name: "cliente_nome",
      text: compactTemplateText(row.cliente_nome || "Cliente", 120),
    },
    {
      type: "text",
      parameter_name: "cliente_telefono",
      text: compactTemplateText(row.cliente_phone || "", 60),
    },
    {
      type: "text",
      parameter_name: "messaggio_cliente",
      text: compactTemplateText(row.inbound_body || "Richiesta cliente", 320),
    },
    {
      type: "text",
      parameter_name: "link_risposta",
      text: compactTemplateText(toAbsoluteUrl(row.reply_link, baseUrl), 500),
    },
    {
      type: "text",
      parameter_name: "link_chiusura",
      text: compactTemplateText(toAbsoluteUrl(row.mark_done_url, baseUrl), 500),
    },
  ];

  if (area === "phonesia") {
    return [
      {
        type: "text",
        parameter_name: "negozio_nome",
        text: compactTemplateText(row.destinazione_nome || "PHONESIA", 120),
      },
      ...commonParameters,
    ];
  }

  return commonParameters;
}

async function fetchDueRequests(supabase, tableName, nowIso) {
  const { data, error } = await supabase
    .from(tableName)
    .select(HANDOFF_COLUMNS)
    .in("status", DUE_STATUSES)
    .lte("due_at", nowIso)
    .eq("reminder_count", 0)
    .is("marked_done_at", null)
    .order("due_at", { ascending: true })
    .limit(MAX_ROWS_PER_AREA);

  if (error) throw error;
  return data ?? [];
}

async function sendTemplateReminder(params) {
  const to = toMetaRecipient(params.toPhone);

  if (!params.accessToken || !params.phoneNumberId) {
    return {
      status: "skipped",
      reason: "missing_configuration",
      whatsappMessageId: null,
    };
  }

  if (!to) {
    return {
      status: "skipped",
      reason: "invalid_recipient",
      whatsappMessageId: null,
    };
  }

  try {
    const response = await fetch(
      `https://graph.facebook.com/${params.graphApiVersion}/${params.phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${params.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: params.templateName,
            language: {
              code: params.language,
            },
            components: [
              {
                type: "body",
                parameters: params.parameters,
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      return {
        status: "failed",
        reason: "meta_rejected",
        whatsappMessageId: null,
      };
    }

    const result = await response.json().catch(() => null);

    return {
      status: "sent",
      reason: "sent",
      whatsappMessageId: result?.messages?.[0]?.id ?? null,
    };
  } catch {
    return {
      status: "failed",
      reason: "network_error",
      whatsappMessageId: null,
    };
  }
}

async function markReminderSent(params) {
  const sentAt = new Date().toISOString();
  const metadata = {
    ...safeMetadata(params.row.metadata),
    reminder_24h: {
      sent_at: sentAt,
      template_name: params.templateName,
      whatsapp_message_id: params.whatsappMessageId ?? null,
    },
  };

  const { data, error } = await params.supabase
    .from(params.tableName)
    .update({
      status: "reminded",
      reminder_sent_at: sentAt,
      reminder_count: 1,
      updated_at: sentAt,
      metadata,
    })
    .eq("id", params.row.id)
    .in("status", DUE_STATUSES)
    .eq("reminder_count", 0)
    .is("marked_done_at", null)
    .select("id");

  if (error) throw error;
  return (data ?? []).length > 0;
}

function printDryRunRows(area, rows) {
  const visibleRows = rows.slice(0, 20);

  for (const row of visibleRows) {
    console.log(
      `  - ${area} #${row.id}: ${row.destinazione_nome || "destinazione"} / ${
        row.cliente_nome || "cliente"
      } / due_at=${row.due_at}`,
    );
  }

  if (rows.length > visibleRows.length) {
    console.log(`  ... altre ${rows.length - visibleRows.length} richieste non mostrate`);
  }
}

async function processArea(params) {
  const rows = await fetchDueRequests(params.supabase, params.tableName, params.nowIso);
  const summary = {
    area: params.area,
    tableName: params.tableName,
    dueRows: rows.length,
    sent: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };

  console.log(`${params.label}: richieste da sollecitare=${rows.length}`);

  if (params.dryRun) {
    printDryRunRows(params.area, rows);
    return summary;
  }

  for (const row of rows) {
    const parameters = buildTemplateParameters(params.area, row, params.baseUrl);
    const sendResult = await sendTemplateReminder({
      accessToken: params.accessToken,
      phoneNumberId: params.phoneNumberId,
      graphApiVersion: params.graphApiVersion,
      toPhone: row.destinazione_phone,
      templateName: params.templateName,
      language: params.language,
      parameters,
    });

    if (sendResult.status !== "sent") {
      summary.failed += 1;
      console.error(`${params.label}: reminder non inviato per handoff #${row.id}`, {
        status: sendResult.status,
        reason: sendResult.reason,
      });
      continue;
    }

    const updated = await markReminderSent({
      supabase: params.supabase,
      tableName: params.tableName,
      row,
      templateName: params.templateName,
      whatsappMessageId: sendResult.whatsappMessageId,
    });

    if (!updated) {
      summary.skipped += 1;
      console.warn(`${params.label}: handoff #${row.id} gia gestito o gia sollecitato.`);
      continue;
    }

    summary.sent += 1;
    summary.updated += 1;
    console.log(`${params.label}: reminder inviato per handoff #${row.id}`);
  }

  return summary;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const nowIso = new Date().toISOString();
  const baseUrl = getPublicBaseUrl();
  const graphApiVersion = env.WHATSAPP_GRAPH_API_VERSION || GRAPH_API_VERSION;
  const phonesiaDbKeys = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const beltramiDbKeys = ["BELTRAMI_SUPABASE_URL", "BELTRAMI_SUPABASE_SERVICE_ROLE_KEY"];

  if (args.apply && env.HANDOFF_REMINDERS_APPLY_ENABLED !== "true") {
    console.error("Apply reminder disabilitato: template o autorizzazione non pronti.");
    process.exitCode = 1;
    return;
  }

  if (args.apply) {
    requireEnv(env, phonesiaDbKeys, "Phonesia DB");
    requireEnv(env, beltramiDbKeys, "Beltrami DB");
    requireEnv(env, ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"], "Phonesia WhatsApp");
    requireEnv(
      env,
      ["BELTRAMI_WHATSAPP_ACCESS_TOKEN", "BELTRAMI_WHATSAPP_PHONE_NUMBER_ID"],
      "Beltrami WhatsApp",
    );
  }

  console.log(`Modalita: ${args.apply ? "apply" : "dry-run"}`);
  console.log(`Checked at: ${nowIso}`);
  console.log(`Dry-run: ${args.dryRun ? "nessun invio WhatsApp, nessun update DB" : "no"}`);

  const summaries = [];
  if (hasEnv(env, phonesiaDbKeys)) {
    const phonesiaSupabase = createSupabaseAdmin(
      env.NEXT_PUBLIC_SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
    );
    summaries.push(
      await processArea({
        area: "phonesia",
        label: "Phonesia",
        tableName: "phonesia_handoff_richieste",
        supabase: phonesiaSupabase,
        nowIso,
        dryRun: args.dryRun,
        baseUrl,
        accessToken: env.WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
        graphApiVersion,
        templateName: PHONESIA_REMINDER_TEMPLATE_NAME,
        language: env.WHATSAPP_STORE_HANDOFF_TEMPLATE_LANGUAGE || TEMPLATE_LANGUAGE,
      }),
    );
  } else {
    console.log("Phonesia: controllo saltato, env DB non configurate.");
  }

  if (hasEnv(env, beltramiDbKeys)) {
    const beltramiSupabase = createSupabaseAdmin(
      env.BELTRAMI_SUPABASE_URL,
      env.BELTRAMI_SUPABASE_SERVICE_ROLE_KEY,
    );
    summaries.push(
      await processArea({
        area: "beltrami",
        label: "Beltrami",
        tableName: "beltrami_handoff_richieste",
        supabase: beltramiSupabase,
        nowIso,
        dryRun: args.dryRun,
        baseUrl,
        accessToken: env.BELTRAMI_WHATSAPP_ACCESS_TOKEN,
        phoneNumberId: env.BELTRAMI_WHATSAPP_PHONE_NUMBER_ID,
        graphApiVersion,
        templateName: BELTRAMI_REMINDER_TEMPLATE_NAME,
        language: env.BELTRAMI_WHATSAPP_NOTIFY_TEMPLATE_LANGUAGE || TEMPLATE_LANGUAGE,
      }),
    );
  } else {
    console.log("Beltrami: controllo saltato, env DB non configurate.");
  }

  const totalDue = summaries.reduce((acc, item) => acc + item.dueRows, 0);
  const totalSent = summaries.reduce((acc, item) => acc + item.sent, 0);
  const totalUpdated = summaries.reduce((acc, item) => acc + item.updated, 0);
  const totalFailed = summaries.reduce((acc, item) => acc + item.failed, 0);
  const totalSkipped = summaries.reduce((acc, item) => acc + item.skipped, 0);

  console.log("Riepilogo:");
  console.log(`  richieste da sollecitare: ${totalDue}`);
  console.log(`  reminder inviati: ${totalSent}`);
  console.log(`  record aggiornati: ${totalUpdated}`);
  console.log(`  skip: ${totalSkipped}`);
  console.log(`  errori: ${totalFailed}`);
  if (args.dryRun) {
    console.log("  WhatsApp reali inviati in dry-run: no");
  }

  if (totalFailed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("Errore reminder handoff 24h:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
