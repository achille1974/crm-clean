#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.resolve(__dirname, "../..");
const REPORT_DIR =
  "/Users/archimede/CRM_LOCAL_NON_COMMITTARE/phonesia-promo-backfill";
const APPLY_ENV_NAME = "PHONESIA_PROMO_BACKFILL_APPLY_ENABLED";
const PAGE_SIZE = 1000;

function parseArgs(argv) {
  const args = {
    dryRun: true,
    apply: false,
  };

  for (const arg of argv.slice(2)) {
    if (arg === "--dry-run") {
      args.dryRun = true;
      args.apply = false;
    } else if (arg === "--apply") {
      args.apply = true;
      args.dryRun = false;
    } else {
      throw new Error(`Argomento non supportato: ${arg}`);
    }
  }

  return args;
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const env = {};
  const content = fs.readFileSync(filePath, "utf8");

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();

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
    ...loadEnvFile(path.join(ROOT_DIR, ".env.production.local")),
    ...loadEnvFile(path.join(ROOT_DIR, ".env.local")),
    ...process.env,
  };
}

function createSupabaseAdmin(env) {
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL mancante.");
  }

  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function loadPromoHistoryHelper() {
  const helperPath = path.join(
    ROOT_DIR,
    "lib/phonesia/opportunita-promo-history.ts",
  );
  const source = fs.readFileSync(helperPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: helperPath,
  }).outputText;
  const moduleObject = { exports: {} };
  const localRequire = (specifier) => require(specifier);

  new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    output,
  )(
    moduleObject.exports,
    localRequire,
    moduleObject,
    helperPath,
    path.dirname(helperPath),
  );

  if (typeof moduleObject.exports.getPromoKeyFromHistoryRow !== "function") {
    throw new Error("Helper getPromoKeyFromHistoryRow non disponibile.");
  }

  return {
    getPromoKeyFromHistoryRow: moduleObject.exports.getPromoKeyFromHistoryRow,
  };
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function metadataString(metadata, key) {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function inferBackfillReadiness(row) {
  const metadata = asRecord(row.metadata);
  const sendMode =
    normalizeText(row.send_mode) ||
    metadataString(metadata, "send_mode") ||
    metadataString(metadata, "tipo_invio");
  const opportunityCode = normalizeText(row.opportunita_code);
  const isCustom =
    sendMode.startsWith("custom_message") ||
    opportunityCode.toUpperCase().startsWith("CUSTOM_MESSAGE");
  const templateName =
    metadataString(metadata, "template_name") ||
    metadataString(metadata, "template_usato");
  const standardService =
    metadataString(metadata, "standard_service") ||
    (opportunityCode.toUpperCase().startsWith("CUSTOM_MESSAGE")
      ? ""
      : opportunityCode);
  const customMessage =
    metadataString(metadata, "custom_message") ||
    metadataString(metadata, "messaggio_personalizzato") ||
    normalizeText(row.messaggio);

  if (!metadata && !sendMode && !opportunityCode) {
    return {
      ok: false,
      reason: "metadata e campi promo insufficienti",
    };
  }

  if (!templateName) {
    return {
      ok: false,
      reason: "template_name mancante",
    };
  }

  if (!sendMode) {
    return {
      ok: false,
      reason: "send_mode mancante",
    };
  }

  if (isCustom && !customMessage) {
    return {
      ok: false,
      reason: "messaggio custom mancante",
    };
  }

  if (!isCustom && !standardService) {
    return {
      ok: false,
      reason: "servizio standard mancante",
    };
  }

  return {
    ok: true,
    reason: null,
  };
}

async function fetchRowsMissingPromoKey(supabase) {
  const rows = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await supabase
      .from("phonesia_opportunita_inviate")
      .select(
        [
          "id",
          "cliente_id",
          "opportunita_code",
          "channel",
          "sent_at",
          "created_at",
          "send_mode",
          "inviato_at",
          "messaggio",
          "attachment_public_url",
          "attachment_file_name",
          "metadata",
          "promo_key",
        ].join(", "),
      )
      .is("promo_key", null)
      .order("id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Errore lettura storico promo: ${error.message}`);
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

function buildReport(summary) {
  const lines = [
    "Backfill promo_key Phonesia",
    `Modalita: ${summary.mode}`,
    `Generato: ${new Date().toISOString()}`,
    "",
    `Righe lette: ${summary.totalRows}`,
    `Righe backfillabili: ${summary.backfillableRows}`,
    `Righe saltate: ${summary.skippedRows}`,
    `Promo_key distinte: ${summary.distinctPromoKeys}`,
    `Righe aggiornate: ${summary.updatedRows}`,
    `Update falliti: ${summary.updateFailedRows}`,
    "",
    "Motivi righe saltate:",
  ];

  if (summary.skipReasons.size === 0) {
    lines.push("- nessuno");
  } else {
    for (const [reason, count] of [...summary.skipReasons.entries()].sort()) {
      lines.push(`- ${reason}: ${count}`);
    }
  }

  lines.push("", "Promo_key distinte:");
  for (const [promoKey, count] of [...summary.promoKeyCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )) {
    lines.push(`- ${promoKey}: ${count}`);
  }

  lines.push("", "Esempi righe saltate:");
  if (summary.skippedSamples.length === 0) {
    lines.push("- nessuna");
  } else {
    for (const sample of summary.skippedSamples) {
      lines.push(
        `- id=${sample.id} cliente_id=${sample.cliente_id ?? ""} motivo=${sample.reason}`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

function writeReport(summary) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const timestamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  const reportPath = path.join(
    REPORT_DIR,
    `phonesia_promo_key_backfill_${summary.mode}_${timestamp}.txt`,
  );

  fs.writeFileSync(reportPath, buildReport(summary), "utf8");
  return reportPath;
}

async function applyBackfillUpdates(supabase, rows) {
  let updatedRows = 0;
  let updateFailedRows = 0;

  for (const row of rows) {
    const { error } = await supabase
      .from("phonesia_opportunita_inviate")
      .update({ promo_key: row.promoKey })
      .eq("id", row.id)
      .is("promo_key", null);

    if (error) {
      updateFailedRows += 1;
      console.error(
        `Update fallito per id=${row.id}: ${error.message}`,
      );
    } else {
      updatedRows += 1;
    }
  }

  return { updatedRows, updateFailedRows };
}

async function main() {
  const args = parseArgs(process.argv);
  const env = loadEnv();

  if (args.apply && env[APPLY_ENV_NAME] !== "true") {
    console.error(
      `Apply backfill disabilitato: impostare ${APPLY_ENV_NAME}=true per aggiornare il DB.`,
    );
    process.exitCode = 2;
    return;
  }

  const supabase = createSupabaseAdmin(env);
  const { getPromoKeyFromHistoryRow } = loadPromoHistoryHelper();
  const rows = await fetchRowsMissingPromoKey(supabase);
  const backfillable = [];
  const skipReasons = new Map();
  const skippedSamples = [];
  const promoKeyCounts = new Map();

  for (const row of rows) {
    const readiness = inferBackfillReadiness(row);

    if (!readiness.ok) {
      const reason = readiness.reason || "dati insufficienti";
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
      if (skippedSamples.length < 20) {
        skippedSamples.push({
          id: row.id,
          cliente_id: row.cliente_id,
          reason,
        });
      }
      continue;
    }

    const promoKey = getPromoKeyFromHistoryRow(row);
    if (!promoKey) {
      const reason = "promo_key non calcolabile";
      skipReasons.set(reason, (skipReasons.get(reason) ?? 0) + 1);
      if (skippedSamples.length < 20) {
        skippedSamples.push({
          id: row.id,
          cliente_id: row.cliente_id,
          reason,
        });
      }
      continue;
    }

    backfillable.push({ id: row.id, promoKey });
    promoKeyCounts.set(promoKey, (promoKeyCounts.get(promoKey) ?? 0) + 1);
  }

  let updatedRows = 0;
  let updateFailedRows = 0;

  if (args.apply && backfillable.length > 0) {
    const result = await applyBackfillUpdates(supabase, backfillable);
    updatedRows = result.updatedRows;
    updateFailedRows = result.updateFailedRows;
  }

  const summary = {
    mode: args.apply ? "apply" : "dry-run",
    totalRows: rows.length,
    backfillableRows: backfillable.length,
    skippedRows: rows.length - backfillable.length,
    distinctPromoKeys: promoKeyCounts.size,
    updatedRows,
    updateFailedRows,
    skipReasons,
    skippedSamples,
    promoKeyCounts,
  };
  const reportPath = writeReport(summary);

  console.log(`Modalita: ${summary.mode}`);
  console.log(`Righe lette: ${summary.totalRows}`);
  console.log(`Righe backfillabili: ${summary.backfillableRows}`);
  console.log(`Righe saltate: ${summary.skippedRows}`);
  console.log(`Promo_key distinte: ${summary.distinctPromoKeys}`);
  console.log(`Righe aggiornate: ${summary.updatedRows}`);
  console.log(`Update falliti: ${summary.updateFailedRows}`);
  console.log(`Report: ${reportPath}`);

  if (!args.apply) {
    console.log("Dry-run: nessun DB aggiornato.");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
