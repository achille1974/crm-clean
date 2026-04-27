"use client";

import Link from "next/link";

type Cliente = {
  id: number;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
  ultima_opportunita_label: string | null;
  ultima_opportunita_sent_at: string | null;
  opportunita_labels: string[];
};

function formatDateTime(value?: string | null): string {
  if (!value) return "—";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function fullName(cliente: Cliente): string {
  const value = [cliente.nome, cliente.cognome].filter(Boolean).join(" ").trim();
  return value || "Cliente";
}

export default function ClientiList({
  clienti,
}: {
  clienti: Cliente[];
}) {
  if (!clienti.length) {
    return (
      <div className="rounded border p-4 text-sm text-gray-500">
        Nessun cliente presente.
      </div>
    );
  }

  return (
    <div className="divide-y rounded border bg-white">
      {clienti.map((c) => (
        <div
          key={c.id}
          className="flex flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="min-w-0 flex-1">
            <div className="font-medium text-slate-950">{fullName(c)}</div>

            <div className="mt-1 text-sm text-gray-500">
              {c.email ?? "—"}
            </div>

            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Ultima opportunità inviata
                </div>
                <div className="mt-1 text-sm font-medium text-slate-900">
                  {c.ultima_opportunita_label ?? "Nessuna"}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatDateTime(c.ultima_opportunita_sent_at)}
                </div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Storico opportunità
                </div>

                {c.opportunita_labels.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.opportunita_labels.map((label) => (
                      <span
                        key={`${c.id}-${label}`}
                        className="rounded-full border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <div className="mt-1 text-sm text-slate-500">
                    Nessuna opportunità inviata.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 gap-3 text-sm">
            <Link href={`/phonesia/clienti/${c.id}`} className="underline">
              Scheda
            </Link>

            {c.telefono && (
              <>
                <a href={`tel:${c.telefono}`} className="underline">
                  Tel
                </a>
                <a
                  href={`https://wa.me/${c.telefono.replace("+", "")}`}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  WA
                </a>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
