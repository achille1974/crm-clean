type Props = {
  privacyAccepted: boolean;
  onPrivacyChange: (value: boolean) => void;
  marketingAccepted: boolean;
  onMarketingChange: (value: boolean) => void;
};

export default function QrConsensi({
  privacyAccepted,
  onPrivacyChange,
  marketingAccepted,
  onMarketingChange,
}: Props) {
  return (
    <div className="space-y-4 rounded-[24px] border border-slate-200 bg-slate-50 p-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={privacyAccepted}
            onChange={(e) => onPrivacyChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />

          <div className="text-sm leading-relaxed text-slate-700">
            <div className="font-semibold text-slate-900">
              Confermo di aver letto l’informativa privacy
            </div>

            <p className="mt-1">
              Dichiaro di aver letto e compreso l’informativa privacy e autorizzo
              il trattamento dei miei dati per le finalità necessarie alla
              registrazione, alla gestione del rapporto con PHONESIA e alle
              comunicazioni di servizio.
            </p>

            <p className="mt-2">
              Informativa completa:{" "}
              <a
                href="/phonesia/privacy"
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-orange-600 underline underline-offset-4"
              >
                QUI
              </a>
            </p>

            <p className="mt-2 text-slate-500">
              Questo passaggio è necessario per completare la registrazione.
            </p>
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-[0_8px_24px_rgba(249,115,22,0.08)]">
        <div className="mb-3 inline-flex rounded-full border border-orange-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-700">
          Offerte e vantaggi personalizzati
        </div>

        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={marketingAccepted}
            onChange={(e) => onMarketingChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />

          <div className="text-sm leading-relaxed text-slate-700">
            <div className="font-semibold text-slate-900">
              Sì, desidero ricevere offerte commerciali e comunicazioni promozionali
            </div>

            <p className="mt-1">
              Potremo inviarti solo comunicazioni utili e pertinenti ai tuoi servizi,
              come proposte per risparmiare, migliorare la tua offerta o attivare
              servizi che ti mancano.
            </p>

            <div className="mt-3 rounded-2xl border border-orange-100 bg-white/80 p-3">
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Esempi di comunicazioni
              </div>

              <ul className="mt-2 space-y-1.5 text-sm text-slate-700">
                <li>• offerte per abbassare la spesa mensile</li>
                <li>• promo su mobile, fisso o energia</li>
                <li>• vantaggi e opportunità riservati ai clienti registrati</li>
              </ul>
            </div>

            <p className="mt-3 text-slate-500">
              Consenso facoltativo. Puoi registrarti anche senza attivarlo e
              potrai revocarlo in qualsiasi momento in modo semplice.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
