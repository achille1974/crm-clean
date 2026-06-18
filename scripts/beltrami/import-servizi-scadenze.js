const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const xlsx = require("xlsx");

const DRIVE_ROOT =
  "/Users/archimede/Il mio Drive/CRM_IMPORT/BELTRAMI_1876/SERVIZI_SCADENZE";
const INBOX_DIR = path.join(DRIVE_ROOT, "inbox");
const LIVE_FILE = path.join(DRIVE_ROOT, "beltrami_1876_servizi_scadenze_LIVE.xlsx");
const SNAPSHOTS_DIR = path.join(DRIVE_ROOT, "snapshots");
const REPORTS_DIR = path.join(DRIVE_ROOT, "reports");
const LOCAL_STATE_DIR =
  "/Users/archimede/CRM_LOCAL_NON_COMMITTARE/beltrami-import-servizi";
const LIVE_STATE_FILE = path.join(LOCAL_STATE_DIR, "beltrami_servizi_live_state.json");
const SHEET_NAME = "SERVIZI_SCADENZE";
const UPCOMING_REMINDER_DAYS = 7;
const FILE_STABILITY_WAIT_MS = 3000;

const EXPECTED_HEADERS = [
  "nome",
  "cognome",
  "telefono",
  "email",
  "codice_fiscale",
  "servizio",
  "data_attivazione",
  "data_scadenza",
  "durata_servizio",
  "note",
];

const DURATION_UNITS = new Set(["days", "months", "years"]);
const ITALIAN_MOBILE_RE = /^3\d{8,9}$/;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    file: null,
    live: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg === "--live") {
      args.live = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--file") {
      args.file = argv[++i];
    } else if (arg.startsWith("--file=")) {
      args.file = arg.slice("--file=".length);
    } else {
      throw new Error(`Argomento non riconosciuto: ${arg}`);
    }
  }

  if (!args.dryRun) {
    throw new Error("Per ora lo script supporta solo --dry-run.");
  }
  if (args.live && args.file) {
    throw new Error("Usa --live oppure --file, non entrambi.");
  }

  return args;
}

