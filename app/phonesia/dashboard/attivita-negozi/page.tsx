import Link from "next/link";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 100;
const PAGE_SIZE_MAX = 200;
const FETCH_PAGE_SIZE = 1000;
const NEGOZI = [
  "PHONESIA Floridia",
  "PHONESIA Augusta",
  "PHONESIA Siracusa",
  "PHONESIA Avola",
];
const COLLEGAMENTO_OPTIONS = [
  { value: "tutte", label: "Tutte" },
  { value: "collegate", label: "Collegate" },
  { value: "non_collegate", label: "Non collegate" },
] as const;

type CollegamentoFilter = (typeof COLLEGAMENTO_OPTIONS)[number]["value"];

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type ActivityBatchRow = {
  id: number;
  source_file_name: string | null;
  source_sheet_name: string | null;
  import_status: string | null;
  total_rows: number | null;
  imported_rows: number | null;
  skipped_rows: number | null;
  created_at: string | null;
};

type ActivityRow = {
  id: number;
  batch_id: number | null;
  source_row_index: number | null;
  data_vendita: string | null;
  data: string | null;
  magazzino: string | null;
  negozio_label: string | null;
  documento: string | null;
  numero: string | null;
  descrizione: string | null;
  codice: string | null;
  totale: number | string | null;
  pag_1: string | null;
  pag_2: string | null;
  altro_pag: string | null;
  numero_tel: string | null;
  cliente_pda: string | null;
  operatore: string | null;
};

type ActivityCustomerLinkRow = {
  id: number;
  activity_row_id: number;
  batch_id: number;
  cliente_id: number;
  match_method: string | null;
  confidence: number | string | null;
  activity_phone: string | null;
  crm_phone: string | null;
  created_at: string | null;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
};

type Filters = {
  negozio: string;
  collegamento: CollegamentoFilter;
  q: string;
  batchId: number | null;
  dataDa: string;
  dataA: string;
  page: number;
  pageSize: number;
};

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getSingleValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function normalizeText(value?: string | null): string {
  return String(value ?? "").trim();
}

