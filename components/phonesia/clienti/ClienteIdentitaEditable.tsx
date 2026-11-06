"use client";

import { useState } from "react";

export default function ClienteIdentitaEditable({
  cliente,
}: {
  cliente: { id: number; telefono: string | null; email: string | null; codice_fiscale: string | null };
}) {
  const [editing, setEditing] = useState(false);
  const [telefono, setTelefono] = useState(cliente.telefono ?? "");
  const [email, setEmail] = useState(cliente.email ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function salva() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/phonesia/clienti/${cliente.id}/identita`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ telefono, email }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || "Modifica non riuscita.");
      setEditing(false);
      location.reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Modifica non riuscita.");
    } finally { setLoading(false); }
  }

  if (!editing) {
    return (
      <>
        <ul className="text-sm space-y-1">
          <li><strong>Telefono:</strong> {cliente.telefono ?? "—"}</li>
          <li><strong>Email:</strong> {cliente.email ?? "—"}</li>
          <li><strong>Codice fiscale:</strong> {cliente.codice_fiscale ?? "—"}</li>
        </ul>

        <button
          className="mt-2 text-sm underline"
          onClick={() => setEditing(true)}
        >
          ✏️ Modifica
        </button>
      </>
    );
  }

  return (
    <div className="space-y-2">
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <input
        className="border p-2 w-full"
        value={telefono}
        onChange={(e) => setTelefono(e.target.value)}
        placeholder="Telefono"
      />
      <input
        className="border p-2 w-full"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
      />

      <button
        className="bg-black text-white px-3 py-1"
        onClick={salva}
        disabled={loading}
      >
        Salva
      </button>
    </div>
  );
}
