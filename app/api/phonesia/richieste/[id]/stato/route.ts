import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
params: Promise<{ id: string }>;
};

type ConversationRow = {
  id: number | string;
  metadata: Record<string, unknown> | null;
};

const ALLOWED_STATUSES = new Set([
  "da_gestire",
  "in_lavorazione",
  "ricontattato",
  "chiusa",
  "non_interessato",
]);

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeStatus(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function resolveParams(context: RouteContext) {
  return await context.params;
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await resolveParams(context);
    const richiestaId = Number(id);

    if (!Number.isFinite(richiestaId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_request_id" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      stato_operativo?: unknown;
    };

    const nextStatus = normalizeStatus(body.stato_operativo);

    if (!ALLOWED_STATUSES.has(nextStatus)) {
      return NextResponse.json(
        {
          ok: false,
          error: "invalid_status",
          allowed_statuses: Array.from(ALLOWED_STATUSES),
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: currentData, error: currentError } = await supabase
      .from("phonesia_conversazioni")
      .select("id, metadata")
      .eq("id", richiestaId)
      .maybeSingle();

    if (currentError) {
      throw currentError;
    }

    const row = (currentData as ConversationRow | null) ?? null;

    if (!row) {
      return NextResponse.json(
        { ok: false, error: "request_not_found" },
        { status: 404 },
      );
    }

    const currentMetadata = row.metadata ?? {};
    const currentOperationalRaw = currentMetadata.agent_operational;
    const currentOperational = isRecord(currentOperationalRaw)
      ? currentOperationalRaw
      : {};

    const previousStatus =
      typeof currentOperational.stato_operativo === "string"
        ? currentOperational.stato_operativo
        : null;

    const now = new Date().toISOString();

    const previousHistory = Array.isArray(currentMetadata.agent_status_history)
      ? currentMetadata.agent_status_history
      : [];

    const nextMetadata = {
      ...currentMetadata,
      agent_operational: {
        ...currentOperational,
        stato_operativo: nextStatus,
      },
      agent_status_history: [
        ...previousHistory,
        {
          previous_status: previousStatus,
          next_status: nextStatus,
          updated_at: now,
          source: "dashboard_richieste",
        },
      ],
      agent_operational_updated_at: now,
    };

    const { data: updatedData, error: updateError } = await supabase
      .from("phonesia_conversazioni")
      .update({
        metadata: nextMetadata,
      })
      .eq("id", richiestaId)
      .select("id, metadata")
      .single();

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      ok: true,
      id: richiestaId,
      previous_status: previousStatus,
      stato_operativo: nextStatus,
      metadata: (updatedData as ConversationRow).metadata,
    });
  } catch (error) {
    console.error("Errore aggiornamento stato richiesta agent:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "update_request_status_failed",
        detail: error instanceof Error ? error.message : "Errore sconosciuto",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return PATCH(request, context);
}
