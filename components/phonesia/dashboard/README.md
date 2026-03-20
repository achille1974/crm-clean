# Dashboard Phonesia v1

File inclusi:
- `lib/phonesia/dashboard.ts`
- `app/phonesia/dashboard/page.tsx`
- `components/phonesia/dashboard/KpiCards.tsx`
- `components/phonesia/dashboard/SimpleBarChart.tsx`
- `components/phonesia/dashboard/ConversionTable.tsx`
- `components/phonesia/dashboard/ContrattiTable.tsx`
- `components/phonesia/dashboard/LeadTable.tsx`
- `components/phonesia/dashboard/Filters.tsx`

## Note importanti
1. Questa dashboard usa `NEXT_PUBLIC_SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` lato server.
2. Il file `lib/phonesia/dashboard.ts` usa `server-only`.
3. Il join negozi avviene con `phonesia_negozi.codice`, perché `phonesia_clienti.negozio_id` e `phonesia_contratti.negozio_id` sono codici numerici (1,2,3,4,5).
4. Se nel tuo progetto hai alias diversi da `@/`, adatta gli import.
5. Se vuoi limitare la dashboard ad utenti admin, aggiungi protezione sulla pagina `/app/phonesia/dashboard/page.tsx`.
