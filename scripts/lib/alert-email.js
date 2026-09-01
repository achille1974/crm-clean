const { spawnSync } = require("child_process");

const PYTHON_BIN = "/usr/bin/python3";

function nowIso() {
  return new Date().toISOString();
}

function serializeError(error) {
  if (!error) return null;
  if (typeof error === "string") return { message: error };

  return {
    name: error.name || "Error",
    message: error.message || String(error),
    code: error.code || null,
    stack: error.stack || null,
  };
}

function clean(value) {
  return String(value || "").trim();
}

function smtpConfig(env, recipient) {
  const host = clean(env.SMTP_HOST) || "smtp.gmail.com";
  const port = Number(clean(env.SMTP_PORT) || 465);
  const username = clean(env.SMTP_USERNAME);
  const password = clean(env.SMTP_PASSWORD);
  const from = clean(env.SMTP_FROM) || username;
  const to = clean(recipient) || clean(env.ALERT_EMAIL_TO);

  return { host, port, username, password, from, to };
}

function smtpMissing(config) {
  const missing = [];

  if (!config.host) missing.push("SMTP_HOST");
  if (!Number.isInteger(config.port) || config.port < 1) missing.push("SMTP_PORT");
  if (!config.username) missing.push("SMTP_USERNAME");
  if (!config.password) missing.push("SMTP_PASSWORD");
  if (!config.from) missing.push("SMTP_FROM");
  if (!config.to) missing.push("PHONESIA_IMPORT_ALERT_EMAIL/ALERT_EMAIL_TO");

  return missing;
}

function sendSmtpEmail({ env, recipient, email }) {
  const config = smtpConfig(env, recipient);
  const missing = smtpMissing(config);

  if (missing.length > 0) {
    return {
      attempted_at: nowIso(),
      configured: false,
      sent: false,
      provider: "smtp",
      skipped_reason: `${missing.join(", ")} mancante`,
      missing_configuration: missing,
      email,
    };
  }

  const script = [
    "import json, smtplib, sys",
    "from email.message import EmailMessage",
    "payload = json.load(sys.stdin)",
    "msg = EmailMessage()",
    "msg['Subject'] = payload['subject']",
    "msg['From'] = payload['from']",
    "msg['To'] = payload['to']",
    "msg.set_content(payload['body'])",
    "with smtplib.SMTP_SSL(payload['host'], int(payload['port']), timeout=20) as server:",
    "    server.login(payload['username'], payload['password'])",
    "    server.send_message(msg)",
    "print(json.dumps({'sent': True}))",
  ].join("\n");

  const startedAt = nowIso();
  const result = spawnSync(PYTHON_BIN, ["-c", script], {
    input: JSON.stringify({
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      from: config.from,
      to: config.to,
      subject: email.subject,
      body: email.body,
    }),
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 1024 * 1024,
  });

  if (result.status !== 0 || result.error) {
    return {
      attempted_at: startedAt,
      configured: true,
      sent: false,
      provider: "smtp",
      recipient: config.to,
      from: config.from,
      smtp_host: config.host,
      exit_code: result.status,
      signal: result.signal || null,
      error: result.error ? serializeError(result.error) : null,
      stderr: clean(result.stderr) || null,
      email,
    };
  }

  return {
    attempted_at: startedAt,
    configured: true,
    sent: true,
    provider: "smtp",
    recipient: config.to,
    from: config.from,
    smtp_host: config.host,
    email,
  };
}

async function sendResendEmail({ env, recipient, email }) {
  const apiKey = clean(env.RESEND_API_KEY);
  const from = clean(env.PHONESIA_IMPORT_ALERT_FROM);
  const missing = [];

  if (!recipient) missing.push("PHONESIA_IMPORT_ALERT_EMAIL");
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("PHONESIA_IMPORT_ALERT_FROM");

  if (missing.length > 0) {
    return {
      attempted_at: nowIso(),
      configured: false,
      sent: false,
      provider: "resend",
      skipped_reason: `${missing.join(", ")} mancante`,
      missing_configuration: missing,
      email,
    };
  }

  try {
    const { Resend } = await import("resend");
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from,
      to: recipient,
      subject: email.subject,
      text: email.body,
    });

    if (error) {
      return {
        attempted_at: nowIso(),
        configured: true,
        sent: false,
        provider: "resend",
        recipient,
        from,
        error: serializeError(error),
        email,
      };
    }

    return {
      attempted_at: nowIso(),
      configured: true,
      sent: true,
      provider: "resend",
      recipient,
      from,
      resend_email_id: data && data.id ? data.id : null,
      email,
    };
  } catch (error) {
    return {
      attempted_at: nowIso(),
      configured: true,
      sent: false,
      provider: "resend",
      recipient,
      from,
      error: serializeError(error),
      email,
    };
  }
}

async function sendAlertEmail({ env, email }) {
  const recipient = clean(env.PHONESIA_IMPORT_ALERT_EMAIL) || clean(env.ALERT_EMAIL_TO);
  const resendResult = await sendResendEmail({ env, recipient, email });

  if (resendResult.sent) return resendResult;

  const smtpResult = sendSmtpEmail({ env, recipient, email });

  if (smtpResult.sent) {
    return {
      ...smtpResult,
      fallback_from_provider: "resend",
      fallback_reason: resendResult,
    };
  }

  if (resendResult.configured || !smtpResult.configured) {
    return {
      ...resendResult,
      fallback_attempt: smtpResult,
    };
  }

  return smtpResult;
}

module.exports = {
  sendAlertEmail,
};
