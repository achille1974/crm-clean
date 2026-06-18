const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const xlsx = require("xlsx");

const DRIVE_ROOT =
  "/Users/archimede/Il mio Drive/CRM_IMPORT/BELTRAMI_1876/SERVIZI_SCADENZE";
const INBOX_DIR = path.join(DRIVE_ROOT, "inbox");
const SHEET_NAME = "SERVIZI_SCADENZE";
const UPCOMING_REMINDER_DAYS = 7;

const EXPECTED_HEADERS = [
  "nome",
  "cognome",
  "telefono",
  "email",
  "codice_fiscale",
  "servizio",
  "data_attivazione",
  "data_scadenza",
  "durata_valore",
  "durata_unita",
  "note",
];

const DURATION_UNITS = new Set(["days", "months", "years"]);
const ITALIAN_MOBILE_RE = /^3\d{8,9}$/;

function parseArgs(argv) {
  const args = {
    dryRun: false,
    file: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--dry-run") {
      args.dryRun = true;
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

function isEmptyRow(row) {
  return EXPECTED_HEADERS.every((_, index) => isEmptyCell(row[index]));
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
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

function validateHeaders(headerRow) {
  const actual = EXPECTED_HEADERS.map((_, index) => normalizeHeader(headerRow[index]));
  const expected = EXPECTED_HEADERS.map(normalizeHeader);

  const mismatches = [];

  for (let i = 0; i < expected.length; i += 1) {
    if (actual[i] !== expected[i]) {
      mismatches.push({
        column: i + 1,
        expected: EXPECTED_HEADERS[i],
        actual: headerRow[i] === undefined ? "" : String(headerRow[i]),
      });
    }
  }

  return mismatches;
}

function rowToObject(row) {
  return EXPECTED_HEADERS.reduce((acc, header, index) => {
    acc[header] = row[index] ?? "";
    return acc;
  }, {});
}

function normalizeRow(raw, sourceRowIndex) {
  const errors = [];
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
  const durataValore = parseInteger(raw.durata_valore);
  const durataUnita = normalizeOptionalText(raw.durata_unita)?.toLowerCase() ?? null;

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

  if (!isEmptyCell(raw.durata_valore) && durataValore === null) {
    errors.push("durata_valore deve essere un numero intero");
  }

  if (durataValore !== null && durataValore <= 0) {
    errors.push("durata_valore deve essere maggiore di zero");
  }

  if (durataUnita && !DURATION_UNITS.has(durataUnita)) {
    errors.push("durata_unita deve essere days, months oppure years");
  }

  let dataScadenza = dataScadenzaInput;

  if (!dataScadenza) {
    if (!dataAttivazione || durataValore === null || !durataUnita || !DURATION_UNITS.has(durataUnita)) {
      errors.push("scadenza mancante: indicare data_scadenza oppure data_attivazione + durata");
    } else if (durataValore > 0) {
      const calculated = addDuration(parseDateString(dataAttivazione), durataValore, durataUnita);
      dataScadenza = calculated ? formatDate(calculated) : null;
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
    durata_valore: durataValore,
    durata_unita: durataUnita,
    note,
  };

  return {
    ok: errors.length === 0,
    errors,
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

function analyzeFile(filePath) {
  const buffer = fs.readFileSync(filePath);
  const fileHash = sha256Buffer(buffer);
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
  const headerErrors = validateHeaders(headerRow);

  if (headerErrors.length > 0) {
    return {
      filePath,
      fileName: path.basename(filePath),
      fileHash,
      headerErrors,
      totalRows: 0,
      validRows: [],
      errorRows: [],
      skippedRows: 0,
      upcomingExpiries: [],
      consentNotVerifiableRows: 0,
    };
  }

  const validRows = [];
  const errorRows = [];
  let skippedRows = 0;

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index] || [];

    if (isEmptyRow(row)) {
      skippedRows += 1;
      continue;
    }

    const sourceRowIndex = index + 1;
    const raw = rowToObject(row);
    const result = normalizeRow(raw, sourceRowIndex);

    if (result.ok) {
      validRows.push(result);
    } else {
      errorRows.push(result);
    }
  }

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
    fileName: path.basename(filePath),
    fileHash,
    headerErrors: [],
    totalRows: validRows.length + errorRows.length,
    validRows,
    errorRows,
    skippedRows,
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
      upcomingExpiries: 0,
      consentNotVerifiableRows: 0,
    },
  );
}

function printResult(result) {
  console.log("");
  console.log(`File: ${result.filePath}`);
  console.log(`Hash file SHA256: ${result.fileHash}`);

  if (result.headerErrors.length > 0) {
    console.log("Header: ERRORE");
    console.log(JSON.stringify(result.headerErrors, null, 2));
    return;
  }

  console.log("Header: OK");
  console.log(`Righe totali: ${result.totalRows}`);
  console.log(`Righe valide: ${result.validRows.length}`);
  console.log(`Righe errore: ${result.errorRows.length}`);
  console.log(`Righe ignorate: ${result.skippedRows}`);
  console.log(`Prossime scadenze entro ${UPCOMING_REMINDER_DAYS} giorni: ${result.upcomingExpiries.length}`);
  console.log(`Righe con consenso mancante non verificabile in dry-run: ${result.consentNotVerifiableRows}`);

  if (result.upcomingExpiries.length > 0) {
    console.log("Scadenze prossime:");
    console.log(JSON.stringify(result.upcomingExpiries, null, 2));
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

function main() {
  const args = parseArgs(process.argv.slice(2));
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
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
