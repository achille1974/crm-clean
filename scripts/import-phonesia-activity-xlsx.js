const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const xlsx = require("xlsx");
const { createClient } = require("@supabase/supabase-js");

const BATCH_TABLE = "phonesia_activity_import_batches";
const ROW_TABLE = "phonesia_activity_import_rows";
const PREFERRED_SHEET = "DETTAGLI_VENDITE";
const DEFAULT_CHUNK_SIZE = 500;
const HASH_COLUMN = "source_file_hash";
const IMPORT_STATUS = {
  INITIAL: "partial",
  IMPORTED: "imported",
  PARTIAL: "partial",
  FAILED: "failed",
};

const MAGAZZINI = {
  "VITTORIO EMANUELE": { negozio_id: 1, negozio_label: "PHONESIA Floridia" },
  "CORSO GELONE": { negozio_id: 3, negozio_label: "PHONESIA Siracusa" },
  AVOLA: { negozio_label: "PHONESIA Avola" },
  "VIALE ITALIA": { negozio_label: "PHONESIA Augusta" },
};

const FIELD_ALIASES = {
  documento: ["documento", "doc", "tipo documento"],
  numero: ["numero", "num", "n", "nr", "numero documento"],
  magazzino: ["magazzino", "mag"],
  data_vendita_text: ["data vendita", "data_vendita", "datavendita"],
  data_text: ["data"],
  totale: ["totale", "tot"],
  pag_1: ["pag 1", "pag_1", "pagamento 1", "pagamento1"],
  pag_2: ["pag 2", "pag_2", "pagamento 2", "pagamento2"],
  altro_pag: ["altro pag", "altro_pag", "altro pagamento"],
  tot_pag_1: ["tot pag 1", "tot_pag_1", "totale pag 1"],
  tot_pag_2: ["tot pag 2", "tot_pag_2", "totale pag 2"],
  codice: ["codice", "cod"],
  descrizione: ["descrizione", "desc", "articolo"],
  qta: ["qta", "quantita", "quantità"],
  prezzo: ["prezzo", "prz"],
  costo: ["costo"],
  sconto: ["sconto", "sco"],
  margine: ["margine"],
  margine_salvadanai: ["margine salvadanai", "margine_salvadanai"],
  imponibile: ["imponibile"],
  imposta: ["imposta", "iva"],
  cod_iva: ["cod iva", "cod_iva", "codice iva"],
  aliquota: ["aliquota", "aliquota iva"],
  pista: ["pista"],
  servizio: ["servizio"],
  promo: ["promo", "promozione"],
  sottopromo: ["sottopromo", "sotto promo"],
  numero_tel: ["numero tel", "numero_tel", "telefono", "cellulare", "numero telefono"],
  imei: ["imei"],
  sim: ["sim", "iccid"],
  cliente_pda: ["cliente pda", "cliente_pda"],
  pda: ["pda"],
  canone: ["canone"],
  operatore: ["operatore"],
  tr: ["tr"],
  idcentro_tr: ["idcentro tr", "idcentro_tr"],
  note_riga: ["note riga", "note_riga", "note"],
  idcentro_altropdv: ["idcentro altropdv", "idcentro_altropdv"],
  scontrino: ["scontrino"],
  fattura: ["fattura"],
};

const NUMERIC_FIELDS = new Set([
  "totale",
  "tot_pag_1",
  "tot_pag_2",
  "qta",
  "prezzo",
  "costo",
  "sconto",
  "margine",
  "margine_salvadanai",
  "imponibile",
  "imposta",
  "aliquota",
  "canone",
]);

