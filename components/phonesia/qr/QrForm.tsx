"use client";

import { useState } from "react";
import Image from "next/image";
import { supabase } from "../../../lib/supabaseClient";
import {
  registraPrivacyAccepted,
  registraMarketingAccepted,
} from "../../../lib/phonesia";

import QrConsensi from "./QrConsensi";

const NEGOZI: Record<number, string> = {
  1: "Floridia",
  2: "Augusta",
  3: "Siracusa",
  4: "Avola",
  5: "Tabacchino Floridia",
};

export default function QrForm({
  negozioId,
}: {
  negozioId: number;
}) {
  const nomeNegozio = NEGOZI[negozioId] || "Negozio";
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

    if (!/^[0-9]{9,10}$/.test(telefonoRaw)) {
      alert("Inserisci un numero di telefono valido.");
      setLoading(false);
      return;
    }

    const telefonoFormatted = `+39${telefonoRaw}`;

    const { data: clienteEsistente, error: searchError } = await supabase
      .from("phonesia_clienti")
      .select("*")
      .eq("telefono", telefonoFormatted)
      .single();

    if (searchError && searchError.code !== "PGRST116") {
      console.error("Errore ricerca cliente:", searchError);
      alert("Errore durante la verifica del cliente");
      setLoading(false);
      return;
    }

    let clienteFinale = clienteEsistente;

    if (clienteEsistente) {
      const { error: updateError } = await supabase
        .from("phonesia_clienti")
        .update({
          nome: data.get("nome"),
          cognome: data.get("cognome"),
          email: data.get("email") || null,
          codice_fiscale: data.get("codice_fiscale"),
          negozio_id: negozioId,
        })
        .eq("id", clienteEsistente.id);

      if (updateError) {
        console.error("Errore aggiornamento cliente:", updateError);
        alert("Errore aggiornamento cliente");
        setLoading(false);
        return;
      }

      clienteFinale = clienteEsistente;
    } else {
      const { data: nuovoCliente, error: insertError } = await supabase
        .from("phonesia_clienti")
        .insert({
          nome: data.get("nome"),
          cognome: data.get("cognome"),
          telefono: telefonoFormatted,
          email: data.get("email") || null,
          codice_fiscale: data.get("codice_fiscale"),
          qr_id: "phonesia_qr",
          negozio_id: negozioId,
        })
        .select()
        .single();

      if (insertError || !nuovoCliente) {
        console.error("Errore creazione cliente:", insertError);
        alert("Errore durante la registrazione del cliente");
        setLoading(false);
        return;
      }

      clienteFinale = nuovoCliente;
    }

    if (!clienteFinale) {
      alert("Errore imprevisto nella registrazione.");
      setLoading(false);
      return;
    }

    const { error: errConsenso } = await registraPrivacyAccepted({
      cliente_id: clienteFinale.id,
      qr_id: "phonesia_qr",
    });

    if (errConsenso) {
      console.error("Errore consenso:", errConsenso);
      alert("Errore durante la registrazione del consenso");
      setLoading(false);
      return;
    }

    if (marketingAccepted) {
      await registraMarketingAccepted({
        cliente_id: clienteFinale.id,
        qr_id: "phonesia_qr",
        negozio_id: negozioId,
      });
    }

/* ===============================
   CLIENTE CON TELEGRAM GIÀ ATTIVO
   =============================== */

if (clienteFinale.telegram_active) {
  setLoading(false);

  window.location.href =
    `/phonesia/welcome?id=${clienteFinale.id}`;

  return;
}

/* ===============================
   REDIRECT TELEGRAM BOT
   =============================== */

const telegramBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

if (!telegramBot) {
  alert("Errore configurazione Telegram.");
  setLoading(false);
  return;
}

setLoading(false);

window.location.href =
  `https://t.me/${telegramBot}?start=${clienteFinale.id}`;

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

      <h1 style={{ fontSize: 26, fontWeight: 900, marginBottom: 4 }}>
       Registrazione PHONESIA
      </h1>

      <p style={{ fontWeight: 700, marginBottom: 16 }}>
  	{nomeNegozio}
      </p>      

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>

	<div style={{ display: "flex", alignItems: "center", border: "1px solid #ccc", padding: "10px" }}>
  <span style={{ marginRight: 8 }}>👤</span>
  <input
    name="nome"
    placeholder="Nome"
    required
    style={{ border: "none", outline: "none", flex: 1 }}
  />
</div>

<div style={{ display: "flex", alignItems: "center", border: "1px solid #ccc", padding: "10px" }}>
  <span style={{ marginRight: 8 }}>👤</span>
  <input
    name="cognome"
    placeholder="Cognome"
    required
    style={{ border: "none", outline: "none", flex: 1 }}
  />
</div>

<div style={{ display: "flex", alignItems: "center", border: "1px solid #ccc", padding: "10px" }}>
  <span style={{ marginRight: 8 }}>🪪</span>
  <input
    name="codice_fiscale"
    placeholder="Codice Fiscale"
    required
    style={{ border: "none", outline: "none", flex: 1 }}
  />
</div>

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

	<div style={{ display: "flex", alignItems: "center", border: "1px solid #ccc", padding: "10px" }}>
  <span style={{ marginRight: 8 }}>📧</span>
  <input
    name="email"
    placeholder="Email (facoltativa)"
    style={{ border: "none", outline: "none", flex: 1 }}
  />
</div>

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
    marginTop: 16,
    padding: "14px",
    fontSize: "18px",
    fontWeight: "bold",
    background: "#ff7a00",
    color: "white",
    border: "none",
    borderRadius: "6px",
    cursor: loading || !privacyAccepted ? "not-allowed" : "pointer",
    opacity: loading || !privacyAccepted ? 0.6 : 1
  }}
>
  {loading ? "Invio..." : "Registrati"}
</button>
      
    {loading ? "Invio..." : "Registrati"}
        </button>
      </form>
    </main>
  );
}
