"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";
import { registraPrivacyAccepted } from "../../../lib/phonesia";

import QrConsensi from "./QrConsensi";
import QrSuccess from "./QrSuccess";

export default function QrForm({
  negozioId,
}: {
  negozioId: number;
}) {

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    const form = e.currentTarget;
    const data = new FormData(form);

    /* ===============================
       1️⃣ INSERIMENTO CLIENTE
       =============================== */
    const { data: cliente, error: errCliente } = await supabase
      .from("phonesia_clienti")
      .insert({
        nome: data.get("nome"),
        cognome: data.get("cognome"),
        telefono: data.get("telefono"),
        email: data.get("email"),
        codice_fiscale: data.get("codice_fiscale"),
        qr_id: "phonesia_qr",
      })
      .select()
      .single();

    if (errCliente || !cliente) {
      console.error("Errore cliente:", errCliente);
      alert("Errore durante la registrazione del cliente");
      setLoading(false);
      return;
    }

    /* ===============================
       2️⃣ EVENTO CONSENSO PRIVACY
       =============================== */
    const { error: errConsenso } = await registraPrivacyAccepted({
      cliente_id: cliente.id,
      qr_id: "phonesia_qr",
    });

    if (errConsenso) {
      console.error("Errore consenso:", errConsenso);
      alert("Errore durante la registrazione del consenso");
      setLoading(false);
      return;
    }

    /* ===============================
       3️⃣ CHIAMATA API SERVER (WELCOME)
       =============================== */
    try {
      await fetch("/api/phonesia/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente.id,
          telefono: cliente.telefono,
        }),
      });
    } catch (err) {
      console.error("Errore chiamata API welcome:", err);
      // NON blocchiamo il flusso: cliente e consenso sono validi
    }

    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return <QrSuccess />;
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>
      {/* LOGO PHONESIA */}
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
        <Image
          src="/phonesia/Logo_Phonesia-1.png"
          alt="PHONESIA"
          width={180}
          height={70}
          priority
          style={{ objectFit: "contain" }}
        />
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 12 }}>
        Registrazione PHONESIA
      </h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <input name="nome" placeholder="Nome" required />
        <input name="cognome" placeholder="Cognome" required />
        <input name="codice_fiscale" placeholder="Codice Fiscale" required />
        <input
          name="telefono"
          placeholder="Telefono"
          defaultValue="+39"
          required
        />
        <input name="email" placeholder="Email (facoltativa)" />

        <QrConsensi />

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: 10,
            fontWeight: 900,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Invio..." : "Registrati"}
        </button>
      </form>
    </main>
  );
}