function compactSpaces(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalText(value) {
  const text = compactSpaces(value);
  return text || null;
}

function normalizeEmail(value) {
  const email = compactSpaces(value).toLowerCase();
  return email || null;
}

function normalizeCodiceFiscale(value) {
  const codiceFiscale = compactSpaces(value).toUpperCase();
  return codiceFiscale || null;
}

function normalizeHeader(value) {
  return compactSpaces(value).toLowerCase();
}

function normalizeDurationText(value) {
  return compactSpaces(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function normalizeItalianWhatsappPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("39") && digits.length > 10) {
    digits = digits.slice(2);
  }

  digits = digits.replace(/^0+(?=3\d{8,})/, "");

  if (!ITALIAN_MOBILE_RE.test(digits)) {
    return null;
  }

  return `+39${digits}`;
}

function isEmptyCell(value) {
  return value === null || value === undefined || compactSpaces(value) === "";
}

function isEmptyRow(row, headers = EXPECTED_HEADERS) {
  return headers.every((_, index) => isEmptyCell(row[index]));
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function timestampForFile(date = new Date()) {
  return [
    date.getFullYear(),
    pad2(date.getMonth() + 1),
    pad2(date.getDate()),
    "_",
    pad2(date.getHours()),
    pad2(date.getMinutes()),
    pad2(date.getSeconds()),
  ].join("");
}

function readJsonFile(filePath) {
  if (!fs.existsSync(filePath)) return null;

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(`${filePath}.tmp`, filePath);
}

function getFileState(filePath) {
  const stat = fs.statSync(filePath);
  return {
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function isSameFileState(left, right) {
  return left.size === right.size && left.mtimeMs === right.mtimeMs;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForStableFile(filePath) {
  const before = getFileState(filePath);
  await sleep(FILE_STABILITY_WAIT_MS);
  const after = getFileState(filePath);

  return {
    stable: isSameFileState(before, after),
    before,
    after,
  };
}

function findLatestSnapshotForHash(fileHash) {
  if (!fs.existsSync(SNAPSHOTS_DIR)) return null;

  const hash8 = fileHash.slice(0, 8);
  const snapshots = fs
    .readdirSync(SNAPSHOTS_DIR)
    .filter((entry) => entry.endsWith(`_${hash8}.xlsx`))
    .map((entry) => {
      const filePath = path.join(SNAPSHOTS_DIR, entry);
      return {
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  return snapshots[0]?.filePath ?? null;
}

function createLiveSnapshot(filePath, fileHash, force) {
  ensureDir(SNAPSHOTS_DIR);

  const existingSnapshot = force ? null : findLatestSnapshotForHash(fileHash);
  if (existingSnapshot) {
    return {
      path: existingSnapshot,
      created: false,
    };
  }

  const hash8 = fileHash.slice(0, 8);
  const timestamp = timestampForFile();
  let snapshotPath = path.join(
    SNAPSHOTS_DIR,
    `beltrami_1876_servizi_scadenze_${timestamp}_${hash8}.xlsx`,
  );
  let suffix = 2;

  while (fs.existsSync(snapshotPath)) {
    snapshotPath = path.join(
      SNAPSHOTS_DIR,
      `beltrami_1876_servizi_scadenze_${timestamp}_${hash8}_${suffix}.xlsx`,
    );
    suffix += 1;
  }

  fs.copyFileSync(filePath, snapshotPath, fs.constants.COPYFILE_EXCL);

  return {
    path: snapshotPath,
    created: true,
  };
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }

  if (value && typeof value === "object" && !(value instanceof Date)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }

  if (value instanceof Date) {
    return JSON.stringify(formatDate(value));
  }

  return JSON.stringify(value);
}

function parseInteger(value) {
  if (isEmptyCell(value)) return null;

  const number =
    typeof value === "number"
      ? value
      : Number(String(value).trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", "."));

  if (!Number.isFinite(number) || !Number.isInteger(number)) {
    return null;
  }

  return number;
}

function normalizeDurationUnit(value) {
  const unit = normalizeDurationText(value);

  if (unit === "year" || unit === "years" || unit === "anno" || unit === "anni") {
    return "years";
  }
  if (unit === "month" || unit === "months" || unit === "mese" || unit === "mesi") {
    return "months";
  }
  if (unit === "day" || unit === "days" || unit === "giorno" || unit === "giorni") {
    return "days";
  }

  return unit || null;
}

function parseDurationService(value) {
  const raw = compactSpaces(value);
  if (!raw) {
    return {
      raw: null,
      value: null,
      unit: null,
      ok: false,
      reason: "durata_servizio vuota",
    };
  }

  const normalized = normalizeDurationText(raw);
  const presets = {
    annuale: { value: 1, unit: "years" },
    biennale: { value: 2, unit: "years" },
    semestrale: { value: 6, unit: "months" },
  };

  if (presets[normalized]) {
    return {
      raw,
      ...presets[normalized],
      ok: true,
      reason: null,
    };
  }

  const match = normalized.match(/^(\d+)\s*(anno|anni|year|years|mese|mesi|month|months|giorno|giorni|day|days)$/);

  if (!match) {
    return {
      raw,
      value: null,
      unit: null,
      ok: false,
      reason: "durata_servizio non interpretabile",
    };
  }

  const durationValue = Number(match[1]);
  const durationUnit = normalizeDurationUnit(match[2]);

  if (!Number.isInteger(durationValue) || durationValue <= 0 || !DURATION_UNITS.has(durationUnit)) {
    return {
      raw,
      value: null,
      unit: null,
      ok: false,
      reason: "durata_servizio non valida",
    };
  }

  return {
    raw,
    value: durationValue,
    unit: durationUnit,
    ok: true,
    reason: null,
  };
}

function parseDate(value) {
  if (isEmptyCell(value)) return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDate(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;

    return formatDate(new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d)));
  }

  const text = compactSpaces(value);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);

  if (iso) {
    return validateDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const italian = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);

  if (italian) {
    let year = Number(italian[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;

    return validateDateParts(year, Number(italian[2]), Number(italian[1]));
  }

  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;

  return formatDate(parsed);
}

function validateDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return formatDate(date);
}

function parseDateString(value) {
  const parsed = parseDate(value);
  if (!parsed) return null;

  const [year, month, day] = parsed.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDate(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonths(date, months) {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  const targetMonthNumber = month + months;
  const targetYear = year + Math.floor(targetMonthNumber / 12);
  const targetMonth = ((targetMonthNumber % 12) + 12) % 12;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));

  return new Date(Date.UTC(targetYear, targetMonth, targetDay));
}

function addDuration(startDate, value, unit) {
  if (unit === "days") {
    const date = new Date(startDate.getTime());
    date.setUTCDate(date.getUTCDate() + value);
    return date;
  }

  if (unit === "months") {
    return addMonths(startDate, value);
  }

  if (unit === "years") {
    return addMonths(startDate, value * 12);
  }

  return null;
}

function getTodayUtcDateOnly() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function isWithinNextDays(dateString, days) {
  const date = parseDateString(dateString);
  if (!date) return false;

  const today = getTodayUtcDateOnly();
  const end = new Date(today.getTime());
  end.setUTCDate(end.getUTCDate() + days);

  return date >= today && date <= end;
}

function matchHeaderFormat(headerRow, expectedHeaders) {
  const actual = expectedHeaders.map((_, index) => normalizeHeader(headerRow[index]));
  const expected = expectedHeaders.map(normalizeHeader);

  return expected.every((header, index) => actual[index] === header);
}

function detectHeaderFormat(headerRow) {
  const normalizedHeaders = headerRow.map(normalizeHeader);

  if (
    normalizedHeaders.includes("durata_valore") ||
    normalizedHeaders.includes("durata_unita")
  ) {
    return {
      ok: false,
      headers: EXPECTED_HEADERS,
      format: null,
      errors: [
        {
          column:
            normalizedHeaders.findIndex(
              (header) => header === "durata_valore" || header === "durata_unita",
            ) + 1,
          expected: "durata_servizio",
          actual: "Formato vecchio non supportato: usare durata_servizio",
        },
      ],
    };
  }

  if (matchHeaderFormat(headerRow, EXPECTED_HEADERS)) {
    return {
      ok: true,
      headers: EXPECTED_HEADERS,
      format: "durata_servizio",
      errors: [],
    };
  }

  const actual = EXPECTED_HEADERS.map((_, index) => normalizeHeader(headerRow[index]));
  const expected = EXPECTED_HEADERS.map(normalizeHeader);
  const errors = [];

  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      errors.push({
        column: i + 1,
        expected: EXPECTED_HEADERS[i],
        actual: headerRow[i] === undefined ? "" : String(headerRow[i]),
      });
    }
  }

  return {
    ok: false,
    headers: EXPECTED_HEADERS,
    format: null,
    errors,
  };
}

function rowToObject(row, headers = EXPECTED_HEADERS) {
  return headers.reduce((acc, header, index) => {
    acc[header] = row[index] ?? "";
    return acc;
  }, {});
}

function normalizeRow(raw, sourceRowIndex) {
  const errors = [];
  const warnings = [];
  const nome = normalizeOptionalText(raw.nome);
  const cognome = normalizeOptionalText(raw.cognome);
  const telefono = normalizeOptionalText(raw.telefono);
  const telefonoNormalizzato = normalizeItalianWhatsappPhone(raw.telefono);
  const email = normalizeEmail(raw.email);
  const codiceFiscale = normalizeCodiceFiscale(raw.codice_fiscale);
  const servizio = normalizeOptionalText(raw.servizio);
  const note = normalizeOptionalText(raw.note);
  const dataAttivazione = parseDate(raw.data_attivazione);
  const dataScadenzaInput = parseDate(raw.data_scadenza);
  const durataServizio = normalizeOptionalText(raw.durata_servizio);
  const parsedDuration = parseDurationService(durataServizio);

  if (!nome) errors.push("nome obbligatorio");
  if (!cognome) errors.push("cognome obbligatorio");
  if (!telefono) errors.push("telefono obbligatorio");
  if (telefono && !telefonoNormalizzato) errors.push("telefono non valido");
  if (!servizio) errors.push("servizio obbligatorio");

  if (!isEmptyCell(raw.data_attivazione) && !dataAttivazione) {
    errors.push("data_attivazione non valida");
  }

  if (!isEmptyCell(raw.data_scadenza) && !dataScadenzaInput) {
    errors.push("data_scadenza non valida");
  }

  if (durataServizio && !parsedDuration.ok) {
    const message = parsedDuration.reason || "durata_servizio non interpretabile";
    if (dataScadenzaInput) {
      warnings.push(message);
    } else {
      errors.push(message);
    }
  }

  let dataScadenza = dataScadenzaInput;
  let dataScadenzaTeorica = null;

  if (!dataScadenza) {
    if (!dataAttivazione || !parsedDuration.ok) {
      errors.push(
        "scadenza mancante: indicare data_scadenza oppure data_attivazione + durata_servizio interpretabile",
      );
    } else {
      const calculated = addDuration(
        parseDateString(dataAttivazione),
        parsedDuration.value,
        parsedDuration.unit,
      );
      dataScadenza = calculated ? formatDate(calculated) : null;
    }
  } else if (dataAttivazione && parsedDuration.ok) {
    const calculated = addDuration(
      parseDateString(dataAttivazione),
      parsedDuration.value,
      parsedDuration.unit,
    );
    dataScadenzaTeorica = calculated ? formatDate(calculated) : null;

    if (dataScadenzaTeorica && dataScadenzaTeorica !== dataScadenza) {
      warnings.push(
        `data_scadenza diversa da scadenza teorica calcolata da durata_servizio (${dataScadenzaTeorica})`,
      );
    }
  }

  const normalized = {
    source_row_index: sourceRowIndex,
    nome,
    cognome,
    telefono,
    telefono_normalizzato: telefonoNormalizzato,
    email,
    codice_fiscale: codiceFiscale,
    servizio,
    data_attivazione: dataAttivazione,
    data_scadenza: dataScadenza,
    data_scadenza_teorica: dataScadenzaTeorica,
    durata_servizio: durataServizio,
    note,
  };

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    normalized,
    raw,
    row_hash: sha256Buffer(Buffer.from(stableJson(raw), "utf8")),
  };
}

function listInputFiles(args) {
  if (args.file) {
    const resolved = path.resolve(args.file);

    if (!fs.existsSync(resolved)) {
      throw new Error(`File non trovato: ${resolved}`);
    }

    if (!isImportableXlsx(resolved)) {
      throw new Error(`File non importabile: ${resolved}`);
    }

    return [resolved];
  }

  if (!fs.existsSync(INBOX_DIR)) {
    throw new Error(`Cartella inbox non trovata: ${INBOX_DIR}`);
  }

  return fs
    .readdirSync(INBOX_DIR)
    .filter((entry) => isImportableXlsx(entry))
    .map((entry) => path.join(INBOX_DIR, entry))
    .sort();
}

function isImportableXlsx(filePath) {
  const baseName = path.basename(filePath);
  return baseName.toLowerCase().endsWith(".xlsx") && !baseName.startsWith("~$");
}

function analyzeFile(filePath, metadata = {}) {
  const fileHash = sha256File(filePath);
  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    raw: true,
  });

  if (!workbook.SheetNames.includes(SHEET_NAME)) {
    throw new Error(`Foglio obbligatorio mancante: ${SHEET_NAME}`);
  }

  const sheet = workbook.Sheets[SHEET_NAME];
  const rows = xlsx.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: true,
    raw: true,
  });

  const headerRow = rows[0] || [];
  const headerCheck = detectHeaderFormat(headerRow);

  if (!headerCheck.ok) {
    return {
      filePath,
      inputFilePath: metadata.inputFilePath || filePath,
      snapshotPath: metadata.snapshotPath || null,
      snapshotCreated: Boolean(metadata.snapshotCreated),
      fileName: path.basename(filePath),
      fileHash,
      headerErrors: headerCheck.errors,
      headerFormat: null,
      totalRows: 0,
      validRows: [],
      errorRows: [],
      skippedRows: 0,
      warningRows: [],
      upcomingExpiries: [],
      consentNotVerifiableRows: 0,
    };
  }

  const validRows = [];
  const errorRows = [];
  let skippedRows = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];

    if (isEmptyRow(row, headerCheck.headers)) {
      skippedRows += 1;
      continue;
    }

    const sourceRowIndex = index + 1;
    const raw = rowToObject(row, headerCheck.headers);
    const result = normalizeRow(raw, sourceRowIndex);

    if (result.ok) {
      validRows.push(result);
    } else {
      errorRows.push(result);
    }
  }

  const warningRows = validRows.filter((row) => row.warnings.length > 0);
  const upcomingExpiries = validRows
    .filter((row) => isWithinNextDays(row.normalized.data_scadenza, UPCOMING_REMINDER_DAYS))
    .map((row) => ({
      source_row_index: row.normalized.source_row_index,
      nome: row.normalized.nome,
      cognome: row.normalized.cognome,
      telefono_normalizzato: row.normalized.telefono_normalizzato,
      servizio: row.normalized.servizio,
      data_scadenza: row.normalized.data_scadenza,
    }));

  return {
    filePath,
    inputFilePath: metadata.inputFilePath || filePath,
    snapshotPath: metadata.snapshotPath || null,
    snapshotCreated: Boolean(metadata.snapshotCreated),
    fileName: path.basename(filePath),
    fileHash,
    headerErrors: [],
    headerFormat: headerCheck.format,
    totalRows: validRows.length + errorRows.length,
    validRows,
    errorRows,
    skippedRows,
    warningRows,
    upcomingExpiries,
    consentNotVerifiableRows: validRows.length,
  };
}

