"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Summary = {
  totale_feedback: number;
  media_generale: number;
  totale_negativi: number;
  richieste_ricontatto: number;
};

type MediaNegozio = {
  negozio_id: number;
  negozio_label: string;
  media: number;
  totale_feedback: number;
  negativi: number;
};

type FeedbackRow = {
  id: number;
  cliente_id: number | null;
  cliente_nome: string;
  telefono: string;
  rating: number;
  commento: string;
  ricontatto: boolean;
  negozio_id: number | null;
  negozio_label: string;
  created_at: string | null;
};

type FeedbackStatsResponse = {
  ok: boolean;
  summary: Summary;
  media: MediaNegozio[];
  negativi: FeedbackRow[];
  ultimi: FeedbackRow[];
  error?: string;
  detail?: string;
};

function formatDate(value: string | null) {
  if (!value) return "-";

  try {
    return new Intl.DateTimeFormat("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function ratingLabel(rating: number) {
  if (rating <= 2) return "Critico";
  if (rating === 3) return "Da seguire";
  if (rating === 4) return "Buono";
  return "Ottimo";
}

function ratingClass(rating: number) {
  if (rating <= 2) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (rating === 3) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (rating === 4) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function FeedbackDashboardPage() {
  const [data, setData] = useState<FeedbackStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [errore, setErrore] = useState<string | null>(null);
  const [storeFilter, setStoreFilter] = useState("tutti");

  async function loadStats() {
    try {
      setLoading(true);
      setErrore(null);

      const response = await fetch("/api/phonesia/feedback/stats", {
        cache: "no-store",
      });

      const result = (await response.json()) as FeedbackStatsResponse;

      if (!response.ok || result.ok === false) {
        throw new Error(result.detail || result.error || "Errore caricamento feedback");
      }

      setData(result);
    } catch (error) {
      console.error("Errore dashboard feedback:", error);
      setErrore(error instanceof Error ? error.message : "Errore sconosciuto");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  const storeOptions = useMemo(() => {
    const labels = new Set<string>();

    data?.ultimi.forEach((row) => labels.add(row.negozio_label));
    data?.negativi.forEach((row) => labels.add(row.negozio_label));
    data?.media.forEach((row) => labels.add(row.negozio_label));

    return Array.from(labels).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const ultimiFiltrati = useMemo(() => {
    const rows = data?.ultimi ?? [];

    if (storeFilter === "tutti") return rows;

    return rows.filter((row) => row.negozio_label === storeFilter);
  }, [data, storeFilter]);

  const negativiFiltrati = useMemo(() => {
    const rows = data?.negativi ?? [];

    if (storeFilter === "tutti") return rows;

    return rows.filter((row) => row.negozio_label === storeFilter);
  }, [data, storeFilter]);

  if (loading) {
    return (
      <main className="min-h-screen bg-[#f8fafc] px-5 py-8 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[32px] border border-slate-200 bg-white p-8 shadow-sm">
            Caricamento dashboard feedback...
          </div>
        </div>
      </main>
    );
  }

  if (errore || !data) {
    return (
      <main className="min-h-screen bg-[#f8fafc] px-5 py-8 text-slate-900">
        <div className="mx-auto max-w-7xl">
          <div className="rounded-[32px] border border-red-200 bg-red-50 p-8 text-red-700">
            Errore caricamento dashboard: {errore || "dati non disponibili"}
          </div>

          <div className="mt-5">
            <Link
              href="/phonesia/dashboard"
              className="inline-flex rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Torna alla dashboard
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const summary = data.summary;

  return (
    <main className="min-h-screen bg-[#f8fafc] px-5 py-8 text-slate-900 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-3 inline-flex rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-orange-700">
              PHONESIA CRM
            </div>

            <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
              Dashboard Feedback
            </h1>

            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base">
              Controlla la soddisfazione clienti, i voti medi per negozio e i
              clienti da ricontattare.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={storeFilter}
              onChange={(event) => setStoreFilter(event.target.value)}
              className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none focus:border-orange-500"
            >
              <option value="tutti">Tutti i negozi</option>
              {storeOptions.map((store) => (
                <option key={store} value={store}>
                  {store}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadStats}
              className="rounded-2xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Aggiorna
            </button>

            <Link
              href="/phonesia/dashboard"
              className="rounded-2xl border border-orange-300 bg-orange-50 px-5 py-3 text-center text-sm font-semibold text-orange-700 transition hover:border-orange-400 hover:bg-orange-100"
            >
              Dashboard
            </Link>

            <Link
              href="/phonesia/dashboard/clienti"
              className="rounded-2xl border border-slate-300 bg-white px-5 py-3 text-center text-sm font-semibold text-slate-700 transition hover:border-slate-400"
            >
              Clienti
            </Link>
          </div>
        </div>

        <section className="grid gap-4 md:grid-cols-4">
          <StatCard
            label="Feedback totali"
            value={summary.totale_feedback}
            note="Risposte ricevute"
          />
          <StatCard
            label="Voto medio"
            value={summary.media_generale ? `${summary.media_generale}/5` : "-"}
            note="Media generale"
          />
          <StatCard
            label="Clienti insoddisfatti"
            value={summary.totale_negativi}
            note="Rating 1, 2 o 3"
            danger={summary.totale_negativi > 0}
          />
          <StatCard
            label="Richieste ricontatto"
            value={summary.richieste_ricontatto}
            note="Clienti che vogliono essere richiamati"
            warning={summary.richieste_ricontatto > 0}
          />
        </section>

        <section className="mt-6 rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
          <div className="mb-5 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-xl font-black tracking-tight text-slate-950">
                Voto medio per negozio
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Ordine basato sul numero di feedback ricevuti.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-[0.16em] text-slate-500">
                  <th className="px-4 py-2">Negozio</th>
                  <th className="px-4 py-2">Media</th>
                  <th className="px-4 py-2">Feedback</th>
                  <th className="px-4 py-2">Insoddisfatti</th>
                  <th className="px-4 py-2">Stato</th>
                </tr>
              </thead>
              <tbody>
                {data.media.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500"
                    >
                      Nessun feedback disponibile.
                    </td>
                  </tr>
                ) : (
                  data.media.map((row) => (
                    <tr key={row.negozio_id} className="bg-slate-50 text-sm">
                      <td className="rounded-l-2xl px-4 py-4 font-bold text-slate-900">
                        {row.negozio_label}
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-lg font-black text-slate-950">
                          {row.media}/5
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {row.totale_feedback}
                      </td>
                      <td className="px-4 py-4 text-slate-700">
                        {row.negativi}
                      </td>
                      <td className="rounded-r-2xl px-4 py-4">
                        <span
                          className={[
                            "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                            row.media >= 4
                              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                              : row.media >= 3
                                ? "border-amber-200 bg-amber-50 text-amber-700"
                                : "border-red-200 bg-red-50 text-red-700",
                          ].join(" ")}
                        >
                          {row.media >= 4
                            ? "Buono"
                            : row.media >= 3
                              ? "Da seguire"
                              : "Critico"}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-2">
          <FeedbackList
            title="Clienti insoddisfatti"
            subtitle="Rating 1, 2 o 3. Sono i primi da richiamare."
            rows={negativiFiltrati}
            emptyText="Nessun cliente insoddisfatto."
            highlightNegative
          />

          <FeedbackList
            title="Ultimi feedback ricevuti"
            subtitle="Le risposte più recenti dei clienti."
            rows={ultimiFiltrati}
            emptyText="Nessun feedback ricevuto."
          />
        </section>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  note,
  danger = false,
  warning = false,
}: {
  label: string;
  value: string | number;
  note: string;
  danger?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-[28px] border bg-white p-5 shadow-sm",
        danger
          ? "border-red-200"
          : warning
            ? "border-amber-200"
            : "border-slate-200",
      ].join(" ")}
    >
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="mt-3 text-3xl font-black tracking-tight text-slate-950">
        {value}
      </div>
      <div className="mt-2 text-sm text-slate-600">{note}</div>
    </div>
  );
}

function FeedbackList({
  title,
  subtitle,
  rows,
  emptyText,
  highlightNegative = false,
}: {
  title: string;
  subtitle: string;
  rows: FeedbackRow[];
  emptyText: string;
  highlightNegative?: boolean;
}) {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="mb-5">
        <h2 className="text-xl font-black tracking-tight text-slate-950">
          {title}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{subtitle}</p>
      </div>

      <div className="space-y-3">
        {rows.length === 0 ? (
          <div className="rounded-2xl bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        ) : (
          rows.map((row) => (
            <article
              key={row.id}
              className={[
                "rounded-2xl border p-4",
                highlightNegative && row.rating <= 3
                  ? "border-red-100 bg-red-50/50"
                  : "border-slate-200 bg-slate-50",
              ].join(" ")}
            >
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <div className="font-black text-slate-950">
                    {row.cliente_nome}
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {row.negozio_label}
                    {row.telefono ? ` · ${row.telefono}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(row.created_at)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className={[
                      "inline-flex rounded-full border px-3 py-1 text-xs font-bold",
                      ratingClass(row.rating),
                    ].join(" ")}
                  >
                    {row.rating}/5 · {ratingLabel(row.rating)}
                  </span>

                  {row.ricontatto ? (
                    <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-bold text-orange-700">
                      Vuole ricontatto
                    </span>
                  ) : null}
                </div>
              </div>

              {row.commento ? (
                <p className="mt-4 rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-slate-700">
                  {row.commento}
                </p>
              ) : (
                <p className="mt-4 text-sm italic text-slate-400">
                  Nessun commento lasciato.
                </p>
              )}

              {row.cliente_id ? (
                <div className="mt-4">
                  <Link
                    href={`/phonesia/dashboard/clienti/${row.cliente_id}`}
                    className="text-sm font-bold text-orange-600 hover:text-orange-700"
                  >
                    Apri scheda cliente →
                  </Link>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>
    </section>
  );
}
