# Phonesia — completamenti dopo l'audit live

## Fonte e stato

L'utente ha riportato in questa conversazione l'audit eseguito con il plugin
Supabase il 23 settembre 2026 alle 15:15 italiane. Non è un audit SQL ripetuto
da questa sessione, nella quale gli strumenti Supabase non sono disponibili.
Progetto `vqtoxgcacosdqtoxihko`, PostgreSQL 17.6, ruolo `postgres`.

Risultati riportati:

- 39 tabelle, tutte di proprietà di `postgres`: 24 senza RLS e 15 con RLS.
- Due viste senza `security_invoker`: `phonesia_analytics_attivazione` e
  `phonesia_whatsapp_campaign_progress`. Le due migrazioni coprono tutti i
  41 oggetti applicativi, i due backup e le 27 sequenze reali.
- Grant estesi ad `anon` e `authenticated` su tutte le tabelle, incluso
  `TRUNCATE`; nessun grant separato di colonna o ruolo browser privilegiato.
- `service_role` mantiene BYPASSRLS e CRUD. Sette delle 17 funzioni applicative
  sono eseguibili dai ruoli browser; cinque funzioni sono segnalate per
  `search_path`. I loro nomi e corpi completi non sono inclusi nel resoconto.
- Default permissivi per `postgres` e `supabase_admin`; `pg_net` registrata
  in `public` e routine HTTP in `net` eseguibili dai ruoli browser. Non è
  dimostrato che `net` sia esposto nella Data API.
- Avvisi Auth su password compromesse e opzioni MFA; schema privato e funzione
  QR nuova ancora assenti. Nessun trigger applicativo su clienti/consensi;
  colonne e tipi della fase 1 compatibili, identità cliente con indici univoci.

Nessuna migrazione applicata o pubblicazione eseguita da questa sessione.

## Priorità operativa

Il contenimento dell'accesso pubblico attuale non deve attendere una revisione
generale di MFA. Seguire la sequenza del rollout: fase 1, CRM aggiornato,
fase 2 immediatamente dopo, verifiche live. Chiudere separatamente i punti
residui senza presentarli come già risolti. Non eseguire tutte le migrazioni
del repository perché la cronologia online è vuota.

