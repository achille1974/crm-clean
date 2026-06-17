import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy | Beltrami 1876",
};

export default function BeltramiPrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900 md:py-12">
      <article className="mx-auto max-w-3xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm md:p-9">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          Beltrami 1876
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          Informativa privacy
        </h1>

        <div className="mt-6 space-y-5 text-sm leading-relaxed text-slate-700">
          <p>
            Questa pagina contiene un testo operativo provvisorio per il flusso
            di registrazione clienti Beltrami 1876.
          </p>
          <p>
            I dati raccolti tramite il form sono utilizzati per registrare la
            richiesta del cliente, gestire i servizi indicati e inviare
            comunicazioni WhatsApp relative a pratiche, assistenza e scadenze.
          </p>
          <p>
            I dati trattati possono includere nome, cognome, telefono WhatsApp,
            email, codice fiscale, servizio di interesse, note e consensi
            prestati.
          </p>
          <p>
            Il consenso al contatto WhatsApp e richiesto per ricevere
            comunicazioni operative sui servizi e sulle scadenze collegate.
          </p>
          <p>
            Il testo definitivo dovra essere verificato e completato dal
            titolare o dal consulente privacy prima dell&apos;uso produttivo.
          </p>
        </div>
      </article>
    </main>
  );
}
