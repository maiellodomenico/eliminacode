# Configurazione stampante termica Windows

## Scelta consigliata

Stampante termica USB o Ethernet compatibile ESC/POS, carta 80 mm. Per ticket molto compatti va bene anche 58 mm.

## Prima configurazione

1. Installare il driver Windows del produttore.
2. Collegare la stampante e stampare una pagina/test dal pannello Windows.
3. Annotare il nome esatto mostrato in **Impostazioni > Bluetooth e dispositivi > Stampanti e scanner**.
4. Copiare `.env.example` in `.env`.
5. Impostare `PRINTER_ENABLED=1` e `WINDOWS_PRINTER_NAME=...`.
6. Avviare il totem e provare un ticket.

La v0.1 usa lo spooler Windows tramite PowerShell `Out-Printer`, scelta compatibile con molti driver. Per produzione su modelli ESC/POS specifici e taglio automatico si consiglia aggiungere un driver RAW ESC/POS per il modello scelto (cut command, QR sul ticket, logo, apertura cassetto se necessaria).

## Layout ticket consigliato

- Logo/locale
- Reparto
- Numero molto grande
- Data/ora
- QR del ticket opzionale per trasferimento carta -> app
- breve testo privacy/assistenza opzionale
