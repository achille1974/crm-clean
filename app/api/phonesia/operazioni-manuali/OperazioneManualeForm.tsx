"use client";

import { useState } from "react";

type Props = {
  clienteId: string;
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
    <div style={{ marginTop: 20 }}>
      <button onClick={() => setOpen(!open)}>
        {open ? "Chiudi" : "Aggiungi operazione"}
      </button>

      {open && (
        <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
          <div>
            <label>Data operazione</label><br />
            <input
              type="datetime-local"
              name="data_operazione"
              required
            />
          </div>

          <div>
            <label>Servizio</label><br />
            <input type="text" name="servizio" />
          </div>

          <div>
            <label>Descrizione *</label><br />
            <textarea name="descrizione" required />
          </div>

          <div>
            <label>Promo</label><br />
            <input type="text" name="promo" />
          </div>

          <div>
            <label>Sottopromo</label><br />
            <input type="text" name="sottopromo" />
          </div>

          <div>
            <label>Operatore</label><br />
            <input type="text" name="operatore" />
          </div>

          <br />
          <button type="submit" disabled={loading}>
            {loading ? "Salvataggio..." : "Salva operazione"}
          </button>

          {msg && <p>{msg}</p>}
        </form>
      )}
    </div>
  );
}
