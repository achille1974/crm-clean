"use client";

import { useState } from "react";

export default function AttivitaForm({ clienteId }: { clienteId: number }) {
  const [descrizione, setDescrizione] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!descrizione.trim()) return;

    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/phonesia/clienti/${clienteId}/attivita`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ descrizione: descrizione.trim() }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Salvataggio non riuscito.");
      setDescrizione("");
      window.dispatchEvent(new CustomEvent("phonesia-attivita-saved", { detail: clienteId }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Salvataggio non riuscito.");
    } finally { setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <textarea
        className="w-full border rounded p-2 text-sm"
        placeholder="Descrivi l’attività svolta (es. Preventivo assicurazione, cambio piano, assistenza…)"
        value={descrizione}
        onChange={(e) => setDescrizione(e.target.value)}
        rows={3}
        maxLength={4000}
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
