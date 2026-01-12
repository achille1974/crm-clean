"use client";

import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

type Attivita = {
  id: number;
  descrizione: string;
  created_at: string;
};

export default function AttivitaList({ clienteId }: { clienteId: number }) {
  const [attivita, setAttivita] = useState<Attivita[]>([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data } = await supabase
      .from("phonesia_attivita")
      .select("id, descrizione, created_at")
      .eq("cliente_id", clienteId)
      .order("created_at", { ascending: false });

    if (data) setAttivita(data);
  }

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
