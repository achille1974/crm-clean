"use client";

import Link from "next/link";

type Cliente = {
  id: number;
  nome: string | null;
  cognome: string | null;
  email: string | null;
  telefono: string | null;
};

export default function ClientiList({
  clienti,
}: {
  clienti: Cliente[];
}) {
  if (!clienti.length) {
    return (
      <div className="border rounded p-4 text-sm text-gray-500">
        Nessun cliente presente.
      </div>
    );
  }

  return (
    <div className="border rounded divide-y">
      {clienti.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between px-4 py-3"
        >
          <div>
            <div className="font-medium">
              {c.nome} {c.cognome}
            </div>
            <div className="text-sm text-gray-500">
              {c.email ?? "—"}
            </div>
          </div>

          <div className="flex gap-3 text-sm">
            {/* LINK CORRETTO */}
            <Link
              href={`/phonesia/clienti/${c.id}`}
              className="underline"
            >
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
