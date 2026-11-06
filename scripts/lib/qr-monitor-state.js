const fs = require("node:fs");
const QR_MONITOR_STATE = "/Users/archimede/phonesia-diagnostics/qr-monitor/latest.json";

function checkQrMonitorState(log, { readFile = fs.readFileSync, now = Date.now() } = {}) {
  let state;
  try { state = JSON.parse(readFile(QR_MONITOR_STATE, "utf8")); }
  catch {
    log.checks.phonesia_qr = { ok: false, state_path: QR_MONITOR_STATE };
    log.alerts.push({ severity: "critical", code: "QR_MONITOR_UNAVAILABLE", message: "Monitor registrazioni QR non disponibile.", details: { state_path: QR_MONITOR_STATE } });
    return;
  }
  const age = now - Date.parse(state.checked_at);
  const fresh = Number.isFinite(age) && age >= -60_000 && age <= 15 * 60_000;
  log.checks.phonesia_qr = { ...state, fresh, state_path: QR_MONITOR_STATE };
  if (!fresh || state.ok !== true) {
    log.alerts.push({ severity: "critical", code: fresh ? "QR_REGISTRATION_FAILED" : "QR_MONITOR_STALE",
      message: fresh ? "Le registrazioni QR non superano i controlli automatici." : "Il monitor QR non si aggiorna da oltre 15 minuti.",
      details: { checked_at: state.checked_at, failures: (state.checks || []).filter((item) => !item.ok).map((item) => item.name) } });
  }
}
module.exports = { checkQrMonitorState };
