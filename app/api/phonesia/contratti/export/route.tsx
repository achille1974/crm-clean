import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY for export route.",
  );
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type ExportRowRaw = {
  id: string;
  created_at: string | null;
  data_stipula: string | null;
  nome: string | null;
  cognome: string | null;
  operatore: string | null;
  categoria: string | null;
  tipo_contratto: string | null;
  numero_contratto: string | null;
  telefono: string | null;
  email: string | null;
  negozio_id: number | null;
  origine_cliente: string | null;
};

function sanitizeDate(value: string | null): string | null {
  if (!value) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function formatDateForExcel(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function labelContratto(categoria: string | null, tipo: string | null) {
  const parts = [categoria, tipo].filter(Boolean);
  if (parts.length === 0) return "Non classificato";
  return parts.join(" · ");
}

function buildFilename(from: string | null, to: string | null, negozio: string | null) {
  const pieces = ["contratti-phonesia"];

  if (negozio) {
    pieces.push(`negozio-${negozio}`);
  }

  if (from) {
    pieces.push(`dal-${from}`);
  }

  if (to) {
    pieces.push(`al-${to}`);
  }

  pieces.push(
    new Date()
      .toISOString()
      .replace(/[:]/g, "-")
      .replace(/\..+$/, ""),
  );

  return `${pieces.join("_")}.xlsx`;
}

async function getAllFilteredContracts(params: {
  negozioCodice: number | null;
  dateFrom: string | null;
  dateTo: string | null;
}): Promise<ExportRowRaw[]> {
  const chunkSize = 1000;
  const rows: ExportRowRaw[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("phonesia_contratti")
      .select(
        "id, created_at, data_stipula, nome, cognome, operatore, categoria, tipo_contratto, numero_contratto, telefono, email, negozio_id, origine_cliente",
      )
      .order("created_at", { ascending: false })
      .range(from, from + chunkSize - 1);

    if (params.negozioCodice) {
      query = query.eq("negozio_id", params.negozioCodice);
    }

    if (params.dateFrom) {
      query = query.gte("data_stipula", params.dateFrom);
    }

    if (params.dateTo) {
      query = query.lte("data_stipula", params.dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Errore export contratti: ${error.message}`);
    }

    const chunk = (data ?? []) as ExportRowRaw[];
    rows.push(...chunk);

    if (chunk.length < chunkSize) {
      break;
    }

    from += chunkSize;
  }

  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const negozioRaw = searchParams.get("negozio");
    const fromRaw = sanitizeDate(searchParams.get("from"));
    const toRaw = sanitizeDate(searchParams.get("to"));

    const negozioCodice =
      negozioRaw && negozioRaw !== "all" && !Number.isNaN(Number(negozioRaw))
        ? Number(negozioRaw)
        : null;

    const [contratti, negoziRes] = await Promise.all([
      getAllFilteredContracts({
        negozioCodice,
        dateFrom: fromRaw,
        dateTo: toRaw,
      }),
      supabase.from("phonesia_negozi").select("codice, nome"),
    ]);

    const negozioMap = new Map<number, string>();
    (negoziRes.data ?? []).forEach((row: any) => {
      negozioMap.set(Number(row.codice), row.nome);
    });

    const exportRows = contratti.map((row) => ({
      ID: row.id,
      Cliente: [row.nome, row.cognome].filter(Boolean).join(" ").trim() || "",
      Nome: row.nome ?? "",
      Cognome: row.cognome ?? "",
      Operatore: row.operatore ?? "",
      Contratto: labelContratto(row.categoria, row.tipo_contratto),
      Categoria: row.categoria ?? "",
      TipoContratto: row.tipo_contratto ?? "",
      NumeroContratto: row.numero_contratto ?? "",
      DataStipula: formatDateForExcel(row.data_stipula),
      ImportatoIl: formatDateForExcel(row.created_at),
      Telefono: row.telefono ?? "",
      Email: row.email ?? "",
      Negozio:
        row.negozio_id != null
          ? negozioMap.get(Number(row.negozio_id)) ?? `Negozio ${row.negozio_id}`
          : "(non associato)",
      NegozioId: row.negozio_id ?? "",
      OrigineCliente: row.origine_cliente ?? "",
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(exportRows);

    XLSX.utils.book_append_sheet(workbook, worksheet, "Contratti");

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    const filename = buildFilename(fromRaw, toRaw, negozioRaw);

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown export error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}
