import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  authorizeBatchWorker,
  HISTORICAL_CAMPAIGN_ID,
  selectDispatchableCampaign,
  type DispatchableCampaign,
} from "@/lib/phonesia/batch-worker-auth";

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
  const authorizationHeader = request.headers.get("authorization");
  const authorization = authorizeBatchWorker(authorizationHeader, process.env);
  if (!authorization.ok) {
    return NextResponse.json(
      { ok: false, error: authorization.error },
      { status: authorization.status },
    );
  }

  const supabase = adminClient();
  const { data, error } = await supabase
    .from("phonesia_whatsapp_campaign_progress")
    .select("id,historical,state,pending")
    .in("state", ["ready", "processing"])
    .eq("historical", false)
    .eq("snapshot_complete", true)
    .neq("id", HISTORICAL_CAMPAIGN_ID)
    .gt("pending", 0)
    .order("id", { ascending: true })
    .limit(20);
  if (error) {
    return NextResponse.json(
      { ok: false, error: "dispatcher_query_failed", message: error.message },
      { status: 500 },
    );
  }

  const campaign = selectDispatchableCampaign(
    (data ?? []) as DispatchableCampaign[],
  );
  if (!campaign) {
    return NextResponse.json({ ok: true, dispatched: false, reason: "no_pending_campaigns" });
  }

  const workerUrl = new URL(
    `/api/phonesia/opportunita/campaigns/${campaign.id}/worker`,
    request.url,
  );
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: { authorization: authorizationHeader! },
    cache: "no-store",
    signal: AbortSignal.timeout(52_000),
  });
  const text = await response.text();
  let workerResult: unknown = null;
  try {
    workerResult = JSON.parse(text);
  } catch {
    workerResult = { ok: false, error: "worker_non_json", detail: text.slice(0, 300) };
  }
  return NextResponse.json(
    { ok: response.ok, dispatched: true, campaignId: campaign.id, worker: workerResult },
    { status: response.ok ? 200 : 502 },
  );
}
