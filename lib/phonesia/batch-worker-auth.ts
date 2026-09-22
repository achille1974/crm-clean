export type BatchWorkerEnvironment = {
  [key: string]: string | undefined;
  CRON_SECRET?: string;
  PHONESIA_BATCH_WORKER_ENABLED?: string;
};

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function authorizeBatchWorker(
  authorization: string | null,
  environment: BatchWorkerEnvironment,
): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const secret = environment.CRON_SECRET?.trim();
  if (!secret) return { ok: false, status: 503, error: "cron_secret_missing" };
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) {
    return { ok: false, status: 401, error: "cron_unauthorized" };
  }
  if (!constantTimeEqual(authorization.slice(prefix.length), secret)) {
    return { ok: false, status: 401, error: "cron_unauthorized" };
  }
  if (environment.PHONESIA_BATCH_WORKER_ENABLED !== "true") {
    return { ok: false, status: 503, error: "batch_worker_disabled" };
  }
  return { ok: true };
}

export type DispatchableCampaign = {
  id: string;
  historical: boolean;
  state: string;
  pending: number;
};

export const HISTORICAL_CAMPAIGN_ID = "e6964dee-865a-4dbf-95dc-223e0c2fece2";

export function selectDispatchableCampaign(
  campaigns: DispatchableCampaign[],
): DispatchableCampaign | null {
  return (
    campaigns.find(
      (campaign) =>
        campaign.id !== HISTORICAL_CAMPAIGN_ID &&
        !campaign.historical &&
        campaign.pending > 0 &&
        (campaign.state === "ready" || campaign.state === "processing"),
    ) ?? null
  );
}
