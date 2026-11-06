"use client";

import { useEffect, useState } from "react";

type Attivita = {
  id: number;
  descrizione: string | null;
  created_at: string;
};

export default function AttivitaList({ clienteId }: { clienteId: number }) {
  const [attivita, setAttivita] = useState<Attivita[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch(`/api/phonesia/clienti/${clienteId}/attivita`, { signal: controller.signal });
        if (!response.ok) throw new Error("Lettura delle attività non riuscita.");
        const data = await response.json();
        if (!cancelled) { setAttivita(data.attivita || []); setError(""); }
      } catch {
        if (!cancelled) setError("Lettura delle attività non riuscita.");
      }
    }
    function onSaved(event: Event) {
      if ((event as CustomEvent<number>).detail === clienteId) void load();
    }
    void load();
    window.addEventListener("phonesia-attivita-saved", onSaved);

    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("phonesia-attivita-saved", onSaved);
    };
  }, [clienteId]);

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!attivita.length) {
    return <p className="text-sm text-gray-500">Nessuna attività registrata.</p>;
  }

  return (
    <ul className="space-y-2">
      {attivita.map((a) => (
        <li key={a.id} className="border rounded p-2 text-sm">
          <div>{a.descrizione}</div>
          <div className="text-xs text-gray-400 mt-1">
            {new Date(a.created_at).toLocaleString()}
          </div>
        </li>
      ))}
    </ul>
  );
}
