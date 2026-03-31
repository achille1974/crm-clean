"use client";

import { useMemo, useState } from "react";

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

type Props = {
  clienteId: number;
  clienteNome: string;
  activeServices: ServiceFamily[];
  telegramActive: boolean;
  marketingConsented: boolean;
  contactStoreLabel: string;
};

type SendState =
  | { type: "idle"; message: "" }
  | { type: "success"; message: string }
  | { type: "error"; message: string };

export default function ClienteOpportunityPanel({
  clienteId,
  clienteNome,
  activeServices,
  telegramActive,
  marketingConsented,
  contactStoreLabel,
}: Props) {
  const [selectedServices, setSelectedServices] = useState<ServiceFamily[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendState, setSendState] = useState<SendState>({
    type: "idle",
    message: "",
  });

  const activeSet = useMemo(() => new Set<ServiceFamily>(activeServices), [activeServices]);
  const proponibili = SERVICE_COLUMNS.filter((service) => !activeSet.has(service));

  const canAttemptSend = selectedServices.length > 0;
  const canReallySend = canAttemptSend && telegramActive && marketingConsented && !isSending;

  function toggleService(service: ServiceFamily) {
    setSendState({ type: "idle", message: "" });

    setSelectedServices((prev) =>
      prev.includes(service)
        ? prev.filter((item) => item !== service)
        : [...prev, service],
    );
  }

  async function handleConfirmSend() {
    setIsSending(true);
    setSendState({ type: "idle", message: "" });

    try {
      const response = await fetch("/api/phonesia/opportunita/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          clienteId,
          services: selectedServices,
        }),
      });

      const data = (await response.json()) as {
        ok: boolean;
        message?: string;
        error?: string;
        detail?: string;
      };

      if (!response.ok || !data.ok) {
        setSendState({
          type: "error",
          message:
            data.message ||
            data.detail ||
            "Invio non riuscito. Controlla consenso marketing e Telegram attivo.",
        });
        setIsSending(false);
        return;
      }

      setSendState({
        type: "success",
        message: data.message || "Messaggio inviato correttamente.",
      });
      setSelectedServices([]);
      setConfirmOpen(false);
    } catch (error) {
      setSendState({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Errore imprevisto durante l’invio del messaggio.",
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <section className="rounded-3xl border border-slate-200 bg-white px-5 py-5 shadow-sm md:px-6">
        <div className="mb-4">
          <h2 className="text-xl font-black text-slate-950">Servizi da proporre</h2>
          <p className="mt-1 text-sm text-slate-600">
            Seleziona i servizi non ancora attivi e poi conferma l’invio del messaggio
            al cliente.
          </p>
        </div>

        <div className="mb-4 grid gap-3 md:grid-cols-3">
          <StatusCard
            label="Consenso marketing"
            ok={marketingConsented}
            okText="Autorizzato"
            koText="Non autorizzato"
          />
          <StatusCard
            label="Telegram cliente"
            ok={telegramActive}
            okText="Attivo"
            koText="Non attivo"
          />
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-sm text-slate-500">Negozio messaggio</div>
            <div className="mt-2 text-base font-bold text-slate-950">
              {contactStoreLabel}
            </div>
          </div>
        </div>

        {proponibili.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Questo cliente ha già tutti i servizi presenti nella matrice.
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {proponibili.map((service) => {
              const isSelected = selectedServices.includes(service);

              return (
                <label
                  key={service}
                  className={[
                    "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition",
                    isSelected
                      ? "border-orange-300 bg-orange-50"
                      : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleService(service)}
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                  />

                  <div className="min-w-0">
                    <div className="font-semibold text-slate-950">{service}</div>
                    <div className="mt-1 text-sm text-slate-600">
                      Servizio non attivo, proponibile al cliente.
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-sm font-semibold text-slate-900">
            Servizi selezionati
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {selectedServices.length > 0 ? (
              selectedServices.map((service) => (
                <span
                  key={service}
                  className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700"
                >
                  {service}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500">Nessun servizio selezionato.</span>
            )}
          </div>

          {sendState.type !== "idle" && (
            <div
              className={[
                "mt-4 rounded-2xl border px-4 py-3 text-sm",
                sendState.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-rose-200 bg-rose-50 text-rose-700",
              ].join(" ")}
            >
              {sendState.message}
            </div>
          )}

          <div className="mt-4">
            <button
              type="button"
              disabled={!canAttemptSend}
              onClick={() => setConfirmOpen(true)}
              className={[
                "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white transition",
                canAttemptSend
                  ? "bg-orange-500 hover:bg-orange-600"
                  : "cursor-not-allowed bg-orange-300",
              ].join(" ")}
            >
              Invia messaggio
            </button>

            <p className="mt-2 text-xs text-slate-500">
              Il messaggio verrà inviato solo se il cliente ha consenso marketing e
              Telegram attivo.
            </p>
          </div>
        </div>
      </section>

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_20px_80px_rgba(15,23,42,0.25)]">
            <div className="mb-2 inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
              Conferma invio
            </div>

            <h3 className="text-2xl font-black tracking-tight text-slate-950">
              Confermi l’invio del messaggio?
            </h3>

            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              Cliente: <strong className="text-slate-950">{clienteNome}</strong>
            </p>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-semibold text-slate-900">Servizi selezionati</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {selectedServices.map((service) => (
                  <span
                    key={service}
                    className="inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-semibold text-orange-700"
                  >
                    {service}
                  </span>
                ))}
              </div>

              <ul className="mt-4 space-y-1.5">
                <li>
                  • Consenso marketing:{" "}
                  <strong className={marketingConsented ? "text-emerald-700" : "text-rose-700"}>
                    {marketingConsented ? "ok" : "mancante"}
                  </strong>
                </li>
                <li>
                  • Telegram attivo:{" "}
                  <strong className={telegramActive ? "text-emerald-700" : "text-rose-700"}>
                    {telegramActive ? "ok" : "non attivo"}
                  </strong>
                </li>
                <li>
                  • Negozio usato nel messaggio:{" "}
                  <strong className="text-slate-950">{contactStoreLabel}</strong>
                </li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Annulla
              </button>

              <button
                type="button"
                disabled={!canReallySend}
                onClick={handleConfirmSend}
                className={[
                  "inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm font-semibold text-white transition",
                  canReallySend
                    ? "bg-orange-500 hover:bg-orange-600"
                    : "cursor-not-allowed bg-orange-300",
                ].join(" ")}
              >
                {isSending ? "Invio in corso..." : "Conferma e invia"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function StatusCard({
  label,
  ok,
  okText,
  koText,
}: {
  label: string;
  ok: boolean;
  okText: string;
  koText: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div
        className={[
          "mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold",
          ok
            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
            : "border-rose-200 bg-rose-50 text-rose-700",
        ].join(" ")}
      >
        {ok ? okText : koText}
      </div>
    </div>
  );
}
