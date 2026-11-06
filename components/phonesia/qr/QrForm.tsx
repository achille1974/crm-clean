"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { browserQrOutbox } from "@/lib/phonesia/qr-browser-storage";
import { sendQrSubmission } from "@/lib/phonesia/qr-outbox";
import type { PendingQr, QrAttempt, QrSubmission } from "@/lib/phonesia/qr-outbox";

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
  src = null,
}: {
  negozioId: number;
  src?: string | null;
}) {
  const nomeNegozio = NEGOZI[negozioId] || "Negozio";

  const [loading, setLoading] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [marketingAccepted, setMarketingAccepted] = useState(false);
  const [pending, setPending] = useState<PendingQr[]>([]);
  const [notice, setNotice] = useState("");
  const [storageUnavailable, setStorageUnavailable] = useState(false);
  const [heldId, setHeldId] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const activeId = useRef<string | null>(null);
  const editingId = useRef<string | undefined>(undefined);
  const busy = useRef(false);

  const refreshPending = useCallback(async () => {
    try {
      const entries = await browserQrOutbox().list();
      setPending(entries); setStorageUnavailable(false);
      if (activeId.current && !entries.some((entry) => entry.id === activeId.current)) {
        activeId.current = null; setHeldId(null);
      }
      return entries;
    } catch { setStorageUnavailable(true); return []; }
  }, []);

  const reportAttempt = useCallback((result: QrAttempt) => {
    if (result.state === "saved") {
      if (activeId.current === result.id) window.location.href = "/phonesia/welcome";
      else setNotice("Una registrazione in attesa è stata confermata dal sistema.");
    } else if (result.state === "review") {
      setNotice(result.message || "Un modulo richiede una verifica. Usa «Riprendi modulo» per correggerlo.");
    } else if (result.state === "waiting") {
      setNotice("Invio in attesa di conferma. Il modulo è conservato su questo dispositivo per 72 ore. Riproveremo con la pagina aperta, anche dopo averla riaperta.");
    }
  }, []);

  const retryPending = useCallback(async (force = false) => {
    if (busy.current || !navigator.onLine) return;
    busy.current = true;
    try {
      const entries = await refreshPending();
      const due = entries.filter((entry) => !entry.needsReview && (entry.nextAttemptAt <= Date.now()
        || (force && entry.lastStatus !== 429))).slice(0, 5);
      if (due.length) setLoading(true);
      for (const entry of due) reportAttempt(await browserQrOutbox().attempt(entry.id, force));
      await refreshPending();
    } catch { setNotice("Gli invii restano in attesa. Riprova tra poco senza cancellare i dati del browser."); }
    finally { busy.current = false; setLoading(false); }
  }, [refreshPending, reportAttempt]);

  useEffect(() => {
    const retry = () => { void retryPending(); };
    void refreshPending().then(retry);
    const timer = window.setInterval(retry, 30_000);
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("online", retry);
      window.removeEventListener("focus", retry);
    };
  }, [refreshPending, retryPending]);

  function clearForm() {
    activeId.current = null; editingId.current = undefined; setHeldId(null);
    formRef.current?.reset(); setPrivacyAccepted(false); setMarketingAccepted(false);
    setNotice("");
  }

  async function resumeForm(entry: PendingQr) {
    if (busy.current) return;
    busy.current = true; setLoading(true);
    try {
      const payload = await browserQrOutbox().resumeForEditing(entry.id, negozioId);
      activeId.current = null; editingId.current = entry.id; setHeldId(null);
      for (const name of ["nome", "cognome", "telefono", "email", "codice_fiscale"] as const) {
        const input = formRef.current?.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = payload[name];
      }
      setPrivacyAccepted(payload.privacy_accepted); setMarketingAccepted(payload.marketing_accepted);
      setNotice("Controlla i dati e premi «Completa registrazione». L’invio automatico di questo modulo è sospeso durante la modifica.");
      await refreshPending();
    } catch { setNotice("Impossibile riaprire questo modulo. I dati conservati non sono stati cancellati."); }
    finally { busy.current = false; setLoading(false); }
  }

  async function deletePending(id: string) {
    if (busy.current || !window.confirm("Eliminare questo modulo dal dispositivo? Non sarà più possibile reinviarlo da qui.")) return;
    busy.current = true; setLoading(true);
    try {
      await browserQrOutbox().remove(id);
      if (activeId.current === id || editingId.current === id) clearForm();
      await refreshPending();
    } catch { setNotice("Il modulo non è stato eliminato. Riprova."); }
    finally { busy.current = false; setLoading(false); }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy.current || heldId) return;
    if (!privacyAccepted) {
      alert("Devi confermare di aver letto l’informativa privacy per continuare.");
      return;
    }
    const data = new FormData(e.currentTarget);
    const payload: QrSubmission = {
      nome: String(data.get("nome") || "").trim(), cognome: String(data.get("cognome") || "").trim(),
      telefono: String(data.get("telefono") || "").trim(), email: String(data.get("email") || "").trim(),
      codice_fiscale: String(data.get("codice_fiscale") || "").trim(), negozio_id: negozioId,
      privacy_accepted: privacyAccepted, marketing_accepted: marketingAccepted,
      ...(src ? { src } : {}),
    };
    busy.current = true; setLoading(true); setNotice("");
    try {
      let id: string;
      try {
        id = await browserQrOutbox().enqueue(payload, editingId.current);
        setStorageUnavailable(false);
      } catch {
        // Storage is optional: do not block a working server on private/limited browsers.
        setStorageUnavailable(true);
        const result = await sendQrSubmission(payload);
        if (result.saved) window.location.href = "/phonesia/welcome";
        else setNotice(`${result.message || "Invio non confermato."} Non è stato possibile conservare il modulo: mantieni questa pagina aperta e riprova.`);
        return;
      }
      activeId.current = id; editingId.current = undefined; setHeldId(id);
      reportAttempt(await browserQrOutbox().attempt(id, true));
      await refreshPending();
    } catch {
      setNotice(activeId.current
        ? "Invio non confermato. Il modulo è conservato su questo dispositivo; riapri questa pagina per riprovare."
        : "Invio non confermato e salvataggio sul dispositivo non disponibile. Mantieni questa pagina aperta e riprova.");
    } finally {
      busy.current = false; setLoading(false);
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
                {notice && <p role="status" aria-live="polite" className="mb-5 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm leading-relaxed">{notice}</p>}
                {storageUnavailable && <p className="mb-5 text-sm text-amber-800">Il browser non consente il salvataggio temporaneo. Mantieni la pagina aperta fino alla conferma dell’invio.</p>}
                <form ref={formRef} onSubmit={handleSubmit}>
                  <fieldset disabled={loading || Boolean(heldId)} className="space-y-5 disabled:opacity-70">
                  <InputField label="Nome" name="nome" maxLength={100} required />
                  <InputField label="Cognome" name="cognome" maxLength={100} required />
                  <InputField label="Codice Fiscale" name="codice_fiscale" maxLength={16} pattern="[A-Z0-9]{16}|[0-9]{11}" uppercase required />

                  <div>
                    <label htmlFor="qr-telefono" className="mb-2 block text-sm font-medium text-slate-600">
                      Numero di telefono
                    </label>

                    <div className="flex overflow-hidden rounded-2xl border border-slate-300 bg-white">
                      <span className="border-r bg-slate-50 px-4 py-3">+39</span>
                      <input
                        name="telefono"
                        id="qr-telefono"
                        type="tel"
                        pattern="[0-9]{9,10}"
                        maxLength={10}
                        autoComplete="tel-national"
                        required
                        className="w-full px-4 py-3 outline-none"
                      />
                    </div>
                  </div>

                  <InputField label="Email" name="email" type="email" maxLength={254} />

                  <QrConsensi
                    privacyAccepted={privacyAccepted}
                    onPrivacyChange={setPrivacyAccepted}
                    marketingAccepted={marketingAccepted}
                    onMarketingChange={setMarketingAccepted}
                  />

                  <button
                    type="submit"
                    disabled={loading || Boolean(heldId)}
                    className="w-full rounded-xl bg-orange-500 py-3 text-white"
                  >
                    {loading ? "Invio in corso…" : heldId ? "In attesa di conferma" : "Completa registrazione"}
                  </button>
                  <p className="text-xs leading-relaxed text-slate-500">Quando premi il pulsante, conserviamo una copia cifrata sul dispositivo fino alla conferma dell’invio, per un massimo di 72 ore. Per riprovare serve riaprire questa pagina e avere una connessione. I moduli scaduti vengono rimossi alla riapertura.</p>
                  </fieldset>
                </form>
                {pending.length > 0 && <section aria-label="Registrazioni in attesa" className="mt-6 space-y-3 border-t border-slate-200 pt-5">
                  <h2 className="font-semibold">Invii in attesa su questo dispositivo: {pending.length}</h2>
                  <p className="text-sm text-slate-600">La registrazione è completata solo dopo la conferma del sistema. Non cancellare i dati del browser mentre ci sono invii in attesa.</p>
                  <button type="button" disabled={loading} onClick={() => void retryPending(true)} className="rounded-xl border border-orange-300 px-4 py-2 text-sm font-semibold text-orange-700 disabled:opacity-50">Riprova invii in attesa</button>
                  {pending.map((entry) => <div key={entry.id} className="rounded-xl bg-slate-50 p-3 text-sm">
                    <p>{NEGOZI[entry.storeId] || "Punto vendita"} · {new Date(entry.createdAt).toLocaleString("it-IT")} · {entry.needsReview ? "Da verificare" : "In attesa"}</p>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {entry.storeId === negozioId && <button type="button" disabled={loading} onClick={() => void resumeForm(entry)} className="font-semibold text-orange-700 underline">Riprendi modulo</button>}
                      <button type="button" disabled={loading} onClick={() => void deletePending(entry.id)} className="text-slate-500 underline">Elimina dal dispositivo</button>
                    </div>
                  </div>)}
                  <button type="button" disabled={loading} onClick={clearForm} className="rounded-xl border border-slate-300 px-4 py-2 text-sm">Registra un altro cliente</button>
                </section>}
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
  type = "text",
  maxLength,
  pattern,
}: {
  label: string;
  name: string;
  required?: boolean;
  uppercase?: boolean;
  type?: "text" | "email";
  maxLength?: number;
  pattern?: string;
}) {
  return (
    <div>
      <label htmlFor={`qr-${name}`} className="mb-2 block text-sm">{label}</label>
      <input
        id={`qr-${name}`}
        name={name}
        type={type}
        maxLength={maxLength}
        pattern={pattern}
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
