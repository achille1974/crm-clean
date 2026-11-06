# CRM Phonesia — regole per gli agenti (Claude Code, Codex)

## Rilascio
- Ogni modifica: commit → `git push origin main` → deploy Vercel da Git.
- Mai `vercel --prod` dal Mac se ci sono modifiche non committate: la produzione
  deve sempre corrispondere a un commit su GitHub.
- Prima del push: `npm run test:qr && npm run test:dashboard && npm run test:messaging && npm run build -- --webpack`.

## Database (Supabase `vqtoxgcacosdqtoxihko`)
- Le migrazioni in `supabase/migrations/` si applicano una alla volta, solo con
  autorizzazione esplicita di Achille. La cronologia online è vuota: non lanciare
  `supabase db push` su tutto.
- Mai DROP, TRUNCATE o DELETE massivi. Backup/snapshot prima di ogni UPDATE massivo.

## WhatsApp e clienti
- Nessun invio reale ai clienti senza autorizzazione esplicita per quella campagna
  e quella lista. Una build verde non è un invio riuscito: accepted ≠ delivered ≠ read.
- Invio marketing solo con: consenso `marketing_accepted`, `whatsapp_active = true`,
  nessuna revoca, nessun invio marketing negli ultimi 14 giorni, promo non già ricevuta.
- Contratto in archivio ≠ consenso.
- La cartella `invio/` contiene anagrafiche: è esclusa da Git e non va mai committata.

## Separazioni
- Phonesia, Beltrami 1876 e il vecchio CRM Tabaccai restano distinti
  (dati, consensi, numero WhatsApp, app Meta, dominio).
- Mai mostrare token, password o chiavi nei log, nei report o in chat.

## Lingua
- Comunicazioni con Achille in italiano, semplici, distinguendo sempre:
  proposta / codice modificato / build / preview / production / test reale.
