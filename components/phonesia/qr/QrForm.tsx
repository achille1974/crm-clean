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

type ClienteQrRow = {
  id: number;
  nome: string | null;
  cognome: string | null;
  telefono: string | null;
  email: string | null;
  codice_fiscale: string | null;
  negozio_id: number | null;
  qr_id: string | null;
};

function normalizeEmail(value: FormDataEntryValue | null): string | null {
  const email = String(value || "").trim().toLowerCase();
  return email || null;
}

function normalizeCodiceFiscale(value: FormDataEntryValue | null): string {
  return String(value || "").trim().toUpperCase();
}

function isDuplicateInsertError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as {
    code?: unknown;
    message?: unknown;
    details?: unknown;
  };

  const code = typeof record.code === "string" ? record.code : "";
  const message = typeof record.message === "string" ? record.message : "";
  const details = typeof record.details === "string" ? record.details : "";

  return (
    code === "23505" ||
    message.toLowerCase().includes("duplicate") ||
    details.toLowerCase().includes("already exists")
  );
}

async function findExistingCliente(params: {
  telefono: string;
  codiceFiscale: string;
  email: string | null;
}): Promise<ClienteQrRow | null> {
  const { data: byPhone, error: phoneError } = await supabase
    .from("phonesia_clienti")
    .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, qr_id")
    .eq("telefono", params.telefono)
    .limit(1);

  if (phoneError) {
    throw phoneError;
  }

  const phoneRows = (byPhone ?? []) as ClienteQrRow[];
  if (phoneRows[0]) {
    return phoneRows[0];
  }

  if (params.codiceFiscale) {
    const { data: byCf, error: cfError } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, qr_id")
      .ilike("codice_fiscale", params.codiceFiscale)
      .limit(1);

    if (cfError) {
      throw cfError;
    }

    const cfRows = (byCf ?? []) as ClienteQrRow[];
    if (cfRows[0]) {
      return cfRows[0];
    }
  }

  if (params.email) {
    const { data: byEmail, error: emailError } = await supabase
      .from("phonesia_clienti")
      .select("id, nome, cognome, telefono, email, codice_fiscale, negozio_id, qr_id")
      .ilike("email", params.email)
      .limit(1);

    if (emailError) {
      throw emailError;
    }

    const emailRows = (byEmail ?? []) as ClienteQrRow[];
    if (emailRows[0]) {
      return emailRows[0];
    }
  }

  return null;
}

export default function QrForm({
  negozioId,
}: {
  negozioId: number;
}) {
  const nomeNegozio = NEGOZI[negozioId] || "Negozio";

  const [loading, setLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);

  async function sendWelcome(clienteId: number | string) {
    const response = await fetch("/api/phonesia/whatsapp/send-welcome", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cliente_id: clienteId,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok || result?.ok === false) {
      console.error("Errore invio welcome WhatsApp:", result);
      throw new Error(result?.detail || result?.error || "Errore invio welcome WhatsApp");
    }

    return result;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    if (!privacyAccepted) {
      alert("Devi confermare di aver letto l’informativa privacy per continuare.");
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
    const codiceFiscale = normalizeCodiceFiscale(data.get("codice_fiscale"));
    const email = normalizeEmail(data.get("email"));

    try {
      const clienteEsistente = await findExistingCliente({
        telefono: telefonoFormatted,
        codiceFiscale,
        email,
      });

      if (clienteEsistente) {
        alert("Cliente già registrato");
        setLoading(false);
        return;
      }

      const { data: nuovoCliente, error: insertError } = await supabase
        .from("phonesia_clienti")
        .insert({
          nome: data.get("nome"),
          cognome: data.get("cognome"),
          telefono: telefonoFormatted,
          email,
          codice_fiscale: codiceFiscale,
          qr_id: "phonesia_qr",
          negozio_id: negozioId,
        })
        .select()
        .single();

      if (insertError || !nuovoCliente) {
        console.error("Errore creazione cliente:", insertError);

        if (isDuplicateInsertError(insertError)) {
          alert("Cliente già registrato");
        } else {
          alert("Errore durante la registrazione del cliente");
        }

        setLoading(false);
        return;
      }

      const { error: errConsenso } = await registraPrivacyAccepted({
        cliente_id: nuovoCliente.id,
        qr_id: "phonesia_qr",
      });

      if (errConsenso) {
        console.error("Errore consenso:", errConsenso);
        alert("Errore durante la registrazione del consenso");
        setLoading(false);
        return;
      }

      if (marketingAccepted) {
        const { error: marketingError } = await registraMarketingAccepted({
          cliente_id: nuovoCliente.id,
          qr_id: "phonesia_qr",
          negozio_id: negozioId,
        });

        if (marketingError) {
          console.error("Errore consenso marketing:", marketingError);
        }
      }

      try {
        await sendWelcome(nuovoCliente.id);
        setLoading(false);
        window.location.href = `/phonesia/welcome?id=${nuovoCliente.id}`;
      } catch (error) {
        console.error(error);
        alert(
          "Registrazione completata, ma non siamo riusciti a inviare il messaggio WhatsApp automatico.",
        );
        setLoading(false);
      }
    } catch (error) {
      console.error("Errore imprevisto registrazione QR:", error);
      alert("Errore imprevisto nella registrazione.");
      setLoading(false);
    }
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
                  <strong>PHONESIA {nomeNegozio.toUpperCase()}</strong>
                </p>
              </div>

              <div className="mx-auto mt-10 max-w-3xl rounded-[30px] border border-slate-200 bg-white p-5 shadow-sm md:p-8">
                <form onSubmit={handleSubmit} className="space-y-5">
                  <InputField label="Nome" name="nome" required />
                  <InputField label="Cognome" name="cognome" required />
                  <InputField label="Codice Fiscale" name="codice_fiscale" uppercase required />

                  <div>
                    <label className="mb-2 block text-sm font-medium text-slate-600">
                      Numero di telefono
                    </label>

                    <div className="flex overflow-hidden rounded-2xl border border-slate-300 bg-white">
                      <span className="border-r bg-slate-50 px-4 py-3">+39</span>
                      <input
                        name="telefono"
                        type="tel"
                        required
                        className="w-full px-4 py-3 outline-none"
                      />
                    </div>
                  </div>

                  <InputField label="Email" name="email" />

                  <QrConsensi
                    privacyAccepted={privacyAccepted}
                    onPrivacyChange={setPrivacyAccepted}
                    marketingAccepted={marketingAccepted}
                    onMarketingChange={setMarketingAccepted}
                  />

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full rounded-xl bg-orange-500 py-3 text-white"
                  >
                    {loading ? "..." : "Completa registrazione"}
                  </button>
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
  required = false,
  uppercase = false,
}: {
  label: string;
  name: string;
  required?: boolean;
  uppercase?: boolean;
}) {
  return (
    <div>
      <label className="mb-2 block text-sm">{label}</label>
      <input
        name={name}
        required={required}
        onInput={(e) => {
          if (uppercase) {
            e.currentTarget.value = e.currentTarget.value.toUpperCase();
          }
        }}
        className="w-full rounded-xl border px-4 py-3"
      />
    </div>
  );
}
