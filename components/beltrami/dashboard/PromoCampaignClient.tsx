"use client";

import { useMemo, useState } from "react";

import {
  Badge,
  EmptyState,
  formatDateTime,
  StatCard,
} from "@/components/beltrami/dashboard/DashboardUi";
import type {
  BeltramiPromoCandidate,
  BeltramiPromoDashboardData,
  BeltramiPromoPreflightResult,
} from "@/lib/beltrami/promo";

const BELTRAMI_PROMO_TEMPLATE_NAME = "bel_promo_img_v1";
const BELTRAMI_PROMO_BODY_PARAMETER_NAME = "messaggio_promo";

type Props = {
  data: BeltramiPromoDashboardData;
};

type SendResult = {
  ok?: boolean;
  sent?: number;
  failed?: number;
  skipped?: number;
  message?: string;
};

function buildPayload(params: {
  selectedIds: number[];
  promoName: string;
  messageText: string;
  imageUrl: string;
  templateName: string;
  confirmation?: string;
}) {
  return {
    clienteIds: params.selectedIds,
    promoName: params.promoName,
    messageText: params.messageText,
    imageUrl: params.imageUrl,
    templateName: params.templateName,
    ...(params.confirmation ? { confirmation: params.confirmation } : {}),
  };
}

function clientLabel(row: BeltramiPromoCandidate) {
  return row.nome_completo || [row.nome, row.cognome].filter(Boolean).join(" ") || "Cliente";
}

