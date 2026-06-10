const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const ACTIVITY_ROWS_TABLE = "phonesia_activity_import_rows";
const CLIENTI_TABLE = "phonesia_clienti";
const LINKS_TABLE = "phonesia_activity_customer_links";
const PAGE_SIZE = 1000;

const CREATE_LINK_TABLE_SQL = `
create table if not exists public.phonesia_activity_customer_links (
  id bigserial primary key,
  activity_row_id bigint not null references public.phonesia_activity_import_rows(id),
  batch_id bigint not null references public.phonesia_activity_import_batches(id),
  cliente_id bigint not null references public.phonesia_clienti(id),
  match_method text not null,
  confidence numeric not null,
  activity_phone text,
  crm_phone text,
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists phonesia_activity_customer_links_row_cliente_uidx
on public.phonesia_activity_customer_links(activity_row_id, cliente_id);

create index if not exists phonesia_activity_customer_links_batch_id_idx
on public.phonesia_activity_customer_links(batch_id);

create index if not exists phonesia_activity_customer_links_cliente_id_idx
on public.phonesia_activity_customer_links(cliente_id);

create index if not exists phonesia_activity_customer_links_activity_row_id_idx
on public.phonesia_activity_customer_links(activity_row_id);

alter table public.phonesia_activity_customer_links enable row level security;

notify pgrst, 'reload schema';
`.trim();

function parseArgs(argv) {
  const args = {
    batchId: null,
    commit: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--batch-id") {
      args.batchId = Number(argv[++i]);
    } else if (arg.startsWith("--batch-id=")) {
      args.batchId = Number(arg.slice("--batch-id=".length));
    } else if (arg === "--commit") {
      args.commit = true;
    } else {
      throw new Error(`Argomento non riconosciuto: ${arg}`);
    }
  }

  if (!Number.isInteger(args.batchId) || args.batchId < 1) {
    throw new Error("Parametro obbligatorio mancante o non valido: --batch-id <id>");
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

function isMissingTableError(error) {
  return error && /does not exist|schema cache|could not find the table/i.test(error.message || "");
}

async function assertLinksTableExists(supabase) {
  const { error } = await supabase.from(LINKS_TABLE).select("id").limit(1);
  if (!error) return true;
  if (!isMissingTableError(error)) throw error;
  return false;
}

async function fetchAll(supabase, table, select, applyQuery) {
  const rows = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from(table).select(select).range(from, from + PAGE_SIZE - 1);
    if (applyQuery) query = applyQuery(query);

    const { data, error } = await query;
    if (error) throw error;

    rows.push(...data);
    if (data.length < PAGE_SIZE) return rows;
  }
}

function normalizePhone(value) {
  if (value === null || value === undefined) {
    return { raw: "", digits: "", canonical: "", keys: [] };
  }

  const raw = String(value).trim();
  let digits = raw.replace(/\D/g, "");

  while (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("390")) {
    digits = `39${digits.slice(3)}`;
  }

  let national = digits;
  if (digits.startsWith("39") && digits.length > 10) {
    national = digits.slice(2);
  }
  national = national.replace(/^0+(?=3\d{8,})/, "");

  const keys = new Set();
  if (digits) keys.add(digits);
  if (national) keys.add(national);
  if (national.length === 10) keys.add(`39${national}`);
  if (digits.length >= 10) keys.add(digits.slice(-10));

  return {
    raw,
    digits,
    canonical: national.length === 10 ? `39${national}` : digits,
    keys: [...keys].filter((item) => item.length >= 8),
  };
}

