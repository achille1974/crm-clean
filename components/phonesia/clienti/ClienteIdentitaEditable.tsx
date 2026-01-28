"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function ClienteIdentitaEditable({
  cliente,
}: {
  cliente: any;
}) {
  const [editing, setEditing] = useState(false);
  const [telefono, setTelefono] = useState(cliente.telefono ?? "");
  const [email, setEmail] = useState(cliente.email ?? "");
  const [loading, setLoading] = useState(false);

  async function salva() {
    setLoading(true);

    await supabase
      .from("phonesia_clienti")
      .update({ telefono, email })
      .eq("id", cliente.id);

    setLoading(false);
    setEditing(false);
    location.reload();
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
