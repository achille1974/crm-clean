type QrConsensiProps = {
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
}: QrConsensiProps) {
  return (
    <div style={{ fontSize: 14, display: "grid", gap: 8 }}>
      <label>
        <input
          type="checkbox"
          checked={privacyAccepted}
          onChange={(e) => onPrivacyChange(e.target.checked)}
        />{" "}
        Acconsento al trattamento dei miei dati personali da parte di Phonesia
        per finalità di registrazione, contatto e assistenza, comunicazioni, incluso l’invio
        di un messaggio di benvenuto, tramite canali digitali, come descritto
        nell’informativa privacy.
      </label>

      <label>
        <input
          type="checkbox"
          checked={marketingAccepted}
          onChange={(e) => onMarketingChange(e.target.checked)}
        />{" "}
        Acconsento a ricevere comunicazioni promozionali.
      </label>

      <p style={{ fontSize: 13 }}>
        Informativa completa:{" "}
        <a
          href="/phonesia/privacy"
          target="_blank"
          rel="noopener noreferrer"
        >
          https://crm-clean.vercel.app/phonesia/privacy
        </a>
      </p>
    </div>
  );
}
