export default function QrSuccess() {
  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>
      <h1 style={{ fontSize: 26, fontWeight: 900 }}>
        Registrazione completata ✅
      </h1>

      <p>
        Grazie! La tua registrazione è avvenuta correttamente.
      </p>

      <p>
        📩 Ti abbiamo inviato un <b>SMS</b> per attivare il canale WhatsApp.
      </p>

      <p style={{ marginTop: 16 }}>
        Apri il messaggio ricevuto, clicca sul link e invia <b>OK</b>
        per completare l’attivazione.
      </p>

      <p style={{ marginTop: 24, fontSize: 14, opacity: 0.8 }}>
        Subito dopo riceverai il tuo biglietto digitale PHONESIA su WhatsApp.
      </p>
    </main>
  );
}