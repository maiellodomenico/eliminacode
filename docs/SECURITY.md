# Security baseline

- Use new Supabase publishable keys in clients.
- Use secret keys only in trusted server/Edge Function environments.
- RLS is mandatory for every table in exposed schemas.
- Authorization is based on `organization_members`, never user-editable metadata.
- Do not place device secrets in QR codes or NFC tags.
- Device credentials must be hashed at rest and rotatable.
- Public ticket acquisition must be rate-limited and validated server-side before production.
- Run Supabase security advisors after every schema change.
