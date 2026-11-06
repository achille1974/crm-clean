import { NextRequest, NextResponse } from "next/server";
import { authorizePhonesiaAdminApi } from "@/lib/phonesia/api-auth";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
params: Promise<{ id: string }>;
};

type AgentTaskRow = {
  id: number | string;
  conversation_id: number | string | null;
  status: string;
  metadata: Record<string, unknown> | null;
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
  "informativo",
  "annullata",
]);

const CLOSED_STATUSES = new Set([
  "ricontattato",
  "chiusa",
  "non_interessato",
  "annullata",
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

function updateConversationMetadataStatus(
  metadata: Record<string, unknown> | null,
  nextStatus: string,
) {
  const currentMetadata = metadata ?? {};
  const currentOperationalRaw = currentMetadata.agent_operational;
  const currentOperational = isRecord(currentOperationalRaw)
    ? currentOperationalRaw
    : {};

  const previousStatus =
    typeof currentOperational.stato_operativo === "string"
      ? currentOperational.stato_operativo
      : null;

  const previousHistory = Array.isArray(currentMetadata.agent_status_history)
    ? currentMetadata.agent_status_history
    : [];

  const now = new Date().toISOString();

  return {
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
        source: "dashboard_agent_tasks",
      },
    ],
    agent_operational_updated_at: now,
  };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const auth = await authorizePhonesiaAdminApi();
  if (!auth.ok) return auth.response;
  try {
    const { id } = await resolveParams(context);
    const taskId = Number(id);

    if (!Number.isFinite(taskId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_task_id" },
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      status?: unknown;
      stato_operativo?: unknown;
    };

    const nextStatus = normalizeStatus(body.status ?? body.stato_operativo);

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

    const { data: taskData, error: taskError } = await supabase
      .from("phonesia_agent_tasks")
      .select("id, conversation_id, status, metadata")
      .eq("id", taskId)
      .maybeSingle();

    if (taskError) {
      throw taskError;
    }

    const task = (taskData as AgentTaskRow | null) ?? null;

    if (!task) {
      return NextResponse.json(
        { ok: false, error: "task_not_found" },
        { status: 404 },
      );
    }

    const now = new Date().toISOString();
    const closedAt = CLOSED_STATUSES.has(nextStatus) ? now : null;

    const { error: updateTaskError } = await supabase
      .from("phonesia_agent_tasks")
      .update({
        status: nextStatus,
        closed_at: closedAt,
      })
      .eq("id", taskId);

    if (updateTaskError) {
      throw updateTaskError;
    }

    if (task.conversation_id) {
      const { data: conversationData, error: conversationError } = await supabase
        .from("phonesia_conversazioni")
        .select("id, metadata")
        .eq("id", task.conversation_id)
        .maybeSingle();

      if (conversationError) {
        throw conversationError;
      }

      const conversation = (conversationData as ConversationRow | null) ?? null;

      if (conversation) {
        const nextMetadata = updateConversationMetadataStatus(
          conversation.metadata,
          nextStatus,
        );

        const { error: updateConversationError } = await supabase
          .from("phonesia_conversazioni")
          .update({
            metadata: nextMetadata,
          })
          .eq("id", conversation.id);

        if (updateConversationError) {
          throw updateConversationError;
        }
      }
    }

    return NextResponse.json({
      ok: true,
      id: taskId,
      previous_status: task.status,
      status: nextStatus,
      closed_at: closedAt,
    });
  } catch (error) {
    console.error("Errore aggiornamento stato task agent:", error);

    return NextResponse.json(
      {
        ok: false,
        error: "update_agent_task_status_failed",
        detail: error instanceof Error ? error.message : "Errore sconosciuto",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  return PATCH(request, context);
}
