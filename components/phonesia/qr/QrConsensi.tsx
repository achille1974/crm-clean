export default function QrConsensi() {
  return (
    <div style={{ fontSize: 14, display: "grid", gap: 8 }}>
      <label>
        <input type="checkbox" required /> Acconsento al trattamento dei dati
        personali.
      </label>

      <label>
        <input type="checkbox" /> Acconsento a ricevere comunicazioni promozionali.
      </label>

      <p style={{ fontSize: 13 }}>
        Informativa completa:{" "}
        <a href="/privacy" target="_blank">
          https://app.crm-supreme.it/privacy
        </a>
      </p>
    </div>
  );
}
