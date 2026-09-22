export type SendState =
  | "pending"
  | "processing"
  | "accepted"
  | "rejected"
  | "skipped"
  | "uncertain";

export type DeliveryState = "sent" | "delivered" | "read" | "failed";

export type ClaimedRecipient = {
  id: string;
  campaignId: string;
  clienteId: number;
  normalizedPhone: string;
  leaseToken: string;
};

export type EligibilityResult =
  | { eligible: true }
  | { eligible: false; reason: string };

export type MetaSendResult =
  | { kind: "accepted"; whatsappMessageId: string; httpStatus: number }
  | { kind: "rejected"; httpStatus: number; code?: string; message: string };

export interface PersistentBatchRepository {
  claim(campaignId: string, limit: number, leaseSeconds: number): Promise<ClaimedRecipient[]>;
  startAttempt(recipient: ClaimedRecipient): Promise<void>;
  release(recipient: ClaimedRecipient): Promise<void>;
  skip(recipient: ClaimedRecipient, message: string): Promise<void>;
  recheckEligibility(recipient: ClaimedRecipient): Promise<EligibilityResult>;
  finish(
    recipient: ClaimedRecipient,
    result:
      | { state: "accepted"; whatsappMessageId: string; httpStatus: number }
      | { state: "rejected"; httpStatus: number; code?: string; message: string }
      | { state: "skipped"; message: string }
      | { state: "uncertain"; message: string },
  ): Promise<void>;
}

export type WorkerBlockResult = {
  claimed: number;
  accepted: number;
  rejected: number;
  skipped: number;
  uncertain: number;
  needsContinuation: boolean;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new DOMException("Meta timeout", "TimeoutError")), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export async function processPersistentBatchBlock(params: {
  campaignId: string;
  repository: PersistentBatchRepository;
  sendToMeta: (recipient: ClaimedRecipient) => Promise<MetaSendResult>;
  blockSize?: number;
  leaseSeconds?: number;
  callTimeoutMs?: number;
  budgetMs?: number;
  saveMarginMs?: number;
  now?: () => number;
}): Promise<WorkerBlockResult> {
  const blockSize = params.blockSize ?? 25;
  const leaseSeconds = params.leaseSeconds ?? 45;
  const callTimeoutMs = params.callTimeoutMs ?? 20_000;
  const budgetMs = params.budgetMs ?? 40_000;
  const saveMarginMs = params.saveMarginMs ?? 5_000;
  const now = params.now ?? Date.now;
  const startedAt = now();
  const summary: WorkerBlockResult = {
    claimed: 0,
    accepted: 0,
    rejected: 0,
    skipped: 0,
    uncertain: 0,
    needsContinuation: false,
  };

  while (summary.claimed < blockSize) {
    const remainingMs = budgetMs - (now() - startedAt);
    if (remainingMs < callTimeoutMs + saveMarginMs) {
      summary.needsContinuation = true;
      break;
    }
    const [recipient] = await params.repository.claim(params.campaignId, 1, leaseSeconds);
    if (!recipient) break;
    summary.claimed += 1;

    const eligibility = await params.repository.recheckEligibility(recipient);
    if (!eligibility.eligible) {
      await params.repository.skip(recipient, eligibility.reason);
      summary.skipped += 1;
      continue;
    }

    const beforeSendRemainingMs = budgetMs - (now() - startedAt);
    if (beforeSendRemainingMs < callTimeoutMs + saveMarginMs) {
      await params.repository.release(recipient);
      summary.claimed -= 1;
      summary.needsContinuation = true;
      break;
    }

    await params.repository.startAttempt(recipient);

    try {
      const result = await withTimeout(params.sendToMeta(recipient), callTimeoutMs);
      if (result.kind === "accepted") {
        await params.repository.finish(recipient, {
          state: "accepted",
          whatsappMessageId: result.whatsappMessageId,
          httpStatus: result.httpStatus,
        });
        summary.accepted += 1;
      } else {
        await params.repository.finish(recipient, {
          state: "rejected",
          httpStatus: result.httpStatus,
          code: result.code,
          message: result.message,
        });
        summary.rejected += 1;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Esito chiamata Meta non confermato.";
      await params.repository.finish(recipient, { state: "uncertain", message });
      summary.uncertain += 1;
    }
  }

  if (summary.claimed === blockSize) summary.needsContinuation = true;

  return summary;
}

export function reduceDeliveryEvents(events: DeliveryState[]): DeliveryState | null {
  if (events.includes("read")) return "read";
  if (events.includes("delivered")) return "delivered";
  if (events.includes("failed")) return "failed";
  if (events.includes("sent")) return "sent";
  return null;
}
