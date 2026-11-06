const path = require("node:path");

const SSH_PROCESSES = new Set(["sshd", "sshd-session", "sshd-auth"]);
const FAILED_AUTH = /^Failed (password|publickey|keyboard-interactive(?:\/\S+)?|hostbased|gssapi-with-mic|none) for (?:invalid user )?(\S+) from (\S+) port (\d+)(?:\s|$)/i;
const INVALID_USER = /^Invalid user (\S+) from (\S+) port (\d+)(?:\s|$)/i;
const PAM_FAILURE = /^PAM: Authentication (?:failure|error) for (?:illegal user )?(\S+) from (\S+?)(?:\s|$)/i;
const AUTH_LIMIT = /^maximum authentication attempts exceeded for (?:invalid user )?(\S+) from (\S+) port (\d+)(?:\s|$)/i;

function parseSshFailures(output, { since, until }) {
  const rows = JSON.parse(output);
  if (!Array.isArray(rows)) throw new Error("Il log SSH JSON non contiene un elenco di eventi.");
  const events = [];
  const seen = new Set();

  for (const row of rows) {
    if (!row || typeof row !== "object" || typeof row.eventMessage !== "string") {
      throw new Error("Evento nel log SSH incompleto o non valido.");
    }
    const process = path.basename(row.processImagePath || row.process || "");
    if (!SSH_PROCESSES.has(process)) continue;
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time)) throw new Error("Evento SSH privo di data valida.");
    if (time < since || time > until) continue;
    const message = row.eventMessage.replace(/^(?:error|fatal):\s*/i, "").trim();
    let match;
    let event;
    if ((match = message.match(FAILED_AUTH))) {
      event = { kind: "failed_authentication", method: match[1], user: match[2], address: match[3], port: match[4] };
    } else if ((match = message.match(INVALID_USER))) {
      event = { kind: "invalid_user", user: match[1], address: match[2], port: match[3] };
    } else if ((match = message.match(PAM_FAILURE))) {
      event = { kind: "pam_authentication_failure", user: match[1], address: match[2], port: null };
    } else if ((match = message.match(AUTH_LIMIT))) {
      event = { kind: "authentication_limit", user: match[1], address: match[2], port: match[3] };
    } else {
      continue;
    }
    event = { ...event, timestamp: row.timestamp, time, process, pid: row.processID ?? row.processIdentifier ?? null };
    const identity = JSON.stringify([row.timestamp, event.pid, process, message]);
    if (seen.has(identity)) continue;
    seen.add(identity);
    events.push(event);
  }

  // OpenSSH can report Invalid user/PAM/maximum attempts as well as Failed ...
  // for the same connection. Count the individual Failed records, not both.
  const failures = events.filter((event) => event.kind === "failed_authentication");
  const supplemental = new Map();
  for (const event of events.filter((entry) => entry.kind !== "failed_authentication")) {
    const alreadyCounted = failures.some((failure) => failure.address === event.address && (
      (event.port && failure.port === event.port) ||
      (event.pid !== null && failure.pid === event.pid) ||
      (!event.port && failure.user === event.user && Math.abs(failure.time - event.time) <= 5000)
    ));
    if (alreadyCounted) continue;
    const connection = JSON.stringify([event.address, event.port || event.pid || event.timestamp, event.user]);
    if (!supplemental.has(connection)) supplemental.set(connection, event);
  }
  const counted = [...failures, ...supplemental.values()].sort((a, b) => a.time - b.time);
  return {
    failed_count: counted.length,
    matching_log_events: events.length,
    source_addresses: [...new Set(counted.map((event) => event.address))],
    sample_events: counted.slice(0, 20).map(({ time, ...event }) => event),
  };
}

module.exports = { parseSshFailures };
