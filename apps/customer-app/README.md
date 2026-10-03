# Eliminacode App Cliente v0.1.0

App universale per clienti di qualsiasi locale aderente.

## Funzioni MVP

- lettura QR del totem;
- supporto deep/universal link generati da QR e tag NFC;
- ticket digitale con numero, reparto, persone davanti e attesa stimata;
- inserimento preordine/nota;
- richiesta permessi push;
- feedback Scarso / Medio / Buono;
- modalita demo locale.

## Nota NFC

L'app non deve leggere direttamente un tag con un plugin NFC. Il tag contiene un normale URL HTTPS. Android/iOS lo rilevano a livello di sistema e aprono il link; con App Links/Universal Links il link entra nell'app. Questo riduce permessi, incompatibilita e complessita.

## Avvio

```bash
npm install
npx expo start
```

Per una release store occorrono dominio definitivo, `assetlinks.json` Android, file AASA iOS, credenziali push, icone/splash e build firmate.
