const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const PROJECT_DIR = "/Users/archimede/crm-clean";
const ROOT_DIR = path.resolve(__dirname, "..");
const PACKAGE_JSON = path.join(PROJECT_DIR, "package.json");
const MONITOR_LOGS_DIR = "/Users/Shared/PHONESIA_MONITOR/logs";
const GOOGLE_DRIVE_INBOX =
  "/Users/archimede/Il mio Drive/CRM_IMPORT/ATTIVITA_NEGOZI/inbox";
const DISK_ALERT_FREE_PERCENT = 15;
const SSH_FAILED_THRESHOLD_DEFAULT = 20;
const CONTRACT_PROCESSING_MAX_AGE_MS = 30 * 60 * 1000;
const CONTRACT_RECENT_LOG_WINDOW_MS = 30 * 60 * 1000;
const CONTRACT_LOG_TAIL_BYTES = 96 * 1024;

const IMPORT_SCRIPTS = [
  "scripts/run-activity-import-folder.js",
  "scripts/import-phonesia-activity-xlsx.js",
  "scripts/match-phonesia-activity-customers.js",
];

const LAUNCHD_LABELS = [
  "com.phonesia.activity-import.silent",
  "com.phonesia.activity-import.final",
];

const CONTRACT_IMPORTER_BASE = "/Users/archimede/phonesia_ai";
const CONTRACT_PATHS = {
  parser: path.join(CONTRACT_IMPORTER_BASE, "contract_importer.py"),
  parser_wrapper: path.join(CONTRACT_IMPORTER_BASE, "start_contract_importer.sh"),
  sync: path.join(CONTRACT_IMPORTER_BASE, "shared_contract_sync.py"),
  sync_wrapper: path.join(CONTRACT_IMPORTER_BASE, "start_shared_contract_sync.sh"),
  healthcheck: path.join(CONTRACT_IMPORTER_BASE, "importer_healthcheck.py"),
  health_state: path.join(CONTRACT_IMPORTER_BASE, ".healthcheck/importer_health_state.json"),
};
const CONTRACT_QUEUE_DIRS = {
  processing: path.join(CONTRACT_IMPORTER_BASE, "contracts_queue/processing"),
  processed: path.join(CONTRACT_IMPORTER_BASE, "contracts_queue/processed"),
  errori: path.join(CONTRACT_IMPORTER_BASE, "contracts_queue/errori"),
  scartati: path.join(CONTRACT_IMPORTER_BASE, "contracts_queue/scartati"),
};
const CONTRACT_LOG_FILES = {
  importer_out: path.join(CONTRACT_IMPORTER_BASE, "logs/contract_importer.out.log"),
  importer_err: path.join(CONTRACT_IMPORTER_BASE, "logs/contract_importer.err.log"),
  importer_log: path.join(CONTRACT_IMPORTER_BASE, "logs/importer.log"),
  healthcheck_out: path.join(CONTRACT_IMPORTER_BASE, "logs/importer_healthcheck.out.log"),
  healthcheck_err: path.join(CONTRACT_IMPORTER_BASE, "logs/importer_healthcheck.err.log"),
  sync_out: path.join(CONTRACT_IMPORTER_BASE, "shared_contract_sync.out.log"),
  sync_err: path.join(CONTRACT_IMPORTER_BASE, "shared_contract_sync.err.log"),
};
const CONTRACT_LAUNCHD_LABELS = [
  "com.phonesia.contract-importer.v1",
  "com.phonesia.shared-contract-sync.v3",
  "com.phonesia.importer-healthcheck.v1",
];
const CONTRACT_LOG_CRITICAL_RE =
  /\b(traceback|exception)\b|permission denied|no space left|errno 28|supabase|quota|authentication (?:failed|error)|auth (?:failed|error)|invalid auth|unauthorized|forbidden/i;
const CONTRACT_LOG_WARNING_RE =
  /llm extraction failed|read timed out|\b(failed|error|errore)\b/i;

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
  return path.join(MONITOR_LOGS_DIR, `crm-mac-health-${safeTimestamp(startedAt)}.json`);
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || "Error",
    message: error.message || String(error),
    code: error.code || null,
  };
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
    ...loadEnvFile(path.join(ROOT_DIR, ".env.production.local")),
    ...loadEnvFile(path.join(ROOT_DIR, ".env.local")),
    ...process.env,
  };
}

function commandLabel(command, args) {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ");
}

