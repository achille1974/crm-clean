"use client";

import { useState } from "react";

type Props = {
  clienteId: number;
  clientePda?: string | null;
  telefono?: string | null;
  negozio: string;
};

export default function OperazioneManualeForm({
  clienteId,
  clientePda,
  telefono,
  negozio,
}: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setMsg(null);

    const form = e.currentTarget;
    const data = new FormData(form);

    const payload = {
      cliente_id: clienteId,
      cliente_pda: clientePda || null,
      telefono_riferimento: telefono || null,
      data_operazione: data.get("data_operazione"),
      negozio,
      servizio: data.get("servizio"),
      descrizione: data.get("descrizione"),
      promo: data.get("promo"),
      sottopromo: data.get("sottopromo"),
      operatore_negozio: data.get("operatore"),
    };

    const res = await fetch("/api/phonesia/operazioni-manuali", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const json = await res.json();

    if (!res.ok) {
      setMsg(json.error || "Errore");
    } else {
      setMsg("Operazione inserita");
      form.reset();
    }

    setLoading(false);
  }

  return (
    <div className="space-y-4">
      <button
        onClick={() => setOpen(!open)}
        className="text-sm underline"
      >
        {open ? "Chiudi" : "Aggiungi operazione"}
      </button>

      {open && (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-sm">Data operazione</label>
            <input
              type="datetime-local"
              name="data_operazione"
              required
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div>
            <label className="block text-sm">Servizio</label>
            <input
              type="text"
              name="servizio"
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div>
            <label className="block text-sm">Descrizione *</label>
            <textarea
              name="descrizione"
              required
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div>
            <label className="block text-sm">Promo</label>
            <input
              type="text"
              name="promo"
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div>
            <label className="block text-sm">Sottopromo</label>
            <input
              type="text"
              name="sottopromo"
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <div>
            <label className="block text-sm">Operatore</label>
            <input
              type="text"
              name="operatore"
              className="border rounded px-2 py-1 w-full"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="border px-3 py-1 rounded"
          >
            {loading ? "Salvataggio..." : "Salva"}
          </button>

          {msg && <p className="text-sm">{msg}</p>}
        </form>
      )}
    </div>
  );
}
