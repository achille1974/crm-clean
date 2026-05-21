export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

function isValidPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const clienteIdRaw = body.cliente_id ? Number(body.cliente_id) : null;
    const rating = Number(body.rating);
    const commento = String(body.commento || "").trim();
    const ricontatto = Boolean(body.ricontatto);

    if (!isValidPositiveInteger(clienteIdRaw)) {
      return NextResponse.json(
        {
          ok: false,
          error: "cliente_id_mancante",
          message: "Link feedback non valido: cliente non identificato.",
        },
        { status: 400 },
      );
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      return NextResponse.json(
        { ok: false, error: "rating_non_valido" },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: clienteData, error: clienteError } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, negozio_id")
      .eq("id", clienteIdRaw)
      .maybeSingle();

    if (clienteError) {
      throw new Error(`Errore lettura cliente: ${clienteError.message}`);
    }

    const cliente = clienteData as ClienteRow | null;

    if (!cliente) {
      return NextResponse.json(
        {
          ok: false,
          error: "cliente_non_trovato",
          message: "Cliente non trovato per questo link feedback.",
        },
        { status: 404 },
      );
    }

    const { error } = await supabase.from("phonesia_feedback").insert({
      cliente_id: cliente.id,
      negozio_id: cliente.negozio_id,
      rating,
      commento: commento || null,
      ricontatto,
    });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({
      ok: true,
      cliente_id: cliente.id,
      negozio_id: cliente.negozio_id,
    });
  } catch (error) {
    console.error("Errore API feedback:", error);

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
