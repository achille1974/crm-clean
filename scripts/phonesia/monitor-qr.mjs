import fs from "node:fs";
import path from "node:path";
// Silenzia solo l'avviso MODULE_TYPELESS_PACKAGE_JSON (import di .ts da .mjs), ripetuto
// a ogni ciclo nel log launchd. Gli altri avvisi restano visibili.
const originalEmitWarning = process.emitWarning.bind(process);
process.emitWarning = (warning, ...args) => {
  const code = typeof args[0] === "object" ? args[0]?.code : args[1];
  if (code === "MODULE_TYPELESS_PACKAGE_JSON" || String(warning).includes("MODULE_TYPELESS_PACKAGE_JSON")) return;
  return originalEmitWarning(warning, ...args);
};
const { probeQr } = await import("./qr-health.mjs");
const output = process.env.PHONESIA_QR_MONITOR_DIR || "/Users/archimede/phonesia-diagnostics/qr-monitor";
fs.mkdirSync(output, { recursive: true, mode: 0o700 });
const report = await probeQr();
const file = path.join(output, "latest.json");
const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
report.last_success_at = report.ok ? report.checked_at : previous?.last_success_at || null;
report.first_failure_at = report.ok ? null : previous?.first_failure_at || report.checked_at;
report.consecutive_failures = report.ok ? 0 : (previous?.consecutive_failures || 0) + 1;
fs.writeFileSync(`${file}.tmp`, JSON.stringify(report, null, 2), { mode: 0o600 });
fs.renameSync(`${file}.tmp`, file);
const history = path.join(output, `qr-health-${report.checked_at.slice(0, 10)}.jsonl`);
fs.appendFileSync(history, `${JSON.stringify(report)}\n`, { mode: 0o600 });
for (const name of fs.readdirSync(output)) {
  if (/^qr-health-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)
    && fs.statSync(path.join(output, name)).mtimeMs < Date.now() - 7 * 86400_000) fs.unlinkSync(path.join(output, name));
}
// This job only writes diagnostics. The existing CRM/Mac monitor reads this state for its alerts.
console.log(JSON.stringify({ checked_at: report.checked_at, ok: report.ok, checks: report.checks.length,
  failures: report.checks.filter((item) => !item.ok).map((item) => item.name) }));
if (!report.ok) process.exitCode = 1;
