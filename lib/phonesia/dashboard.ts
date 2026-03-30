import "server-only";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for dashboard queries.",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const LEAD_DATE_FIELD = "created_at";
const CONTRACT_DATE_FIELD = "data_stipula";

export type DashboardFilters = {
  negozioCodice?: number | null;
  dateFrom?: string | null;
  dateTo?: string | null;
};

export type DashboardKpis = {
  leadTotali: number;
  contrattiTotali: number;
  contrattiCollegatiQr: number;
  conversionePct: number;
  contrattiTelefonia: number;
  contrattiEnergia: number;
};

export type NegozioStat = {
  negozioCodice: number | null;
  negozio: string;
  totale: number;
};

export type ConversioneNegozioStat = {
  negozioCodice: number | null;
  negozio: string;
  leadQr: number;
  leadConvertiti: number;
  contratti: number;
  conversionePct: number;
};

export type ContrattiPerOperatoreStat = {
  operatore: string;
  totale: number;
};

export type ContrattoRecente = {
  id: string;
  createdAt: string | null;
  dataStipula: string | null;
  nome: string | null;
  cognome: string | null;
  operatore: string | null;
  categoria: string | null;
  tipoContratto: string | null;
  numeroContratto: string | null;
  telefono: string | null;
  email: string | null;
  negozioId: number | null;
  negozioNome: string;
  origineCliente: string | null;
};

export type LeadRecente = {
  id: number;
  createdAt: string | null;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codiceFiscale: string | null;
  negozioId: number | null;
  negozioNome: string;
};

export type LeadOpportunityRow = {
  id: number;
  createdAt: string | null;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codiceFiscale: string | null;
  negozioId: number | null;
  negozioNome: string;
  hasContract: boolean;
  contractCount: number;
  lastContractDate: string | null;
};

export type NegozioOption = {
  codice: number;
  nome: string;
};

