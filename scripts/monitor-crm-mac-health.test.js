const assert = require("node:assert/strict");
const { test } = require("node:test");
const { parseSshFailures } = require("./lib/ssh-auth-failures");
const { checkSshFailedAttempts, computeStatus } = require("./monitor-crm-mac-health");

const now = Date.now();
const window = { since: now - 3600000, until: now + 1000 };
function row(message, process = "sshd-session", offset = 0, pid = 100) {
  return { timestamp: new Date(now + offset).toISOString(), processImagePath: `/usr/libexec/${process}`, processID: pid, eventMessage: message };
}
const parse = (rows) => parseSshFailures(JSON.stringify(rows), window);

test("ignores the three noise categories that caused the real alert", () => {
  const rows = [
    ...Array.from({ length: 6 }, (_, i) => row("[com.apple.network.libinfo:si_destination_compare] send failed: Invalid argument", "sshd", -i)),
    ...Array.from({ length: 24 }, (_, i) => row("Failed to find apple.sshd-auth in LaunchServices", i % 2 ? "nehelper" : "neagent", -i)),
    ...Array.from({ length: 2 }, (_, i) => row('log run noninteractively: sshd failed failure invalid user', "log", -i)),
  ];
  assert.equal(parse(rows).failed_count, 0);
});

test("recognizes failures from all three SSH processes and IPv6", () => {
  const result = parse([
    row("Failed password for archimede from 192.0.2.10 port 6000 ssh2", "sshd"),
    row("Failed publickey for archimede from 2001:db8::1 port 6001 ssh2", "sshd-session"),
    row("Failed keyboard-interactive/pam for archimede from 192.0.2.11 port 6002 ssh2", "sshd-auth"),
    row("Accepted publickey for archimede from 192.0.2.12 port 6003 ssh2"),
  ]);
  assert.equal(result.failed_count, 3);
  assert.deepEqual(result.source_addresses, ["192.0.2.10", "2001:db8::1", "192.0.2.11"]);
});

test("counts repeated password failures but not their extra diagnostics", () => {
  const result = parse([
    row("Invalid user test from 192.0.2.10 port 6000", "sshd", -500),
    row("error: PAM: Authentication failure for illegal user test from 192.0.2.10", "sshd-session", -300),
    row("Failed password for invalid user test from 192.0.2.10 port 6000 ssh2", "sshd-session", -200),
    row("Failed password for invalid user test from 192.0.2.10 port 6000 ssh2", "sshd-session", -100),
    row("error: maximum authentication attempts exceeded for invalid user test from 192.0.2.10 port 6000 ssh2 [preauth]"),
  ]);
  assert.equal(result.failed_count, 2);
  assert.equal(result.matching_log_events, 5);
});

test("keeps standalone invalid-user and PAM failures", () => {
  assert.equal(parse([
    row("Invalid user test from 192.0.2.10 port 6000"),
    row("error: PAM: Authentication failure for archimede from 192.0.2.11", "sshd-auth", -100, 101),
  ]).failed_count, 2);
});

test("excludes old and future events and duplicate records", () => {
  const message = "Failed password for test from 192.0.2.10 port 6000 ssh2";
  const current = row(message);
  assert.equal(parse([row(message, "sshd", -3600001), row(message, "sshd", 60000), current, current]).failed_count, 1);
});

test("rejects truncated JSON and invalid timestamps", () => {
  assert.throws(() => parseSshFailures('[{"eventMessage":', window));
  assert.throws(() => parseSshFailures('{}', window));
  assert.throws(() => parse([{ ...row("Failed password for test from 192.0.2.10 port 6000 ssh2"), timestamp: "invalid" }]));
});

test("20 real failures still produce a critical alert", () => {
  const log = { alerts: [] };
  const rows = Array.from({ length: 20 }, (_, i) => row(`Failed password for test from 192.0.2.10 port ${6000 + i} ssh2`, "sshd-session", -1000 - i));
  const result = checkSshFailedAttempts(log, {}, (command, args) => {
    assert.equal(command, "log");
    assert.ok(args.includes("--info"));
    assert.ok(args.includes("json"));
    assert.ok(!args.at(-1).includes("eventMessage"));
    return { ok: true, stdout: JSON.stringify(rows), stderr: "", exit_code: 0 };
  });
  assert.equal(result.failed_count_last_hour, 20);
  assert.equal(computeStatus(log), "critical");
  assert.equal(log.alerts[0].code, "ssh_failed_attempts_high");
});

test("unavailable or malformed logs produce warning rather than a healthy zero", () => {
  for (const commandResult of [
    { ok: false, stdout: "", stderr: "Cannot run while sandboxed", exit_code: 64 },
    { ok: true, stdout: "[truncated", stderr: "", exit_code: 0 },
  ]) {
    const log = { alerts: [] };
    const result = checkSshFailedAttempts(log, {}, () => commandResult);
    assert.equal(result.ok, false);
    assert.equal(result.failed_count_last_hour, null);
    assert.equal(computeStatus(log), "warning");
  }
});
