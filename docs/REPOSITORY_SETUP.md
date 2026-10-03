# Repository setup

1. Create a new GitHub account or organization dedicated to Eliminacode.
2. Create a private repository named `eliminacode-platform`.
3. Copy this bootstrap configuration into the repository root.
4. Add the application folders from the generated software suite.
5. Enable branch protection/rulesets for `main`:
   - pull request required
   - CI must pass
   - block force pushes
6. Configure Vercel secrets only after the dedicated Vercel project exists.
7. Keep production environment variables in Vercel/Supabase, not in GitHub source.