function applyDateRange<T extends { gte: Function; lte: Function }>(
  query: T,
  field: string,
  filters?: DashboardFilters,
  mode: "date" | "datetime" = "datetime",
): T {
  let next = query;

  if (filters?.dateFrom) {
    next =
      mode === "date"
        ? next.gte(field, filters.dateFrom)
        : next.gte(field, `${filters.dateFrom}T00:00:00`);
  }

  if (filters?.dateTo) {
    next =
      mode === "date"
        ? next.lte(field, filters.dateTo)
        : next.lte(field, `${filters.dateTo}T23:59:59`);
  }

  return next;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export async function getDashboardKpis(filters?: DashboardFilters): Promise<DashboardKpis> {
  let leadQuery = supabase
    .from("phonesia_clienti")
    .select("id, negozio_id, created_at", { count: "exact", head: true });

  if (filters?.negozioCodice) {
    leadQuery = leadQuery.eq("negozio_id", filters.negozioCodice);
  }

  leadQuery = applyDateRange(leadQuery, LEAD_DATE_FIELD, filters, "datetime");

  let contractQuery = supabase
    .from("phonesia_contratti")
    .select("id, categoria, cliente_id, negozio_id, data_stipula", {
      count: "exact",
      head: true,
    });

  if (filters?.negozioCodice) {
    contractQuery = contractQuery.eq("negozio_id", filters.negozioCodice);
  }

  contractQuery = applyDateRange(contractQuery, CONTRACT_DATE_FIELD, filters, "date");

  const baseLinkedContractsQuery = filters?.negozioCodice
    ? supabase
        .from("phonesia_contratti")
        .select("id", { count: "exact", head: true })
        .eq("negozio_id", filters.negozioCodice)
        .not("cliente_id", "is", null)
    : supabase
        .from("phonesia_contratti")
        .select("id", { count: "exact", head: true })
        .not("cliente_id", "is", null);

  const baseTelefoniaQuery = filters?.negozioCodice
    ? supabase
        .from("phonesia_contratti")
        .select("id", { count: "exact", head: true })
        .eq("negozio_id", filters.negozioCodice)
        .in("categoria", ["telefonia", "internet"])
    : supabase
        .from("phonesia_contratti")
        .select("id", { count: "exact", head: true })
        .in("categoria", ["telefonia", "internet"]);

  const baseEnergiaQuery = filters?.negozioCodice
    ? supabase
        .from("phonesia_contratti")
        .select("id", { count: "exact", head: true })
        .eq("negozio_id", filters.negozioCodice)
        .eq("categoria", "energia")
    : supabase
        .from("phonesia_contratti")
        .select("id", { count: "exact", head: true })
        .eq("categoria", "energia");

  const [leadCountRes, contractCountRes, linkedContractsRes, telefoniaRes, energiaRes] =
    await Promise.all([
      leadQuery,
      contractQuery,
      applyDateRange(baseLinkedContractsQuery as any, CONTRACT_DATE_FIELD, filters, "date"),
      applyDateRange(baseTelefoniaQuery as any, CONTRACT_DATE_FIELD, filters, "date"),
      applyDateRange(baseEnergiaQuery as any, CONTRACT_DATE_FIELD, filters, "date"),
    ]);

  let linkedLeadsQuery = supabase
    .from("phonesia_contratti")
    .select("cliente_id, negozio_id, data_stipula")
    .not("cliente_id", "is", null);

  if (filters?.negozioCodice) {
    linkedLeadsQuery = linkedLeadsQuery.eq("negozio_id", filters.negozioCodice);
  }

  linkedLeadsQuery = applyDateRange(
    linkedLeadsQuery as any,
    CONTRACT_DATE_FIELD,
    filters,
    "date",
  ) as any;

  const { data: linkedLeadsRows } = await linkedLeadsQuery;

  const leadConvertitiIds = new Set<number>(
    (linkedLeadsRows ?? [])
      .map((row: any) => Number(row.cliente_id))
      .filter((id: number) => !Number.isNaN(id)),
  );

  const leadTotali = leadCountRes.count ?? 0;
  const contrattiTotali = contractCountRes.count ?? 0;
  const contrattiCollegatiQr = linkedContractsRes.count ?? 0;
  const contrattiTelefonia = telefoniaRes.count ?? 0;
  const contrattiEnergia = energiaRes.count ?? 0;
  const leadConvertiti = leadConvertitiIds.size;

  return {
    leadTotali,
    contrattiTotali,
    contrattiCollegatiQr,
    conversionePct: leadTotali ? round2((leadConvertiti / leadTotali) * 100) : 0,
    contrattiTelefonia,
    contrattiEnergia,
  };
}

export async function getLeadPerNegozio(filters?: DashboardFilters): Promise<NegozioStat[]> {
  let query = supabase.from("phonesia_clienti").select("id, negozio_id, created_at");
  query = applyDateRange(query as any, LEAD_DATE_FIELD, filters, "datetime") as any;

  if (filters?.negozioCodice) {
    query = query.eq("negozio_id", filters.negozioCodice);
  }

  const [{ data: clienti }, { data: negozi }] = await Promise.all([
    query,
    supabase.from("phonesia_negozi").select("codice, nome").order("codice", { ascending: true }),
  ]);

  const map = new Map<number, string>();
  (negozi ?? []).forEach((n: any) => map.set(Number(n.codice), n.nome));

  const counts = new Map<number, number>();
  (clienti ?? []).forEach((c: any) => {
    const codice = Number(c.negozio_id);
    counts.set(codice, (counts.get(codice) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([codice, totale]) => ({
      negozioCodice: codice,
      negozio: map.get(codice) ?? `Negozio ${codice}`,
      totale,
    }))
    .sort((a, b) => (a.negozioCodice ?? 0) - (b.negozioCodice ?? 0));
}

export async function getContrattiPerNegozio(filters?: DashboardFilters): Promise<NegozioStat[]> {
  let query = supabase.from("phonesia_contratti").select("id, negozio_id, data_stipula");
  query = applyDateRange(query as any, CONTRACT_DATE_FIELD, filters, "date") as any;

  if (filters?.negozioCodice) {
    query = query.eq("negozio_id", filters.negozioCodice);
  }

  const [{ data: contratti }, { data: negozi }] = await Promise.all([
    query,
    supabase.from("phonesia_negozi").select("codice, nome").order("codice", { ascending: true }),
  ]);

  const map = new Map<number, string>();
  (negozi ?? []).forEach((n: any) => map.set(Number(n.codice), n.nome));

  const counts = new Map<number, number>();
  (contratti ?? []).forEach((c: any) => {
    const codice = c.negozio_id != null ? Number(c.negozio_id) : -1;
    counts.set(codice, (counts.get(codice) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([codice, totale]) => ({
      negozioCodice: codice === -1 ? null : codice,
      negozio: codice === -1 ? "(non associato)" : map.get(codice) ?? `Negozio ${codice}`,
      totale,
    }))
    .sort((a, b) => b.totale - a.totale);
}

export async function getConversionePerNegozio(
  filters?: DashboardFilters,
): Promise<ConversioneNegozioStat[]> {
  let leadQuery = supabase.from("phonesia_clienti").select("id, negozio_id, created_at");
  leadQuery = applyDateRange(leadQuery as any, LEAD_DATE_FIELD, filters, "datetime") as any;

  if (filters?.negozioCodice) {
    leadQuery = leadQuery.eq("negozio_id", filters.negozioCodice);
  }

  let contractQuery = supabase
    .from("phonesia_contratti")
    .select("id, cliente_id, negozio_id, data_stipula");
  contractQuery = applyDateRange(contractQuery as any, CONTRACT_DATE_FIELD, filters, "date") as any;

  if (filters?.negozioCodice) {
    contractQuery = contractQuery.eq("negozio_id", filters.negozioCodice);
  }

  const [{ data: negozi }, { data: clienti }, { data: contratti }] = await Promise.all([
    supabase.from("phonesia_negozi").select("codice, nome").order("codice", { ascending: true }),
    leadQuery,
    contractQuery,
  ]);

  const negoziList = (negozi ?? []).map((n: any) => ({
    codice: Number(n.codice),
    nome: n.nome as string,
  }));

  return negoziList
    .filter((negozio) => !filters?.negozioCodice || negozio.codice === filters.negozioCodice)
    .map((negozio) => {
      const leadQr = (clienti ?? []).filter(
        (c: any) => Number(c.negozio_id) === negozio.codice,
      );

      const leadIds = new Set<number>(
        leadQr
          .map((c: any) => Number(c.id))
          .filter((id: number) => !Number.isNaN(id)),
      );

      const contrattiDelNegozio = (contratti ?? []).filter(
        (c: any) => c.cliente_id != null && leadIds.has(Number(c.cliente_id)),
      );

      const leadConvertitiIds = new Set<number>(
        contrattiDelNegozio
          .map((c: any) => Number(c.cliente_id))
          .filter((id: number) => !Number.isNaN(id)),
      );

      const leadQrCount = leadQr.length;
      const leadConvertitiCount = leadConvertitiIds.size;
      const contrattiCount = contrattiDelNegozio.length;

      return {
        negozioCodice: negozio.codice,
        negozio: negozio.nome,
        leadQr: leadQrCount,
        leadConvertiti: leadConvertitiCount,
        contratti: contrattiCount,
        conversionePct: leadQrCount ? round2((leadConvertitiCount / leadQrCount) * 100) : 0,
      };
    });
}

export async function getContrattiPerOperatore(
  filters?: DashboardFilters,
): Promise<ContrattiPerOperatoreStat[]> {
  let query = supabase.from("phonesia_contratti").select("operatore, negozio_id, data_stipula");
  query = applyDateRange(query as any, CONTRACT_DATE_FIELD, filters, "date") as any;

  if (filters?.negozioCodice) {
    query = query.eq("negozio_id", filters.negozioCodice);
  }

  const { data } = await query;

  const counts = new Map<string, number>();
  (data ?? []).forEach((row: any) => {
    const operatore = row.operatore || "(non indicato)";
    counts.set(operatore, (counts.get(operatore) ?? 0) + 1);
  });

  return Array.from(counts.entries())
    .map(([operatore, totale]) => ({ operatore, totale }))
    .sort((a, b) => b.totale - a.totale);
}

export async function getContrattiRecenti(filters?: DashboardFilters): Promise<ContrattoRecente[]> {
  let query = supabase
    .from("phonesia_contratti")
    .select(
      "id, created_at, data_stipula, nome, cognome, operatore, categoria, tipo_contratto, numero_contratto, telefono, email, negozio_id, origine_cliente",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  query = applyDateRange(query as any, CONTRACT_DATE_FIELD, filters, "date") as any;

  if (filters?.negozioCodice) {
    query = query.eq("negozio_id", filters.negozioCodice);
  }

  const [{ data: contratti }, { data: negozi }] = await Promise.all([
    query,
    supabase.from("phonesia_negozi").select("codice, nome"),
  ]);

  const negozioMap = new Map<number, string>();
  (negozi ?? []).forEach((n: any) => negozioMap.set(Number(n.codice), n.nome));

  return (contratti ?? []).map((row: any) => ({
    id: String(row.id),
    createdAt: row.created_at,
    dataStipula: row.data_stipula,
    nome: row.nome,
    cognome: row.cognome,
    operatore: row.operatore,
    categoria: row.categoria,
    tipoContratto: row.tipo_contratto,
    numeroContratto: row.numero_contratto,
    telefono: row.telefono,
    email: row.email,
    negozioId: row.negozio_id,
    negozioNome:
      row.negozio_id != null
        ? negozioMap.get(Number(row.negozio_id)) ?? `Negozio ${row.negozio_id}`
        : "(non associato)",
    origineCliente: row.origine_cliente,
  }));
}

export async function getLeadRecenti(filters?: DashboardFilters): Promise<LeadRecente[]> {
  let query = supabase
    .from("phonesia_clienti")
    .select("id, created_at, nome, cognome, telefono, email, codice_fiscale, negozio_id")
    .order("created_at", { ascending: false })
    .limit(50);

  query = applyDateRange(query as any, LEAD_DATE_FIELD, filters, "datetime") as any;

  if (filters?.negozioCodice) {
    query = query.eq("negozio_id", filters.negozioCodice);
  }

  const [{ data: lead }, { data: negozi }] = await Promise.all([
    query,
    supabase.from("phonesia_negozi").select("codice, nome"),
  ]);

  const negozioMap = new Map<number, string>();
  (negozi ?? []).forEach((n: any) => negozioMap.set(Number(n.codice), n.nome));

  return (lead ?? []).map((row: any) => ({
    id: row.id,
    createdAt: row.created_at,
    nome: row.nome,
    cognome: row.cognome,
    telefono: row.telefono,
    email: row.email,
    codiceFiscale: row.codice_fiscale,
    negozioId: row.negozio_id,
    negozioNome:
      row.negozio_id != null
        ? negozioMap.get(Number(row.negozio_id)) ?? `Negozio ${row.negozio_id}`
        : "(non associato)",
  }));
}

export async function getLeadOpportunityRows(
  filters?: DashboardFilters,
): Promise<LeadOpportunityRow[]> {
  let leadQuery = supabase
    .from("phonesia_clienti")
    .select("id, created_at, nome, cognome, telefono, email, codice_fiscale, negozio_id")
    .order("created_at", { ascending: false });

  leadQuery = applyDateRange(leadQuery as any, LEAD_DATE_FIELD, filters, "datetime") as any;

  if (filters?.negozioCodice) {
    leadQuery = leadQuery.eq("negozio_id", filters.negozioCodice);
  }

  let contractQuery = supabase
    .from("phonesia_contratti")
    .select("cliente_id, negozio_id, data_stipula, created_at")
    .not("cliente_id", "is", null);

  contractQuery = applyDateRange(contractQuery as any, CONTRACT_DATE_FIELD, filters, "date") as any;

  if (filters?.negozioCodice) {
    contractQuery = contractQuery.eq("negozio_id", filters.negozioCodice);
  }

  const [{ data: leads }, { data: contracts }, { data: negozi }] = await Promise.all([
    leadQuery,
    contractQuery,
    supabase.from("phonesia_negozi").select("codice, nome"),
  ]);

  const negozioMap = new Map<number, string>();
  (negozi ?? []).forEach((n: any) => negozioMap.set(Number(n.codice), n.nome));

  const contractSummary = new Map<
    number,
    { count: number; lastContractDate: string | null }
  >();

  (contracts ?? []).forEach((row: any) => {
    const clienteId = Number(row.cliente_id);
    if (Number.isNaN(clienteId)) return;

    const prev = contractSummary.get(clienteId);
    const currentDate = row.data_stipula || row.created_at || null;

    if (!prev) {
      contractSummary.set(clienteId, {
        count: 1,
        lastContractDate: currentDate,
      });
      return;
    }

    const nextDate =
      currentDate && (!prev.lastContractDate || currentDate > prev.lastContractDate)
        ? currentDate
        : prev.lastContractDate;

    contractSummary.set(clienteId, {
      count: prev.count + 1,
      lastContractDate: nextDate,
    });
  });

  return (leads ?? []).map((row: any) => {
    const leadId = Number(row.id);
    const summary = contractSummary.get(leadId);

    return {
      id: leadId,
      createdAt: row.created_at,
      nome: row.nome,
      cognome: row.cognome,
      telefono: row.telefono,
      email: row.email,
      codiceFiscale: row.codice_fiscale,
      negozioId: row.negozio_id != null ? Number(row.negozio_id) : null,
      negozioNome:
        row.negozio_id != null
          ? negozioMap.get(Number(row.negozio_id)) ?? `Negozio ${row.negozio_id}`
          : "(non associato)",
      hasContract: Boolean(summary),
      contractCount: summary?.count ?? 0,
      lastContractDate: summary?.lastContractDate ?? null,
    };
  });
}

export async function getNegozioOptions(): Promise<NegozioOption[]> {
  const { data } = await supabase
    .from("phonesia_negozi")
    .select("codice, nome")
    .order("codice", { ascending: true });

  return (data ?? []).map((row: any) => ({
    codice: Number(row.codice),
    nome: row.nome,
  }));
}
