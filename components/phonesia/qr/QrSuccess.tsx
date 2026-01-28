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
        📲 Per ricevere il nostro messaggio di benvenuto su WhatsApp
        con il biglietto da visita digitale,
        <b> devi confermare aprendo WhatsApp</b>.
      </p>

      <p style={{ marginTop: 20 }}>
        👉 <b>Clicca qui e scrivici OK su WhatsApp</b>
      </p>

      <a
        href="https://wa.me/393473214561?text=OK"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: "inline-block",
          marginTop: 12,
          padding: "12px 18px",
          backgroundColor: "#25D366",
          color: "#fff",
          fontWeight: 700,
          borderRadius: 8,
          textDecoration: "none",
        }}
      >
        Apri WhatsApp
      </a>

      <p style={{ marginTop: 24, fontSize: 14, opacity: 0.8 }}>
        Dopo aver scritto <b>OK</b>, riceverai automaticamente
        il messaggio di benvenuto da Phonesia.
      </p>
    </main>
  );
}
