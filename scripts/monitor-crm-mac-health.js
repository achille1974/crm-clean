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

const IMPORT_SCRIPTS = [
  "scripts/run-activity-import-folder.js",
  "scripts/import-phonesia-activity-xlsx.js",
  "scripts/match-phonesia-activity-customers.js",
];

const LAUNCHD_LABELS = [
  "com.phonesia.activity-import.silent",
  "com.phonesia.activity-import.final",
];

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

function checkDirectoryReadable(dirPath) {
  try {
    const stat = fs.statSync(dirPath);
    fs.accessSync(dirPath, fs.constants.R_OK);
    return { ok: stat.isDirectory(), exists: true, is_directory: stat.isDirectory() };
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

function checkLaunchdLabels(log) {
  const { uid, command } = getCurrentUid();

  const results = LAUNCHD_LABELS.map((label) => {
    const targets = uid
      ? [`gui/${uid}/${label}`, `user/${uid}/${label}`, `system/${label}`]
      : [`system/${label}`];
    const attempts = targets.map((target) =>
      runCommand("launchctl", ["print", target], { timeoutMs: 10000, maxOutput: 6000 })
    );
    const loadedAttempt = attempts.find((attempt) => attempt.ok) || null;

    return {
      label,
      ok: Boolean(loadedAttempt),
      loaded_target: loadedAttempt ? targets[attempts.indexOf(loadedAttempt)] : null,
      attempts,
    };
  });

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

function checkContractParser(log, env) {
  const candidates = findContractParserCandidates();
  const logDirs = knownContractLogDirs(env).map((candidate) => {
    const dir = checkDirectoryReadable(candidate.path);
    const files = dir.ok ? listLogFiles(candidate.path) : [];
    const latest = Array.isArray(files) && files.length > 0 ? files[0] : null;

    return {
      ...candidate,
      exists: dir.exists,
      ok: dir.ok,
      error: dir.error || null,
      latest_log: latest,
      latest_log_analysis: latest ? analyzeParserLog(latest.path) : null,
      file_count: Array.isArray(files) ? files.length : null,
      files_error: files && !Array.isArray(files) ? files.error : null,
    };
  });
  const foundLogDirs = logDirs.filter((dir) => dir.ok);

  log.checks.contract_parser = {
    candidates,
    log_dirs_checked: logDirs,
    exact_parser_configured: false,
    note:
      "Percorso parser contratti non configurato nel monitor: elenco solo candidati e log probabili.",
  };

  if (candidates.length === 0) {
    addAlert(
      log,
      "warning",
      "contract_parser_candidates_missing",
      "Nessun candidato parser contratti trovato nel progetto; serve configurare il percorso esatto."
    );
  } else {
    addAlert(
      log,
      "warning",
      "contract_parser_exact_path_missing",
      "Parser contratti non identificato con certezza; serve configurare il percorso esatto.",
      { candidates: candidates.slice(0, 20) }
    );
  }

  if (foundLogDirs.length === 0) {
    log.checks.contract_parser.log_summary =
      "Nessuna cartella log parser contratti trovata tra i percorsi noti.";
    return;
  }

  const suspiciousLogs = foundLogDirs.filter(
    (dir) =>
      dir.latest_log_analysis &&
      dir.latest_log_analysis.ok &&
      dir.latest_log_analysis.error_match_count > 0 &&
      dir.latest_log_analysis.ok_match_count === 0
  );

  if (suspiciousLogs.length > 0) {
    addAlert(log, "warning", "contract_parser_log_has_errors", "Ultimo log parser contratti contiene errori.", {
      log_dirs: suspiciousLogs.map((dir) => ({
        path: dir.path,
        latest_log: dir.latest_log,
        analysis: dir.latest_log_analysis,
      })),
    });
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
  console.log(
    `Parser contratti: ${log.checks.contract_parser.candidates.length} candidati; percorso esatto da configurare`
  );

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
