"use client";

import { Suspense, useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";

export default function FeedbackPage() {
  return (
    <Suspense fallback={<FeedbackLoading />}>
      <FeedbackContent />
    </Suspense>
  );
}

function FeedbackLoading() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-5">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          Caricamento...
        </section>
      </div>
    </main>
  );
}

function InvalidFeedbackLink() {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-5">
        <section className="w-full rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
          <Image
            src="/phonesia/Logo_Phonesia-1.png"
            alt="PHONESIA"
            width={260}
            height={90}
            priority
            className="mx-auto mb-6 h-auto w-[220px]"
          />

          <h1 className="text-3xl font-black tracking-tight text-slate-950">
            Link feedback non valido
          </h1>

          <p className="mt-4 text-base leading-relaxed text-slate-700">
            Non riusciamo a collegare questo feedback a una scheda cliente.
            Per lasciare una recensione, usa il link ricevuto su WhatsApp oppure
            chiedi assistenza al punto vendita PHONESIA.
          </p>
        </section>
      </div>
    </main>
  );
}

function FeedbackContent() {
  const searchParams = useSearchParams();

  const clienteIdRaw = searchParams.get("cliente_id");
  const clienteId = clienteIdRaw ? Number(clienteIdRaw) : null;

  const [rating, setRating] = useState<number | null>(null);
  const [commento, setCommento] = useState("");
  const [ricontatto, setRicontatto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const validClienteId =
    typeof clienteId === "number" &&
    Number.isInteger(clienteId) &&
    clienteId > 0;

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!validClienteId) {
      alert("Link feedback non valido. Cliente non identificato.");
      return;
    }

    if (!rating) {
      alert("Seleziona un voto da 1 a 5.");
      return;
    }

    setLoading(true);

    const response = await fetch("/api/phonesia/feedback", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        cliente_id: clienteId,
        rating,
        commento: commento.trim() || null,
        ricontatto,
      }),
    });

    const result = await response.json().catch(() => null);

    setLoading(false);

    if (!response.ok || result?.ok === false) {
      console.error("Errore invio feedback:", result);
      alert(result?.message || "Errore durante l’invio del feedback. Riprova.");
      return;
    }

    setSent(true);
  }

  if (!validClienteId) {
    return <InvalidFeedbackLink />;
  }

  if (sent) {
    return (
      <main className="min-h-screen bg-[#f8fafc] text-slate-900">
        <div className="mx-auto flex min-h-screen max-w-2xl items-center px-5">
          <section className="w-full rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
            <Image
              src="/phonesia/Logo_Phonesia-1.png"
              alt="PHONESIA"
              width={260}
              height={90}
              priority
              className="mx-auto mb-6 h-auto w-[220px]"
            />

            <h1 className="text-3xl font-black tracking-tight text-slate-950">
              Grazie 💙
            </h1>

            <p className="mt-4 text-base leading-relaxed text-slate-700">
              Il tuo feedback è stato registrato correttamente.
              Ci aiuta a migliorare ogni giorno il servizio PHONESIA.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8fafc] text-slate-900">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 md:py-12">
        <section className="rounded-[36px] border border-slate-200 bg-white p-6 shadow-[0_10px_40px_rgba(15,23,42,0.06)] md:p-10">
          <div className="mb-8 text-center">
            <Image
              src="/phonesia/Logo_Phonesia-1.png"
              alt="PHONESIA"
              width={280}
              height={100}
              priority
              className="mx-auto mb-6 h-auto w-[230px]"
            />

            <div className="mx-auto mb-5 max-w-max rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-orange-700">
              Soddisfazione cliente
            </div>

            <h1 className="text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              Com’è andata la tua esperienza?
            </h1>

            <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-slate-700">
              Bastano pochi secondi. Il tuo parere ci aiuta a migliorare il servizio
              e a seguirti meglio.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-7">
            <div>
              <label className="mb-4 block text-sm font-semibold text-slate-700">
                Quanto sei soddisfatto del servizio ricevuto?
              </label>

              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setRating(value)}
                    className={[
                      "rounded-2xl border px-2 py-4 text-2xl font-black transition",
                      rating === value
                        ? "border-orange-500 bg-orange-500 text-white"
                        : "border-slate-200 bg-white text-slate-700 hover:border-orange-300",
                    ].join(" ")}
                  >
                    {value}
                  </button>
                ))}
              </div>

              <div className="mt-2 flex justify-between text-xs text-slate-500">
                <span>Poco soddisfatto</span>
                <span>Molto soddisfatto</span>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">
                Vuoi lasciarci un commento?{" "}
                <span className="font-normal">(facoltativo)</span>
              </label>

              <textarea
                value={commento}
                onChange={(e) => setCommento(e.target.value)}
                rows={4}
                placeholder="Scrivi qui il tuo commento..."
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-500"
              />
            </div>

            <label className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={ricontatto}
                onChange={(e) => setRicontatto(e.target.checked)}
                className="mt-1"
              />
              <span>
                Vorrei essere ricontattato da PHONESIA per ricevere assistenza o
                maggiori informazioni.
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              className={[
                "w-full rounded-2xl px-5 py-3.5 text-sm font-semibold text-white transition",
                loading
                  ? "cursor-not-allowed bg-orange-300"
                  : "bg-orange-500 hover:bg-orange-600",
              ].join(" ")}
            >
              {loading ? "Invio in corso..." : "Invia feedback"}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