function summarize(results) {
  return results.reduce(
    (acc, result) => {
      acc.files += 1;
      acc.totalRows += result.totalRows;
      acc.validRows += result.validRows.length;
      acc.errorRows += result.errorRows.length + (result.headerErrors.length > 0 ? 1 : 0);
      acc.skippedRows += result.skippedRows;
      acc.warningRows += result.warningRows.length;
      acc.upcomingExpiries += result.upcomingExpiries.length;
      acc.consentNotVerifiableRows += result.consentNotVerifiableRows;
      return acc;
    },
    {
      files: 0,
      totalRows: 0,
      validRows: 0,
      errorRows: 0,
      skippedRows: 0,
      warningRows: 0,
      upcomingExpiries: 0,
      consentNotVerifiableRows: 0,
    },
  );
}

function printResult(result) {
  console.log("");
  if (result.inputFilePath !== result.filePath) {
    console.log(`File LIVE: ${result.inputFilePath}`);
    console.log(`Snapshot letto: ${result.filePath}`);
  } else {
    console.log(`File: ${result.filePath}`);
  }
  if (result.snapshotPath) {
    console.log(`Snapshot: ${result.snapshotPath}`);
    console.log(`Snapshot creato: ${result.snapshotCreated ? "si" : "no, riusato snapshot esistente"}`);
  }
  console.log(`Hash file SHA256: ${result.fileHash}`);

  if (result.headerErrors.length > 0) {
    console.log("Header: ERRORE");
    console.log(JSON.stringify(result.headerErrors, null, 2));
    return;
  }

  console.log("Header: OK");
  console.log(`Formato header: ${result.headerFormat}`);
  console.log(`Righe totali: ${result.totalRows}`);
  console.log(`Righe valide: ${result.validRows.length}`);
  console.log(`Righe errore: ${result.errorRows.length}`);
  console.log(`Righe ignorate: ${result.skippedRows}`);
  console.log(`Righe con warning: ${result.warningRows.length}`);
  console.log(`Prossime scadenze entro ${UPCOMING_REMINDER_DAYS} giorni: ${result.upcomingExpiries.length}`);
  console.log(`Righe con consenso mancante non verificabile in dry-run: ${result.consentNotVerifiableRows}`);

  if (result.upcomingExpiries.length > 0) {
    console.log("Scadenze prossime:");
    console.log(JSON.stringify(result.upcomingExpiries, null, 2));
  }

  if (result.warningRows.length > 0) {
    console.log("Warning righe:");
    console.log(
      JSON.stringify(
        result.warningRows.map((row) => ({
          source_row_index: row.normalized.source_row_index,
          warnings: row.warnings,
        })),
        null,
        2,
      ),
    );
  }

  if (result.errorRows.length > 0) {
    console.log("Errori righe:");
    console.log(
      JSON.stringify(
        result.errorRows.map((row) => ({
          source_row_index: row.normalized.source_row_index,
          errors: row.errors,
          raw: row.raw,
        })),
        null,
        2,
      ),
    );
  }
}

