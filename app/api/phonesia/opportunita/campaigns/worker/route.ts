import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  authorizeBatchWorker,
  HISTORICAL_CAMPAIGN_ID,
  type DispatchableCampaign,
} from "@/lib/phonesia/batch-worker-auth";
import { executeBatchDispatch, type DispatchEvent } from "@/lib/phonesia/batch-dispatcher";

export const runtime = "nodejs";
export const maxDuration = 60;

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Configurazione Supabase mancante.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: NextRequest) {
  return dispatch(request);
}

export async function POST(request: NextRequest) {
  return dispatch(request);
}

async function dispatch(request: NextRequest) {
  const runId = crypto.randomUUID();
  const emit = (event: DispatchEvent) => console.info("phonesia.batch.dispatch", JSON.stringify(event));
  const authorizationHeader = request.headers.get("authorization");
  const authorization = authorizeBatchWorker(authorizationHeader, process.env);
  if (!authorization.ok) {
    emit({ runId, event: "rejected", workerEnabled: process.env.PHONESIA_BATCH_WORKER_ENABLED === "true", reason: authorization.error });
    return NextResponse.json(
      { ok: false, error: authorization.error },
      { status: authorization.status },
    );
  }

  emit({ runId, event: "started", workerEnabled: true });
  const supabase = adminClient();
  // Recupera campagne già senza lavoro, senza richiamare il worker.
  const { data: finalizedCount, error: finalizationError } = await supabase.rpc(
    "phonesia_finalize_idle_whatsapp_campaigns",
  );
  if (finalizationError) {
    emit({ runId, event: "finalization_failed", workerEnabled: true, error: finalizationError.code ?? "database_error" });
    return NextResponse.json(
      { ok: false, error: "finalization_failed" },
      { status: 500 },
    );
  }
  emit({ runId, event: "finalization_checked", workerEnabled: true, campaignsFound: Number(finalizedCount ?? 0) });
  const { data, error } = await supabase
    .from("phonesia_whatsapp_campaign_progress")
    .select("id,historical,state,pending,snapshot_complete")
    .in("state", ["ready", "processing"])
    .eq("historical", false)
    .eq("snapshot_complete", true)
    .neq("id", HISTORICAL_CAMPAIGN_ID)
    .gt("pending", 0)
    .order("id", { ascending: true })
    .limit(20);
  if (error) {
    emit({ runId, event: "selection_failed", workerEnabled: true, error: error.code ?? "database_error" });
    return NextResponse.json(
      { ok: false, error: "dispatcher_query_failed", message: error.message },
      { status: 500 },
    );
  }

  try {
    const result = await executeBatchDispatch({
      runId,
      campaigns: (data ?? []) as DispatchableCampaign[],
      authorizationHeader: authorizationHeader!,
      fetchWorker: fetch,
      emit,
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (workerError) {
    emit({ runId, event: "worker_failed", workerEnabled: true, error: workerError instanceof Error ? workerError.name : "unknown_error" });
    return NextResponse.json({ ok: false, error: "worker_request_failed" }, { status: 502 });
  }
}
