import assert from "node:assert/strict";
import test from "node:test";

import { BATCH_WORKER_ORIGIN, executeBatchDispatch, type DispatchEvent } from "./batch-dispatcher.ts";

test("ready complete campaign with one pending recipient reaches the awaited worker", async () => {
  const events: DispatchEvent[] = [];
  let calls = 0;
  const result = await executeBatchDispatch({
    runId: "test-run",
    campaigns: [{ id: "test-campaign", historical: false, snapshot_complete: true, state: "ready", pending: 1 }],
    authorizationHeader: "Bearer test-secret",
    emit: (event) => events.push(event),
    fetchWorker: async (url, init) => {
      calls += 1;
      assert.equal(url.origin, BATCH_WORKER_ORIGIN);
      assert.equal(url.pathname, "/api/phonesia/opportunita/campaigns/test-campaign/worker");
      assert.equal(init.method, "POST");
      assert.deepEqual(init.headers, { authorization: "Bearer test-secret" });
      assert.equal(init.redirect, "manual");
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(JSON.stringify({ ok: true, claimed: 1 }), { status: 200 });
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, 200);
  assert.equal(result.body.dispatched, true);
  assert.equal(events.at(-1)?.event, "worker_completed");
});

test("historical and non-pending campaigns never reach the worker", async () => {
  let calls = 0;
  const result = await executeBatchDispatch({
    runId: "test-run",
    campaigns: [
      { id: "e6964dee-865a-4dbf-95dc-223e0c2fece2", historical: true, snapshot_complete: false, state: "needs_review", pending: 0 },
      { id: "accepted", historical: false, snapshot_complete: true, state: "completed", pending: 0 },
    ],
    authorizationHeader: "Bearer test-secret",
    emit: () => undefined,
    fetchWorker: async () => { calls += 1; throw new Error("must not call worker"); },
  });
  assert.equal(calls, 0);
  assert.equal(result.body.dispatched, false);
});

test("deployment protection redirect fails without following it", async () => {
  const result = await executeBatchDispatch({
    runId: "test-run",
    campaigns: [{ id: "test-campaign", historical: false, snapshot_complete: true, state: "ready", pending: 1 }],
    authorizationHeader: "Bearer test-secret",
    emit: () => undefined,
    fetchWorker: async () => new Response("", { status: 302, headers: { location: "https://vercel.com/sso-api" } }),
  });
  assert.equal(result.status, 502);
  assert.equal(result.body.ok, false);
});