function countResultErrors(result) {
  return result.errorRows.length + (result.headerErrors.length > 0 ? 1 : 0);
}

function buildReport({ mode, force, liveFilePath, snapshot, results, summary }) {
  const lines = [
    "DRY-RUN BELTRAMI 1876 - SERVIZI E SCADENZE",
    "",
    `Modalita: ${mode}`,
    `Force: ${force ? "si" : "no"}`,
    `Creato il: ${new Date().toISOString()}`,
    "",
  ];

  if (liveFilePath) {
    lines.push(`File LIVE letto: ${liveFilePath}`);
  }
  if (snapshot) {
    lines.push(`Snapshot: ${snapshot.path}`);
    lines.push(`Snapshot creato: ${snapshot.created ? "si" : "no, riusato snapshot esistente"}`);
  }

  lines.push("");
  lines.push("Riepilogo:");
  lines.push(`- file analizzati: ${summary.files}`);
  lines.push(`- righe totali: ${summary.totalRows}`);
  lines.push(`- righe valide: ${summary.validRows}`);
  lines.push(`- righe errore: ${summary.errorRows}`);
  lines.push(`- righe ignorate: ${summary.skippedRows}`);
  lines.push(`- righe con warning: ${summary.warningRows}`);
  lines.push(`- prossime scadenze entro ${UPCOMING_REMINDER_DAYS} giorni: ${summary.upcomingExpiries}`);
  lines.push(`- righe senza consenso non verificabile in dry-run: ${summary.consentNotVerifiableRows}`);

  for (const result of results) {
    lines.push("");
    lines.push(`File: ${result.inputFilePath}`);
    if (result.snapshotPath) {
      lines.push(`Snapshot letto: ${result.snapshotPath}`);
    }
    lines.push(`Hash file: ${result.fileHash}`);
    lines.push(`Formato header: ${result.headerFormat || "non valido"}`);
    lines.push(`Righe totali: ${result.totalRows}`);
    lines.push(`Righe valide: ${result.validRows.length}`);
    lines.push(`Righe errore: ${countResultErrors(result)}`);
    lines.push(`Righe ignorate: ${result.skippedRows}`);
    lines.push(`Righe con warning: ${result.warningRows.length}`);
    lines.push(`Prossime scadenze entro ${UPCOMING_REMINDER_DAYS} giorni: ${result.upcomingExpiries.length}`);
    lines.push(`Righe senza consenso non verificabile in dry-run: ${result.consentNotVerifiableRows}`);

    if (result.upcomingExpiries.length > 0) {
      lines.push("");
      lines.push("Prossime scadenze:");
      for (const row of result.upcomingExpiries) {
        lines.push(
          `- riga ${row.source_row_index}: ${row.nome} ${row.cognome}, ${row.servizio}, ${row.data_scadenza}`,
        );
      }
    }

    if (result.warningRows.length > 0) {
      lines.push("");
      lines.push("Warning:");
      for (const row of result.warningRows) {
        lines.push(`- riga ${row.normalized.source_row_index}: ${row.warnings.join("; ")}`);
      }
    }

    if (result.headerErrors.length > 0 || result.errorRows.length > 0) {
      lines.push("");
      lines.push("Errori:");

      for (const error of result.headerErrors) {
        lines.push(
          `- header colonna ${error.column}: atteso "${error.expected}", trovato "${error.actual}"`,
        );
      }

      for (const row of result.errorRows) {
        lines.push(`- riga ${row.normalized.source_row_index}: ${row.errors.join("; ")}`);
      }
    } else {
      lines.push("");
      lines.push("Errori: nessuno");
    }
  }

  lines.push("");
  return `${lines.join("\n")}\n`;
}

