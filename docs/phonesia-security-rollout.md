# Messa in sicurezza Phonesia — 23 settembre 2026

Progetto: `vqtoxgcacosdqtoxihko`. Applicazione: `https://app.crm-supreme.it`.

## Stato del lavoro

Le correzioni applicative e due migrazioni SQL sono pronte nel repository locale.
La build e i test sotto elencati sono superati. **Nessuna migrazione è stata
applicata al database online e nessun rilascio è stato pubblicato. L'esposizione
rilevata dall'audit non è quindi ancora risolta in produzione.**

Aggiornamento: l'utente ha confermato l'accesso SQL tramite il plugin Supabase
in un'altra conversazione e ha riportato l'audit live del 23 settembre 2026,
ore 15:15 italiane. Progetto `ACTIVE_HEALTHY`, PostgreSQL 17.6, ruolo `postgres`.
La vecchia conversazione che ha preparato i file continua a non disporre degli
strumenti SQL: il problema non è più l'installazione del plugin. Proseguire il
rilascio nella sessione già collegata, senza reinstallarlo o rieseguire audit
generici. La cronologia migrazioni vuota non dimostra assenza di modifiche SQL.
Non condividere password o chiavi segrete nella chat. Esiti e completamenti
sono descritti in `docs/phonesia-security-followup.md`.

## Correzioni preparate

- Registrazione QR tramite API server, senza ricerche o inserimenti diretti dal
  browser. Validazione dei campi, controllo dell'origine e dimensione massima
  della richiesta; risposta generica senza dati o ID di clienti esistenti.
- Creazione atomica di cliente e consensi; limiti persistenti di 20 richieste
  per IP in 10 minuti e 3 per telefono in un'ora. Gli identificatori dei limiti
  sono hash HMAC, non IP o numeri di telefono in chiaro.
- API interne per modifica contatti, attività, statistiche e operazioni con
  verifica di sessione e profilo amministratore attivo prima dell'accesso server.
  Le due API `/api/agent/*` richiedono il segreto server già configurato
  `x-phonesia-secret` oppure una sessione amministratore.
- Invio del benvenuto spostato in un helper server; il vecchio endpoint di invio
  non è più pubblico. Nessun invio reale è stato eseguito durante questi test.
- RLS e revoca dei privilegi tabella/colonna sui 41 oggetti individuati
  dall'audit, inclusi backup e vista campagne. Accesso server conservato;
  l'utente autenticato può leggere soltanto il proprio profilo attivo e non
  attribuirsi privilegi. Vista con `security_invoker`, RPC applicative non
  eseguibili dai ruoli browser, privilegi predefiniti più restrittivi.
- Snapshot privato dei metadati di sicurezza precedenti, non dei dati clienti.

I vecchi helper di scrittura consensi dal browser (`lib/phonesia/consensi.ts` e
`lib/phonesia/index.ts`) sono stati eliminati perché non più utilizzati; sono
recuperabili dalla cronologia Git. Non sono stati eliminati dati del database.
Alcune annotazioni dei parametri delle pagine e rotte sono state adeguate a
Next.js 16 (`Promise`) per risolvere errori di tipo preesistenti nella build;
non ne è stata modificata la logica.

## Ordine obbligatorio del rilascio

1. **Verificare il database reale.** Usare il progetto sopra indicato e leggere
   Security Advisor e cataloghi PostgreSQL. La query diagnostica è in
   `/Users/archimede/phonesia-security-audit-2026-09-23/audit-sola-lettura.sql`.
   L'audit live riportato dall'utente ha confermato 39 tabelle e 2 viste,
   tutte coperte dalla fase 2, e la compatibilità strutturale della fase 1.
   Prima del rilascio verificare eventuali cambiamenti successivi all'audit.
   Per i soli punti rimasti aperti usare
   `scripts/phonesia/security-followup-audit.sql`; i test sintetici locali non
   sostituiscono questi controlli reali.
2. **Applicare la fase 1**:
   `supabase/migrations/20260923143000_phonesia_qr_registration.sql`.
   Crea la funzione di registrazione riservata al server e i contatori privati;
   non chiude ancora gli accessi dell'applicazione attualmente pubblicata.
3. **Pubblicare il CRM aggiornato**, verificando che gli environment di
   produzione puntino al progetto corretto e che `NEXT_PUBLIC_BASE_URL` sia
   `https://app.crm-supreme.it`. Verificare login amministratore, dashboard e QR.
   Una pagina QR già aperta prima del rilascio va ricaricata.
