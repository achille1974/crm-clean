export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const NEGOZI: Record<number, string> = {
  1: "Floridia",
  2: "Augusta",
  3: "Siracusa",
  4: "Avola",
  5: "Tabacchino Floridia",
};

type FeedbackRow = {
  id: number;
  cliente_id: number | null;
  rating: number;
  commento: string | null;
  ricontatto: boolean | null;
  negozio_id: number | null;
  created_at: string | null;
};

type ClienteRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  negozio_id: number | null;
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

function normalizeText(value?: string | null) {
  return String(value ?? "").trim();
}

function clienteNome(cliente?: ClienteRow) {
  const nome = normalizeText(cliente?.nome);
  const cognome = normalizeText(cliente?.cognome);
  const fullName = [nome, cognome].filter(Boolean).join(" ");

  return fullName || "Cliente non identificato";
}

function getNegozioLabel(negozioId: number | null | undefined) {
  if (!negozioId) return "Non assegnato";
  return NEGOZI[negozioId] || `Negozio ${negozioId}`;
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const { data: feedbackData, error: feedbackError } = await supabase
      .from("phonesia_feedback")
      .select("id, cliente_id, rating, commento, ricontatto, negozio_id, created_at")
      .order("created_at", { ascending: false });

    if (feedbackError) {
      throw new Error(`Errore lettura feedback: ${feedbackError.message}`);
    }

    const feedback = (feedbackData ?? []) as FeedbackRow[];

    const clienteIds = [
      ...new Set(
        feedback
          .map((row) => row.cliente_id)
          .filter((value): value is number => typeof value === "number"),
      ),
    ];

    let clientiMap = new Map<number, ClienteRow>();

    if (clienteIds.length > 0) {
      const { data: clientiData, error: clientiError } = await supabase
        .from("phonesia_clienti")
        .select("id, nome, cognome, telefono, negozio_id")
        .in("id", clienteIds);

      if (clientiError) {
        throw new Error(`Errore lettura clienti: ${clientiError.message}`);
      }

      clientiMap = new Map(
        ((clientiData ?? []) as ClienteRow[]).map((cliente) => [cliente.id, cliente]),
      );
    }

    const feedbackArricchiti = feedback.map((row) => {
      const cliente = row.cliente_id ? clientiMap.get(row.cliente_id) : undefined;
      const negozioId = row.negozio_id ?? cliente?.negozio_id ?? null;

      return {
        id: row.id,
        cliente_id: row.cliente_id,
        cliente_nome: clienteNome(cliente),
        telefono: normalizeText(cliente?.telefono),
        rating: row.rating,
        commento: normalizeText(row.commento),
        ricontatto: row.ricontatto === true,
        negozio_id: negozioId,
        negozio_label: getNegozioLabel(negozioId),
        created_at: row.created_at,
      };
    });

    const aggregati: Record<
      number,
      {
        negozio_id: number;
        negozio_label: string;
        totale_rating: number;
        totale_feedback: number;
        negativi: number;
      }
    > = {};

    for (const row of feedbackArricchiti) {
      const negozioId = row.negozio_id ?? 0;

      if (!aggregati[negozioId]) {
        aggregati[negozioId] = {
          negozio_id: negozioId,
          negozio_label: getNegozioLabel(row.negozio_id),
          totale_rating: 0,
          totale_feedback: 0,
          negativi: 0,
        };
      }

      aggregati[negozioId].totale_rating += row.rating;
      aggregati[negozioId].totale_feedback += 1;

      if (row.rating <= 3) {
        aggregati[negozioId].negativi += 1;
      }
    }

    const media = Object.values(aggregati)
      .map((row) => ({
        negozio_id: row.negozio_id,
        negozio_label: row.negozio_label,
        media: Number((row.totale_rating / row.totale_feedback).toFixed(2)),
        totale_feedback: row.totale_feedback,
        negativi: row.negativi,
      }))
      .sort((a, b) => b.totale_feedback - a.totale_feedback);

    const negativi = feedbackArricchiti
      .filter((row) => row.rating <= 3)
      .slice(0, 30);

    const ultimi = feedbackArricchiti.slice(0, 30);

    const totaleFeedback = feedbackArricchiti.length;
    const mediaGenerale =
      totaleFeedback > 0
        ? Number(
            (
              feedbackArricchiti.reduce((sum, row) => sum + row.rating, 0) /
              totaleFeedback
            ).toFixed(2),
          )
        : 0;

    const totaleNegativi = feedbackArricchiti.filter((row) => row.rating <= 3).length;
    const richiesteRicontatto = feedbackArricchiti.filter(
      (row) => row.ricontatto === true,
    ).length;

    return NextResponse.json({
      ok: true,
      summary: {
        totale_feedback: totaleFeedback,
        media_generale: mediaGenerale,
        totale_negativi: totaleNegativi,
        richieste_ricontatto: richiesteRicontatto,
      },
      media,
      negativi,
      ultimi,
    });
  } catch (error) {
    console.error("Errore stats feedback:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "internal_error",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
