import Link from "next/link";
import { createClient } from "@supabase/supabase-js";
import ClientiSelectionForm from "@/components/phonesia/dashboard/ClientiSelectionForm";
import {
  formatPromoSentAtRome,
  getPromoKeyFromHistoryRow,
  getPromoOpportunitySentAt,
  type PromoOpportunityHistoryRow,
} from "@/lib/phonesia/opportunita-promo-history";

export const dynamic = "force-dynamic";

const SERVICE_COLUMNS = [
  "MOBILE",
  "FISSO",
  "ENERGIA",
  "TV",
  "SMARTPHONE",
  "ACCESSORI",
  "SICUREZZA",
  "FOTOVOLTAICO",
] as const;

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type SearchParamsInput =
  | Promise<Record<string, string | string[] | undefined>>
  | Record<string, string | string[] | undefined>;

type Props = {
  searchParams?: SearchParamsInput;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  whatsapp_active: boolean | null;
  created_at: string | null;
};

type ServizioRow = {
  cliente_id: number | null;
  service_family: string | null;
  service_code: string | null;
  provider_cluster: string | null;
  brand_raw: string | null;
  service_status: string | null;
};

type ContrattoRow = {
  cliente_id: number | null;
  operatore: string | null;
  data_stipula: string | null;
  created_at: string | null;
};

type MarketingConsentRow = {
  cliente_id: number | null;
};

type PromoFilterOption = {
  key: string;
  label: string;
  description: string;
  negozioLabel: string;
  attachmentFileName: string | null;
  sentClientCount: number;
  sentRowCount: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
  messagePreview: string | null;
};

const NEGOZI: Record<number, string> = {
  1: "Floridia",
  2: "Augusta",
  3: "Siracusa",
  4: "Avola",
  5: "Tabacchino Floridia",
};

const ROME_TIME_ZONE = "Europe/Rome";

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

function normalizePreviewText(value?: string | null): string {
  return normalizeText(value).replace(/\s+/g, " ");
}

