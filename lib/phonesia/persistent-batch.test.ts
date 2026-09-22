import assert from "node:assert/strict";
import test from "node:test";

import {
  processPersistentBatchBlock,
  reduceDeliveryEvents,
  type ClaimedRecipient,
  type PersistentBatchRepository,
  type SendState,
} from "./persistent-batch.ts";
import {
  authorizeBatchWorker,
  selectDispatchableCampaign,
} from "./batch-worker-auth.ts";

type Row = ClaimedRecipient & { state: SendState; eligible: boolean; attemptStarted: boolean };

class MemoryRepository implements PersistentBatchRepository {
  rows: Row[];
  finalized = new Map<string, unknown>();

  constructor(count: number) {
    this.rows = Array.from({ length: count }, (_, index) => ({
      id: `r-${index}`,
      campaignId: "campaign",
      clienteId: index + 1,
      normalizedPhone: `3934000${String(index).padStart(4, "0")}`,
      leaseToken: "",
      state: "pending" as const,
      eligible: true,
      attemptStarted: false,
    }));
  }

  async claim(campaignId: string, limit: number, leaseSeconds?: number) {
    void leaseSeconds;
    const claimed = this.rows
      .filter((row) => row.campaignId === campaignId && row.state === "pending" && !row.leaseToken)
      .slice(0, limit);
    for (const row of claimed) {
      row.leaseToken = `lease-${row.id}`;
    }
    return claimed.map((row) => ({ ...row }));
  }

  async startAttempt(recipient: ClaimedRecipient) {
    const row = this.rows.find((item) => item.id === recipient.id)!;
    assert.equal(row.state, "pending");
    assert.equal(row.leaseToken, recipient.leaseToken);
    row.state = "processing";
    row.attemptStarted = true;
  }

  async release(recipient: ClaimedRecipient) {
    const row = this.rows.find((item) => item.id === recipient.id)!;
    assert.equal(row.state, "pending");
    assert.equal(row.attemptStarted, false);
    row.leaseToken = "";
  }

  async skip(recipient: ClaimedRecipient, message: string) {
    const row = this.rows.find((item) => item.id === recipient.id)!;
    assert.equal(row.state, "pending");
    assert.equal(row.attemptStarted, false);
    row.state = "skipped";
    row.leaseToken = "";
    this.finalized.set(row.id, { state: "skipped", message });
  }

  async recheckEligibility(recipient: ClaimedRecipient) {
    const row = this.rows.find((item) => item.id === recipient.id)!;
    return row.eligible ? ({ eligible: true } as const) : ({ eligible: false, reason: "consenso mancante" } as const);
  }

  async finish(recipient: ClaimedRecipient, result: Parameters<PersistentBatchRepository["finish"]>[1]) {
    const row = this.rows.find((item) => item.id === recipient.id)!;
    assert.equal(row.state, "processing");
    assert.equal(row.leaseToken, recipient.leaseToken);
    row.state = result.state;
    this.finalized.set(row.id, result);
  }
}

test("processes 497 recipients in persistent small blocks without loss", async () => {
  const repository = new MemoryRepository(497);
  let accepted = 0;
  do {
    const result = await processPersistentBatchBlock({
      campaignId: "campaign",
      repository,
      blockSize: 25,
      sendToMeta: async (recipient) => ({
        kind: "accepted",
        whatsappMessageId: `wamid.${recipient.id}`,
        httpStatus: 200,
      }),
    });
    accepted += result.accepted;
  } while (repository.rows.some((row) => row.state === "pending"));
  assert.equal(accepted, 497);
  assert.equal(new Set(repository.rows.map((row) => row.id)).size, 497);
});

test("double confirmation and concurrent workers do not claim a recipient twice", async () => {
  const campaigns = new Map<string, string>();
  const create = (key: string) => campaigns.get(key) ?? (campaigns.set(key, "campaign"), "campaign");
  assert.equal(create("click-key"), create("click-key"));
  assert.equal(campaigns.size, 1);

  const repository = new MemoryRepository(50);
  const [first, second] = await Promise.all([
    repository.claim("campaign", 25, 45),
    repository.claim("campaign", 25, 45),
  ]);
  assert.equal(new Set([...first, ...second].map((row) => row.id)).size, 50);
});

test("timeout and crash after Meta acceptance never return to pending", async () => {
  const repository = new MemoryRepository(2);
  const result = await processPersistentBatchBlock({
    campaignId: "campaign",
    repository,
    blockSize: 2,
    callTimeoutMs: 5,
    sendToMeta: async () => new Promise(() => undefined),
  });
  assert.equal(result.uncertain, 2);
  assert.deepEqual(repository.rows.map((row) => row.state), ["uncertain", "uncertain"]);

  const crashRepository = new MemoryRepository(1);
  crashRepository.finish = async () => {
    throw new Error("database unavailable after Meta acceptance");
  };
  await assert.rejects(() =>
    processPersistentBatchBlock({
      campaignId: "campaign",
      repository: crashRepository,
      sendToMeta: async () => ({ kind: "accepted", whatsappMessageId: "wamid.crash", httpStatus: 200 }),
    }),
  );
  assert.equal(crashRepository.rows[0].state, "processing");
  crashRepository.rows[0].state = "uncertain";
  assert.notEqual(crashRepository.rows[0].state, "pending");
});