function truncateText(value, maxLength = 12000) {
  const text = String(value || "");
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n... [troncato ${text.length - maxLength} caratteri]`;
}

function runCommand(command, args = [], options = {}) {
  const startedAt = nowIso();
  const result = {
    command: commandLabel(command, args),
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

  try {
    const completed = spawnSync(command, args, {
      cwd: options.cwd || ROOT_DIR,
      env: options.env || process.env,
      encoding: "utf8",
      timeout: options.timeoutMs || 15000,
      maxBuffer: options.maxBuffer || 1024 * 1024,
    });

    result.finished_at = nowIso();
    result.duration_ms = Date.now() - startedMs;
    result.exit_code = completed.status;
    result.signal = completed.signal;
    result.ok = completed.status === 0 && !completed.error;
    result.stdout = truncateText(completed.stdout || "", options.maxOutput || 12000);
    result.stderr = truncateText(completed.stderr || "", options.maxOutput || 12000);
    result.error = completed.error ? serializeError(completed.error) : null;
  } catch (error) {
    result.finished_at = nowIso();
    result.duration_ms = Date.now() - startedMs;
    result.error = serializeError(error);
  }

  return result;
}

function addAlert(log, severity, code, message, details = null) {
  log.alerts.push({
    severity,
    code,
    message,
    details,
    at: nowIso(),
  });
}

function fileExists(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return { exists: true, stat };
  } catch (error) {
    return { exists: false, error: serializeError(error) };
  }
}

function checkFileReadable(filePath) {
  try {
    const stat = fs.statSync(filePath);
    fs.accessSync(filePath, fs.constants.R_OK);
    return {
      ok: stat.isFile(),
      exists: true,
      is_file: stat.isFile(),
      size_bytes: stat.size,
      modified_at: stat.mtime.toISOString(),
      modified_ms: stat.mtimeMs,
    };
  } catch (error) {
    return {
      ok: false,
      exists: false,
      is_file: false,
      error: serializeError(error),
    };
  }
}

function checkDirectoryReadable(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    fs.accessSync(dirPath, fs.constants.R_OK);
    return {
      ok: stat.isDirectory(),
      exists: true,
      is_directory: stat.isDirectory(),
      modified_at: stat.mtime.toISOString(),
      modified_ms: stat.mtimeMs,
    };
  } catch (error) {
    return { ok: false, exists: false, is_directory: false, error: serializeError(error) };
  }
}

function parseDfOutput(output) {
  const lines = String(output || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);
  if (lines.length < 2) return null;

  const parts = lines[lines.length - 1].trim().split(/\s+/);
  if (parts.length < 6) return null;

  const totalKb = Number(parts[1]);
  const usedKb = Number(parts[2]);
  const availableKb = Number(parts[3]);
  if (!Number.isFinite(totalKb) || !Number.isFinite(availableKb) || totalKb <= 0) {
    return null;
  }

  const availablePercent = Math.round((availableKb / totalKb) * 10000) / 100;

  return {
    filesystem: parts[0],
    total_kb: totalKb,
    used_kb: usedKb,
    available_kb: availableKb,
    capacity: parts[4],
    mounted_on: parts.slice(5).join(" "),
    available_percent: availablePercent,
  };
}

function checkBaseMacCrm(log) {
  const project = fileExists(PROJECT_DIR);
  const packageJson = fileExists(PACKAGE_JSON);
  const nodeVersion = runCommand(process.execPath, ["--version"], { timeoutMs: 5000 });
  const diskCommand = runCommand("df", ["-Pk", PROJECT_DIR], { timeoutMs: 10000 });
  const disk = diskCommand.ok ? parseDfOutput(diskCommand.stdout) : null;

  log.checks.base = {
    project_dir: {
      path: PROJECT_DIR,
      ok: project.exists && project.stat.isDirectory(),
      exists: project.exists,
      is_directory: project.exists ? project.stat.isDirectory() : false,
      error: project.error || null,
    },
    package_json: {
      path: PACKAGE_JSON,
      ok: packageJson.exists && packageJson.stat.isFile(),
      exists: packageJson.exists,
      is_file: packageJson.exists ? packageJson.stat.isFile() : false,
      error: packageJson.error || null,
    },
    node: {
      ok: nodeVersion.ok,
      executable: process.execPath,
      version: nodeVersion.ok ? nodeVersion.stdout.trim() : null,
      command: nodeVersion,
    },
    disk: {
      ok: Boolean(disk),
      threshold_free_percent: DISK_ALERT_FREE_PERCENT,
      command: diskCommand,
      parsed: disk,
    },
  };

  if (!log.checks.base.project_dir.ok) {
    addAlert(log, "critical", "project_dir_missing", `${PROJECT_DIR} non esiste o non e una cartella.`);
  }
  if (!log.checks.base.package_json.ok) {
    addAlert(log, "critical", "package_json_missing", `${PACKAGE_JSON} non esiste o non e un file.`);
  }
  if (!nodeVersion.ok) {
    addAlert(log, "critical", "node_unavailable", "Node non risulta eseguibile.", {
      command: nodeVersion.command,
      stderr: nodeVersion.stderr,
      error: nodeVersion.error,
    });
  }
  if (!disk) {
    addAlert(log, "warning", "disk_check_failed", "Controllo spazio disco non riuscito.", {
      command: diskCommand.command,
      stderr: diskCommand.stderr,
      error: diskCommand.error,
    });
  } else if (disk.available_percent < DISK_ALERT_FREE_PERCENT) {
    addAlert(log, "critical", "disk_space_low", "Spazio disco libero sotto soglia.", disk);
  }
}

function checkGoogleDrive(log) {
  const inbox = checkDirectoryReadable(GOOGLE_DRIVE_INBOX);
  log.checks.google_drive = {
    inbox_path: GOOGLE_DRIVE_INBOX,
    ok: inbox.ok,
    exists: inbox.exists,
    is_directory: inbox.is_directory,
    error: inbox.error || null,
  };

  if (!inbox.ok) {
    addAlert(
      log,
      "critical",
      "google_drive_inbox_unavailable",
      "Inbox Google Drive import attivita negozi non esistente o non accessibile.",
      log.checks.google_drive
    );
  }
}

function checkImportScripts(log) {
  const results = IMPORT_SCRIPTS.map((relativePath) => {
    const absolutePath = path.join(PROJECT_DIR, relativePath);
    const exists = fileExists(absolutePath);
    const nodeCheck =
      exists.exists && exists.stat.isFile()
        ? runCommand(process.execPath, ["--check", absolutePath], { timeoutMs: 15000 })
        : null;

    return {
      relative_path: relativePath,
      path: absolutePath,
      exists: exists.exists,
      is_file: exists.exists ? exists.stat.isFile() : false,
      node_check: nodeCheck,
      ok: Boolean(exists.exists && exists.stat.isFile() && nodeCheck && nodeCheck.ok),
      error: exists.error || null,
    };
  });

  log.checks.import_scripts = results;

  for (const result of results) {
    if (!result.exists || !result.is_file) {
      addAlert(log, "critical", "import_script_missing", `Script import mancante: ${result.relative_path}`, result);
    } else if (!result.node_check || !result.node_check.ok) {
      addAlert(log, "critical", "import_script_syntax_failed", `node --check fallito: ${result.relative_path}`, {
        path: result.path,
        command: result.node_check ? result.node_check.command : null,
        stdout: result.node_check ? result.node_check.stdout : null,
        stderr: result.node_check ? result.node_check.stderr : null,
        error: result.node_check ? result.node_check.error : null,
      });
    }
  }
}

function getCurrentUid() {
  const result = runCommand("id", ["-u"], { timeoutMs: 5000 });
  const uid = result.ok ? result.stdout.trim() : "";
  return { uid, command: result };
}

function printLaunchdLabel(label, uid) {
  const targets = uid
    ? [`gui/${uid}/${label}`, `user/${uid}/${label}`, `system/${label}`]
    : [`system/${label}`];
  const attempts = targets.map((target) =>
    runCommand("launchctl", ["print", target], { timeoutMs: 10000, maxOutput: 12000 })
  );
  const loadedAttempt = attempts.find((attempt) => attempt.ok) || null;

  return {
    label,
    ok: Boolean(loadedAttempt),
    loaded_target: loadedAttempt ? targets[attempts.indexOf(loadedAttempt)] : null,
    attempts,
    state: loadedAttempt ? extractLaunchdField(loadedAttempt.stdout, "state") : null,
    pid: loadedAttempt ? extractLaunchdField(loadedAttempt.stdout, "pid") : null,
    last_exit_code: loadedAttempt ? extractLaunchdField(loadedAttempt.stdout, "last exit code") : null,
    runs: loadedAttempt ? extractLaunchdField(loadedAttempt.stdout, "runs") : null,
  };
}

function extractLaunchdField(output, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(output || "").match(new RegExp(`${escaped}\\s*=\\s*([^\\n]+)`, "i"));
  return match ? match[1].trim() : null;
}

function checkLaunchdLabels(log) {
  const { uid, command } = getCurrentUid();

  const results = LAUNCHD_LABELS.map((label) => printLaunchdLabel(label, uid));

  log.checks.launchd = {
    uid,
    uid_command: command,
    labels: results,
  };

  for (const result of results) {
    if (!result.ok) {
      addAlert(log, "critical", "launchd_label_not_loaded", `Launchd non caricato: ${result.label}`, {
        label: result.label,
        attempted_targets: result.attempts.map((attempt) => ({
          command: attempt.command,
          exit_code: attempt.exit_code,
          stderr: attempt.stderr,
          error: attempt.error,
        })),
      });
    }
  }
}

function shouldSkipScanEntry(entryName) {
  return new Set([
    ".git",
    ".next",
    "node_modules",
    "import",
    "imports",
    ".vercel",
  ]).has(entryName);
}

function isContractCandidate(relativePath, isDirectory) {
  const normalized = relativePath.toLowerCase();
  if (!/(contratt|contract)/.test(normalized)) return false;
  if (isDirectory) return true;
  if (normalized.startsWith("scripts/")) return true;
  if (/\.(js|mjs|cjs|ts|tsx|sh|py)$/.test(normalized)) return true;
  return /(parser|parse|import|importer|queue|log)/.test(normalized);
}

function findContractParserCandidates() {
  const candidates = [];
  const stack = [PROJECT_DIR];
  const maxCandidates = 80;

  while (stack.length > 0 && candidates.length < maxCandidates) {
    const current = stack.pop();
    let entries = [];

    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch (_error) {
      continue;
    }

    for (const entry of entries) {
      if (shouldSkipScanEntry(entry.name)) continue;

      const absolutePath = path.join(current, entry.name);
      const relativePath = path.relative(PROJECT_DIR, absolutePath);

      if (entry.isDirectory()) {
        if (isContractCandidate(relativePath, true)) {
          candidates.push({ type: "directory", path: absolutePath, relative_path: relativePath });
        }
        stack.push(absolutePath);
      } else if (entry.isFile() && isContractCandidate(relativePath, false)) {
        candidates.push({ type: "file", path: absolutePath, relative_path: relativePath });
      }

      if (candidates.length >= maxCandidates) break;
    }
  }

  return candidates.sort((a, b) => a.relative_path.localeCompare(b.relative_path));
}

function envPathCandidates(env) {
  return Object.entries(env)
    .filter(([key, value]) => /(CONTRATT|CONTRACT)/i.test(key) && /(LOG|DIR|PATH)/i.test(key) && value)
    .map(([key, value]) => ({
      source: `env:${key}`,
      path: String(value),
    }))
    .filter((item) => item.path.startsWith("/"));
}

function knownContractLogDirs(env) {
  const candidates = [
    ...envPathCandidates(env),
    { source: "known", path: "/Users/Shared/PHONESIA_CONTRATTI/logs" },
    { source: "known", path: "/Users/Shared/PHONESIA_CONTRACTS/logs" },
    { source: "known", path: "/Users/Shared/PHONESIA_IMPORT/contratti/logs" },
    { source: "known", path: "/Users/Shared/PHONESIA_IMPORT_CONTRATTI/logs" },
    { source: "known", path: path.join(PROJECT_DIR, "logs") },
    { source: "known", path: path.join(PROJECT_DIR, "scripts/logs") },
  ];
  const unique = new Map();

  for (const candidate of candidates) {
    if (!unique.has(candidate.path)) unique.set(candidate.path, candidate);
  }

  return [...unique.values()];
}

function listLogFiles(dirPath) {
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile())
      .filter((entry) => /\.(json|log|txt)$/i.test(entry.name))
      .map((entry) => {
        const filePath = path.join(dirPath, entry.name);
        const stat = fs.statSync(filePath);
        return {
          path: filePath,
          name: entry.name,
          size_bytes: stat.size,
          modified_at: stat.mtime.toISOString(),
          modified_ms: stat.mtimeMs,
        };
      })
      .sort((a, b) => b.modified_ms - a.modified_ms);
  } catch (error) {
    return { error: serializeError(error) };
  }
}

function readFileTail(filePath, maxBytes = 65536) {
  const stat = fs.statSync(filePath);
  const start = Math.max(0, stat.size - maxBytes);
  const length = stat.size - start;
  const fd = fs.openSync(filePath, "r");

  try {
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, start);
    return buffer.toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function analyzeParserLog(filePath) {
  try {
    const tail = readFileTail(filePath);
    let parsedJson = null;

    try {
      parsedJson = JSON.parse(tail);
    } catch (_error) {
      parsedJson = null;
    }

    const errorMatches = tail.match(/\b(error|errore|failed|failure|critical|eccezione)\b/gi) || [];
    const okMatches = tail.match(/\b(ok|success|succeeded|completed|completato|imported)\b/gi) || [];

    return {
      ok: true,
      parsed_json_status: parsedJson && (parsedJson.status || parsedJson.outcome) ? parsedJson.status || parsedJson.outcome : null,
      error_match_count: errorMatches.length,
      ok_match_count: okMatches.length,
      tail_excerpt: truncateText(tail.slice(-3000), 3000),
    };
  } catch (error) {
    return {
      ok: false,
      error: serializeError(error),
    };
  }
}

function readJsonFile(filePath) {
  const file = checkFileReadable(filePath);
  if (!file.ok) {
    return {
      ok: false,
      path: filePath,
      file,
      data: null,
      error: file.error || { message: "File non leggibile." },
    };
  }

  try {
    return {
      ok: true,
      path: filePath,
      file,
      data: JSON.parse(fs.readFileSync(filePath, "utf8")),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      path: filePath,
      file,
      data: null,
      error: serializeError(error),
    };
  }
}

function extractContractHealthSummary(healthState) {
  const data = healthState && typeof healthState === "object" ? healthState : {};
  const summary =
    data.last_summary && typeof data.last_summary === "object" ? data.last_summary : data;
  const healthy =
    typeof summary.healthy === "boolean"
      ? summary.healthy
      : typeof data.healthy === "boolean"
        ? data.healthy
        : data.last_status === "healthy"
          ? true
          : data.last_status === "unhealthy"
            ? false
            : null;
  const processCountRaw = summary.process_count ?? data.process_count;
  const processCount = Number.isFinite(Number(processCountRaw)) ? Number(processCountRaw) : null;

  return {
    checked_at: summary.checked_at || data.checked_at || null,
    last_status: data.last_status || null,
    healthy,
    problems: Array.isArray(summary.problems) ? summary.problems : [],
    process_count: processCount,
    processes: Array.isArray(summary.processes) ? summary.processes : [],
    out_log_minutes_since_update: summary.out_log_minutes_since_update ?? null,
    err_log_minutes_since_update: summary.err_log_minutes_since_update ?? null,
    processing_count: summary.processing_count ?? null,
    processed_count: summary.processed_count ?? null,
    error_count: summary.error_count ?? null,
    scartati_count: summary.scartati_count ?? null,
    oldest_processing_age_minutes: summary.oldest_processing_age_minutes ?? null,
    recent_error_lines: summary.recent_error_lines ?? null,
    recent_discard_lines: summary.recent_discard_lines ?? null,
    recent_llm_warning_lines: summary.recent_llm_warning_lines ?? null,
    error_delta_since_last_check: summary.error_delta_since_last_check ?? null,
    scartati_delta_since_last_check: summary.scartati_delta_since_last_check ?? null,
    recent_error_delta_since_last_check: summary.recent_error_delta_since_last_check ?? null,
    recent_discard_delta_since_last_check: summary.recent_discard_delta_since_last_check ?? null,
    recent_llm_warning_delta_since_last_check: summary.recent_llm_warning_delta_since_last_check ?? null,
    processed_delta_since_last_check: summary.processed_delta_since_last_check ?? null,
    last_events: summary.last_events || null,
    discard_reasons_tail: summary.discard_reasons_tail || null,
    thresholds: summary.thresholds || null,
  };
}

function countPdfFilesInDirectory(dirPath) {
  const dir = checkDirectoryReadable(dirPath);
  if (!dir.ok) {
    return {
      ok: false,
      path: dirPath,
      directory: dir,
      pdf_count: null,
      oldest_pdf: null,
      oldest_pdf_age_minutes: null,
    };
  }

  try {
    const nowMs = Date.now();
    const pdfs = fs
      .readdirSync(dirPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".pdf"))
      .map((entry) => {
        const filePath = path.join(dirPath, entry.name);
        const stat = fs.statSync(filePath);
        return {
          name: entry.name,
          path: filePath,
          size_bytes: stat.size,
          modified_at: stat.mtime.toISOString(),
          modified_ms: stat.mtimeMs,
          age_minutes: Math.floor((nowMs - stat.mtimeMs) / 60000),
        };
      })
      .sort((a, b) => a.modified_ms - b.modified_ms);
    const oldest = pdfs[0] || null;

    return {
      ok: true,
      path: dirPath,
      directory: dir,
      pdf_count: pdfs.length,
      oldest_pdf: oldest
        ? {
            name: oldest.name,
            modified_at: oldest.modified_at,
            age_minutes: oldest.age_minutes,
            size_bytes: oldest.size_bytes,
          }
        : null,
      oldest_pdf_age_minutes: oldest ? oldest.age_minutes : null,
    };
  } catch (error) {
    return {
      ok: false,
      path: dirPath,
      directory: dir,
      pdf_count: null,
      oldest_pdf: null,
      oldest_pdf_age_minutes: null,
      error: serializeError(error),
    };
  }
}

function parseContractLogLineTime(line) {
  const isoMatch = String(line || "").match(/\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z))/);
  if (isoMatch) {
    const parsed = Date.parse(isoMatch[1]);
    return Number.isNaN(parsed) ? null : parsed;
  }

  const localMatch = String(line || "").match(/\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
  if (localMatch) {
    const parsed = Date.parse(localMatch[1].replace(" ", "T"));
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function contractLogLineIsBenign(line) {
  const lowered = String(line || "").toLowerCase();

  if (/fine sync .*errori:\s*0\b/.test(lowered)) return true;
  if (/pdf trovati nella sorgente/.test(lowered)) return true;
  if (/\bssh_auth_sock\b/.test(lowered)) return true;

  return false;
}

function collectContractLogKeywords(line, matcherKeywords) {
  const keywords = new Set();
  const lowered = String(line || "").toLowerCase();

  for (const keyword of matcherKeywords) {
    if (lowered.includes(keyword)) keywords.add(keyword);
  }

  return keywords;
}

function findContractLogCriticalMatches(text, nowMs, countUndatedLines) {
  const criticalKeywords = new Set();
  const warningKeywords = new Set();
  let criticalMatchCount = 0;
  let warningMatchCount = 0;

  for (const line of String(text || "").split(/\r?\n/)) {
    if (contractLogLineIsBenign(line)) continue;

    const isCritical = CONTRACT_LOG_CRITICAL_RE.test(line);
    const isWarning = CONTRACT_LOG_WARNING_RE.test(line);

    if (!isCritical && !isWarning) continue;

    const lineTimeMs = parseContractLogLineTime(line);

    if (lineTimeMs !== null && nowMs - lineTimeMs > CONTRACT_RECENT_LOG_WINDOW_MS) {
      continue;
    }

    if (lineTimeMs === null && (!countUndatedLines || !isCritical)) {
      continue;
    }

    if (isCritical) {
      criticalMatchCount += 1;
      for (const keyword of collectContractLogKeywords(line, [
        "traceback",
        "exception",
        "permission denied",
        "no space left",
        "errno 28",
        "supabase",
        "quota",
        "authentication failed",
        "authentication error",
        "auth failed",
        "auth error",
        "invalid auth",
        "unauthorized",
        "forbidden",
      ])) {
        criticalKeywords.add(keyword);
      }
    } else if (isWarning) {
      warningMatchCount += 1;
      for (const keyword of collectContractLogKeywords(line, [
        "llm extraction failed",
        "read timed out",
        "failed",
        "error",
        "errore",
      ])) {
        warningKeywords.add(keyword);
      }
    }
  }

  return {
    match_count: criticalMatchCount,
    keywords: [...criticalKeywords].sort(),
    warning_match_count: warningMatchCount,
    warning_keywords: [...warningKeywords].sort(),
  };
}

function analyzeContractLogFile(name, filePath, nowMs) {
  const file = checkFileReadable(filePath);
  const result = {
    name,
    path: filePath,
    ok: file.ok,
    exists: file.exists,
    size_bytes: file.size_bytes || null,
    modified_at: file.modified_at || null,
    age_minutes: file.modified_ms ? Math.floor((nowMs - file.modified_ms) / 60000) : null,
    recent_window_minutes: CONTRACT_RECENT_LOG_WINDOW_MS / 60000,
    is_recent: file.modified_ms ? nowMs - file.modified_ms <= CONTRACT_RECENT_LOG_WINDOW_MS : false,
    critical_match_count: 0,
    critical_keywords: [],
    warning_match_count: 0,
    warning_keywords: [],
    error: file.error || null,
  };

  if (!file.ok || !result.is_recent) return result;

  try {
    const tail = readFileTail(filePath, CONTRACT_LOG_TAIL_BYTES);
    const matches = findContractLogCriticalMatches(tail, nowMs, result.is_recent);
    result.critical_match_count = matches.match_count;
    result.critical_keywords = matches.keywords;
    result.warning_match_count = matches.warning_match_count;
    result.warning_keywords = matches.warning_keywords;
  } catch (error) {
    result.ok = false;
    result.error = serializeError(error);
  }

  return result;
}

function checkContractParser(log, _env) {
  const nowMs = Date.now();
  const { uid, command: uidCommand } = getCurrentUid();
  const files = Object.entries(CONTRACT_PATHS).reduce((acc, [name, filePath]) => {
    acc[name] = {
      path: filePath,
      ...checkFileReadable(filePath),
    };
    return acc;
  }, {});
  const queues = Object.entries(CONTRACT_QUEUE_DIRS).reduce((acc, [name, dirPath]) => {
    acc[name] = countPdfFilesInDirectory(dirPath);
    return acc;
  }, {});
  const launchd = CONTRACT_LAUNCHD_LABELS.map((label) => printLaunchdLabel(label, uid));
  const healthState = readJsonFile(CONTRACT_PATHS.health_state);
  const healthSummary = healthState.ok ? extractContractHealthSummary(healthState.data) : null;
  const logs = Object.entries(CONTRACT_LOG_FILES).reduce((acc, [name, filePath]) => {
    acc[name] = analyzeContractLogFile(name, filePath, nowMs);
    return acc;
  }, {});

  log.checks.contract_parser = {
    exact_parser_configured: true,
    base_dir: CONTRACT_IMPORTER_BASE,
    files,
    launchd: {
      uid,
      uid_command: uidCommand,
      labels: launchd,
    },
    health_state: {
      path: CONTRACT_PATHS.health_state,
      ok: healthState.ok,
      file: healthState.file,
      summary: healthSummary,
      error: healthState.error,
    },
    queues,
    logs,
    thresholds: {
      processing_max_age_minutes: CONTRACT_PROCESSING_MAX_AGE_MS / 60000,
      recent_log_window_minutes: CONTRACT_RECENT_LOG_WINDOW_MS / 60000,
      errori_count_is_not_alert_condition: true,
      scartati_count_is_not_alert_condition: true,
    },
    note:
      "Parser contratti reale configurato da /Users/archimede/phonesia_ai; nessun import eseguito dal monitor.",
  };

  for (const [name, result] of Object.entries(files)) {
    if (name === "health_state") continue;
    if (result.ok) continue;

    addAlert(
      log,
      "critical",
      "contract_parser_file_missing",
      `${result.path} mancante o non leggibile.`,
      { name, path: result.path, error: result.error || null }
    );
  }

  for (const result of launchd) {
    if (!result.ok) {
      addAlert(log, "critical", "contract_launchd_not_loaded", `Launchd contratti non caricato: ${result.label}`, {
        label: result.label,
        attempted_targets: result.attempts.map((attempt) => ({
          command: attempt.command,
          exit_code: attempt.exit_code,
          stderr: attempt.stderr,
          error: attempt.error,
        })),
      });
    }
  }

  if (!healthState.ok) {
    addAlert(
      log,
      "critical",
      "contract_health_state_missing",
      "Health state parser contratti mancante o non leggibile.",
      { path: CONTRACT_PATHS.health_state, error: healthState.error }
    );
  } else if (healthSummary) {
    if (healthSummary.healthy === false) {
      addAlert(log, "critical", "contract_health_unhealthy", "Healthcheck parser contratti non sano.", {
        path: CONTRACT_PATHS.health_state,
        summary: healthSummary,
      });
    }

    if (!Number.isFinite(healthSummary.process_count) || healthSummary.process_count <= 0) {
      addAlert(
        log,
        "critical",
        "contract_importer_process_missing",
        "Healthcheck parser contratti non vede processi importer attivi.",
        { path: CONTRACT_PATHS.health_state, summary: healthSummary }
      );
    }

    if (healthSummary.problems.length > 0 && healthSummary.healthy !== false) {
      addAlert(log, "warning", "contract_health_reports_problems", "Healthcheck parser contratti riporta problemi.", {
        path: CONTRACT_PATHS.health_state,
        problems: healthSummary.problems,
      });
    }
  }

  for (const [name, result] of Object.entries(queues)) {
    if (result.ok) continue;
    addAlert(
      log,
      name === "errori" || name === "scartati" ? "warning" : "critical",
      name === "errori" || name === "scartati" ? "contract_noncritical_queue_unreadable" : "contract_queue_unreadable",
      `Cartella queue contratti non accessibile: ${result.path}`,
      { name, path: result.path, error: result.error || result.directory.error || null }
    );
  }

  const processing = queues.processing;
  if (
    processing &&
    processing.ok &&
    processing.oldest_pdf_age_minutes !== null &&
    processing.oldest_pdf_age_minutes > CONTRACT_PROCESSING_MAX_AGE_MS / 60000
  ) {
    addAlert(log, "critical", "contract_processing_stuck", "PDF bloccati in processing da oltre 30 minuti.", {
      path: processing.path,
      pdf_count: processing.pdf_count,
      oldest_pdf: processing.oldest_pdf,
    });
  }

  const unreadableLogs = Object.values(logs).filter((item) => !item.ok);
  if (unreadableLogs.length > 0) {
    addAlert(log, "warning", "contract_logs_unreadable", "Uno o piu log parser contratti non sono leggibili.", {
      logs: unreadableLogs.map((item) => ({
        name: item.name,
        path: item.path,
        error: item.error,
      })),
    });
  }

  const recentCriticalLogs = Object.values(logs).filter(
    (item) => item.ok && item.is_recent && item.critical_match_count > 0
  );
  if (recentCriticalLogs.length > 0) {
    addAlert(
      log,
      "critical",
      "contract_recent_log_critical",
      "Log parser contratti recenti contengono parole critiche.",
      {
        logs: recentCriticalLogs.map((item) => ({
          name: item.name,
          path: item.path,
          modified_at: item.modified_at,
          age_minutes: item.age_minutes,
          critical_match_count: item.critical_match_count,
          critical_keywords: item.critical_keywords,
        })),
      }
    );
  }

  const recentWarningLogs = Object.values(logs).filter(
    (item) => item.ok && item.is_recent && item.warning_match_count > 0
  );
  if (recentWarningLogs.length > 0) {
    addAlert(
      log,
      "warning",
      "contract_recent_log_warning",
      "Log parser contratti recenti contengono righe da verificare, non critiche.",
      {
        logs: recentWarningLogs.map((item) => ({
          name: item.name,
          path: item.path,
          modified_at: item.modified_at,
          age_minutes: item.age_minutes,
          warning_match_count: item.warning_match_count,
          warning_keywords: item.warning_keywords,
        })),
      }
    );
  }
}

function parseWhoOutput(output) {
  return String(output || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => ({ raw: line }));
}

function parseListeningPorts(output) {
  return String(output || "")
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const parts = line.trim().split(/\s+/);
      const tcpMatch = line.match(/TCP\s+(.+?)(?:\s+\(LISTEN\)|$)/);
      const address = tcpMatch ? tcpMatch[1].trim() : "";
      const portMatch = address.match(/:(\d+)(?:->|$)/) || address.match(/:(\d+)$/);

      return {
        command: parts[0] || null,
        pid: parts[1] || null,
        user: parts[2] || null,
        address,
        port: portMatch ? Number(portMatch[1]) : null,
        raw: line,
      };
    });
}

function parseCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function countSshFailuresFromText(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => /sshd|ssh/i.test(line))
    .filter((line) => /failed|failure|invalid user|authentication error|authentication failed/i.test(line))
    .length;
}

function checkSshFailedAttempts(log, env) {
  const threshold = Number(env.PHONESIA_MONITOR_SSH_FAILED_THRESHOLD || SSH_FAILED_THRESHOLD_DEFAULT);
  const effectiveThreshold = Number.isFinite(threshold) && threshold > 0 ? threshold : SSH_FAILED_THRESHOLD_DEFAULT;
  const predicate = [
    '(process == "sshd" OR eventMessage CONTAINS[c] "sshd" OR eventMessage CONTAINS[c] "ssh")',
    '(eventMessage CONTAINS[c] "failed" OR eventMessage CONTAINS[c] "failure" OR eventMessage CONTAINS[c] "invalid user" OR eventMessage CONTAINS[c] "authentication failed")',
  ].join(" AND ");
  const logShow = runCommand(
    "log",
    ["show", "--last", "1h", "--style", "compact", "--predicate", predicate],
    { timeoutMs: 20000, maxOutput: 60000 }
  );
  let source = "log show";
  let failedCount = logShow.ok ? countSshFailuresFromText(logShow.stdout) : null;
  let fallback = null;

  if (!logShow.ok) {
    const systemLogPath = "/var/log/system.log";
    const systemLog = fileExists(systemLogPath);

    if (systemLog.exists && systemLog.stat.isFile()) {
      try {
        const tail = readFileTail(systemLogPath, 1024 * 1024);
        fallback = {
          path: systemLogPath,
          ok: true,
          failed_count: countSshFailuresFromText(tail),
          tail_checked_bytes: Math.min(systemLog.stat.size, 1024 * 1024),
        };
        source = systemLogPath;
        failedCount = fallback.failed_count;
      } catch (error) {
        fallback = {
          path: systemLogPath,
          ok: false,
          error: serializeError(error),
        };
      }
    } else {
      fallback = {
        path: systemLogPath,
        ok: false,
        error: systemLog.error || null,
      };
    }
  }

  const result = {
    ok: logShow.ok || (fallback && fallback.ok),
    source,
    threshold: effectiveThreshold,
    failed_count_last_hour: failedCount,
    log_show: logShow,
    fallback,
  };

  if (!result.ok) {
    addAlert(log, "warning", "ssh_failed_attempts_check_unavailable", "Controllo tentativi SSH falliti non disponibile.", {
      log_show: {
        command: logShow.command,
        exit_code: logShow.exit_code,
        stderr: logShow.stderr,
        error: logShow.error,
      },
      fallback,
    });
  } else if (failedCount >= effectiveThreshold) {
    addAlert(log, "critical", "ssh_failed_attempts_high", "Molti tentativi SSH falliti recenti.", {
      source,
      failed_count_last_hour: failedCount,
      threshold: effectiveThreshold,
    });
  }

  return result;
}

function checkSecurity(log, env) {
  const who = runCommand("who", [], { timeoutMs: 10000 });
  const lsof = runCommand("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
    timeoutMs: 15000,
    maxOutput: 60000,
  });
  const listeningPorts = lsof.ok ? parseListeningPorts(lsof.stdout) : [];
  const whitelist = parseCsvSet(env.PHONESIA_MONITOR_LISTEN_PORT_WHITELIST);
  const whitelistConfigured = whitelist.size > 0;
  const unexpectedPorts = whitelistConfigured
    ? listeningPorts.filter((item) => item.port !== null && !whitelist.has(String(item.port)))
    : [];
  const sshFailures = checkSshFailedAttempts(log, env);

  log.checks.security = {
    who: {
      ok: who.ok,
      command: who,
      sessions: who.ok ? parseWhoOutput(who.stdout) : [],
    },
    listening_ports: {
      ok: lsof.ok,
      command: lsof,
      ports: listeningPorts,
      whitelist_configured: whitelistConfigured,
      whitelist_ports: [...whitelist],
      unexpected_ports: unexpectedPorts,
      note: whitelistConfigured
        ? "Porte fuori whitelist segnalate come warning, senza email."
        : "Whitelist porte non configurata: elenco porte raccolto, nessuna email per porte inattese.",
    },
    ssh_failed_attempts: sshFailures,
  };

  if (!who.ok) {
    addAlert(log, "warning", "who_check_failed", "Controllo utenti collegati non riuscito.", {
      command: who.command,
      stderr: who.stderr,
      error: who.error,
    });
  }

  if (!lsof.ok) {
    addAlert(log, "warning", "listening_ports_check_failed", "Controllo porte in ascolto non riuscito.", {
      command: lsof.command,
      stderr: lsof.stderr,
      error: lsof.error,
    });
  } else if (unexpectedPorts.length > 0) {
    addAlert(log, "warning", "unexpected_listening_ports", "Porte in ascolto fuori whitelist.", {
      unexpected_ports: unexpectedPorts,
      whitelist_ports: [...whitelist],
    });
  }
}

function computeStatus(log) {
  if (log.alerts.some((alert) => alert.severity === "critical")) return "critical";
  if (log.alerts.some((alert) => alert.severity === "warning")) return "warning";
  return "ok";
}

function buildAlertEmail(log) {
  const criticalAlerts = log.alerts.filter((alert) => alert.severity === "critical");
  const body = [
    "Monitor CRM/Mac mini PHONESIA",
    "",
    `Status: ${log.status}`,
    `Esecuzione: ${log.started_at}`,
    `Log JSON: ${log.log_path}`,
    "",
    "Alert critical:",
    ...criticalAlerts.map((alert) => `- ${alert.code}: ${alert.message}`),
    "",
    "Note:",
    "- Lo script e solo diagnostico: non modifica database, clienti, contratti o task.",
    "- Email inviata solo per status critical.",
  ].join("\n");

  return {
    subject: `[PHONESIA MONITOR] ${log.status.toUpperCase()} CRM Mac mini`,
    body,
  };
}

async function sendCriticalAlert({ env, log }) {
  const recipient = String(env.PHONESIA_IMPORT_ALERT_EMAIL || "").trim();
  const apiKey = String(env.RESEND_API_KEY || "").trim();
  const from = String(env.PHONESIA_IMPORT_ALERT_FROM || "").trim();
  const missing = [];
  const email = buildAlertEmail(log);

  if (!recipient) missing.push("PHONESIA_IMPORT_ALERT_EMAIL");
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("PHONESIA_IMPORT_ALERT_FROM");

  if (missing.length > 0) {
    return {
      attempted_at: nowIso(),
      configured: false,
      sent: false,
      provider: "resend",
      skipped_reason: `${missing.join(", ")} mancante`,
      missing_configuration: missing,
      email,
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: recipient,
      subject: email.subject,
      text: email.body,
    });

    if (error) {
      return {
        attempted_at: nowIso(),
        configured: true,
        sent: false,
        provider: "resend",
        recipient,
        from,
        error: serializeError(error),
        email,
      };
    }

    return {
      attempted_at: nowIso(),
      configured: true,
      sent: true,
      provider: "resend",
      recipient,
      from,
      resend_email_id: data && data.id ? data.id : null,
      email,
    };
  } catch (error) {
    return {
      attempted_at: nowIso(),
      configured: true,
      sent: false,
      provider: "resend",
      recipient,
      from,
      error: serializeError(error),
      email,
    };
  }
}

function writeJsonLog(log) {
  ensureDirectory(MONITOR_LOGS_DIR);
  fs.writeFileSync(log.log_path, `${JSON.stringify(log, null, 2)}\n`, "utf8");
}

function printSummary(log) {
  const criticalCount = log.alerts.filter((alert) => alert.severity === "critical").length;
  const warningCount = log.alerts.filter((alert) => alert.severity === "warning").length;

  console.log("PHONESIA CRM Mac monitor");
  console.log(`Status: ${log.status}`);
  console.log(`Log JSON: ${log.log_path}`);
  console.log(`Alert critical: ${criticalCount}`);
  console.log(`Warning: ${warningCount}`);
  console.log(`Google Drive inbox: ${log.checks.google_drive.ok ? "ok" : "non accessibile"}`);
  console.log(
    `Launchd import: ${log.checks.launchd.labels.filter((item) => item.ok).length}/${log.checks.launchd.labels.length} caricati`
  );
  if (log.checks.contract_parser && log.checks.contract_parser.exact_parser_configured) {
    const contractLaunchd = log.checks.contract_parser.launchd.labels;
    const health = log.checks.contract_parser.health_state.summary;
    const queues = log.checks.contract_parser.queues;
    console.log(
      `Parser contratti: ${health && health.healthy === true ? "healthy" : "da verificare"}`
    );
    console.log(
      `Launchd contratti: ${contractLaunchd.filter((item) => item.ok).length}/${contractLaunchd.length} caricati`
    );
    console.log(
      `Queue contratti PDF: processing=${queues.processing.pdf_count}, processed=${queues.processed.pdf_count}, errori=${queues.errori.pdf_count}, scartati=${queues.scartati.pdf_count}`
    );
  } else {
    console.log("Parser contratti: percorso esatto non configurato");
  }

  if (log.alerts.length > 0) {
    console.log("Alert rilevati:");
    for (const alert of log.alerts) {
      console.log(`- ${alert.severity}: ${alert.code} - ${alert.message}`);
    }
  } else {
    console.log("Alert rilevati: nessuno");
  }

  if (log.email_alert && log.email_alert.attempted_at) {
    console.log(`Email critical: ${log.email_alert.sent ? "inviata" : "non inviata"}`);
  } else {
    console.log("Email critical: non necessaria");
  }
}

async function main() {
  const startedAt = nowIso();
  const env = loadEnv();
  const log = {
    runner: "phonesia_crm_mac_health_monitor",
    started_at: startedAt,
    finished_at: null,
    duration_ms: null,
    log_path: createLogPath(startedAt),
    status: "ok",
    readonly_note:
      "Monitor diagnostico: non modifica database, clienti, contratti, task, import o deploy. Scrive solo il log JSON e invia email solo su critical.",
    thresholds: {
      disk_alert_free_percent: DISK_ALERT_FREE_PERCENT,
      ssh_failed_attempts: Number(env.PHONESIA_MONITOR_SSH_FAILED_THRESHOLD || SSH_FAILED_THRESHOLD_DEFAULT),
      contract_processing_max_age_minutes: CONTRACT_PROCESSING_MAX_AGE_MS / 60000,
      contract_recent_log_window_minutes: CONTRACT_RECENT_LOG_WINDOW_MS / 60000,
    },
    email_system: {
      provider: "resend",
      configured: Boolean(
        env.RESEND_API_KEY &&
          env.PHONESIA_IMPORT_ALERT_EMAIL &&
          env.PHONESIA_IMPORT_ALERT_FROM
      ),
      missing_configuration: [
        !env.RESEND_API_KEY ? "RESEND_API_KEY" : null,
        !env.PHONESIA_IMPORT_ALERT_EMAIL ? "PHONESIA_IMPORT_ALERT_EMAIL" : null,
        !env.PHONESIA_IMPORT_ALERT_FROM ? "PHONESIA_IMPORT_ALERT_FROM" : null,
      ].filter(Boolean),
      sends_only_when_status: "critical",
    },
    checks: {},
    alerts: [],
    email_alert: null,
  };
  const startedMs = Date.now();

  checkBaseMacCrm(log);
  checkGoogleDrive(log);
  checkImportScripts(log);
  checkLaunchdLabels(log);
  checkContractParser(log, env);
  checkSecurity(log, env);

  log.status = computeStatus(log);

  if (log.status === "critical") {
    log.email_alert = await sendCriticalAlert({ env, log });
  }

  log.finished_at = nowIso();
  log.duration_ms = Date.now() - startedMs;
  writeJsonLog(log);
  printSummary(log);

  if (log.status === "critical") {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const serialized = serializeError(error);
  console.error("Errore monitor CRM/Mac:", serialized.message || serialized);
  process.exit(1);
});
