# Eliminacode - Vercel Admin Dashboard

Next.js App Router bootstrap for the Eliminacode administrator dashboard.

## Local setup
1. Copy `.env.example` to `.env.local`.
2. Insert the dedicated Eliminacode Supabase URL and publishable key.
3. Run `npm install`.
4. Run `npm run dev`.

## Vercel
Create a new project in the dedicated Eliminacode Vercel account and import the dedicated GitHub repository.
Set these environment variables for Preview and Production:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Do not add a Supabase secret key to any `NEXT_PUBLIC_` variable.

The current UI contains demo data and route placeholders. The database contract is defined in the Supabase package.
