import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { verifyHandoffToken } from "./tokens";

export type HandoffTableName =
  | "phonesia_handoff_richieste"
  | "beltrami_handoff_richieste";

export type MarkHandoffDoneStatus =
  | "done"
  | "already_done"
  | "invalid"
  | "error";

export type MarkHandoffDoneResult = {
  status: MarkHandoffDoneStatus;
};

type HandoffRow = {
  id: number | string;
  status: string | null;
  mark_done_token_hash: string | null;
};

function parseHandoffId(value: string): number | null {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function hasValidToken(token: string, expectedHash: string | null): boolean {
  if (!expectedHash) return false;

  try {
    return verifyHandoffToken({
      token,
      expectedHash,
    });
  } catch {
    return false;
  }
}

export async function markHandoffDone(params: {
  supabase: SupabaseClient;
  tableName: HandoffTableName;
  id: string;
  token: string;
}): Promise<MarkHandoffDoneResult> {
  const id = parseHandoffId(params.id);
  const token = params.token.trim();

  if (!id || !token) {
    return { status: "invalid" };
  }

  try {
    const { data, error } = await params.supabase
      .from(params.tableName)
      .select("id, status, mark_done_token_hash")
      .eq("id", id)
      .maybeSingle();

    if (error) throw error;

    const row = (data as HandoffRow | null) ?? null;
    if (!row || !hasValidToken(token, row.mark_done_token_hash)) {
      return { status: "invalid" };
    }

    if (row.status === "done") {
      return { status: "already_done" };
    }

    const now = new Date().toISOString();
    const { error: updateError } = await params.supabase
      .from(params.tableName)
      .update({
        status: "done",
        marked_done_at: now,
        marked_done_by: "whatsapp_link",
        updated_at: now,
      })
      .eq("id", id)
      .eq("mark_done_token_hash", row.mark_done_token_hash);

    if (updateError) throw updateError;

    return { status: "done" };
  } catch (error) {
    console.error("Errore chiusura handoff da link:", {
      tableName: params.tableName,
      id,
      message: error instanceof Error ? error.message : "errore sconosciuto",
    });

    return { status: "error" };
  }
}