function writeReport(params) {
  ensureDir(REPORTS_DIR);
  const reportPath = path.join(
    REPORTS_DIR,
    `dry_run_beltrami_servizi_${timestampForFile()}.txt`,
  );

  fs.writeFileSync(reportPath, buildReport(params), "utf8");
  return reportPath;
}

function updateLiveState(state) {
  writeJsonFile(LIVE_STATE_FILE, {
    last_file_hash: state.last_file_hash,
    last_checked_at: state.last_checked_at,
    last_snapshot_path: state.last_snapshot_path,
    last_valid_rows: state.last_valid_rows,
    last_error_rows: state.last_error_rows,
  });
}

async function runLiveDryRun(args) {
  if (!fs.existsSync(LIVE_FILE)) {
    throw new Error(`File LIVE non trovato: ${LIVE_FILE}`);
  }

  console.log("DRY-RUN LIVE: nessuna scrittura su Supabase, nessun invio WhatsApp, nessuno spostamento file.");
  console.log(`Root Drive: ${DRIVE_ROOT}`);
  console.log(`File LIVE: ${LIVE_FILE}`);
  console.log(`Controllo stabilita file: ${FILE_STABILITY_WAIT_MS}ms`);

  const stability = await waitForStableFile(LIVE_FILE);

  if (!stability.stable) {
    console.log("file ancora in aggiornamento: size/mtime cambiati durante il controllo stabilita.");
    console.log(JSON.stringify(stability, null, 2));
    return;
  }

  const fileHash = sha256File(LIVE_FILE);
  const previousState = readJsonFile(LIVE_STATE_FILE);
  const checkedAt = new Date().toISOString();

  if (!args.force && previousState?.last_file_hash === fileHash) {
    updateLiveState({
      ...previousState,
      last_file_hash: fileHash,
      last_checked_at: checkedAt,
      last_snapshot_path: previousState.last_snapshot_path || null,
      last_valid_rows: previousState.last_valid_rows ?? 0,
      last_error_rows: previousState.last_error_rows ?? 0,
    });
    console.log("nessuna modifica rilevata: hash file invariato.");
    console.log(`Hash file SHA256: ${fileHash}`);
    console.log("Snapshot creato: no");
    console.log("Report creato: no");
    return;
  }

  const snapshot = createLiveSnapshot(LIVE_FILE, fileHash, args.force);
  const result = analyzeFile(snapshot.path, {
    inputFilePath: LIVE_FILE,
    snapshotPath: snapshot.path,
    snapshotCreated: snapshot.created,
  });
  const results = [result];
  const summary = summarize(results);
  const reportPath = writeReport({
    mode: "live",
    force: args.force,
    liveFilePath: LIVE_FILE,
    snapshot,
    results,
    summary,
  });

  console.log(`Foglio atteso: ${SHEET_NAME}`);
  console.log("File analizzati: 1");
  results.forEach(printResult);

  console.log("");
  console.log("Riepilogo dry-run:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report dry-run: ${reportPath}`);

  updateLiveState({
    last_file_hash: fileHash,
    last_checked_at: checkedAt,
    last_snapshot_path: snapshot.path,
    last_valid_rows: result.validRows.length,
    last_error_rows: countResultErrors(result),
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.live) {
    await runLiveDryRun(args);
    return;
  }

  const files = listInputFiles(args);

  console.log("DRY-RUN: nessuna scrittura su Supabase, nessun invio WhatsApp, nessuno spostamento file.");
  console.log(`Root Drive: ${DRIVE_ROOT}`);
  console.log(`Foglio atteso: ${SHEET_NAME}`);
  console.log(`File analizzati: ${files.length}`);

  if (files.length === 0) {
    console.log("Nessun file .xlsx trovato in inbox.");
    return;
  }

  const results = files.map(analyzeFile);
  results.forEach(printResult);

  const summary = summarize(results);

  console.log("");
  console.log("Riepilogo dry-run:");
  console.log(JSON.stringify(summary, null, 2));
}

try {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
