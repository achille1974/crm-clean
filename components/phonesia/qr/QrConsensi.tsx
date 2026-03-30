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
              Acconsento al trattamento dei dati personali
            </div>

            <p className="mt-1">
              Dichiaro di aver letto e compreso l’informativa privacy e autorizzo
              il trattamento dei miei dati per le finalità connesse alla
              registrazione e alla gestione del rapporto con PHONESIA.
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
          </div>
        </label>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={marketingAccepted}
            onChange={(e) => onMarketingChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
          />

          <div className="text-sm leading-relaxed text-slate-700">
            <div className="font-semibold text-slate-900">
              Acconsento alle comunicazioni commerciali
            </div>

            <p className="mt-1">
              Accetto di ricevere aggiornamenti, offerte, promozioni e comunicazioni
              informative da parte di PHONESIA tramite i canali di contatto forniti.
            </p>

            <p className="mt-2 text-slate-500">
              Consenso facoltativo. Puoi registrarti anche senza attivarlo.
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