function parseArgs(argv) {
  const args = {
    commit: false,
    force: false,
    file: null,
    chunkSize: DEFAULT_CHUNK_SIZE,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--commit") {
      args.commit = true;
    } else if (arg === "--force") {
      args.force = true;
    } else if (arg === "--file") {
      args.file = argv[++i];
    } else if (arg.startsWith("--file=")) {
      args.file = arg.slice("--file=".length);
    } else if (arg === "--chunk-size") {
      args.chunkSize = Number(argv[++i]);
    } else if (arg.startsWith("--chunk-size=")) {
      args.chunkSize = Number(arg.slice("--chunk-size=".length));
    } else {
      throw new Error(`Argomento non riconosciuto: ${arg}`);
    }
  }

  if (!args.file) {
    throw new Error("Parametro obbligatorio mancante: --file <xlsx>");
  }
  if (!Number.isInteger(args.chunkSize) || args.chunkSize < 1) {
    throw new Error("--chunk-size deve essere un intero positivo.");
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

function resolveInputFile(fileName) {
  const resolved = path.resolve(fileName);
  if (fs.existsSync(resolved)) return resolved;

  if (fileName.startsWith(`imports${path.sep}`) || fileName.startsWith("imports/")) {
    const fallback = path.resolve(fileName.replace(/^imports[\\/]/, "import/"));
    if (fs.existsSync(fallback)) return fallback;
  }

  return resolved;
}

function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function normalizeHeader(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-.]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function isEmpty(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value).trim();
  if (!text) return null;

  const normalized = text
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);

  return Number.isFinite(number) ? number : null;
}

