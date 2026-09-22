import { selectDispatchableCampaign, type DispatchableCampaign } from "./batch-worker-auth.ts";

// Cron reaches the deployment URL, which is protected by Vercel SSO. The
// public CRM domain reaches the same production deployment and its API auth.
export const BATCH_WORKER_ORIGIN = "https://app.crm-supreme.it";

export type DispatchEvent = {
  runId: string;
  event: string;
  workerEnabled: boolean;
  campaignsFound?: number;
  campaignId?: string;
  reason?: string;
  httpStatus?: number;
  error?: string;
};

export async function executeBatchDispatch(options: {
  runId: string;
  campaigns: DispatchableCampaign[];
  authorizationHeader: string;
  fetchWorker: (url: URL, init: RequestInit) => Promise<Response>;
  emit: (event: DispatchEvent) => void;
}): Promise<{ status: number; body: Record<string, unknown> }> {
  const { runId, campaigns, authorizationHeader, fetchWorker, emit } = options;
  emit({ runId, event: "selection", workerEnabled: true, campaignsFound: campaigns.length });
  const campaign = selectDispatchableCampaign(campaigns);
  if (!campaign) {
    emit({ runId, event: "excluded", workerEnabled: true, reason: "no_ready_complete_nonhistorical_pending_campaign" });
    return { status: 200, body: { ok: true, dispatched: false, reason: "no_pending_campaigns" } };
  }

  const workerUrl = new URL(
    `/api/phonesia/opportunita/campaigns/${campaign.id}/worker`,
    BATCH_WORKER_ORIGIN,
  );
  emit({ runId, event: "worker_started", workerEnabled: true, campaignId: campaign.id });
  const response = await fetchWorker(workerUrl, {
    method: "POST",
    headers: { authorization: authorizationHeader },
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(52_000),
  });
  const raw = await response.text();
  let workerResult: Record<string, unknown>;
  try {
    workerResult = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    workerResult = { ok: false, error: "worker_non_json" };
  }
  const succeeded = response.ok && workerResult.ok === true;
  emit({
    runId,
    event: succeeded ? "worker_completed" : "worker_failed",
    workerEnabled: true,
    campaignId: campaign.id,
    httpStatus: response.status,
    ...(!succeeded ? { error: String(workerResult.error ?? "worker_response_failed") } : {}),
  });
  return {
    status: succeeded ? 200 : 502,
    body: { ok: succeeded, dispatched: true, campaignId: campaign.id, worker: workerResult },
  };
}