function getMetadataString(
  metadata: Record<string, unknown> | null | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildSearchBlob(cliente: ClienteRow): string {
  return [
    cliente.nome,
    cliente.cognome,
    cliente.telefono,
    cliente.email,
    cliente.codice_fiscale,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function isServizioAttivo(status?: string | null): boolean {
  const normalized = normalizeText(status).toUpperCase();

  if (!normalized) return true;

  return !["CESSATO", "DISATTIVO", "CHIUSO", "ANNULLATO"].includes(normalized);
}

function normalizeServiceFamily(row: ServizioRow): ServiceFamily | null {
  const family = normalizeText(row.service_family).toUpperCase();
  const code = normalizeText(row.service_code).toUpperCase();

  if (SERVICE_COLUMNS.includes(family as ServiceFamily)) {
    return family as ServiceFamily;
  }

  if (code.includes("MOBILE")) return "MOBILE";
  if (code.includes("FISSO")) return "FISSO";
  if (code.includes("ENERGIA")) return "ENERGIA";
  if (code.includes("TV")) return "TV";
  if (code.includes("SMARTPHONE")) return "SMARTPHONE";
  if (code.includes("ACCESSORI")) return "ACCESSORI";
  if (code.includes("SICUREZZA")) return "SICUREZZA";
  if (code.includes("FOTOVOLTAICO")) return "FOTOVOLTAICO";

  return null;
}

function resolveOperatore(servizi: ServizioRow[], contratti: ContrattoRow[]): string {
  const contrattoConOperatore = contratti.find((row) => normalizeText(row.operatore));
  if (contrattoConOperatore?.operatore) {
    return contrattoConOperatore.operatore;
  }

  const counts = new Map<string, number>();

  for (const servizio of servizi) {
    const label =
      normalizeText(servizio.brand_raw) ||
      normalizeText(servizio.provider_cluster);

    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  const winner = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return winner?.[0] ?? "—";
}

function CellFlag({ active }: { active: boolean }) {
  return (
    <div
      className={[
        "mx-auto flex h-8 w-8 items-center justify-center rounded-full border text-sm font-bold",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-300",
      ].join(" ")}
    >
      {active ? "✓" : "—"}
    </div>
  );
}

function formatPromoDateRome(value: string | null): string {
  if (!value) return "";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("it-IT", {
    timeZone: ROME_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function getPromoSourceText(row: PromoOpportunityHistoryRow): string {
  return (
    normalizePreviewText(row.messaggio) ||
    normalizePreviewText(getMetadataString(row.metadata, "custom_message")) ||
    normalizePreviewText(getMetadataString(row.metadata, "messaggio_personalizzato")) ||
    normalizePreviewText(row.opportunita_code)
  );
}

function cleanPromoPhrase(value: string): string {
  return value
    .replace(/\s*,?\s*(anticipo zero|salvo approvazione|ti aspettiamo).*$/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function extractPromoDescription(row: PromoOpportunityHistoryRow): string | null {
  const text = getPromoSourceText(row);
  if (!text) return null;

  const operatorMatch = text.match(/\b(TIM|Vodafone|WINDTRE|WindTre|Iliad|Fastweb|Kena|Very)\b/i);
  const operator = operatorMatch?.[1]
    ? operatorMatch[1].toUpperCase() === "WINDTRE"
      ? "WINDTRE"
      : operatorMatch[1].toUpperCase()
    : null;
  const purchaseMatch = text.match(/puoi acquistare\s+(.+?)(?:[,.]|$)/i);
  const offerMatch = text.match(/promo\s+[A-Z0-9]+\s*:\s*(.+?)(?:[,.]|$)/i);
  const service = normalizeText(row.opportunita_code)
    .replace(/^CUSTOM_MESSAGE(?:_IMAGE|_DOCUMENT)?:/i, "")
    .replace(/[-_]+/g, " ");
  const rawPhrase = purchaseMatch?.[1] || offerMatch?.[1] || "";
  const phrase = cleanPromoPhrase(rawPhrase);

  if (operator && phrase) return `${operator} ${phrase}`;
  if (operator) return `Promo ${operator}`;
  if (phrase) return phrase;

  if (service && !/^[0-9a-f]{8}/i.test(service)) {
    return service.length > 80 ? `${service.slice(0, 77)}...` : service;
  }

  return null;
}

function getPromoMessagePreview(row: PromoOpportunityHistoryRow): string | null {
  const message = getPromoSourceText(row);

  if (!message) return null;
  return message.length > 90 ? `${message.slice(0, 87)}...` : message;
}

function getPromoAttachmentFileName(row: PromoOpportunityHistoryRow): string | null {
  return (
    normalizeText(row.attachment_file_name) ||
    getMetadataString(row.metadata, "attachment_file_name") ||
    null
  );
}

function inferNegozioLabelFromText(value: string): string | null {
  const text = value.toLowerCase();
  const match = Object.values(NEGOZI).find((label) =>
    text.includes(label.toLowerCase()),
  );

  return match ?? null;
}

function buildPromoFilterOptions(
  rows: PromoOpportunityHistoryRow[],
  negozioLabelByClienteId: Map<number, string>,
) {
  const groups = new Map<
    string,
    {
      key: string;
      sentRowCount: number;
      sentClientIds: Set<number>;
      negozioCounts: Map<string, number>;
      firstSentAt: string | null;
      lastSentAt: string | null;
      description: string | null;
      attachmentFileName: string | null;
      messagePreview: string | null;
    }
  >();

  for (const row of rows) {
    const promoKey = getPromoKeyFromHistoryRow(row);
    if (!promoKey) continue;

    const group =
      groups.get(promoKey) ??
      {
        key: promoKey,
        sentRowCount: 0,
        sentClientIds: new Set<number>(),
        negozioCounts: new Map<string, number>(),
        firstSentAt: null,
        lastSentAt: null,
        description: null,
        attachmentFileName: null,
        messagePreview: null,
      };

    group.sentRowCount += 1;

    const clienteId = Number(row.cliente_id);
    if (Number.isFinite(clienteId)) {
      group.sentClientIds.add(clienteId);
      const rowNegozioLabel =
        negozioLabelByClienteId.get(clienteId) ??
        inferNegozioLabelFromText(getPromoSourceText(row));

      if (rowNegozioLabel) {
        group.negozioCounts.set(
          rowNegozioLabel,
          (group.negozioCounts.get(rowNegozioLabel) ?? 0) + 1,
        );
      }
    }

    const sentAt = getPromoOpportunitySentAt(row);
    const sentAtMs = sentAt ? Date.parse(sentAt) : NaN;
    const firstSentAtMs = group.firstSentAt ? Date.parse(group.firstSentAt) : NaN;
    const lastSentAtMs = group.lastSentAt ? Date.parse(group.lastSentAt) : NaN;

    if (Number.isFinite(sentAtMs)) {
      if (!Number.isFinite(firstSentAtMs) || sentAtMs < firstSentAtMs) {
        group.firstSentAt = sentAt;
      }

      if (!Number.isFinite(lastSentAtMs) || sentAtMs > lastSentAtMs) {
        group.lastSentAt = sentAt;
      }
    }

    group.description ||= extractPromoDescription(row);
    group.attachmentFileName ||= getPromoAttachmentFileName(row);
    group.messagePreview ||= getPromoMessagePreview(row);
    groups.set(promoKey, group);
  }

  return [...groups.values()]
    .map((group): PromoFilterOption => {
      const dateLabel = formatPromoDateRome(group.firstSentAt);
      const negozioWinner = [...group.negozioCounts.entries()].sort(
        (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
      )[0]?.[0];
      const negozioLabel = negozioWinner ?? "Negozio non disponibile";
      const description = group.description ?? "Promo WhatsApp";
      const attachmentPart = group.attachmentFileName
        ? ` - ${group.attachmentFileName}`
        : "";
      const label = [
        dateLabel || "Data non disponibile",
        negozioLabel,
        `${description}${attachmentPart}`,
        `${group.sentClientIds.size} clienti`,
      ].join(" - ");

      return {
        key: group.key,
        label,
        description,
        negozioLabel,
        attachmentFileName: group.attachmentFileName,
        sentClientCount: group.sentClientIds.size,
        sentRowCount: group.sentRowCount,
        firstSentAt: group.firstSentAt,
        lastSentAt: group.lastSentAt,
        messagePreview: group.messagePreview,
      };
    })
    .sort((a, b) => {
      const bTime = b.lastSentAt ? Date.parse(b.lastSentAt) : 0;
      const aTime = a.lastSentAt ? Date.parse(a.lastSentAt) : 0;
      return bTime - aTime || b.sentClientCount - a.sentClientCount;
    });
}

function MarketingConsentBadge({ active }: { active: boolean }) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
        active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      ].join(" ")}
    >
      {active ? "Autorizzato" : "Non autorizzato"}
    </span>
  );
}

export default async function DashboardClientiPage({ searchParams }: Props) {
  const resolvedParams = searchParams ? await searchParams : {};

  const q = getSingleValue(resolvedParams.q).trim();
  const negozio = getSingleValue(resolvedParams.negozio).trim();
  const onlyMarketingConsent = getSingleValue(resolvedParams.solo_marketing) === "1";
  const requestedPromoKey = getSingleValue(resolvedParams.promo_key).trim();

  const supabase = getSupabaseAdmin();

  const { data: clientiData, error: clientiError } = await supabase
    .from("phonesia_clienti")
    .select(
      "id, nome, cognome, telefono, email, codice_fiscale, negozio_id, whatsapp_active, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);

  if (clientiError) {
    throw new Error(`Errore lettura clienti: ${clientiError.message}`);
  }

  let clienti = (clientiData ?? []) as ClienteRow[];

  if (q) {
    const query = q.toLowerCase();
    clienti = clienti.filter((cliente) => buildSearchBlob(cliente).includes(query));
  }

  if (negozio) {
    clienti = clienti.filter((cliente) => String(cliente.negozio_id ?? "") === negozio);
  }

  const clienteIds = clienti.map((cliente) => cliente.id);

  const serviziByCliente = new Map<number, ServizioRow[]>();
  const contrattiByCliente = new Map<number, ContrattoRow[]>();
  let marketingConsentedIds = new Set<number>();
  let promoHistoryRows: PromoOpportunityHistoryRow[] = [];

  if (clienteIds.length > 0) {
    const [
      { data: serviziData, error: serviziError },
      { data: contrattiData, error: contrattiError },
      { data: marketingConsentData, error: marketingConsentError },
      { data: promoHistoryData, error: promoHistoryError },
    ] =
      await Promise.all([
        supabase
          .from("phonesia_servizi_cliente")
          .select(
            "cliente_id, service_family, service_code, provider_cluster, brand_raw, service_status",
          )
          .in("cliente_id", clienteIds),
        supabase
          .from("phonesia_contratti")
          .select("cliente_id, operatore, data_stipula, created_at")
          .in("cliente_id", clienteIds)
          .order("data_stipula", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("phonesia_consensi")
          .select("cliente_id")
          .eq("tipo_evento", "marketing_accepted")
          .in("cliente_id", clienteIds),
        supabase
          .from("phonesia_opportunita_inviate")
          .select(
            "cliente_id, opportunita_code, channel, sent_at, created_at, send_mode, inviato_at, messaggio, attachment_public_url, attachment_file_name, promo_key, metadata",
          )
          .in("cliente_id", clienteIds)
          .order("inviato_at", { ascending: false })
          .limit(5000),
      ]);

    if (serviziError) {
      throw new Error(`Errore lettura servizi cliente: ${serviziError.message}`);
    }

    if (contrattiError) {
      throw new Error(`Errore lettura contratti: ${contrattiError.message}`);
    }

    if (marketingConsentError) {
      throw new Error(
        `Errore lettura consensi marketing: ${marketingConsentError.message}`,
      );
    }

    if (promoHistoryError) {
      throw new Error(`Errore lettura storico promo: ${promoHistoryError.message}`);
    }

    for (const row of (serviziData ?? []) as ServizioRow[]) {
      if (!row.cliente_id) continue;
      const list = serviziByCliente.get(row.cliente_id) ?? [];
      list.push(row);
      serviziByCliente.set(row.cliente_id, list);
    }

    for (const row of (contrattiData ?? []) as ContrattoRow[]) {
      if (!row.cliente_id) continue;
      const list = contrattiByCliente.get(row.cliente_id) ?? [];
      list.push(row);
      contrattiByCliente.set(row.cliente_id, list);
    }

    marketingConsentedIds = new Set<number>(
      ((marketingConsentData ?? []) as MarketingConsentRow[])
        .map((row) => Number(row.cliente_id))
        .filter((value): value is number => Number.isFinite(value)),
    );

    promoHistoryRows = (promoHistoryData ?? []) as PromoOpportunityHistoryRow[];
  }

  const negozioLabelByClienteId = new Map<number, string>(
    clienti.map((cliente) => [
      cliente.id,
      cliente.negozio_id ? NEGOZI[cliente.negozio_id] ?? `Negozio ${cliente.negozio_id}` : "Non assegnato",
    ]),
  );
  const promoOptions = buildPromoFilterOptions(
    promoHistoryRows,
    negozioLabelByClienteId,
  );
  const selectedPromoOption =
    promoOptions.find((option) => option.key === requestedPromoKey) ?? null;
  const selectedPromoKey = selectedPromoOption?.key ?? "";
  const selectedPromoSentClientIds = new Set<number>();

  if (selectedPromoKey) {
    for (const row of promoHistoryRows) {
      const clienteId = Number(row.cliente_id);
      if (!Number.isFinite(clienteId)) continue;

      if (getPromoKeyFromHistoryRow(row) === selectedPromoKey) {
        selectedPromoSentClientIds.add(clienteId);
      }
    }
  }

  let rows = clienti.map((cliente) => {
    const servizi = (serviziByCliente.get(cliente.id) ?? []).filter((row) =>
      isServizioAttivo(row.service_status),
    );
    const contratti = contrattiByCliente.get(cliente.id) ?? [];

    const activeFamilies = new Set<ServiceFamily>();

    for (const servizio of servizi) {
      const family = normalizeServiceFamily(servizio);
      if (family) {
        activeFamilies.add(family);
      }
    }

    return {
      cliente,
      operatore: resolveOperatore(servizi, contratti),
      activeFamilies,
      marketingConsented: marketingConsentedIds.has(cliente.id),
      selectedPromoAlreadySent: selectedPromoSentClientIds.has(cliente.id),
    };
  });
  if (selectedPromoKey) {
    rows = rows.filter(
      (row) => row.marketingConsented && !row.selectedPromoAlreadySent,
    );
  }
  if (onlyMarketingConsent) {
    rows = rows.filter((row) => row.marketingConsented);
  }

  const selectableClientCount = rows.filter(
    (row) => row.marketingConsented && !row.selectedPromoAlreadySent,
  ).length;
  const excludedBySelectedPromoCount = selectedPromoKey
    ? selectedPromoSentClientIds.size
    : 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-8 md:py-7">
          <div className="flex flex-col gap-4">
            <Link
              href="/phonesia/dashboard"
              className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-orange-300 hover:text-orange-700"
            >
              ← Torna alla dashboard
            </Link>

            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div>
                <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-700">
                  Dashboard commerciale
                </div>

                <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Clienti / Servizi / Opportunità
                </h1>

                <p className="mt-2 max-w-3xl text-sm text-slate-600 md:text-base">
                  Vista compatta con anagrafica essenziale, servizi attivi e accesso
                  rapido alla scheda opportunità del cliente.
                </p>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Clienti visibili: {rows.length}
                <span className="mx-2 text-slate-300">·</span>
                Selezionabili: {selectableClientCount}
                {selectedPromoKey ? (
                  <>
                    <span className="mx-2 text-slate-300">·</span>
                    Esclusi promo: {excludedBySelectedPromoCount}
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          <form className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_220px_minmax(260px,0.7fr)_minmax(320px,1fr)_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Cerca cliente
              </label>
              <input
                type="text"
                name="q"
                defaultValue={q}
                placeholder="Nome, cognome, telefono, email o codice fiscale"
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Negozio
              </label>
              <select
                name="negozio"
                defaultValue={negozio}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="">Tutti i negozi</option>
                {Object.entries(NEGOZI).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-3 self-end rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700">
              <input
                type="checkbox"
                name="solo_marketing"
                value="1"
                defaultChecked={onlyMarketingConsent}
                className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              <span>Solo clienti con consenso marketing</span>
            </label>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-600">
                Escludi clienti già contattati per promo
              </label>
              <select
                name="promo_key"
                defaultValue={selectedPromoKey}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              >
                <option value="">Nessun filtro promo</option>
                {promoOptions.map((option) => (
                  <option
                    key={option.key}
                    value={option.key}
                    title={`Chiave tecnica: ${option.key}`}
                  >
                    {option.label}
                  </option>
                ))}
              </select>
              {requestedPromoKey && !selectedPromoKey ? (
                <div className="mt-2 text-xs font-semibold text-amber-700">
                  Promo non trovata nello storico dei clienti visibili.
                </div>
              ) : null}
            </div>

            <div className="flex items-end gap-3">
              <button
                type="submit"
                className="inline-flex h-[50px] items-center justify-center rounded-2xl bg-orange-500 px-5 text-sm font-semibold text-white transition hover:bg-orange-600"
              >
                Applica filtri
              </button>

              <Link
                href="/phonesia/dashboard/clienti"
                className="inline-flex h-[50px] items-center justify-center rounded-2xl border border-slate-300 px-5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Reset
              </Link>
            </div>
          </form>

          {selectedPromoOption ? (
            <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-950">
              <div className="font-semibold">
                Filtro promo attivo: {selectedPromoOption.label}
              </div>
              <div className="mt-1 text-orange-800">
                Già contattati esclusi: {excludedBySelectedPromoCount}
                <span className="mx-2 text-orange-300">·</span>
                Ultimo invio: {formatPromoSentAtRome(selectedPromoOption.lastSentAt) || "—"}
              </div>
              <div className="mt-1 text-xs text-orange-700">
                Chiave tecnica: {selectedPromoOption.key}
              </div>
            </div>
          ) : null}
        </section>

        <ClientiSelectionForm
          selectableClientCount={selectableClientCount}
          visibleClientCount={rows.length}
        >
          <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="max-h-[70vh] overflow-auto rounded-3xl">
              <table className="min-w-[1840px] w-full text-sm">
                <thead className="text-slate-600">
                  <tr className="border-b border-slate-200">
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Seleziona
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Nome
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Cognome
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Operatore
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Codice fiscale
                    </th>
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Marketing
                    </th>
                    {SERVICE_COLUMNS.map((service) => (
                      <th
                        key={service}
                        className="sticky top-0 z-20 bg-slate-50 px-3 py-3 text-center font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]"
                      >
                        {service}
                      </th>
                    ))}
                    <th className="sticky top-0 z-20 bg-slate-50 px-4 py-3 text-left font-semibold shadow-[0_1px_0_0_rgb(226_232_240)]">
                      Opportunità
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8 + SERVICE_COLUMNS.length}
                        className="px-4 py-10 text-center text-sm text-slate-500"
                      >
                        Nessun cliente trovato con i filtri selezionati.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.cliente.id}
                        className="border-b border-slate-100 align-top transition hover:bg-slate-50/70"
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            name="clienti"
                            value={row.cliente.id}
                            disabled={
                              !row.marketingConsented || row.selectedPromoAlreadySent
                            }
                            title={
                              !row.marketingConsented
                                ? "Cliente senza consenso marketing: non selezionabile."
                                : row.selectedPromoAlreadySent
                                ? "Cliente già contattato per la promo selezionata."
                                : undefined
                            }
                            className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                          />
                        </td>

                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {row.cliente.nome || "—"}
                        </td>

                        <td className="px-4 py-4 font-semibold text-slate-950">
                          {row.cliente.cognome || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">
                            {row.operatore}
                          </span>
                        </td>

                        <td className="px-4 py-4 font-mono text-xs text-slate-700">
                          {row.cliente.codice_fiscale || "—"}
                        </td>

                        <td className="px-4 py-4">
                          <MarketingConsentBadge active={row.marketingConsented} />
                        </td>

                        {SERVICE_COLUMNS.map((service) => (
                          <td key={service} className="px-3 py-4 text-center">
                            <CellFlag active={row.activeFamilies.has(service)} />
                          </td>
                        ))}

                        <td className="px-4 py-4">
                          <Link
                            href={`/phonesia/dashboard/clienti/${row.cliente.id}`}
                            className="inline-flex rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
                          >
                            Opportunità
                          </Link>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </ClientiSelectionForm>
      </div>
    </main>
  );
}
