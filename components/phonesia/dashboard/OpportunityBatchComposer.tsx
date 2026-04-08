"use client";

import { useMemo, useState, type ReactNode } from "react";

const SERVICE_COLUMNS = [
  "MOBILE",
  "FISSO",
  "ENERGIA",
  "TV",
  "SMARTPHONE",
  "ACCESSORI",
  "SICUREZZA",
  "FOTOVOLTAICO",
] as const;

type ServiceFamily = (typeof SERVICE_COLUMNS)[number];

type Recipient = {
  id: number;
  nomeCompleto: string;
  telefono: string;
  negozioLabel: string;
  telegramActive: boolean;
  marketingConsented: boolean;
};

type Props = {
  recipients: Recipient[];
};

type SendResultRow = {
  clienteId: number;
  nome: string;
  status: "sent" | "blocked" | "error" | "not_found";
  reason: string;
};

type SendResponse =
  | {
      ok: true;
      batchId: string;
      sentCount: number;
      blockedCount: number;
      errorCount: number;
      results: SendResultRow[];
    }
  | {
      ok: false;
      error: string;
      detail?: string;
    };

function serviceLabel(service: ServiceFamily): string {
  switch (service) {
    case "FISSO":
      return "fibra";
    case "MOBILE":
      return "mobile";
    case "ENERGIA":
      return "energia";
    case "TV":
      return "TV";
    case "SMARTPHONE":
      return "smartphone";
    case "ACCESSORI":
      return "accessori";
    case "SICUREZZA":
      return "sicurezza";
    case "FOTOVOLTAICO":
      return "fotovoltaico";
  }

  return "servizio";
}

function buildStandardText(service: ServiceFamily) {
  if (service === "FISSO") {
    return "Abbiamo un’offerta fibra esclusiva per te. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.";
  }

  if (service === "MOBILE") {
    return "Abbiamo un’offerta mobile dedicata per te. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.";
  }

  if (service === "ENERGIA") {
    return "Abbiamo un’offerta energia dedicata per te. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.";
  }

  return `Abbiamo un’offerta esclusiva per te su ${serviceLabel(service)}. Contattaci oppure vieni in negozio per scoprire tutti i dettagli.`;
}

