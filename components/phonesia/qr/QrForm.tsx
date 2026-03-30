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

    if (clienteFinale.telegram_active) {
      setLoading(false);
      window.location.href = `/phonesia/welcome?id=${clienteFinale.id}`;
      return;
    }

    const telegramBot = process.env.NEXT_PUBLIC_TELEGRAM_BOT;

    if (!telegramBot) {
      alert("Errore configurazione Telegram.");
      setLoading(false);
      return;
    }

    setLoading(false);

    window.location.href = `https://t.me/${telegramBot}?start=${clienteFinale.id}`;
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto w-full max-w-5xl px-5 py-8 md:px-8 md:py-12">
        <section className="overflow-hidden rounded-[36px] border border-slate-200 bg-white shadow-[0_10px_40px_rgba(15,23,42,0.06)]">
          <div className="relative px-6 py-10 md:px-10 md:py-14">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(249,115,22,0.10),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.05),transparent_30%)]" />

            <div className="relative">
              <div className="mb-6 flex justify-center">
                <Image
                  src="/phonesia/Logo_Phonesia-1.png"
                  alt="PHONESIA"
                  width={300}
                  height={100}
                  priority
                  className="h-auto w-[230px] md:w-[300px]"
                />
              </div>

              <div className="mx-auto mb-6 max-w-max rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
                Registrazione cliente
              </div>

              <div className="mx-auto max-w-3xl text-center">
                <h1 className="mb-4 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
                  Completa la tua registrazione
                </h1>

                <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-700 md:text-lg">
                  Registrati per restare in contatto con il tuo punto vendita{" "}
                  <strong>PHONESIA {nomeNegozio.toUpperCase()}</strong> e ricevere
                  assistenza, comunicazioni utili e supporto diretto.
                </p>
              </div>

              <div className="mx-auto mt-10 max-w-3xl rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                <div className="mb-6">
                  <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Punto vendita
                  </div>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
                    PHONESIA {nomeNegozio.toUpperCase()}
                  </h2>
                  <p className="mt-2 text-sm text-slate-600 md:text-base">
                    Inserisci i tuoi dati per completare la registrazione.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <InputField
                    label="Nome"
                    name="nome"
                    placeholder="Inserisci il tuo nome"
                    required
                  />

                  <InputField
                    label="Cognome"
                    name="cognome"
                    placeholder="Inserisci il tuo cognome"
                    required
                  />

                  <InputField
                    label="Codice Fiscale"
                    name="codice_fiscale"
                    placeholder="Inserisci il tuo codice fiscale"
                    required
                  />

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      Numero di telefono
                    </label>

                    <div className="flex overflow-hidden rounded-2xl border border-slate-300 bg-white focus-within:border-orange-500">
                      <span className="inline-flex items-center border-r border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-700">
                        +39
                      </span>

                      <input
                        name="telefono"
                        type="tel"
                        placeholder="3331234567"
                        pattern="[0-9]{9,10}"
                        required
                        className="w-full px-4 py-3 text-sm text-slate-900 outline-none"
                      />
                    </div>
                  </div>

                  <InputField
                    label="Email"
                    name="email"
                    placeholder="Email (facoltativa)"
                  />

                  <QrConsensi
                    privacyAccepted={privacyAccepted}
                    onPrivacyChange={setPrivacyAccepted}
                    marketingAccepted={marketingAccepted}
                    onMarketingChange={setMarketingAccepted}
                  />

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={loading || !privacyAccepted}
                      className={[
                        "inline-flex w-full items-center justify-center rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition",
                        loading || !privacyAccepted
                          ? "cursor-not-allowed bg-orange-300"
                          : "bg-orange-500 hover:bg-orange-600",
                      ].join(" ")}
                    >
                      {loading ? "Registrazione in corso..." : "Completa registrazione"}
                    </button>
                  </div>

                  <p className="text-center text-xs leading-relaxed text-slate-500">
                    Dopo la registrazione verrai reindirizzato su Telegram per attivare
                    il tuo contatto diretto con PHONESIA.
                  </p>
                </form>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function InputField({
  label,
  name,
  placeholder,
  required = false,
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm font-medium text-slate-600">
        {label}
      </label>

      <input
        name={name}
        placeholder={placeholder}
        required={required}
        className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
      />
    </div>
  );
}
