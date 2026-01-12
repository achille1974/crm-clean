export const dynamic = "force-static";

export default function PhonesiaPrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 820,
        margin: "0 auto",
        padding: 24,
        lineHeight: 1.6,
      }}
    >
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 16 }}>
        Informativa Privacy – PHONESIA
      </h1>

      <p><b>Versione:</b> v1.0</p>

      <h2>Titolare del trattamento</h2>
      <p>
        Il Titolare del trattamento dei dati è <b>PHONESIA</b>, nell’ambito delle
        attività svolte presso i propri punti vendita fisici e dei servizi
        collegati.
      </p>
      <p>
        Per qualsiasi richiesta relativa al trattamento dei dati personali è
        possibile scrivere a{" "}
        <a href="mailto:assistenza@phonesia.it">
          assistenza@phonesia.it
        </a>
        .
      </p>

      <h2>Tipologia di dati trattati</h2>
      <p>I dati personali trattati possono includere:</p>
      <ul>
        <li>nome e cognome</li>
        <li>numero di telefono</li>
        <li>indirizzo email (se fornito)</li>
        <li>informazioni relative al punto vendita di riferimento</li>
        <li>dati relativi ai consensi prestati</li>
      </ul>
      <p>
        Non vengono trattati dati particolari ai sensi dell’art. 9 del GDPR.
      </p>

      <h2>Finalità del trattamento</h2>
      <ul>
        <li>registrazione del cliente nel sistema PHONESIA</li>
        <li>gestione del rapporto con il cliente e comunicazioni di servizio</li>
        <li>invio di un messaggio di benvenuto a seguito della registrazione</li>
        <li>
          conservazione dello storico delle interazioni avvenute presso i punti
          vendita
        </li>
      </ul>
      <p>
        Previo <b>consenso facoltativo</b>, i dati potranno essere utilizzati
        anche per l’invio di comunicazioni informative e promozionali relative
        ai servizi PHONESIA.
      </p>

      <h2>Base giuridica del trattamento</h2>
      <p>
        La base giuridica del trattamento è il consenso dell’interessato (art.
        6, par. 1, lett. a GDPR) e l’esecuzione di misure precontrattuali o
        contrattuali richieste dall’interessato.
      </p>
      <p>
        Il conferimento dei dati per le finalità di registrazione e servizio è
        necessario. Il consenso marketing è facoltativo e revocabile in
        qualsiasi momento.
      </p>

      <h2>Modalità di trattamento</h2>
      <p>
        Il trattamento dei dati avviene con strumenti informatici e digitali,
        nel rispetto dei principi di liceità, correttezza e trasparenza previsti
        dal GDPR (Reg. UE 2016/679).
      </p>
      <p>
        Sono adottate misure di sicurezza adeguate per prevenire accessi non
        autorizzati, perdita o uso illecito dei dati.
      </p>

      <h2>Conservazione dei dati</h2>
      <p>
        I dati personali saranno conservati per il tempo necessario al
        raggiungimento delle finalità per cui sono stati raccolti o fino a
        richiesta di cancellazione da parte dell’interessato, salvo obblighi di
        legge.
      </p>

      <h2>Diritti dell’interessato</h2>
      <p>
        L’interessato può in qualsiasi momento esercitare i diritti previsti
        dagli artt. 15–22 del GDPR, tra cui:
      </p>
      <ul>
        <li>accesso ai dati</li>
        <li>rettifica o aggiornamento</li>
        <li>cancellazione</li>
        <li>limitazione o opposizione al trattamento</li>
        <li>portabilità dei dati</li>
      </ul>

      <h2>Revoca del consenso</h2>
      <p>
        Il consenso può essere revocato in qualsiasi momento senza pregiudicare
        la liceità del trattamento basata sul consenso prestato prima della
        revoca.
      </p>
    </main>
  );
}
