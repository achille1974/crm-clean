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
        Acconsento al trattamento dei dati personali.
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
          https://app.crm-supreme.it/phonesia/privacy
        </a>
      </p>
    </div>
  );
}
