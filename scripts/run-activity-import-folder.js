const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { createClient } = require("@supabase/supabase-js");
const { sendAlertEmail } = require("./lib/alert-email");

const ROOT_DIR = path.resolve(__dirname, "..");
const DEFAULT_INBOX_DIR = "/Users/Shared/PHONESIA_IMPORT/inbox";
const ERROR_DIR = "/Users/Shared/PHONESIA_IMPORT/error";
const LOGS_DIR = "/Users/Shared/PHONESIA_IMPORT/logs";
const SMTP_FALLBACK_ENV_FILE = "/Users/archimede/phonesia_ai/.env.importer";
const IMPORT_SCRIPT = path.join(ROOT_DIR, "scripts/import-phonesia-activity-xlsx.js");
const MATCH_SCRIPT = path.join(ROOT_DIR, "scripts/match-phonesia-activity-customers.js");
const BATCH_TABLE = "phonesia_activity_import_batches";
const HASH_COLUMN = "source_file_hash";
const FILE_STABLE_MIN_AGE_MS = 10 * 60 * 1000;

function parseArgs(argv) {
  const args = {
    commit: false,
    silentNoFile: false,
    finalMondayCheck: false,
  };

  for (const arg of argv) {
    if (arg === "--commit") {
      args.commit = true;
    } else if (arg === "--silent-no-file") {
      args.silentNoFile = true;
    } else if (arg === "--final-monday-check") {
      args.finalMondayCheck = true;
    } else if (arg === "--force") {
      throw new Error("Argomento vietato: --force non deve essere usato dal runner.");
    } else if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else {
      throw new Error(`Argomento non riconosciuto: ${arg}`);
    }
  }

  if (args.silentNoFile && args.finalMondayCheck) {
    throw new Error("Usa solo una opzione tra --silent-no-file e --final-monday-check.");
  }

  return args;
}

function printHelp() {
  console.log(
    [
      "Uso: node scripts/run-activity-import-folder.js [--commit]",
      "",
      "Senza --commit esegue solo simulazione e non sposta/elimina file.",
      "Con --commit importa, esegue il matching clienti e pulisce la inbox.",
      "Inbox da PHONESIA_IMPORT_INBOX_DIR; fallback: /Users/Shared/PHONESIA_IMPORT/inbox.",
      "Importa solo file .xlsx non modificati negli ultimi 10 minuti.",
      "--silent-no-file non invia alert se la inbox e vuota e termina con exit code 0.",
      "--final-monday-check invia alert se alle 22 manca un file importabile e termina con exit code 1.",
    ].join("\n")
  );
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
    ...loadEnvFile(SMTP_FALLBACK_ENV_FILE),
    ...loadEnvFile(path.join(ROOT_DIR, ".env.production.local")),
    ...loadEnvFile(path.join(ROOT_DIR, ".env.local")),
    ...process.env,
  };
}

function resolveInboxDir(env) {
  const configuredInboxDir = String(env.PHONESIA_IMPORT_INBOX_DIR || "").trim();

  if (configuredInboxDir) {
    return {
      dir: configuredInboxDir,
      source: "PHONESIA_IMPORT_INBOX_DIR",
      fallback_used: false,
      fallback_dir: DEFAULT_INBOX_DIR,
    };
  }

  return {
    dir: DEFAULT_INBOX_DIR,
    source: "fallback",
    fallback_used: true,
    fallback_dir: DEFAULT_INBOX_DIR,
  };
}

function createSupabase(env) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("NEXT_PUBLIC_SUPABASE_URL o SUPABASE_URL mancante.");
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY mancante.");

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function nowIso() {
  return new Date().toISOString();
}