4. **Applicare immediatamente la fase 2**:
   `supabase/migrations/20260923143500_phonesia_data_access_security.sql`.
   Attiva RLS e chiude i permessi pubblici; lascia disponibili quelli server.
   Pianificare le fasi 2–4 nella stessa finestra di intervento, evitando di
   prolungare l'esposizione tra un passaggio e l'altro.
5. **Verificare il risultato in produzione** con Security Advisor e controlli
   di sola lettura: richieste anonime alle singole tabelle negate, nessun dato
   visibile ad account non approvati, lettura del solo profilo proprio,
   dashboard/importatore server funzionanti. Controllare backup, vista e RPC,
   non soltanto `phonesia_clienti`. Il solo errore 401 su `/rest/v1/` non è una
   verifica sufficiente: nell'audit le singole tabelle restituivano comunque dati.

Non applicare indistintamente tutte le altre migrazioni presenti nel repository:
sono lavori separati e il loro stato online non è stato verificato. Non avviare
test di registrazione con numeri reali né processi di campagna/importazione per
provare le autorizzazioni. Un test integrato valido QR/WhatsApp richiede un
ambiente di prova o un destinatario di test concordato.

Le migrazioni sono transazionali con timeout sui lock. In caso di errore SQL
non proseguire al passaggio successivo. Lo snapshot di sicurezza permette di
ricostruire lo stato precedente, ma ripristinare indiscriminatamente i vecchi
grant riaprirebbe la vulnerabilità: preferire una correzione mirata.

## Verifiche eseguite localmente

| Verifica | Esito |
| --- | --- |
| `bash scripts/phonesia/test-data-security.sh` su PostgreSQL 16 isolato | 53 controlli SQL superati, più esecuzione del nuovo audit metadati |
| `node --test scripts/phonesia/qr-security.test.mjs` | 10 test superati |
| Richieste HTTP al CRM compilato su localhost | 12 controlli superati |
| ESLint mirato sui nuovi moduli, rotte e componenti | Superato |
| `npm run build -- --webpack` | Superata, inclusi TypeScript e generazione pagine |
| `git diff --check` | Superato |

I controlli SQL verificano letture/scritture/cancellazioni anonime negate,
isolamento profili, mancata escalation, accesso server, atomicità dei consensi,
duplicati, limiti QR e privilegi predefiniti del ruolo `postgres`. Sono stati
aggiunti test per entrambe le viste, `TRUNCATE`, sequenze e indici univoci di
email/codice fiscale. Il comportamento amministrativo del ruolo gestito
`supabase_admin` non è simulato: rimane un punto distinto da chiudere online.
I controlli HTTP verificano le
pagine QR/conferma, sei API private senza login e quattro rifiuti di richieste
QR non valide. Non sono stati inseriti o modificati clienti reali.

Il database locale di prova viene arrestato dallo script. Log e dati sintetici
sono conservati in una cartella temporanea dedicata stampata dal test; l'ultima
esecuzione riuscita è in `/private/tmp/phonesia-security-test.KcuNG0/results.log`.

## Limiti e punti successivi

- L'audit SQL e Security Advisor live sono stati riportati dall'utente dalla
  sessione collegata. Restano aperti i default di `supabase_admin`, cinque
  funzioni con `search_path` non fissato, i permessi/dipendenze di `pg_net` e le
  impostazioni Auth: vedere il documento di completamento. Non dichiarare
  risolti questi punti sulla base dei soli test delle due migrazioni.
- Non è stato eseguito un test visuale nel browser integrato, non disponibile;
  sono stati verificati build e risposte HTTP.
- Il consenso conserva versione e valore hash già utilizzati dall'applicazione
  (`v1.0`, `privacy_v1_placeholder`); l'adeguatezza dell'informativa e della sua
  prova documentale richiede una verifica separata.
- I limiti QR riducono gli abusi ma non verificano il possesso del numero di
  telefono. OTP/CAPTCHA e un'eventuale coda con retry/idempotenza del benvenuto
  sono miglioramenti distinti, non implementati in questo intervento.
- L'audit dimostra l'esposizione, non un accesso illecito già avvenuto. Analizzare
  i log disponibili separatamente; non eliminare evidenze né ruotare credenziali
  senza pianificare l'aggiornamento dei sistemi che le usano.