function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = xlsx.SSF.parse_date_code(value);
    if (!parsed) return null;
    const date = new Date(Date.UTC(parsed.y, parsed.m - 1, parsed.d));
    return date.toISOString().slice(0, 10);
  }

  const text = String(value || "").trim();
  if (!text) return null;

  const italian = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);
  if (italian) {
    const day = Number(italian[1]);
    const month = Number(italian[2]);
    let year = Number(italian[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    ) {
      return date.toISOString().slice(0, 10);
    }
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function getByAliases(row, headerMap, aliases) {
  for (const alias of aliases) {
    const header = headerMap.get(normalizeHeader(alias));
    if (header && !isEmpty(row[header])) return row[header];
  }
  return null;
}

function buildHeaderMap(rows) {
  const map = new Map();

  for (const row of rows) {
    for (const header of Object.keys(row)) {
      const normalized = normalizeHeader(header);
      if (normalized && !map.has(normalized)) {
        map.set(normalized, header);
      }
    }
  }

  return map;
}

function mapMagazzino(value) {
  const normalized = normalizeText(value);
  if (!normalized) return {};

  for (const [key, mapped] of Object.entries(MAGAZZINI)) {
    if (normalized.includes(key)) {
      return mapped;
    }
  }

  return {};
}

function makeImportRow(row, headerMap, sourceRowIndex) {
  const rawJson = {};
  for (const key of Object.keys(row)) {
    rawJson[key] = row[key];
  }

  const typed = {
    source_row_index: sourceRowIndex,
    row_hash: sha256Buffer(Buffer.from(stableJson(rawJson), "utf8")),
    raw_json: rawJson,
  };

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    const value = getByAliases(row, headerMap, aliases);
    if (isEmpty(value)) continue;

    typed[field] = NUMERIC_FIELDS.has(field) ? parseNumber(value) : String(value).trim();
  }

  const mappedStore = mapMagazzino(typed.magazzino);
  if (mappedStore.negozio_id) typed.negozio_id = mappedStore.negozio_id;
  if (mappedStore.negozio_label) typed.negozio_label = mappedStore.negozio_label;

  if (typed.data_vendita_text) {
    const date = parseDate(typed.data_vendita_text);
    if (date) typed.data_vendita = date;
  }
  if (typed.data_text) {
    const date = parseDate(typed.data_text);
    if (date) typed.data = date;
  }

  return typed;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "(vuoto)";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function findMinMaxDates(rows) {
  const dates = rows
    .flatMap((row) => [row.data_vendita, row.data])
    .filter(Boolean)
    .sort();

  return {
    min: dates[0] || null,
    max: dates[dates.length - 1] || null,
  };
}

function printImportSummary({ filePath, sheetName, fileHash, rows, commit }) {
  const dates = findMinMaxDates(rows);

  console.log(commit ? "COMMIT: scrittura database abilitata." : "DRY-RUN: nessuna scrittura sul database.");
  console.log(`File: ${filePath}`);
  console.log(`Foglio letto: ${sheetName}`);
  console.log(`Hash file SHA256: ${fileHash}`);
  console.log(`Colonna hash usata: ${HASH_COLUMN}`);
  console.log("Controllo anti-duplicato: attivo");
  console.log(`Numero righe: ${rows.length}`);
  console.log("Conteggio per magazzino:");
  console.log(JSON.stringify(countBy(rows, "magazzino"), null, 2));
  console.log("Conteggio per negozio:");
  console.log(JSON.stringify(countBy(rows, "negozio_label"), null, 2));
  console.log(`Data minima: ${dates.min || "(non trovata)"}`);
  console.log(`Data massima: ${dates.max || "(non trovata)"}`);
  console.log("Esempio prima riga importata:");
  console.log(JSON.stringify(rows[0] || null, null, 2));
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

async function assertHashColumnExists(supabase) {
  const { error } = await supabase.from(BATCH_TABLE).select(HASH_COLUMN).limit(1);
  if (!error) return;

  throw new Error(
    [
      `Colonna hash ufficiale mancante: public.${BATCH_TABLE}.${HASH_COLUMN}`,
      "SQL necessaria:",
      `alter table public.${BATCH_TABLE} add column if not exists ${HASH_COLUMN} text;`,
      `create unique index if not exists phonesia_activity_import_batches_source_file_hash_uidx on public.${BATCH_TABLE}(${HASH_COLUMN}) where ${HASH_COLUMN} is not null;`,
      `Errore Supabase: ${error.message || error}`,
    ].join("\n")
  );
}

async function assertNotDuplicate(supabase, fileHash, force) {
  const { data, error } = await supabase
    .from(BATCH_TABLE)
    .select("id, import_status, created_at")
    .eq(HASH_COLUMN, fileHash)
    .limit(1);

  if (error) throw error;
  if (data && data.length > 0 && !force) {
    throw new Error(
      `Import bloccato: file hash gia presente nel batch ${data[0].id}. Usa --force per forzare.`
    );
  }
}

function isMissingColumnError(error) {
  return error && /column .* does not exist|could not find .* column|schema cache/i.test(error.message || "");
}

function getMissingColumn(error) {
  const message = error.message || "";
  const quoted = message.match(/'([^']+)' column|column "([^"]+)"/i);
  if (quoted) return quoted[1] || quoted[2];

  const plain = message.match(/column ([a-zA-Z0-9_]+) does not exist/i);
  return plain ? plain[1] : null;
}

async function insertAdaptive(supabase, table, payload, requiredColumns) {
  let current = { ...payload };

  for (let attempt = 0; attempt < 25; attempt += 1) {
    const { data, error } = await supabase.from(table).insert(current).select("id").single();
    if (!error) return data;

    const missingColumn = getMissingColumn(error);
    if (!isMissingColumnError(error) || !missingColumn || requiredColumns.includes(missingColumn)) {
      throw error;
    }

    delete current[missingColumn];
  }

  throw new Error(`Troppi tentativi di adattamento colonne per ${table}.`);
}

async function insertRowsAdaptive(supabase, payloads, requiredColumns) {
  let rows = payloads.map((payload) => ({ ...payload }));

  for (let attempt = 0; attempt < 80; attempt += 1) {
    const { error } = await supabase.from(ROW_TABLE).insert(rows);
    if (!error) return rows.length;

    const missingColumn = getMissingColumn(error);
    if (!isMissingColumnError(error) || !missingColumn || requiredColumns.includes(missingColumn)) {
      throw error;
    }

    rows = rows.map((row) => {
      const next = { ...row };
      delete next[missingColumn];
      return next;
    });
  }

  throw new Error(`Troppi tentativi di adattamento colonne per ${ROW_TABLE}.`);
}

async function updateBatch(supabase, batchId, patch) {
  const { error } = await supabase.from(BATCH_TABLE).update(patch).eq("id", batchId);
  if (error) throw error;
}

async function tryUpdateBatch(supabase, batchId, patch) {
  try {
    await updateBatch(supabase, batchId, patch);
  } catch (error) {
    console.error(`Errore aggiornamento batch ${batchId}:`, error.message || error);
  }
}

function readWorkbook(filePath) {
  const workbook = xlsx.readFile(filePath, {
    cellDates: true,
    raw: true,
  });
  const sheetName = workbook.SheetNames.includes(PREFERRED_SHEET)
    ? PREFERRED_SHEET
    : workbook.SheetNames[0];

  if (!sheetName) throw new Error("Nessun foglio trovato nel file Excel.");

  const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
    defval: null,
    raw: true,
  });

  return { sheetName, rows };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const filePath = resolveInputFile(args.file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File Excel non trovato: ${path.resolve(args.file)}`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = sha256Buffer(fileBuffer);
  const { sheetName, rows: excelRows } = readWorkbook(filePath);
  const headerMap = buildHeaderMap(excelRows);
  const importRows = excelRows.map((row, index) => makeImportRow(row, headerMap, index + 2));

  const env = loadEnv();
  const supabase = createSupabase(env);
  await assertHashColumnExists(supabase);
  await assertNotDuplicate(supabase, fileHash, args.force);

  printImportSummary({ filePath, sheetName, fileHash, rows: importRows, commit: args.commit });

  if (!args.commit) {
    console.log("Dry-run completato. Aggiungi --commit per scrivere nel database.");
    return;
  }

  const batchPayload = {
    file_name: path.basename(filePath),
    source_file_name: path.basename(filePath),
    file_path: path.relative(process.cwd(), filePath),
    source_file_path: path.relative(process.cwd(), filePath),
    [HASH_COLUMN]: fileHash,
    sheet_name: sheetName,
    source_sheet_name: sheetName,
    import_status: IMPORT_STATUS.INITIAL,
    total_rows: importRows.length,
    imported_rows: 0,
    skipped_rows: 0,
  };

  const batch = await insertAdaptive(supabase, BATCH_TABLE, batchPayload, [
    "id",
    HASH_COLUMN,
    "import_status",
    "total_rows",
    "imported_rows",
    "skipped_rows",
  ]);

  let importedRows = 0;
  let skippedRows = 0;

  try {
    for (let index = 0; index < importRows.length; index += args.chunkSize) {
      const chunk = importRows.slice(index, index + args.chunkSize).map((row) => ({
        ...row,
        batch_id: batch.id,
      }));
      importedRows += await insertRowsAdaptive(supabase, chunk, [
        "batch_id",
        "source_row_index",
        "row_hash",
        "raw_json",
      ]);
      console.log(`Importate ${importedRows}/${importRows.length} righe...`);
    }

    skippedRows = importRows.length - importedRows;
    await updateBatch(supabase, batch.id, {
      import_status:
        importedRows === importRows.length ? IMPORT_STATUS.IMPORTED : IMPORT_STATUS.PARTIAL,
      total_rows: importRows.length,
      imported_rows: importedRows,
      skipped_rows: skippedRows,
    });

    console.log(`Import completato. Batch ID: ${batch.id}`);
  } catch (error) {
    skippedRows = importRows.length - importedRows;
    await tryUpdateBatch(supabase, batch.id, {
      import_status: IMPORT_STATUS.FAILED,
      total_rows: importRows.length,
      imported_rows: importedRows,
      skipped_rows: skippedRows,
    });
    throw error;
  }
}

main().catch((error) => {
  console.error("Errore:", error.message || error);
  process.exit(1);
});
