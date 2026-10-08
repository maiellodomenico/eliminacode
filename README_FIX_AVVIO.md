# Eliminacode Server v1.1 - fix avvio

Sostituire nel branch `local-first-v1`:
- `apps/server-windows/main.cjs`
- `apps/server-windows/server.cjs`

Poi fare commit e lasciare che GitHub Actions ricompili l'EXE.

Se l'EXE non apre il pannello, controllare questo file di log:
`%APPDATA%\\Eliminacode Server\\bootstrap.log`

Il log mostra se il problema avviene durante apertura database, avvio HTTP o caricamento del pannello.
