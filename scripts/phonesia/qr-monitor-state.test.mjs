import assert from "node:assert/strict";
import test from "node:test";
import stateModule from "../lib/qr-monitor-state.js";
const { checkQrMonitorState } = stateModule;
test("existing health monitor reports QR failures, missing checks and stale monitoring", () => {
  const now = Date.now();
  const run = (state) => {
    const log = { checks: {}, alerts: [] };
    checkQrMonitorState(log, { now, readFile: () => JSON.stringify(state) });
    return log;
  };
  assert.equal(run({ ok: true, checked_at: new Date(now).toISOString() }).alerts.length, 0);
  assert.equal(run({ ok: false, checked_at: new Date(now).toISOString(), checks: [{ name: "origin", ok: false }] }).alerts[0].code, "QR_REGISTRATION_FAILED");
  assert.equal(run({ ok: true, checked_at: new Date(now - 16 * 60_000).toISOString() }).alerts[0].code, "QR_MONITOR_STALE");
  const log = { checks: {}, alerts: [] };
  checkQrMonitorState(log, { readFile: () => { throw new Error("missing"); } });
  assert.equal(log.alerts[0].code, "QR_MONITOR_UNAVAILABLE");
});
