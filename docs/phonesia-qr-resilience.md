# Continuità delle registrazioni QR — 25 settembre 2026

Il rilascio di sicurezza del 23 settembre ha introdotto un controllo dell'origine che non comprendeva il dominio stabile `crm-clean.vercel.app`. La pagina rispondeva 200 ma l'invio veniva respinto con 403 prima della lettura del modulo e della scrittura sul database. Il primo hotfix ha ripristinato quell'origine; questo intervento aggiunge prevenzione e conservazione dei nuovi invii.

## Collegamenti e protezioni

`lib/phonesia/qr-origins.ts` distingue le origini autorizzate dagli ingressi pubblici. I QR pubblici usano `app.crm-supreme.it` e `crm-clean.vercel.app`. L'alias tecnico `crm-clean-achille-beltramis-projects.vercel.app` è protetto dal login Vercel e non deve essere distribuito ai clienti. Gli ingressi GET/HEAD degli alias che raggiungono l'applicazione su `/phonesia/qr` vengono reindirizzati a `https://app.crm-supreme.it`, mantenendo negozio e query. I POST dalle schede già aperte restano autorizzati per gli alias esatti. I domini arbitrari, i suffissi contraffatti, le richieste senza Origin e le richieste cross-site restano respinti. Il modulo viene servito senza cache ed accetta solo i codici negozio 1–5.

Restano attive RLS, permessi delle API private, chiave di servizio solo sul server, validazione degli input, limiti per telefono/IP e scrittura atomica di cliente e consensi. Nessuna migrazione di produzione è necessaria per questo intervento.

## Moduli in attesa

Solo dopo il pulsante di invio e la conferma della privacy, il modulo viene cifrato con AES-GCM e salvato in IndexedDB prima della richiesta HTTP. La chiave Web Crypto non esportabile viene conservata nello stesso browser. I consensi originali vengono reinviati senza alterarli. Non vengono scritti dati personali in chiaro nei log o nella memoria persistente dell'applicazione.

Una coda contiene fino a 100 invii e mantiene ciascun modulo fino alla conferma del server, alla cancellazione esplicita o alla scadenza di 72 ore. La pulizia delle scadenze avviene all'apertura/uso della pagina. Gli errori temporanei restano in coda; gli errori di validazione sospendono il singolo modulo per la correzione. I tentativi hanno attese progressive e rispettano Retry-After. Le Web Locks coordinano le schede quando disponibili; i blocchi dell'identità nel database impediscono comunque inserimenti duplicati.

Il reinvio richiede connessione e pagina QR aperta o riaperta sullo stesso browser/dispositivo. La cancellazione dei dati del browser, la navigazione privata e la rimozione dei dati da parte del browser possono rendere indisponibile questa copia. Se IndexedDB non funziona, l'invio diretto rimane possibile e l'interfaccia avvisa di mantenere la pagina aperta. La cifratura limita i dati in chiaro su disco; non protegge da codice malevolo eseguito nella stessa origine o da chi usa il browser già aperto. Non costituisce un backup centrale.

Questa conservazione vale per i nuovi moduli: non ricostruisce retroattivamente corpi HTTP mai acquisiti durante il blocco precedente.

## Test obbligatori e rilascio

`vercel.json` imposta `npm run build`. Il prebuild esegue i test QR e il postbuild avvia la versione compilata su loopback per verificare domini, reindirizzamenti dei cinque negozi e API private. Un errore rende la build fallita. La sonda locale usa credenziali fittizie e non può inserire clienti reali. I test IndexedDB usano `fake-indexeddb`, dipendenza solo di sviluppo; il collaudo visuale dipende dalla disponibilità del browser.

Prima di promuovere un rilascio:

1. Usare uno snapshot isolato dei sorgenti online, sovrapponendo soltanto le modifiche autorizzate.
2. Eseguire build e `bash scripts/phonesia/test-data-security.sh` su PostgreSQL isolato.
3. Eseguire `vercel deploy --prod --skip-domain`; controllare i log di build e la corrispondenza dei sorgenti.
4. Sul nuovo URL verificare la sonda GET con Origin autorizzato, la pagina e i POST volutamente vuoti. Non creare clienti né inviare messaggi di test in produzione.
5. Promuovere solo dopo i controlli; verificare tutti i domini e la sonda periodica. Conservare il deployment precedente per un rollback mirato.

## Monitoraggio

`scripts/phonesia/monitor-qr.mjs` esegue 7 controlli non distruttivi: due ingressi QR pubblici, due verifiche di origine per l'invio, rifiuto dell'origine estranea, protezione dell'API privata e disponibilità effettiva del database/RPC attraverso il server Vercel. L'alias tecnico del team non è una pagina pubblica e non viene confuso con un QR cliente guasto.

Il GET su `/api/phonesia/qr/register` è una sonda con lo stesso controllo dell'origine: verifica negozi e RPC con i parametri deliberatamente non validi di `qr-readiness.ts`. L'errore PostgreSQL 22023 è atteso e avviene prima di scritture o rate limit. La sonda usa la configurazione del server reale e restituisce solo uno stato generico, senza dati personali. I test SQL verificano che non crei clienti, consensi o contatori.

LaunchAgent `com.phonesia.qr-health` esegue la sonda ogni 300 secondi, con Mac acceso e connesso. Scrive stato e storico degli ultimi sette giorni in `/Users/archimede/phonesia-diagnostics/qr-monitor`. Non richiede credenziali Supabase locali né invia email. Il monitor CRM/Mac preesistente, con cadenza di 30 minuti, legge lo stato e considera critical sia un controllo fallito sia uno stato vecchio oltre 15 minuti. Il canale di allerta esistente mantiene i propri destinatari e le proprie regole. Nessuna email di prova è necessaria.

La dipendenza dal Mac resta un limite del monitoraggio: per una sorveglianza indipendente dal computer si dovrà spostare la sonda su un servizio sempre attivo. Non fare affidamento sul solo conteggio delle registrazioni, perché i negozi possono avere ritmi diversi.

Riferimenti tecnici: [Web Crypto e persistenza delle chiavi](https://www.w3.org/TR/webcrypto-2/), [Web Locks](https://www.w3.org/TR/web-locks/), [test IndexedDB in Node](https://github.com/dumbmatter/fakeIndexedDB), [timeout Supabase](https://supabase.com/docs/reference/javascript/using-modifiers-abortsignal).
