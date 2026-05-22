"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type StatusOption = {
  value: string;
  label: string;
  className: string;
};

const STATUS_OPTIONS: StatusOption[] = [
  {
    value: "da_gestire",
    label: "Da gestire",
    className: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  },
  {
    value: "in_lavorazione",
    label: "In lavorazione",
    className: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  },
  {
    value: "ricontattato",
    label: "Ricontattato",
    className:
      "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  },
  {
    value: "chiusa",
    label: "Chiusa",
    className: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
  },
  {
    value: "non_interessato",
    label: "Non interessato",
    className: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100",
  },
];

export default function RichiestaStatusActions({
  richiestaId,
  currentStatus,
}: {
  richiestaId: number | string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loadingStatus, setLoadingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(nextStatus: string) {
    if (nextStatus === currentStatus || loadingStatus) return;

    try {
      setError(null);
      setLoadingStatus(nextStatus);

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
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Errore aggiornamento stato",
      );
    } finally {
      setLoadingStatus(null);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {STATUS_OPTIONS.map((option) => {
          const active = option.value === currentStatus;
          const loading = loadingStatus === option.value;

          return (
            <button
              key={option.value}
              type="button"
              disabled={active || Boolean(loadingStatus)}
              onClick={() => updateStatus(option.value)}
              className={[
                "rounded-full border px-3 py-1.5 text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "border-slate-300 bg-slate-950 text-white"
                  : option.className,
              ].join(" ")}
              title={active ? "Stato attuale" : `Segna come ${option.label}`}
            >
              {loading ? "..." : option.label}
            </button>
          );
        })}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