function clienteLabel(cliente) {
  return [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() || `(cliente ${cliente.id})`;
}

function addClienteToIndexes(indexes, cliente) {
  const normalized = normalizePhone(cliente.telefono);
  if (normalized.keys.length === 0) return;

  for (const key of normalized.keys) {
    if (!indexes.byPhoneKey.has(key)) indexes.byPhoneKey.set(key, new Map());
    indexes.byPhoneKey.get(key).set(cliente.id, {
      ...cliente,
      normalizedPhone: normalized,
    });
  }
}

function findCandidates(indexes, normalizedActivityPhone) {
  const candidates = new Map();

  for (const key of normalizedActivityPhone.keys) {
    const matches = indexes.byPhoneKey.get(key);
    if (!matches) continue;

    for (const [clienteId, cliente] of matches.entries()) {
      candidates.set(clienteId, cliente);
    }
  }

  return [...candidates.values()];
}

function summarizeMatches(rows, clienti) {
  const indexes = {
    byPhoneKey: new Map(),
  };

  for (const cliente of clienti) {
    addClienteToIndexes(indexes, cliente);
  }

  const summary = {
    totalRows: rows.length,
    withPhone: 0,
    withoutPhone: 0,
    certain: [],
    ambiguous: [],
    notFound: [],
    matchByStore: {},
  };

  for (const row of rows) {
    const activityPhone = normalizePhone(row.numero_tel);
    const base = {
      activity_row_id: row.id,
      batch_id: row.batch_id,
      source_row_index: row.source_row_index,
      negozio_label: row.negozio_label || "(vuoto)",
      activity_phone: activityPhone.raw,
      activity_phone_normalized: activityPhone.canonical,
      numero_tel: row.numero_tel,
    };

    if (activityPhone.keys.length === 0) {
      summary.withoutPhone += 1;
      continue;
    }

    summary.withPhone += 1;
    const candidates = findCandidates(indexes, activityPhone);

    if (candidates.length === 1) {
      const cliente = candidates[0];
      const match = {
        ...base,
        cliente_id: cliente.id,
        cliente: clienteLabel(cliente),
        match_method: "phone_exact_normalized",
        confidence: 1,
        crm_phone: cliente.telefono,
        crm_phone_normalized: cliente.normalizedPhone.canonical,
      };
      summary.certain.push(match);
      summary.matchByStore[base.negozio_label] = (summary.matchByStore[base.negozio_label] || 0) + 1;
    } else if (candidates.length > 1) {
      summary.ambiguous.push({
        ...base,
        candidate_count: candidates.length,
        candidates: candidates.slice(0, 10).map((cliente) => ({
          cliente_id: cliente.id,
          cliente: clienteLabel(cliente),
          crm_phone: cliente.telefono,
        })),
      });
    } else {
      summary.notFound.push(base);
    }
  }

  return summary;
}

function printSummary({ batchId, commit, linksTableExists, summary }) {
  console.log(commit ? "COMMIT: scrittura link abilitata." : "DRY-RUN: nessuna scrittura sul database.");
  console.log(`batch_id: ${batchId}`);
  console.log(`tabella link presente: ${linksTableExists ? "si" : "no"}`);
  console.log(`righe totali: ${summary.totalRows}`);
  console.log(`righe con telefono: ${summary.withPhone}`);
  console.log(`righe senza telefono: ${summary.withoutPhone}`);
  console.log(`match certi: ${summary.certain.length}`);
  console.log(`ambigui: ${summary.ambiguous.length}`);
  console.log(`non trovati: ${summary.notFound.length}`);
  console.log("match per negozio:");
  console.log(JSON.stringify(summary.matchByStore, null, 2));
  console.log("primi 20 esempi match:");
  console.log(JSON.stringify(summary.certain.slice(0, 20), null, 2));
  console.log("primi 20 esempi ambigui:");
  console.log(JSON.stringify(summary.ambiguous.slice(0, 20), null, 2));
  console.log("primi 20 esempi non trovati:");
  console.log(JSON.stringify(summary.notFound.slice(0, 20), null, 2));
}

async function fetchExistingLinkKeys(supabase, batchId) {
  const existing = await fetchAll(
    supabase,
    LINKS_TABLE,
    "activity_row_id, cliente_id",
    (query) => query.eq("batch_id", batchId)
  );

  return new Set(existing.map((row) => `${row.activity_row_id}:${row.cliente_id}`));
}

async function insertLinks(supabase, batchId, matches) {
  const existingKeys = await fetchExistingLinkKeys(supabase, batchId);
  const payloads = [];

  for (const match of matches) {
    const key = `${match.activity_row_id}:${match.cliente_id}`;
    if (existingKeys.has(key)) continue;

    payloads.push({
      activity_row_id: match.activity_row_id,
      batch_id: match.batch_id,
      cliente_id: match.cliente_id,
      match_method: match.match_method,
      confidence: match.confidence,
      activity_phone: match.activity_phone,
      crm_phone: match.crm_phone,
      notes: `Match automatico per telefono normalizzato. activity=${match.activity_phone_normalized}; crm=${match.crm_phone_normalized}`,
    });
  }

  let inserted = 0;
  for (let index = 0; index < payloads.length; index += 500) {
    const chunk = payloads.slice(index, index + 500);
    const { error } = await supabase.from(LINKS_TABLE).upsert(chunk, {
      onConflict: "activity_row_id,cliente_id",
      ignoreDuplicates: true,
    });
    if (error) throw error;
    inserted += chunk.length;
    console.log(`Link preparati/inseriti ${inserted}/${payloads.length}...`);
  }

  return {
    eligible: matches.length,
    alreadyPresent: matches.length - payloads.length,
    inserted: payloads.length,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const supabase = createSupabase(env);

  const linksTableExists = await assertLinksTableExists(supabase);
  if (!linksTableExists && args.commit) {
    throw new Error(
      [
        `Tabella link mancante: public.${LINKS_TABLE}`,
        "Crea prima la tabella con questa SQL:",
        CREATE_LINK_TABLE_SQL,
      ].join("\n")
    );
  }

  const rows = await fetchAll(
    supabase,
    ACTIVITY_ROWS_TABLE,
    "id, batch_id, source_row_index, numero_tel, negozio_label",
    (query) => query.eq("batch_id", args.batchId).order("id", { ascending: true })
  );
  const clienti = await fetchAll(
    supabase,
    CLIENTI_TABLE,
    "id, nome, cognome, telefono",
    (query) => query.not("telefono", "is", null).order("id", { ascending: true })
  );

  const summary = summarizeMatches(rows, clienti);
  printSummary({ batchId: args.batchId, commit: args.commit, linksTableExists, summary });

  if (!linksTableExists) {
    console.log("SQL necessaria per abilitare il commit:");
    console.log(CREATE_LINK_TABLE_SQL);
  }

  if (!args.commit) {
    console.log("Dry-run completato. Aggiungi --commit per scrivere i link.");
    return;
  }

  const result = await insertLinks(supabase, args.batchId, summary.certain);
  console.log("Commit link completato:");
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error("Errore:", error.message || error);
  process.exit(1);
});