test("duplicate and out-of-order callbacks reduce deterministically", () => {
  assert.equal(reduceDeliveryEvents(["delivered", "sent", "delivered", "read"]), "read");
  assert.equal(reduceDeliveryEvents(["failed", "sent", "failed"]), "failed");
  assert.equal(reduceDeliveryEvents(["failed", "delivered"]), "delivered");
});

test("next-day resume claims only pending, never accepted or uncertain", async () => {
  const repository = new MemoryRepository(3);
  repository.rows[0].state = "accepted";
  repository.rows[1].state = "uncertain";
  const claimed = await repository.claim("campaign", 25, 45);
  assert.deepEqual(claimed.map((row) => row.id), ["r-2"]);
});

test("failed persistence and failed eligibility never call Meta", async () => {
  let metaCalls = 0;
  const unavailable = new MemoryRepository(1);
  unavailable.claim = async () => {
    throw new Error("snapshot/claim unavailable");
  };
  await assert.rejects(() =>
    processPersistentBatchBlock({
      campaignId: "campaign",
      repository: unavailable,
      sendToMeta: async () => {
        metaCalls += 1;
        return { kind: "accepted", whatsappMessageId: "never", httpStatus: 200 };
      },
    }),
  );

  const ineligible = new MemoryRepository(1);
  ineligible.rows[0].eligible = false;
  const result = await processPersistentBatchBlock({
    campaignId: "campaign",
    repository: ineligible,
    sendToMeta: async () => {
      metaCalls += 1;
      return { kind: "accepted", whatsappMessageId: "never", httpStatus: 200 };
    },
  });
  assert.equal(result.skipped, 1);
  assert.equal(metaCalls, 0);
});

test("missing or wrong secret and disabled switch block the worker", () => {
  assert.deepEqual(authorizeBatchWorker(null, {}), {
    ok: false,
    status: 503,
    error: "cron_secret_missing",
  });
  assert.deepEqual(
    authorizeBatchWorker(null, {
      PHONESIA_BATCH_WORKER_ENABLED: "false",
      CRON_SECRET: "right",
    }),
    { ok: false, status: 401, error: "cron_unauthorized" },
  );
  assert.deepEqual(
    authorizeBatchWorker("Bearer right", {
      PHONESIA_BATCH_WORKER_ENABLED: "false",
      CRON_SECRET: "right",
    }),
    { ok: false, status: 503, error: "batch_worker_disabled" },
  );
  assert.equal(
    authorizeBatchWorker("Bearer any", { PHONESIA_BATCH_WORKER_ENABLED: "true" }).ok,
    false,
  );
  assert.equal(
    authorizeBatchWorker("Bearer wrong", {
      PHONESIA_BATCH_WORKER_ENABLED: "true",
      CRON_SECRET: "right",
    }).ok,
    false,
  );
  assert.equal(
    authorizeBatchWorker("Bearer right", {
      PHONESIA_BATCH_WORKER_ENABLED: "true",
      CRON_SECRET: "right",
    }).ok,
    true,
  );
});

test("stops before claiming another recipient when the safe budget is insufficient", async () => {
  const repository = new MemoryRepository(2);
  const times = [0, 0, 0, 30_000];
  const result = await processPersistentBatchBlock({
    campaignId: "campaign",
    repository,
    blockSize: 10,
    callTimeoutMs: 16_000,
    saveMarginMs: 5_000,
    budgetMs: 45_000,
    now: () => times.shift() ?? 30_000,
    sendToMeta: async (recipient) => ({
      kind: "accepted",
      whatsappMessageId: `wamid.${recipient.id}`,
      httpStatus: 200,
    }),
  });
  assert.equal(result.accepted, 1);
  assert.equal(repository.rows[1].state, "pending");
  assert.equal(repository.rows[1].attemptStarted, false);
  assert.equal(result.needsContinuation, true);
});

test("simulated dispatcher resume continues pending work and excludes historical campaigns", async () => {
  const selected = selectDispatchableCampaign([
    { id: "historical", historical: true, state: "needs_review", pending: 211 },
    { id: "active", historical: false, state: "ready", pending: 2 },
  ]);
  assert.equal(selected?.id, "active");
  assert.equal(
    selectDispatchableCampaign([
      { id: "e6964dee-865a-4dbf-95dc-223e0c2fece2", historical: false, state: "ready", pending: 211 },
    ]),
    null,
  );

  const repository = new MemoryRepository(2);
  for (let invocation = 0; invocation < 2; invocation += 1) {
    await processPersistentBatchBlock({
      campaignId: "campaign",
      repository,
      blockSize: 1,
      sendToMeta: async (recipient) => ({
        kind: "accepted",
        whatsappMessageId: `wamid.${recipient.id}`,
        httpStatus: 200,
      }),
    });
  }
  assert.deepEqual(repository.rows.map((row) => row.state), ["accepted", "accepted"]);
});
