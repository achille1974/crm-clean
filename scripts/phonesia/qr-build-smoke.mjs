import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { request as httpRequest } from "node:http";
import assert from "node:assert/strict";
import { probeQr } from "./qr-health.mjs";

const portProbe = createServer().listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const base = `http://127.0.0.1:${port}`;
// Node fetch may normalize Host to the connection target. Exercise the real host
// routing with HTTP, not a mocked redirect helper.
function localRequest(url, options) {
  return new Promise((resolve, reject) => {
    const req = httpRequest(url, { method: options.method, headers: options.headers, signal: options.signal }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers: res.headers })));
    });
    req.on("error", reject);
    req.end(options.body);
  });
}
// No production credentials in the smoke-test server. Valid registrations could never reach a real DB.
const server = spawn(process.execPath, ["./node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, NODE_ENV: "production", VERCEL: "1", NEXT_PUBLIC_BASE_URL: "https://app.crm-supreme.it",
    NEXT_PUBLIC_SUPABASE_URL: "https://database.example.invalid", NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
    SUPABASE_SERVICE_ROLE_KEY: "test-only-never-a-real-key" }, stdio: "ignore",
});
try {
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (server.exitCode !== null) throw new Error("Compiled server exited before smoke tests");
    try { ready = (await fetch(`${base}/phonesia/qr?negozio=1`, { signal: AbortSignal.timeout(1000) })).status === 200; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.ok(ready, "compiled QR page is available");
  const report = await probeQr({ localBase: base, allStores: true, transport: localRequest, checkReadiness: false });
  for (const check of report.checks) assert.ok(check.ok, JSON.stringify(check));
  console.log(`QR compiled HTTP checks: ${report.checks.length} passed. No customer writes or messages.`);
} finally {
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
  if (server.exitCode === null) await once(server, "exit");
  clearTimeout(timeout);
}