export default function OpportunityBatchComposer({ recipients }: Props) {
  const [messageMode, setMessageMode] = useState<"standard" | "custom">("standard");
  const [standardService, setStandardService] = useState<ServiceFamily>("SMARTPHONE");
  const [customMessage, setCustomMessage] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [sendResponse, setSendResponse] = useState<SendResponse | null>(null);

  const eligibleRecipients = useMemo(
    () =>
      recipients.filter(
        (recipient) => recipient.telegramActive && recipient.marketingConsented,
      ),
    [recipients],
  );

  const blockedRecipients = useMemo(
    () =>
      recipients.filter(
        (recipient) => !recipient.telegramActive || !recipient.marketingConsented,
      ),
    [recipients],
  );

  const previewText =
    messageMode === "standard"
      ? buildStandardText(standardService)
      : customMessage.trim() || "Nessun messaggio personalizzato inserito.";

  const canSend =
    recipients.length > 0 &&
    eligibleRecipients.length > 0 &&
    !isSending &&
    (messageMode === "standard" || customMessage.trim().length > 0);

  async function handleSendBatch() {
    setIsSending(true);
    setSendResponse(null);

    try {
      const formData = new FormData();

      for (const recipient of recipients) {
        formData.append("clienti", String(recipient.id));
      }

      formData.append("messageMode", messageMode);

      if (messageMode === "standard") {
        formData.append("standardService", standardService);
      } else {
        formData.append("customMessage", customMessage.trim());
      }

      if (selectedFile) {
        formData.append("locandina", selectedFile);
      }

      const response = await fetch("/api/phonesia/opportunita/send-batch", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as SendResponse;

      if (!response.ok || !data.ok) {
        setSendResponse(
          data.ok
            ? data
            : {
                ok: false,
                error: data.error || "Invio batch non riuscito.",
                detail: data.detail,
              },
        );
        setIsSending(false);
        return;
      }

      setSendResponse(data);
    } catch (error) {
      setSendResponse({
        ok: false,
        error: "Errore imprevisto durante l’invio batch.",
        detail: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Destinatari selezionati</h2>
          <p className="mt-1 text-sm text-slate-600">
            Invia l’opportunità solo ai clienti idonei: consenso marketing attivo e Telegram attivo.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <StatCard label="Selezionati" value={String(recipients.length)} />
          <StatCard label="Idonei all’invio" value={String(eligibleRecipients.length)} />
          <StatCard label="Bloccati" value={String(blockedRecipients.length)} />
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="min-w-[900px] w-full text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                  <th className="px-4 py-3 text-left font-semibold">Telefono</th>
                  <th className="px-4 py-3 text-left font-semibold">Negozio</th>
                  <th className="px-4 py-3 text-left font-semibold">Telegram</th>
                  <th className="px-4 py-3 text-left font-semibold">Marketing</th>
                </tr>
              </thead>

              <tbody>
                {recipients.map((recipient) => (
                  <tr key={recipient.id} className="border-b border-slate-100">
                    <td className="px-4 py-4 font-semibold text-slate-950">
                      {recipient.nomeCompleto}
                    </td>
                    <td className="px-4 py-4 text-slate-700">{recipient.telefono || "—"}</td>
                    <td className="px-4 py-4 text-slate-700">{recipient.negozioLabel}</td>
                    <td className="px-4 py-4">
                      <Badge ok={recipient.telegramActive}>
                        {recipient.telegramActive ? "Attivo" : "Non attivo"}
                      </Badge>
                    </td>
                    <td className="px-4 py-4">
                      <Badge ok={recipient.marketingConsented}>
                        {recipient.marketingConsented ? "Autorizzato" : "Non autorizzato"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Composizione opportunità</h2>
          <p className="mt-1 text-sm text-slate-600">
            Puoi inviare solo il messaggio, oppure messaggio + locandina caricata dal computer.
          </p>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Tipo messaggio</div>

              <div className="mt-3 flex flex-col gap-3">
                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="messageMode"
                    checked={messageMode === "standard"}
                    onChange={() => setMessageMode("standard")}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Messaggio standard</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Usa il testo preconfigurato in base al tipo di opportunità.
                    </div>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="radio"
                    name="messageMode"
                    checked={messageMode === "custom"}
                    onChange={() => setMessageMode("custom")}
                    className="mt-1 h-4 w-4 border-slate-300 text-orange-500 focus:ring-orange-500"
                  />
                  <div>
                    <div className="font-semibold text-slate-950">Messaggio personalizzato</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Scrivi manualmente il testo da inviare ai clienti selezionati.
                    </div>
                  </div>
                </label>
              </div>
            </section>

            {messageMode === "standard" ? (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Opportunità standard
                </label>

                <select
                  value={standardService}
                  onChange={(event) => setStandardService(event.target.value as ServiceFamily)}
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
                >
                  {SERVICE_COLUMNS.map((service) => (
                    <option key={service} value={service}>
                      {service}
                    </option>
                  ))}
                </select>
              </section>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <label className="mb-2 block text-sm font-semibold text-slate-900">
                  Messaggio personalizzato
                </label>

                <textarea
                  value={customMessage}
                  onChange={(event) => setCustomMessage(event.target.value)}
                  rows={7}
                  placeholder="Scrivi qui il messaggio da inviare ai clienti selezionati..."
                  className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
                />
              </section>
            )}

            <section className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <label className="mb-2 block text-sm font-semibold text-slate-900">
                Locandina da allegare
              </label>

              <input
                type="file"
                accept="image/*,.pdf"
                onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                className="block w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
              />

              <p className="mt-2 text-sm text-slate-500">
                Formati consigliati: immagine o PDF.
              </p>

              {selectedFile ? (
                <div className="mt-3 inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700">
                  File selezionato: {selectedFile.name}
                </div>
              ) : null}
            </section>
          </div>

          <div className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Anteprima messaggio</div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                {previewText}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-sm font-semibold text-slate-900">Invio</div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-700">
                Verranno inviati:
                <ul className="mt-2 space-y-1.5">
                  <li>• messaggio standard o personalizzato</li>
                  <li>• locandina allegata, se caricata</li>
                  <li>• pulsanti Contattaci / Vieni in negozio nel messaggio</li>
                </ul>
              </div>

              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={handleSendBatch}
                  className={[
                    "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white transition",
                    canSend
                      ? "bg-orange-500 hover:bg-orange-600"
                      : "cursor-not-allowed bg-orange-300",
                  ].join(" ")}
                >
                  {isSending ? "Invio in corso..." : "Invia opportunità ai clienti selezionati"}
                </button>

                <p className="text-xs text-slate-500">
                  I clienti senza consenso marketing o senza Telegram attivo verranno saltati automaticamente.
                </p>
              </div>
            </section>
          </div>
        </div>
      </section>

      {sendResponse ? (
        <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
          {sendResponse.ok ? (
            <>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm text-emerald-800">
                Invio completato. Batch ID: <strong>{sendResponse.batchId}</strong>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <StatCard label="Inviati" value={String(sendResponse.sentCount)} />
                <StatCard label="Bloccati" value={String(sendResponse.blockedCount)} />
                <StatCard label="Errori" value={String(sendResponse.errorCount)} />
              </div>

              <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200">
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr className="border-b border-slate-200">
                        <th className="px-4 py-3 text-left font-semibold">Cliente</th>
                        <th className="px-4 py-3 text-left font-semibold">Esito</th>
                        <th className="px-4 py-3 text-left font-semibold">Dettaglio</th>
                      </tr>
                    </thead>

                    <tbody>
                      {sendResponse.results.map((row) => (
                        <tr key={`${row.clienteId}-${row.status}`} className="border-b border-slate-100">
                          <td className="px-4 py-4 font-semibold text-slate-950">{row.nome}</td>
                          <td className="px-4 py-4">
                            <StatusPill status={row.status} />
                          </td>
                          <td className="px-4 py-4 text-slate-700">{row.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
              <strong>{sendResponse.error}</strong>
              {sendResponse.detail ? <div className="mt-1">{sendResponse.detail}</div> : null}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-2 text-3xl font-black text-slate-950">{value}</div>
    </div>
  );
}

function Badge({
  ok,
  children,
}: {
  ok: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={[
        "inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
        ok
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-rose-200 bg-rose-50 text-rose-700",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function StatusPill({
  status,
}: {
  status: "sent" | "blocked" | "error" | "not_found";
}) {
  const label =
    status === "sent"
      ? "Inviato"
      : status === "blocked"
        ? "Bloccato"
        : status === "not_found"
          ? "Non trovato"
          : "Errore";

  const className =
    status === "sent"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "blocked"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-rose-200 bg-rose-50 text-rose-700";

  return (
    <span className={["inline-flex rounded-full border px-3 py-1 text-xs font-semibold", className].join(" ")}>
      {label}
    </span>
  );
}
