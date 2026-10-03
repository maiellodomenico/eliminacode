# NFC del totem - soluzione con tag passivo statico

Non serve hardware NFC nel PC Windows.

1. Applicare sul frontale del totem un tag NFC NTAG213/215/216.
2. Programmarlo una sola volta con un URL HTTPS, per esempio `https://queue.example.com/tap/TOTEM-001`.
3. Bloccare la scrittura del tag dopo il collaudo, se desiderato.
4. Quando l'utente seleziona un reparto e preme NFC, il totem crea una tap session sul backend con TTL breve (es. 25 secondi).
5. Il telefono legge il tag e apre il medesimo URL statico.
6. Il backend associa quel tap alla sessione attiva, crea il ticket una sola volta e marca la sessione come consumata.

### Requisiti server essenziali

- una sola sessione attiva per stationId;
- consumo atomico;
- TTL breve;
- rate limit;
- risposta idempotente se il browser ripete il caricamento;
- app/universal link con fallback a pagina web/installazione app.
