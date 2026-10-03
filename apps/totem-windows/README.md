# Eliminacode Totem Windows v0.1.0

Applicazione Electron/React per PC Windows touchscreen.

## Funzioni presenti

- scelta reparto a grandi pulsanti;
- ticket cartaceo con stampa Windows;
- QR claim per app cliente;
- modalita NFC tramite tap session e tag NFC passivo statico;
- modalita kiosk/fullscreen;
- modalita demo senza backend.

## Avvio sviluppo

```bash
npm install
npm run build
```

In sviluppo si puo usare `npm run dev`; in produzione il pacchetto va poi impacchettato con electron-builder o MSIX dopo la scelta del PC/totem definitivo.

Leggere `PRINTER_SETUP.md` e `NFC_SETUP.md` prima dell'installazione sul totem reale.
