export type BatchResponseFailure = {
  ok: false;
  error: string;
  message: string;
  detail?: string;
  outcomeUnconfirmed: boolean;
};

const UNCONFIRMED_MESSAGE =
  "Esito batch non confermato. Verificare Campagne prima di ripetere l’invio.";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textDetail(text: string): string | undefined {
  const normalized = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 500) : undefined;
}

export async function readBatchApiResponse(
  response: Response,
  options: { isSend: boolean },
): Promise<Record<string, unknown> | BatchResponseFailure> {
  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  const body = await response.text();
  let parsed: unknown = null;

  if (body.trim()) {
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = null;
    }
  }

  if (isRecord(parsed)) {
    return parsed;
  }

  const redirectedToLogin =
    response.redirected && /\/(login|auth)(?:[/?#]|$)/i.test(response.url);
  const isHtml = contentType.includes("text/html") || /^\s*</.test(body);
  const outcomeUnconfirmed = options.isSend;

  if (response.status === 401 || response.status === 403 || (redirectedToLogin && isHtml)) {
    return {
      ok: false,
      error: "sessione_scaduta",
      message: "Sessione scaduta o accesso non autorizzato. Accedi di nuovo.",
      detail: outcomeUnconfirmed ? UNCONFIRMED_MESSAGE : undefined,
      outcomeUnconfirmed,
    };
  }

  if (response.status === 504) {
    return {
      ok: false,
      error: "timeout_batch",
      message: "Timeout durante l’elaborazione del batch.",
      detail: outcomeUnconfirmed ? UNCONFIRMED_MESSAGE : undefined,
      outcomeUnconfirmed,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      error: "errore_http_batch",
      message: `Errore HTTP ${response.status} durante l’elaborazione del batch.`,
      detail: outcomeUnconfirmed
        ? `${textDetail(body) ? `${textDetail(body)} ` : ""}${UNCONFIRMED_MESSAGE}`
        : textDetail(body),
      outcomeUnconfirmed,
    };
  }

  return {
    ok: false,
    error: "risposta_batch_non_valida",
    message: body.trim()
      ? "Il server ha restituito una risposta non JSON."
      : "Il server ha restituito una risposta vuota.",
    detail: outcomeUnconfirmed ? UNCONFIRMED_MESSAGE : textDetail(body),
    outcomeUnconfirmed,
  };
}

export function batchNetworkFailure(error: unknown): BatchResponseFailure {
  const isTimeout =
    error instanceof DOMException &&
    (error.name === "AbortError" || error.name === "TimeoutError");

  return {
    ok: false,
    error: isTimeout ? "timeout_batch" : "errore_rete_batch",
    message: isTimeout
      ? "Timeout durante la richiesta batch."
      : "La risposta finale del batch non è stata ricevuta.",
    detail: UNCONFIRMED_MESSAGE,
    outcomeUnconfirmed: true,
  };
}