function normalizeSearch(value?: string | null): string {
  return normalizeText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function parsePositiveInt(value: string, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return fallback;
  return parsed;
}

function parseOptionalPositiveInt(value: string): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

function parseFilters(params: Record<string, string | string[] | undefined>): Filters {
  const collegamentoRaw = getSingleValue(params.collegamento);
  const pageSizeRaw = parsePositiveInt(getSingleValue(params.pageSize), PAGE_SIZE_DEFAULT);

  return {
    negozio: getSingleValue(params.negozio),
    collegamento: COLLEGAMENTO_OPTIONS.some((option) => option.value === collegamentoRaw)
      ? (collegamentoRaw as CollegamentoFilter)
      : "tutte",
    q: getSingleValue(params.q).trim(),
    batchId: parseOptionalPositiveInt(getSingleValue(params.batch_id)),
    dataDa: getSingleValue(params.data_da),
    dataA: getSingleValue(params.data_a),
    page: parsePositiveInt(getSingleValue(params.page), 1),
    pageSize: Math.min(pageSizeRaw, PAGE_SIZE_MAX),
  };
}

function activityDate(row: ActivityRow): string | null {
  return row.data_vendita ?? row.data;
}

function dateKey(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function parseNumeric(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value === null || value === undefined) return null;

  const normalized = String(value)
    .trim()
    .replace(/[^\d,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function formatCurrency(value: number | string | null | undefined): string {
  const parsed = parseNumeric(value);
  if (parsed === null) return "—";

  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
  }).format(parsed);
}

function formatDate(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clienteLabel(cliente?: ClienteRow): string {
  if (!cliente) return "—";
  return [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim() || `Cliente ${cliente.id}`;
}

function buildSearchBlob(row: ActivityRow): string {
  return [
    row.descrizione,
    row.codice,
    row.numero_tel,
    row.cliente_pda,
    row.operatore,
  ]
    .map(normalizeSearch)
    .join(" ");
}

function documentKey(row: ActivityRow): string {
  return [
    row.batch_id ?? "",
    normalizeSearch(row.magazzino),
    normalizeSearch(row.documento),
    normalizeSearch(row.numero),
    dateKey(row.data) || dateKey(row.data_vendita),
  ].join("|");
}

function calculateUniqueDocumentTotal(rows: ActivityRow[]): number {
  const totalsByDocument = new Map<string, number | null>();

  for (const row of rows) {
    const key = documentKey(row);
    const total = parseNumeric(row.totale);

    if (!totalsByDocument.has(key) || totalsByDocument.get(key) === null) {
      totalsByDocument.set(key, total);
    }
  }

  let sum = 0;
  for (const total of totalsByDocument.values()) {
    sum += total ?? 0;
  }

  return sum;
}

function matchesDateFilters(row: ActivityRow, filters: Filters): boolean {
  const value = dateKey(activityDate(row));
  if (filters.dataDa && (!value || value < filters.dataDa)) return false;
  if (filters.dataA && (!value || value > filters.dataA)) return false;
  return true;
}

function matchesSearch(row: ActivityRow, q: string): boolean {
  if (!q) return true;
  return buildSearchBlob(row).includes(normalizeSearch(q));
}

function buildHref(filters: Filters, patch: Partial<Filters>) {
  const next = { ...filters, ...patch };
  const params = new URLSearchParams();

  if (next.negozio) params.set("negozio", next.negozio);
  if (next.collegamento !== "tutte") params.set("collegamento", next.collegamento);
  if (next.q) params.set("q", next.q);
  if (next.batchId) params.set("batch_id", String(next.batchId));
  if (next.dataDa) params.set("data_da", next.dataDa);
  if (next.dataA) params.set("data_a", next.dataA);
  if (next.page > 1) params.set("page", String(next.page));
  if (next.pageSize !== PAGE_SIZE_DEFAULT) params.set("pageSize", String(next.pageSize));

  const query = params.toString();
  return query ? `/phonesia/dashboard/attivita-negozi?${query}` : "/phonesia/dashboard/attivita-negozi";
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchBatches(supabase: ReturnType<typeof getSupabaseAdmin>) {
  const { data, error } = await supabase
    .from("phonesia_activity_import_batches")
    .select(
      "id, source_file_name, source_sheet_name, import_status, total_rows, imported_rows, skipped_rows, created_at",
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Errore lettura batch import attività: ${error.message}`);
  return (data ?? []) as ActivityBatchRow[];
}

async function fetchActivityRows(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  filters: Filters,
) {
  const rows: ActivityRow[] = [];

  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    let query = supabase
      .from("phonesia_activity_import_rows")
      .select(
        "id, batch_id, source_row_index, data_vendita, data, magazzino, negozio_label, documento, numero, descrizione, codice, totale, pag_1, pag_2, altro_pag, numero_tel, cliente_pda, operatore",
      )
      .order("id", { ascending: false })
      .range(from, from + FETCH_PAGE_SIZE - 1);

    if (filters.negozio) {
      query = query.eq("negozio_label", filters.negozio);
    }

    if (filters.batchId) {
      query = query.eq("batch_id", filters.batchId);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Errore lettura attività negozi: ${error.message}`);

    rows.push(...((data ?? []) as ActivityRow[]));
    if (!data || data.length < FETCH_PAGE_SIZE) break;
  }

  return rows;
}

async function fetchLinksByActivityIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  activityIds: number[],
) {
  const links: ActivityCustomerLinkRow[] = [];

  for (const chunk of chunkValues(activityIds, 500)) {
    const { data, error } = await supabase
      .from("phonesia_activity_customer_links")
      .select(
        "id, activity_row_id, batch_id, cliente_id, match_method, confidence, activity_phone, crm_phone, created_at",
      )
      .in("activity_row_id", chunk);

    if (error) throw new Error(`Errore lettura collegamenti attività-clienti: ${error.message}`);
    links.push(...((data ?? []) as ActivityCustomerLinkRow[]));
  }

  return links;
}

async function fetchClientiByIds(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  clienteIds: number[],
) {
  const clienti: ClienteRow[] = [];

  for (const chunk of chunkValues(clienteIds, 500)) {
    const { data, error } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono")
      .in("id", chunk);

    if (error) throw new Error(`Errore lettura clienti collegati: ${error.message}`);
    clienti.push(...((data ?? []) as ClienteRow[]));
  }

  return new Map(clienti.map((cliente) => [cliente.id, cliente]));
}

function buildBestLinkMap(links: ActivityCustomerLinkRow[]) {
  const map = new Map<number, ActivityCustomerLinkRow>();

  for (const link of links) {
    const existing = map.get(link.activity_row_id);
    const currentConfidence = parseNumeric(link.confidence) ?? 0;
    const existingConfidence = parseNumeric(existing?.confidence) ?? 0;

    if (!existing || currentConfidence > existingConfidence || link.id < existing.id) {
      map.set(link.activity_row_id, link);
    }
  }

  return map;
}

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
      {helper ? <div className="mt-1 text-xs font-semibold text-slate-500">{helper}</div> : null}
    </div>
  );
}

function ConnectionBadge({ linked }: { linked: boolean }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-black",
        linked
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-600",
      ].join(" ")}
    >
      {linked ? "Collegata" : "Non collegata"}
    </span>
  );
}

