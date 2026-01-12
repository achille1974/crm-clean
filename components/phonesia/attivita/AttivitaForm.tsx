"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function AttivitaForm({ clienteId }: { clienteId: number }) {
  const [descrizione, setDescrizione] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descrizione.trim()) return;

    setSaving(true);

    await supabase.from("phonesia_attivita").insert({
      cliente_id: clienteId,
      descrizione: descrizione.trim(),
    });

    setDescrizione("");
    setSaving(false);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <textarea
        className="w-full border rounded p-2 text-sm"
        placeholder="Descrivi l’attività svolta (es. Preventivo assicurazione, cambio piano, assistenza…)"
        value={descrizione}
        onChange={(e) => setDescrizione(e.target.value)}
        rows={3}
      />

      <button
        type="submit"
        disabled={saving}
        className="px-4 py-1 text-sm rounded bg-black text-white disabled:opacity-50"
      >
        {saving ? "Salvataggio..." : "Aggiungi attività"}
      </button>
    </form>
  );
}
