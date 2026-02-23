"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";
import {
  registraPrivacyAccepted,
  registraMarketingAccepted,
} from "../../../lib/phonesia";

import QrConsensi from "./QrConsensi";
import QrSuccess from "./QrSuccess";

export default function QrForm({
  negozioId,
}: {
  negozioId: number;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    if (!privacyAccepted) {
      alert("Devi accettare la Privacy Policy per continuare.");
      setLoading(false);
      return;
    }

    const form = e.currentTarget;
    const data = new FormData(form);

    const telefonoRaw = String(data.get("telefono") || "").trim();

    // Validazione numero italiano (9-10 cifre)
    if (!/^[0-9]{9,10}$/.test(telefonoRaw)) {
      alert("Inserisci un numero di telefono valido.");
      setLoading(false);
      return;
    }

    const telefonoFormatted = `+39${telefonoRaw}`;

    /* ===============================
       1️⃣ INSERIMENTO CLIENTE
       =============================== */
    const { data: cliente, error: errCliente } = await supabase
      .from("phonesia_clienti")
      .insert({
        nome: data.get("nome"),
        cognome: data.get("cognome"),
        telefono: telefonoFormatted,
        email: data.get("email"),
        codice_fiscale: data.get("codice_fiscale"),
        qr_id: "phonesia_qr",
        negozio_id: negozioId,
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
       2️⃣ BIS — CONSENSO MARKETING
       =============================== */
    if (marketingAccepted) {
      await registraMarketingAccepted({
        cliente_id: cliente.id,
        qr_id: "phonesia_qr",
        negozio_id: negozioId,
      });
    }

    /* ===============================
       3️⃣ CHIAMATA API SERVER (WELCOME → SMS)
       =============================== */
    try {
      await fetch("https://crm-clean.vercel.app/api/phonesia/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cliente_id: cliente.id,
          telefono: telefonoFormatted,
        }),
      });
    } catch (err) {
      console.error("Errore chiamata API welcome:", err);
    }

    setLoading(false);
    setSubmitted(true);
  }

  if (submitted) {
    return <QrSuccess />;
  }

  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>
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

        {/* TELEFONO CON +39 BLOCCATO */}
        <div style={{ display: "flex" }}>
          <span
            style={{
              padding: "10px",
              background: "#eee",
              border: "1px solid #ccc",
              borderRight: "none",
              display: "flex",
              alignItems: "center",
            }}
          >
            +39
          </span>

          <input
            name="telefono"
            type="tel"
            placeholder="3331234567"
            pattern="[0-9]{9,10}"
            required
            style={{
              flex: 1,
              border: "1px solid #ccc",
              padding: "10px",
            }}
          />
        </div>

        <input name="email" placeholder="Email (facoltativa)" />

        <QrConsensi
          privacyAccepted={privacyAccepted}
          onPrivacyChange={setPrivacyAccepted}
          marketingAccepted={marketingAccepted}
          onMarketingChange={setMarketingAccepted}
        />

        <button
          type="submit"
          disabled={loading || !privacyAccepted}
          style={{
            marginTop: 10,
            fontWeight: 900,
            opacity: loading || !privacyAccepted ? 0.6 : 1,
            cursor: loading || !privacyAccepted ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Invio..." : "Registrati"}
        </button>
      </form>
    </main>
  );
}