export default async function AttivitaNegoziPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};
  const filters = parseFilters(resolvedParams);
  const supabase = getSupabaseAdmin();

  const [batches, rawRows] = await Promise.all([
    fetchBatches(supabase),
    fetchActivityRows(supabase, filters),
  ]);

  const rowsAfterTextFilters = rawRows
    .filter((row) => matchesDateFilters(row, filters))
    .filter((row) => matchesSearch(row, filters.q));

  const links = await fetchLinksByActivityIds(
    supabase,
    rowsAfterTextFilters.map((row) => row.id),
  );
  const linkByActivityId = buildBestLinkMap(links);
  const clienteIds = [...new Set(links.map((link) => link.cliente_id).filter(Boolean))];
  const clientiById = await fetchClientiByIds(supabase, clienteIds);

  const filteredRows = rowsAfterTextFilters
    .filter((row) => {
      const linked = linkByActivityId.has(row.id);
      if (filters.collegamento === "collegate") return linked;
      if (filters.collegamento === "non_collegate") return !linked;
      return true;
    })
    .sort((a, b) => {
      const dateA = activityDate(a) ? new Date(activityDate(a) as string).getTime() : 0;
      const dateB = activityDate(b) ? new Date(activityDate(b) as string).getTime() : 0;
      return dateB - dateA || b.id - a.id;
    });

  const totalRows = filteredRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / filters.pageSize));
  const currentPage = Math.min(filters.page, totalPages);
  const fromIndex = (currentPage - 1) * filters.pageSize;
  const visibleRows = filteredRows.slice(fromIndex, fromIndex + filters.pageSize);

  const linkedCount = filteredRows.filter((row) => linkByActivityId.has(row.id)).length;
  const batchIds = new Set(
    filteredRows
      .map((row) => row.batch_id)
      .filter((id): id is number => Number.isInteger(id)),
  );
  const relevantBatches = batches.filter((batch) => batchIds.has(batch.id));
  const latestImport = relevantBatches[0]?.created_at ?? null;
  const detailRowsAmount = filteredRows.reduce(
    (sum, row) => sum + (parseNumeric(row.totale) ?? 0),
    0,
  );
  const uniqueDocumentAmount = calculateUniqueDocumentTotal(filteredRows);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-4">
            <Link
              href="/phonesia/dashboard"
              className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              ← Torna alla dashboard
            </Link>

            <div>
              <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                Registro negozi
              </div>
              <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                Attività negozi
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                Registro attività importato dagli Excel dei punti vendita.
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-4 xl:grid-cols-7">
          <SummaryCard label="Attività importate" value={String(totalRows)} />
          <SummaryCard label="Collegate a cliente CRM" value={String(linkedCount)} />
          <SummaryCard label="Non collegate" value={String(totalRows - linkedCount)} />
          <SummaryCard label="Batch importati" value={String(batchIds.size)} />
          <SummaryCard label="Ultimo import" value={formatDateTime(latestImport)} />
          <SummaryCard
            label="Totale documenti unici"
            value={formatCurrency(uniqueDocumentAmount)}
            helper="Calcolato una sola volta per documento"
          />
          <SummaryCard label="Somma righe dettaglio" value={formatCurrency(detailRowsAmount)} />
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
          <form method="GET" className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Negozio</span>
              <select
                name="negozio"
                defaultValue={filters.negozio}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              >
                <option value="">Tutte</option>
                {NEGOZI.map((negozio) => (
                  <option key={negozio} value={negozio}>
                    {negozio}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Collegamento</span>
              <select
                name="collegamento"
                defaultValue={filters.collegamento}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              >
                {COLLEGAMENTO_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Batch</span>
              <select
                name="batch_id"
                defaultValue={filters.batchId ? String(filters.batchId) : ""}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              >
                <option value="">Tutti</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    #{batch.id} · {batch.source_file_name || "file non indicato"} ·{" "}
                    {formatDate(batch.created_at)}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Data da</span>
              <input
                type="date"
                name="data_da"
                defaultValue={filters.dataDa}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              />
            </label>

            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Data a</span>
              <input
                type="date"
                name="data_a"
                defaultValue={filters.dataA}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              />
            </label>

            <label className="space-y-1 text-sm font-semibold text-slate-700">
              <span>Righe</span>
              <select
                name="pageSize"
                defaultValue={String(filters.pageSize)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              >
                <option value="50">50</option>
                <option value="100">100</option>
                <option value="200">200</option>
              </select>
            </label>

            <label className="space-y-1 text-sm font-semibold text-slate-700 md:col-span-2 xl:col-span-4">
              <span>Ricerca</span>
              <input
                type="search"
                name="q"
                defaultValue={filters.q}
                placeholder="Descrizione, codice, telefono, cliente PDA o operatore"
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-orange-300"
              />
            </label>

            <div className="flex items-end gap-2 md:col-span-2">
              <button
                type="submit"
                className="rounded-2xl bg-slate-950 px-5 py-2 text-sm font-bold text-white transition hover:bg-orange-600"
              >
                Filtra
              </button>
              <Link
                href="/phonesia/dashboard/attivita-negozi"
                className="rounded-2xl border border-slate-200 bg-slate-50 px-5 py-2 text-sm font-bold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
              >
                Reset
              </Link>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-black text-slate-950">Registro attività</h2>
              <p className="mt-1 text-sm text-slate-600">
                Pagina {currentPage} di {totalPages} · {totalRows} attività filtrate
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href={buildHref(filters, { page: Math.max(1, currentPage - 1) })}
                className={[
                  "rounded-full border px-4 py-2 text-sm font-bold",
                  currentPage <= 1
                    ? "pointer-events-none border-slate-100 bg-slate-50 text-slate-300"
                    : "border-slate-200 bg-slate-50 text-slate-700 transition hover:border-orange-300 hover:text-orange-700",
                ].join(" ")}
              >
                Precedente
              </Link>
              <Link
                href={buildHref(filters, { page: Math.min(totalPages, currentPage + 1) })}
                className={[
                  "rounded-full border px-4 py-2 text-sm font-bold",
                  currentPage >= totalPages
                    ? "pointer-events-none border-slate-100 bg-slate-50 text-slate-300"
                    : "border-slate-200 bg-slate-50 text-slate-700 transition hover:border-orange-300 hover:text-orange-700",
                ].join(" ")}
              >
                Successiva
              </Link>
            </div>
          </div>

          {visibleRows.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm font-semibold text-slate-500">
              Nessuna attività trovata con i filtri selezionati.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[1500px] divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Negozio</th>
                    <th className="px-3 py-3">Documento</th>
                    <th className="px-3 py-3">Numero</th>
                    <th className="px-3 py-3">Descrizione</th>
                    <th className="px-3 py-3">Codice</th>
                    <th className="px-3 py-3 text-right">Totale</th>
                    <th className="px-3 py-3">Pagamento</th>
                    <th className="px-3 py-3">Numero telefono</th>
                    <th className="px-3 py-3">Operatore</th>
                    <th className="px-3 py-3">Cliente collegato</th>
                    <th className="px-3 py-3">Stato collegamento</th>
                    <th className="px-3 py-3">Scheda cliente</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {visibleRows.map((row) => {
                    const link = linkByActivityId.get(row.id);
                    const cliente = link ? clientiById.get(link.cliente_id) : undefined;
                    const linked = Boolean(link);

                    return (
                      <tr key={row.id} className="align-top">
                        <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">
                          {formatDate(activityDate(row))}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-700">
                          {normalizeText(row.negozio_label) || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {normalizeText(row.documento) || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                          {normalizeText(row.numero) || "—"}
                        </td>
                        <td className="max-w-[320px] px-3 py-3 font-semibold text-slate-950">
                          {normalizeText(row.descrizione) || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                          {normalizeText(row.codice) || "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-slate-950">
                          {formatCurrency(row.totale)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          <div>{normalizeText(row.pag_1) || "—"}</div>
                          <div className="text-xs text-slate-400">
                            {normalizeText(row.pag_2) || normalizeText(row.altro_pag) || "—"}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-xs text-slate-600">
                          {normalizeText(row.numero_tel) || "—"}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {normalizeText(row.operatore) || "—"}
                        </td>
                        <td className="px-3 py-3 font-semibold text-slate-950">
                          {clienteLabel(cliente)}
                          {cliente?.telefono ? (
                            <div className="mt-1 font-mono text-xs font-normal text-slate-500">
                              {cliente.telefono}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <ConnectionBadge linked={linked} />
                        </td>
                        <td className="px-3 py-3">
                          {cliente ? (
                            <Link
                              href={`/phonesia/dashboard/clienti/${cliente.id}`}
                              className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
                            >
                              Apri scheda
                            </Link>
                          ) : (
                            <span className="text-sm text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
