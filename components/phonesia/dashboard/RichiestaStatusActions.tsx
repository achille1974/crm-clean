"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const STATUS_OPTIONS = [
  { value: "da_gestire", label: "Da gestire" },
  { value: "in_lavorazione", label: "In lavorazione" },
  { value: "ricontattato", label: "Ricontattato" },
  { value: "chiusa", label: "Chiusa" },
  { value: "non_interessato", label: "Non interessato" },
];

export default function RichiestaStatusActions({
  richiestaId,
  currentStatus,
}: {
  richiestaId: number | string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(nextStatus: string) {
    if (nextStatus === currentStatus || loading) {
      setStatus(currentStatus);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      const response = await fetch(`/api/phonesia/richieste/${richiestaId}/stato`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          stato_operativo: nextStatus,
        }),
      });

      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        detail?: string;
      };

      if (!response.ok || result.ok === false) {
        throw new Error(
          result.detail || result.error || "Aggiornamento stato non riuscito",
        );
      }

      router.refresh();
    } catch (updateError) {
      console.error("Errore cambio stato richiesta:", updateError);
      setStatus(currentStatus);
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Errore aggiornamento stato",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-3 max-w-[190px] space-y-2">
      <label className="block text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">
        Cambia stato
      </label>

      <select
        value={status}
        disabled={loading}
        onChange={(event) => {
          const nextStatus = event.target.value;
          setStatus(nextStatus);
          updateStatus(nextStatus);
        }}
        className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 outline-none transition hover:border-orange-300 focus:border-orange-500 disabled:cursor-wait disabled:opacity-60"
      >
        {STATUS_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>

      {loading ? (
        <div className="text-[11px] font-semibold text-slate-500">
          Aggiornamento...
        </div>
      ) : null}

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