function safeTimestamp(value) {
  return value.replace(/[:.]/g, "-");
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function createLogPath(startedAt) {
  return path.join(LOGS_DIR, `activity-import-${safeTimestamp(startedAt)}.json`);
}

function writeJsonLog(log) {
  ensureDirectory(LOGS_DIR);
  const payload = { ...log };
  delete payload.started_ms;
  fs.writeFileSync(log.log_path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function serializeError(error) {
  if (!error) return null;
  if (typeof error === "string") return { message: error };

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    stack: error.stack || null,
  };
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function getExcelFiles(inboxDir, checkedAtMs) {
  ensureDirectory(inboxDir);

  return fs
    .readdirSync(inboxDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .filter((entry) => entry.name.toLowerCase().endsWith(".xlsx"))
    .filter((entry) => !entry.name.startsWith("~$"))
    .map((entry) => {
      const filePath = path.join(inboxDir, entry.name);
      const stat = fs.statSync(filePath);
      const ageMs = checkedAtMs - stat.mtimeMs;
      const stableAfterMs = stat.mtimeMs + FILE_STABLE_MIN_AGE_MS;
      const isStable = ageMs >= FILE_STABLE_MIN_AGE_MS;

      return {
        file_name: entry.name,
        file_path: filePath,
        size_bytes: stat.size,
        modified_at: stat.mtime.toISOString(),
        modified_ms: stat.mtimeMs,
        age_seconds: Math.max(0, Math.floor(ageMs / 1000)),
        stable_after: new Date(stableAfterMs).toISOString(),
        stable_in_seconds: isStable
          ? 0
          : Math.max(0, Math.ceil((FILE_STABLE_MIN_AGE_MS - ageMs) / 1000)),
        is_stable: isStable,
      };
    })
    .sort((a, b) => a.modified_ms - b.modified_ms || a.file_name.localeCompare(b.file_name));
}

function logFileInfo(file) {
  const { modified_ms: _modifiedMs, ...item } = file;
  return item;
}

function makeFileNotStableResult(file) {
  return {
    ...logFileInfo(file),
    status: "file_not_stable_yet",
    source_file_hash: null,
    batch_id: null,
    duplicate: null,
    phases: {},
    actions: [],
    moved_to_error: null,
    failed_phase: null,
    error: null,
    skipped_reason: `File modificato da meno di 10 minuti; importabile dopo ${file.stable_after}.`,
  };
}

function buildUnstableFilesMessage(files) {
  const details = files
    .map(
      (file) =>
        `- ${file.file_name}: modificato ${file.modified_at}, importabile dopo ${file.stable_after}`
    )
    .join("\n");

  return [
    "Uno o piu file .xlsx sono presenti nella inbox ma non sono ancora stabili.",
    "Il runner importa solo file non modificati negli ultimi 10 minuti.",
    "",
    details,
  ].join("\n");
}

async function findExistingBatchByHash(supabase, fileHash) {
  const { data, error } = await supabase
    .from(BATCH_TABLE)
    .select(`id, import_status, created_at, source_file_name, source_sheet_name, ${HASH_COLUMN}`)
    .eq(HASH_COLUMN, fileHash)
    .limit(1);

  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

function commandLabel(args) {
  return [process.execPath, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function runNodeScript(scriptPath, args) {
  const commandArgs = [scriptPath, ...args];

  return new Promise((resolve) => {
    const startedAt = nowIso();
    const result = {
      command: commandLabel(commandArgs),
      started_at: startedAt,
      finished_at: null,
      duration_ms: null,
      exit_code: null,
      signal: null,
      ok: false,
      stdout: "",
      stderr: "",
      error: null,
    };
    const startedMs = Date.now();
    const child = spawn(process.execPath, commandArgs, {
      cwd: ROOT_DIR,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      result.stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      result.stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      result.finished_at = nowIso();
      result.duration_ms = Date.now() - startedMs;
      result.error = serializeError(error);
      resolve(result);
    });

    child.on("close", (code, signal) => {
      result.finished_at = nowIso();
      result.duration_ms = Date.now() - startedMs;
      result.exit_code = code;
      result.signal = signal;
      result.ok = code === 0;
      resolve(result);
    });
  });
}

function extractBatchIdFromOutput(output) {
  const match = String(output || "").match(/Batch ID:\s*(\d+)/i);
  return match ? Number(match[1]) : null;
}

function isDuplicateImportOutput(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return /file hash gia presente nel batch \d+/i.test(output);
}

function extractDuplicateBatchId(result) {
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  const match = output.match(/file hash gia presente nel batch (\d+)/i);
  return match ? Number(match[1]) : null;
}

function commandFailureMessage(result) {
  const pieces = [
    `Comando: ${result.command}`,
    `Exit code: ${result.exit_code === null ? "(nessuno)" : result.exit_code}`,
  ];

  if (result.signal) pieces.push(`Signal: ${result.signal}`);
  if (result.error) pieces.push(`Errore processo: ${JSON.stringify(result.error)}`);
  if (result.stderr) pieces.push(`STDERR:\n${result.stderr.trim()}`);
  if (result.stdout) pieces.push(`STDOUT:\n${result.stdout.trim()}`);

  return pieces.join("\n\n");
}

function uniqueErrorPath(fileName) {
  ensureDirectory(ERROR_DIR);

  const parsed = path.parse(fileName);
  const base = `${safeTimestamp(nowIso())}-${parsed.name}${parsed.ext}`;
  let target = path.join(ERROR_DIR, base);
  let counter = 2;

  while (fs.existsSync(target)) {
    target = path.join(ERROR_DIR, `${safeTimestamp(nowIso())}-${parsed.name}-${counter}${parsed.ext}`);
    counter += 1;
  }

  return target;
}

function moveFileToError(sourcePath, fileName) {
  const targetPath = uniqueErrorPath(fileName);

  try {
    fs.renameSync(sourcePath, targetPath);
  } catch (error) {
    if (error && error.code === "EXDEV") {
      fs.copyFileSync(sourcePath, targetPath);
      fs.unlinkSync(sourcePath);
    } else {
      throw error;
    }
  }

  return targetPath;
}

function deleteFile(sourcePath) {
  fs.unlinkSync(sourcePath);
}

function makeFailureEvent({
  outcome,
  fileResult,
  failedPhase,
  error,
  logPath,
  recommendedAction,
  subject,
}) {
  return {
    outcome,
    subject: subject || null,
    executed_at: nowIso(),
    file_name: fileResult ? fileResult.file_name : null,
    file_path: fileResult ? fileResult.file_path : null,
    source_file_hash: fileResult ? fileResult.source_file_hash : null,
    batch_id: fileResult ? fileResult.batch_id : null,
    failed_phase: failedPhase,
    error,
    log_path: logPath,
    recommended_action: recommendedAction,
  };
}

function buildAlertEmail(event) {
  const subject = event.subject || `[PHONESIA IMPORT] ${event.outcome} - ${event.failed_phase}`;
  const body = [
    `Esito: ${event.outcome}`,
    `Data e ora esecuzione: ${event.executed_at}`,
    `Nome file: ${event.file_name || "(non presente)"}`,
    `Hash file: ${event.source_file_hash || "(non disponibile)"}`,
    `Batch ID: ${event.batch_id || "(non disponibile)"}`,
    `Fase fallita: ${event.failed_phase}`,
    "",
    "Errore completo:",
    event.error || "(nessun dettaglio)",
    "",
    `Percorso log JSON: ${event.log_path}`,
    "",
    "Azione consigliata:",
    event.recommended_action,
  ].join("\n");

  return { subject, body };
}

async function sendImportFailureAlert({ env, event }) {
  const email = buildAlertEmail(event);
  const result = await sendAlertEmail({ env, email });
  if (!result.configured) console.log("Alert email non configurato");
  return result;
}

async function writeLogAndMaybeAlert({ log, env, event }) {
  log.finished_at = nowIso();
  log.duration_ms = Date.now() - log.started_ms;
  writeJsonLog(log);

  if (event) {
    const alertResult = await sendImportFailureAlert({ env, event });
    log.alert_email_configured = Boolean(alertResult.configured);
    log.alerts.push(alertResult);
    log.finished_at = nowIso();
    log.duration_ms = Date.now() - log.started_ms;
    writeJsonLog(log);
  }
}

function plannedAction(result, type, reason, targetPath) {
  result.actions.push({
    type,
    executed: false,
    reason,
    target_path: targetPath || null,
    at: nowIso(),
  });
}

function executedAction(result, type, targetPath) {
  result.actions.push({
    type,
    executed: true,
    target_path: targetPath || null,
    at: nowIso(),
  });
}

async function markFailure({ result, args, failedPhase, errorMessage, recommendedAction }) {
  result.status = "error";
  result.failed_phase = failedPhase;
  result.error = errorMessage;

  if (args.commit && fs.existsSync(result.file_path)) {
    try {
      const movedTo = moveFileToError(result.file_path, result.file_name);
      result.moved_to_error = movedTo;
      executedAction(result, "move_to_error", movedTo);
      recommendedAction = `${recommendedAction}\nFile spostato in error: ${movedTo}`;
    } catch (moveError) {
      const serialized = serializeError(moveError);
      result.move_to_error_error = serialized;
      result.actions.push({
        type: "move_to_error",
        executed: false,
        error: serialized,
        at: nowIso(),
      });
      recommendedAction = `${recommendedAction}\nSpostamento in error fallito: ${
        serialized ? serialized.message : String(moveError)
      }`;
    }
  } else if (!args.commit) {
    plannedAction(result, "move_to_error", "dry_run");
  }

  return {
    outcome: "ERRORE",
    failedPhase,
    error: errorMessage,
    recommendedAction,
  };
}

async function handleDuplicate({ result, args, duplicate }) {
  result.status = "duplicate";
  result.batch_id = duplicate && duplicate.id ? duplicate.id : result.batch_id;
  result.duplicate = duplicate || null;

  if (args.commit) {
    deleteFile(result.file_path);
    executedAction(result, "delete_duplicate_from_inbox");
  } else {
    plannedAction(result, "delete_duplicate_from_inbox", "dry_run");
  }

  return null;
}

async function processFile({ file, args, supabase }) {
  const result = {
    file_name: file.file_name,
    file_path: file.file_path,
    size_bytes: file.size_bytes,
    modified_at: file.modified_at,
    source_file_hash: null,
    status: "started",
    batch_id: null,
    duplicate: null,
    phases: {},
    actions: [],
    moved_to_error: null,
    failed_phase: null,
    error: null,
  };

  try {
    result.source_file_hash = sha256File(file.file_path);

    try {
      const duplicate = await findExistingBatchByHash(supabase, result.source_file_hash);
      result.phases.duplicate_check = { ok: true, checked_at: nowIso() };

      if (duplicate) {
        await handleDuplicate({ result, args, duplicate });
        return { result, failure: null };
      }
    } catch (error) {
      const errorMessage = serializeError(error).message;
      result.phases.duplicate_check = {
        ok: false,
        checked_at: nowIso(),
        error: serializeError(error),
      };
      const failure = await markFailure({
        result,
        args,
        failedPhase: "dry_run",
        errorMessage,
        recommendedAction:
          "Verificare configurazione Supabase e colonna source_file_hash prima di riprovare.",
      });
      return { result, failure };
    }

    const dryRun = await runNodeScript(IMPORT_SCRIPT, ["--file", file.file_path]);
    result.phases.dry_run = dryRun;

    if (!dryRun.ok) {
      if (isDuplicateImportOutput(dryRun)) {
        await handleDuplicate({
          result,
          args,
          duplicate: {
            id: extractDuplicateBatchId(dryRun),
            detected_from: "import_dry_run_output",
          },
        });
        return { result, failure: null };
      }

      const failure = await markFailure({
        result,
        args,
        failedPhase: "dry_run",
        errorMessage: commandFailureMessage(dryRun),
        recommendedAction:
          "Correggere il file Excel o la configurazione Supabase, poi ripetere la simulazione.",
      });
      return { result, failure };
    }

    if (!args.commit) {
      result.status = "dry_run_ok";
      plannedAction(result, "import_database", "dry_run");
      plannedAction(result, "matching_clienti", "dry_run_no_batch_id");
      plannedAction(result, "delete_imported_from_inbox", "dry_run");
      return { result, failure: null };
    }

    const importRun = await runNodeScript(IMPORT_SCRIPT, ["--file", file.file_path, "--commit"]);
    result.phases.import = importRun;

    if (!importRun.ok) {
      try {
        const batch = await findExistingBatchByHash(supabase, result.source_file_hash);
        if (batch) result.batch_id = batch.id;
      } catch (lookupError) {
        result.batch_lookup_after_import_error = serializeError(lookupError);
      }

      const failure = await markFailure({
        result,
        args,
        failedPhase: "import",
        errorMessage: commandFailureMessage(importRun),
        recommendedAction:
          "Controllare il log, correggere la causa dell'import database e valutare il batch eventualmente creato.",
      });
      return { result, failure };
    }

    const batch = await findExistingBatchByHash(supabase, result.source_file_hash);
    result.batch_id =
      (batch && batch.id) || extractBatchIdFromOutput(importRun.stdout) || extractBatchIdFromOutput(importRun.stderr);

    if (!result.batch_id) {
      const failure = await markFailure({
        result,
        args,
        failedPhase: "import",
        errorMessage: "Import completato ma batch_id non rilevabile da output o source_file_hash.",
        recommendedAction:
          "Verificare manualmente phonesia_activity_import_batches e non rilanciare lo stesso file senza chiarire lo stato.",
      });
      return { result, failure };
    }

    const matchingRun = await runNodeScript(MATCH_SCRIPT, [
      "--batch-id",
      String(result.batch_id),
      "--commit",
    ]);
    result.phases.matching = matchingRun;

    if (!matchingRun.ok) {
      const failure = await markFailure({
        result,
        args,
        failedPhase: "matching",
        errorMessage: commandFailureMessage(matchingRun),
        recommendedAction:
          "Controllare tabella link, dati clienti e log matching; l'import batch e gia stato creato.",
      });
      return { result, failure };
    }

    deleteFile(result.file_path);
    executedAction(result, "delete_imported_from_inbox");
    result.status = "imported";
    return { result, failure: null };
  } catch (error) {
    const failure = await markFailure({
      result,
      args,
      failedPhase: "unexpected",
      errorMessage: JSON.stringify(serializeError(error), null, 2),
      recommendedAction:
        "Controllare il log JSON e risolvere l'errore tecnico prima di rilanciare il runner.",
    });
    return { result, failure };
  }
}

async function main() {
  const startedAt = nowIso();
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const inbox = resolveInboxDir(env);

  if (args.help) {
    printHelp();
    return;
  }

  ensureDirectory(ERROR_DIR);
  ensureDirectory(LOGS_DIR);
  console.log(`Inbox import attivita negozi: ${inbox.dir} (${inbox.source})`);

  const log = {
    runner: "phonesia_activity_import_folder",
    started_at: startedAt,
    finished_at: null,
    duration_ms: null,
    started_ms: Date.now(),
    mode: args.commit ? "commit" : "dry_run",
    no_file_mode: args.finalMondayCheck
      ? "final_monday_check"
      : args.silentNoFile
        ? "silent_no_file"
        : "normal",
    inbox_dir: inbox.dir,
    inbox_source: inbox.source,
    inbox_fallback_used: inbox.fallback_used,
    inbox_fallback_dir: inbox.fallback_dir,
    error_dir: ERROR_DIR,
    logs_dir: LOGS_DIR,
    log_path: createLogPath(startedAt),
    file_stability_min_age_minutes: FILE_STABLE_MIN_AGE_MS / 60 / 1000,
    file_stability_checked_at: null,
    alert_email_configured: false,
    email_system: {
      project_email_system_found: true,
      provider: "resend_with_smtp_fallback",
      provider_configured: Boolean(
        (env.PHONESIA_IMPORT_ALERT_EMAIL || env.ALERT_EMAIL_TO) &&
          ((env.RESEND_API_KEY && env.PHONESIA_IMPORT_ALERT_FROM) ||
            (env.SMTP_USERNAME && env.SMTP_PASSWORD && (env.SMTP_FROM || env.SMTP_USERNAME))),
      ),
      notes:
        "Alert errori import via Resend; se Resend fallisce, fallback SMTP con credenziali locali.",
    },
    files_found: [],
    results: [],
    alerts: [],
    status: "started",
    outcome: "started",
  };

  try {
    const checkedAtMs = Date.now();
    const files = getExcelFiles(inbox.dir, checkedAtMs);
    const stableFiles = files.filter((file) => file.is_stable);
    const unstableFiles = files.filter((file) => !file.is_stable);
    const unstableResults = unstableFiles.map(makeFileNotStableResult);

    log.file_stability_checked_at = new Date(checkedAtMs).toISOString();
    log.files_found = files.map(logFileInfo);
    log.results.push(...unstableResults);

    if (files.length === 0) {
      if (args.silentNoFile) {
        log.status = "no_file_silent";
        log.outcome = "no_file_silent";
        log.no_file_reason = `Nessun file .xlsx trovato in ${inbox.dir}. Controllo intermedio silenzioso.`;
        await writeLogAndMaybeAlert({ log, env, event: null });
        process.exitCode = 0;
        return;
      }

      const isFinalMondayCheck = args.finalMondayCheck;
      log.status = isFinalMondayCheck ? "no_file_final_alert" : "no_file_alert";
      log.outcome = log.status;
      const event = makeFailureEvent({
        outcome: "NESSUN FILE",
        fileResult: null,
        failedPhase: "no_file",
        error: `Nessun file .xlsx trovato in ${inbox.dir}. I file temporanei Excel ~$*.xlsx sono ignorati.`,
        logPath: log.log_path,
        recommendedAction:
          "Copiare il file Excel ufficiale nella inbox e rilanciare il runner.",
        subject: isFinalMondayCheck ? "PHONESIA IMPORT - Nessun file trovato alle 22" : null,
      });
      await writeLogAndMaybeAlert({ log, env, event });
      process.exitCode = 1;
      return;
    }

    if (stableFiles.length === 0) {
      log.status = args.finalMondayCheck ? "file_not_stable_final_alert" : "file_not_stable_yet";
      log.outcome = log.status;
      log.no_import_reason = "Nessun file .xlsx stabile trovato: file presenti ma modificati da meno di 10 minuti.";

      const event = args.finalMondayCheck
        ? makeFailureEvent({
            outcome: "FILE NON IMPORTABILE",
            fileResult: unstableResults[0] || null,
            failedPhase: "file_not_stable_yet",
            error: buildUnstableFilesMessage(unstableFiles),
            logPath: log.log_path,
            recommendedAction:
              "Attendere la fine della sincronizzazione Google Drive o della scrittura Excel, poi rilanciare il runner.",
            subject: "PHONESIA IMPORT - File non importabile alle 22",
          })
        : null;

      await writeLogAndMaybeAlert({ log, env, event });
      process.exitCode = args.finalMondayCheck ? 1 : 0;
      return;
    }

    const supabase = createSupabase(env);
    let hadFailure = false;

    if (args.finalMondayCheck && unstableFiles.length > 0) {
      hadFailure = true;
      const event = makeFailureEvent({
        outcome: "FILE NON IMPORTABILE",
        fileResult: unstableResults[0] || null,
        failedPhase: "file_not_stable_yet",
        error: buildUnstableFilesMessage(unstableFiles),
        logPath: log.log_path,
        recommendedAction:
          "Attendere la fine della sincronizzazione Google Drive o della scrittura Excel, poi rilanciare il runner.",
        subject: "PHONESIA IMPORT - File non importabile alle 22",
      });
      await writeLogAndMaybeAlert({ log, env, event });
    }

    for (const file of stableFiles) {
      const { result, failure } = await processFile({ file, args, supabase });
      log.results.push(result);
      log.status = failure ? "error" : "running";
      log.outcome = failure ? "error" : "running";

      if (failure) {
        hadFailure = true;
        const event = makeFailureEvent({
          outcome: failure.outcome,
          fileResult: result,
          failedPhase: failure.failedPhase,
          error: failure.error,
          logPath: log.log_path,
          recommendedAction: failure.recommendedAction,
        });
        await writeLogAndMaybeAlert({ log, env, event });
      } else {
        writeJsonLog({
          ...log,
          finished_at: nowIso(),
          duration_ms: Date.now() - log.started_ms,
        });
      }
    }

    log.status = hadFailure ? "error" : "ok";
    log.outcome = log.status;
    await writeLogAndMaybeAlert({ log, env, event: null });
    if (hadFailure) process.exitCode = 1;
  } catch (error) {
    const serialized = serializeError(error);
    log.status = "unexpected";
    log.outcome = "unexpected";
    log.unexpected_error = serialized;
    const event = makeFailureEvent({
      outcome: "ERRORE",
      fileResult: null,
      failedPhase: "unexpected",
      error: JSON.stringify(serialized, null, 2),
      logPath: log.log_path,
      recommendedAction:
        "Controllare permessi delle cartelle operative, configurazione ambiente e log JSON.",
    });
    await writeLogAndMaybeAlert({ log, env, event });
    process.exitCode = 1;
  } finally {
    if (log.started_ms) delete log.started_ms;
  }
}

main().catch((error) => {
  console.error("Errore runner:", error.message || error);
  process.exit(1);
});