La revoca dei grant è indispensabile: RLS non si applica a `TRUNCATE` e
`REFERENCES`. Il grant SQL di TRUNCATE non dimostra però l'esistenza di un
endpoint REST che lo esegua; non provare operazioni distruttive in produzione.
Le tabelle con RLS senza policy negano normalmente le righe: non aggiungere
policy permissive per eliminare il relativo avviso.
[PostgreSQL: limiti e comportamento RLS](https://www.postgresql.org/docs/17/ddl-rowsecurity.html).

## 1. Privilegi predefiniti di supabase_admin

Usare le sezioni 1–2 di `scripts/phonesia/security-followup-audit.sql` per
distinguere ACL globali/per schema e verificare il rapporto fra ruolo corrente
e ruolo creatore. `ALTER DEFAULT PRIVILEGES` riguarda soltanto gli oggetti
futuri del creatore indicato: correggere `postgres` non corregge `supabase_admin`,
ma quest'ultimo non riattribuisce automaticamente grant su tabelle già esistenti.
I privilegi globali non si annullano con un REVOKE soltanto per schema.
[PostgreSQL: default privileges](https://www.postgresql.org/docs/17/sql-alterdefaultprivileges.html).

Non aggiungere alla fase 2 un comando non verificato per il ruolo gestito,
non acquisire superuser e non alterare i ruoli di piattaforma. Verificare quali
default vengono realmente modificati dall'operazione supportata nel pannello
Data API; rileggere poi `pg_default_acl`. Se restano default del ruolo gestito
non modificabili dall'amministratore del progetto, richiedere l'intervento del
supporto Supabase e documentare il rischio residuo, continuando a creare gli
oggetti applicativi come `postgres` con grant espliciti.

La procedura ufficiale di opt-in per i progetti esistenti mostra revoche per
`postgres`: non assumere che risolva automaticamente anche gli altri creatori.
Non attendere il rollout futuro della piattaforma per chiudere i dati attuali.
[Supabase: esposizione esplicita dei nuovi oggetti](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

## 2. Cinque funzioni senza search_path fisso

La sezione 3 restituisce firme esatte, proprietari, tipo restituito e impronta
delle definizioni, senza mostrarne i corpi. Nella sessione collegata confrontare
queste firme con l'Advisor e ispezionare individualmente i corpi e le dipendenze,
senza riportare eventuali segreti incorporati nei report o nella chat.

Qualificare con lo schema i riferimenti necessari prima di fissare un percorso
ristretto. Non applicare indiscriminatamente `SET search_path = ''` a funzioni
con nomi non qualificati. Preservare firma, tipo, attributi, owner, ACL, trigger
e comportamento, verificando anche SQL dinamico e funzioni richiamate.
Salvare le definizioni precedenti in modo riservato per un rollback mirato.

La revoca EXECUTE della fase 2 chiude gli accessi browser, ma non corregge il
search_path. Non eliminare trigger per cancellare un avviso. Le quattro policy
campagne che dipendono da `phonesia_is_active_admin()` sono coperte dalla
chiusura dei grant e dalla policy restrittiva; il server continua a bypassare
RLS. Verificare comunque eventuali altri chiamanti del helper prima di modificarlo.

## 3. pg_net

Le sezioni 4–6 verificano owner, relocatability, privilegi, trigger e potenziali
chiamanti, senza eseguire richieste HTTP. La ricerca nel codice è euristica:
`pg_depend` e il testo delle funzioni possono non catturare chiamate dinamiche.
Gli schemi esposti vanno confermati nelle impostazioni Data API effettive;
l'assenza di una voce in `pg_db_role_setting` non prova che `net` sia privato.

Non eseguire `DROP EXTENSION`, `CASCADE` o una ricreazione per eliminare
l'avviso: possono interrompere webhook, code e job. Prima di revocare EXECUTE
su routine `net`, identificare anche i chiamanti invoker, i proprietari di
trigger/job e i permessi realmente necessari. Usare un'operazione autorizzata
per l'owner effettivo, preservando i flussi server e verificando eventuali grant
riapplicati dagli aggiornamenti dell'estensione. Spostare soltanto lo schema di
registrazione dell'estensione non equivale a mettere in sicurezza tutte le routine.
[Supabase: pg_net e richieste asincrone](https://supabase.com/docs/guides/database/extensions/pg_net).

## 4. Auth: decisioni e implementazione separate

- Protezione password compromesse: verificare piano e disponibilità. La
  documentazione la prevede da Pro in su; nessun cambio piano o costo senza
  autorizzazione. Non ruotare password degli utenti per eliminare l'avviso.
  [Supabase: password security](https://supabase.com/docs/guides/auth/password-security).
- MFA: il login locale usa attualmente solo `signInWithPassword`, senza flusso
  di iscrizione/verifica secondo fattore né enforcement AAL2 nel proxy/helper.
  Abilitare fattori non significa renderli obbligatori. Prima di imporre MFA
  occorre predisporre accesso, enrollment, recupero e verifiche server per gli
  amministratori, concordando l'attivazione per evitare blocchi di accesso.
  [Supabase: enforcement MFA](https://supabase.com/docs/guides/auth/auth-mfa).

## Aggiornamenti locali e criteri di chiusura

La suite ora riproduce 39 tabelle e due viste, oltre a indici univoci su telefono,
email e codice fiscale. Superati 53 controlli SQL su PostgreSQL 16 isolato,
compresi diniego TRUNCATE per entrambi i ruoli browser, sequenze, viste e
duplicati. Anche il nuovo script diagnostico è stato eseguito in sola lettura
sullo schema sintetico. Non simula i privilegi amministrativi gestiti Supabase
né certifica compatibilità runtime su PostgreSQL 17.6.

Log: `/private/tmp/phonesia-security-test.KcuNG0/results.log`.

Per concludere: conservare evidenza del rilascio e delle migrazioni applicate,
ricontrollare accesso anonimo alle singole tabelle e RPC, lettura del profilo
attivo, flussi server e Advisor. Classificare ogni avviso residuo con causa e
azione; non dichiarare la messa in sicurezza completa sulla sola assenza di
`rls_disabled_in_public` o sull'esito dei test locali.
