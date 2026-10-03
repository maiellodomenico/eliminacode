# API Contract - Eliminacode Universale v1

Base URL di esempio: `https://api.example.com/v1`

## Entita principali

- `venue`: locale/azienda
- `department`: reparto/sportello
- `station`: totem fisico
- `ticket`: turno
- `tapSession`: sessione NFC temporanea
- `order`: ordine/preordine associato al ticket
- `feedbackToken`: diritto monouso a lasciare feedback

## Endpoints minimi

### GET /venues/{venueId}/departments
Restituisce i reparti attivi.

### POST /tickets
Crea un ticket.

Body:
```json
{
  "venueId": "VENUE-001",
  "departmentId": "SALUMERIA",
  "channel": "paper|qr|app|nfc",
  "stationId": "TOTEM-001"
}
```

Response:
```json
{
  "ticketId": "uqid_...",
  "displayNumber": "S042",
  "departmentName": "Salumeria",
  "peopleAhead": 6,
  "estimatedMinutes": 12,
  "claimUrl": "https://queue.example.com/claim/ey..."
}
```

### POST /tap-sessions
Attiva il punto NFC statico del totem per il reparto selezionato.

Body:
```json
{
  "stationId": "TOTEM-001",
  "venueId": "VENUE-001",
  "departmentId": "SALUMERIA",
  "ttlSeconds": 25
}
```

Response:
```json
{
  "tapSessionId": "tap_...",
  "expiresAt": "2026-10-03T14:30:25+02:00"
}
```

### GET /tap/{stationId}
Endpoint pubblico raggiunto dal tag NFC. Consuma una sessione attiva e genera/assegna il ticket. Deve essere atomico e idempotente per `tapSessionId`.

### POST /tickets/{ticketId}/claim
Associa il ticket all'installazione dell'app cliente.

### GET /tickets/{ticketId}
Stato corrente del ticket.

### POST /tickets/{ticketId}/order
Inserisce o aggiorna il preordine.

### POST /operator/tickets/{ticketId}/call
### POST /operator/tickets/{ticketId}/serve
### POST /operator/tickets/{ticketId}/skip
### POST /operator/tickets/{ticketId}/recall

### GET /operator/departments/{departmentId}/queue
Coda operativa ordinata.

### POST /tickets/{ticketId}/feedback-token
Generato soltanto dopo `SERVED`.

### POST /feedback/{token}
Token monouso con rating `poor|average|good` ed eventuale commento.

## Realtime

In produzione i client devono ricevere gli eventi:

- `ticket.updated`
- `queue.updated`
- `ticket.called`
- `ticket.served`
- `order.updated`
- `feedback.requested`

Trasporto consigliato: WebSocket o Supabase Realtime. Le notifiche push restano necessarie quando l'app cliente e in background/chiusa.
