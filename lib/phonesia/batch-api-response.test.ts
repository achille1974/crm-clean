import assert from "node:assert/strict";
import test from "node:test";

import { batchNetworkFailure, readBatchApiResponse } from "./batch-api-response.ts";

function response(body: string | null, status: number, contentType?: string) {
  return new Response(body, {
    status,
    headers: contentType ? { "content-type": contentType } : undefined,
  });
}

test("keeps valid JSON success and partial results", async () => {
  const result = await readBatchApiResponse(
    response('{"ok":true,"sentCount":3,"failedCount":1}', 200, "application/json"),
    { isSend: true },
  );
  assert.deepEqual(result, { ok: true, sentCount: 3, failedCount: 1 });
});

test("classifies HTML login responses", async () => {
  const result = await readBatchApiResponse(
    response("<html>login</html>", 401, "text/html"),
    { isSend: true },
  );
  assert.equal(result.error, "sessione_scaduta");
  assert.equal(result.outcomeUnconfirmed, true);
});

test("classifies 403, 500 and 504 without JSON parsing errors", async () => {
  const forbidden = await readBatchApiResponse(response("", 403), { isSend: true });
  const serverError = await readBatchApiResponse(response("upstream failed", 500), {
    isSend: true,
  });
  const timeout = await readBatchApiResponse(response("", 504), { isSend: true });

  assert.equal(forbidden.error, "sessione_scaduta");
  assert.equal(serverError.error, "errore_http_batch");
  assert.equal(timeout.error, "timeout_batch");
});

test("classifies empty and HTML 200 responses as invalid", async () => {
  const empty = await readBatchApiResponse(response("", 200), { isSend: true });
  const html = await readBatchApiResponse(
    response("<html>unexpected</html>", 200, "text/html"),
    { isSend: true },
  );

  assert.equal(empty.error, "risposta_batch_non_valida");
  assert.equal(html.error, "risposta_batch_non_valida");
  assert.match(String(empty.detail ?? ""), /Esito batch non confermato/);
});

test("classifies an aborted request as timeout with unconfirmed outcome", () => {
  const result = batchNetworkFailure(new DOMException("timed out", "TimeoutError"));

  assert.equal(result.error, "timeout_batch");
  assert.equal(result.outcomeUnconfirmed, true);
  assert.match(String(result.detail ?? ""), /Esito batch non confermato/);
});
