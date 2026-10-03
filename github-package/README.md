# Eliminacode - GitHub Bootstrap Package

This package bootstraps a dedicated GitHub repository/organization for Eliminacode.

Recommended repository name: `eliminacode-platform`

## Monorepo layout
- `apps/admin-dashboard` - Next.js dashboard (Vercel)
- `apps/totem-windows` - Windows kiosk
- `apps/customer-app` - universal customer app
- `apps/operator-tablet` - Android operator app
- `packages/shared` - shared ticket/API contracts
- `supabase` - schema, policies, functions
- `docs` - architecture and deployment docs

## Required GitHub secrets
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`

Do not store Supabase secret keys as repository variables visible to builds that do not need them.