export default function PromoCampaignClient({ data }: Props) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [promoName, setPromoName] = useState("");
  const [messageText, setMessageText] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [templateName, setTemplateName] = useState(BELTRAMI_PROMO_TEMPLATE_NAME);
  const [preflight, setPreflight] = useState<BeltramiPromoPreflightResult | null>(null);
  const [preflightFingerprint, setPreflightFingerprint] = useState("");
  const [sendResult, setSendResult] = useState<SendResult | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState<"preflight" | "send" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const eligibleIds = useMemo(() => data.rows.map((row) => row.id), [data.rows]);
  const currentFingerprint = JSON.stringify({
    selectedIds: [...selectedIds].sort((a, b) => a - b),
    promoName,
    messageText,
    imageUrl,
    templateName,
  });
  const preflightStillValid =
    preflight?.ok === true &&
    preflightFingerprint === currentFingerprint &&
    preflight.counts.inviabiliEffettivi > 0;
  const canSend = preflightStillValid && confirmation.trim().toUpperCase() === "INVIA";

  function toggleCliente(id: number, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return [...next];
    });
    setPreflight(null);
    setSendResult(null);
  }

  function selectAllEligible() {
    setSelectedIds(eligibleIds);
    setPreflight(null);
    setSendResult(null);
  }

  function clearSelection() {
    setSelectedIds([]);
    setPreflight(null);
    setSendResult(null);
  }

  async function executePreflight() {
    setLoading("preflight");
    setErrorMessage(null);
    setSendResult(null);

    try {
      const response = await fetch("/api/beltrami/promo/preflight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({ selectedIds, promoName, messageText, imageUrl, templateName }),
        ),
      });
      const result = (await response.json().catch(() => null)) as
        | BeltramiPromoPreflightResult
        | null;

      if (!result) {
        throw new Error("Risposta preflight non valida.");
      }

      setPreflight(result);
      setPreflightFingerprint(currentFingerprint);

      if (!response.ok || result.errors.length > 0) {
        setErrorMessage(result.errors.join(" "));
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Preflight non riuscito.");
    } finally {
      setLoading(null);
    }
  }

  async function executeSend() {
    if (!canSend) return;

    setLoading("send");
    setErrorMessage(null);
    setSendResult(null);

    try {
      const response = await fetch("/api/beltrami/promo/send-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          buildPayload({
            selectedIds,
            promoName,
            messageText,
            imageUrl,
            templateName,
            confirmation,
          }),
        ),
      });
      const result = (await response.json().catch(() => null)) as SendResult | null;

      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || "Invio promo non riuscito.");
      }

      setSendResult(result);
      setConfirmation("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Invio promo non riuscito.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="space-y-6">
      {data.warnings.length > 0 ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
          {data.warnings.join(" ")}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-5">
        <StatCard label="Idonei" value={data.counts.idonei} note="Selezionabili" tone="success" />
        <StatCard
          label="Selezionati"
          value={selectedIds.length}
          note="Clienti scelti"
          tone={selectedIds.length > 0 ? "warning" : "neutral"}
        />
        <StatCard
          label="Senza consenso promo"
          value={data.counts.senzaConsensoMarketing}
          note="Esclusi"
        />
        <StatCard
          label="Senza WhatsApp"
          value={data.counts.senzaWhatsappOTelefono}
          note="Esclusi"
        />
        <StatCard label="STOP" value={data.counts.optOut} note="Opt-out" tone="danger" />
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Nome promo</span>
              <input
                value={promoName}
                onChange={(event) => {
                  setPromoName(event.target.value);
                  setPreflight(null);
                }}
                placeholder="Promo TIM Motorola 6 euro mese"
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Messaggio promo</span>
              <textarea
                value={messageText}
                onChange={(event) => {
                  setMessageText(event.target.value);
                  setPreflight(null);
                }}
                rows={5}
                placeholder={`Scrivi il testo per la variabile body ${BELTRAMI_PROMO_BODY_PARAMETER_NAME}.`}
                className="w-full resize-y rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">
                URL pubblico immagine/locandina
              </span>
              <input
                value={imageUrl}
                onChange={(event) => {
                  setImageUrl(event.target.value);
                  setPreflight(null);
                }}
                placeholder="https://..."
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-700">Template Meta</span>
              <input
                value={templateName}
                onChange={(event) => {
                  setTemplateName(event.target.value);
                  setPreflight(null);
                }}
                className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 text-sm font-black text-slate-950">Controlli invio</div>
              <div className="space-y-2 text-sm font-semibold text-slate-600">
                <div>Invia solo a clienti con consenso promozionale WhatsApp.</div>
                <div>Il preflight non invia messaggi e non scrive nel database.</div>
                <div>Invio reale con template Meta approvato {BELTRAMI_PROMO_TEMPLATE_NAME}.</div>
                <div>Body template con variabile {BELTRAMI_PROMO_BODY_PARAMETER_NAME}.</div>
              </div>
            </div>

            <div
              className="aspect-[4/3] rounded-lg border border-slate-200 bg-slate-100 bg-cover bg-center"
              role="img"
              aria-label="Anteprima immagine promo"
              style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
            >
              {!imageUrl ? (
                <div className="flex h-full items-center justify-center px-4 text-center text-sm font-semibold text-slate-500">
                  Anteprima immagine
                </div>
              ) : null}
            </div>

            {preflight ? (
              <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <span className="font-black text-slate-950">Preflight</span>
                  <Badge tone={preflight.ok ? "success" : "danger"}>
                    {preflight.ok ? "OK" : "Bloccato"}
                  </Badge>
                </div>
                <div className="space-y-1 font-semibold text-slate-600">
                  <div>promo_key: {preflight.promoKey || "-"}</div>
                  <div>Selezionati: {preflight.counts.selezionati}</div>
                  <div>Idonei: {preflight.counts.idonei}</div>
                  <div>Gia contattati: {preflight.counts.giaContattatiPromo}</div>
                  <div>Inviabili effettivi: {preflight.counts.inviabiliEffettivi}</div>
                  <div>Immagine presente: {preflight.imagePresent ? "si" : "no"}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-black tracking-tight text-slate-950">
              Clienti idonei
            </h2>
            <div className="mt-1 text-sm font-semibold text-slate-500">
              Seleziona tutti agisce solo sui clienti con tutti i consensi richiesti.
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllEligible}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
            >
              Seleziona tutti idonei
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition hover:border-emerald-300 hover:text-emerald-700"
            >
              Svuota
            </button>
          </div>
        </div>

        {data.rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Selezione</th>
                  <th className="px-3 py-3">Cliente</th>
                  <th className="px-3 py-3">Telefono</th>
                  <th className="px-3 py-3">Registrazione</th>
                  <th className="px-3 py-3">Consensi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {data.rows.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(row.id)}
                        onChange={(event) => toggleCliente(row.id, event.target.checked)}
                        className="h-5 w-5 rounded border-slate-300 text-emerald-700"
                        aria-label={`Seleziona ${clientLabel(row)}`}
                      />
                    </td>
                    <td className="px-3 py-4">
                      <div className="font-bold text-slate-950">{clientLabel(row)}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-500">
                        {row.email || "-"}
                      </div>
                    </td>
                    <td className="px-3 py-4 font-semibold text-slate-700">
                      {row.telefono_normalizzato || row.telefono || "-"}
                    </td>
                    <td className="px-3 py-4 text-slate-700">
                      {formatDateTime(row.created_at)}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-2">
                        <Badge tone="success">Privacy</Badge>
                        <Badge tone="success">WhatsApp/contatto</Badge>
                        <Badge tone="success">Promo WhatsApp</Badge>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState>Nessun cliente idoneo per promo con i filtri correnti.</EmptyState>
        )}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm md:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-3">
            <button
              type="button"
              onClick={executePreflight}
              disabled={loading !== null}
              className="rounded-md bg-emerald-700 px-5 py-2.5 text-sm font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading === "preflight" ? "Preflight in corso..." : "Esegui preflight"}
            </button>

            {errorMessage ? (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {errorMessage}
              </div>
            ) : null}

            {sendResult?.ok ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                Invio completato. Inviati: {sendResult.sent ?? 0}. Falliti:{" "}
                {sendResult.failed ?? 0}. Saltati: {sendResult.skipped ?? 0}.
              </div>
            ) : null}
          </div>

          <div className="min-w-[280px] rounded-lg border border-red-200 bg-red-50 p-4">
            <label className="block">
              <span className="mb-2 block text-sm font-bold text-red-800">
                Conferma finale
              </span>
              <input
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Scrivi INVIA"
                className="w-full rounded-md border border-red-200 bg-white px-3 py-2 text-sm font-bold text-slate-950 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </label>
            <button
              type="button"
              onClick={executeSend}
              disabled={!canSend || loading !== null}
              className="mt-3 w-full rounded-md bg-red-700 px-5 py-2.5 text-sm font-black text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {loading === "send" ? "Invio in corso..." : "Invia promo reale"}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
