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
        📲 Ti abbiamo appena inviato un messaggio di benvenuto su
        <b> WhatsApp</b> con il tuo biglietto da visita digitale Phonesia.
      </p>

      <p style={{ marginTop: 16 }}>
        Apri WhatsApp e rispondi <b>OK</b> al messaggio ricevuto
        per attivare il canale di comunicazione.
      </p>

      <p style={{ marginTop: 24, fontSize: 14, opacity: 0.8 }}>
        Non serve cliccare nessun pulsante: il messaggio è già stato inviato.
      </p>
    </main>
  );
}
