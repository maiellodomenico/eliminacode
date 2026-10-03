# Integration map

## Supabase
Owns: organizations, locations, departments, devices, queue sessions, tickets, orders, ticket events, feedback.

## GitHub
Owns: source control, pull requests, CI and deployment workflow definitions.

## Vercel
Owns: the administrator dashboard web deployment and preview/production environments.

## Client credential rule
- Browser/mobile/totem/tablet: Supabase publishable key only.
- Trusted backend/Edge Functions: Supabase secret key only when strictly required.
- Never commit secrets to GitHub.
