# Eliminacode Tablet Operatore Android v0.1.0

Tablet di reparto per operatori.

## Funzioni MVP

- coda ordinata;
- evidenza dei ticket con preordine;
- dettaglio ordine/note;
- CHIAMA;
- SERVITO;
- RICHIAMA;
- SALTA;
- layout landscape per tablet;
- modalita demo locale.

## Produzione

Il tablet deve autenticarsi come dispositivo dell'azienda/reparto. Gli eventi devono arrivare realtime dal backend e ogni azione deve essere registrata con `operatorId/deviceId/timestamp`.

## Avvio

```bash
npm install
npx expo start --android
```
