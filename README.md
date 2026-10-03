# Eliminacode Universal Platform

Monorepo ufficiale per la piattaforma Eliminacode universale.

## Struttura

- `apps/admin-dashboard` - Dashboard amministratore Next.js, destinata a Vercel
- `apps/totem-windows` - Software kiosk Windows touchscreen, ticket/QR/NFC/stampa
- `apps/customer-app` - App cliente universale
- `apps/operator-tablet` - App Android per tablet operatore/reparto
- `supabase` - Schema database, RLS e seed del backend Supabase
- `.github` - CI, template e configurazione repository
- `docs` - Contratto API, sicurezza e deployment

## Infrastruttura

Eliminacode usa account e progetti dedicati e indipendenti per Supabase, GitHub, Vercel e gli altri servizi. Non devono essere riutilizzate credenziali o risorse di altri progetti.

## Primo avvio

1. Creare un progetto Supabase dedicato.
2. Eseguire `supabase/migrations/20261003143000_initial_eliminacode.sql`.
3. Opzionalmente eseguire `supabase/seed.sql` per i dati demo.
4. Configurare `apps/admin-dashboard/.env.local` partendo da `.env.example`.
5. Importare questo repository in Vercel con Root Directory `apps/admin-dashboard`.
6. Collegare successivamente totem, app cliente e tablet alle stesse API.

## Sicurezza

Non committare password, secret key, service role key o token Vercel/GitHub. I client devono usare esclusivamente credenziali pubblicabili e autorizzazioni RLS/API dedicate.
