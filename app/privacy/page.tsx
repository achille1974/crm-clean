export const dynamic = "force-static";

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 820, margin: "0 auto", padding: 24, lineHeight: 1.6 }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 16 }}>
        Informativa sulla Privacy
      </h1>

      <p><b>Versione:</b> v1.0</p>

      <h2>Titolare del trattamento</h2>
      <p>PHONESIA / Supreme – Progetto CRM.</p>

      <h2>Dati trattati</h2>
      <p>
        Nome, cognome, codice fiscale, numero di telefono, indirizzo email e ogni
        altro dato fornito volontariamente dall’utente.
      </p>

      <h2>Finalità del trattamento</h2>
      <ul>
        <li>Registrazione del contatto nel sistema CRM;</li>
        <li>Gestione delle comunicazioni di servizio;</li>
        <li>Adempimento di obblighi di legge.</li>
      </ul>
      <p>
        Previo consenso facoltativo, i dati potranno essere utilizzati anche per
        comunicazioni informative e promozionali.
      </p>

      <h2>Base giuridica</h2>
      <p>
        Consenso dell’interessato e/o esecuzione di richieste precontrattuali o
        contrattuali.
      </p>

      <h2>Modalità di trattamento</h2>
      <p>
        I dati sono trattati con strumenti informatici nel rispetto del GDPR
        (Reg. UE 2016/679).
      </p>

      <h2>Conservazione</h2>
      <p>
        I dati sono conservati per il tempo necessario alle finalità indicate o
        fino a revoca del consenso.
      </p>

      <h2>Diritti dell’interessato</h2>
      <p>
        L’utente può esercitare i diritti di accesso, rettifica, cancellazione,
        limitazione, opposizione e portabilità.
      </p>

      <h2>Contatti</h2>
      <p>Email: <a href="mailto:assistenza@phonesia.it">assistenza@phonesia.it</a></p>
    </main>
  );
}
