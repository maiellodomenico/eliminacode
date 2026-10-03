# Notifiche cliente

Eventi consigliati:

1. `peopleAhead == 2` -> "Preparati: mancano due turni"
2. `peopleAhead == 1` -> "Sei il prossimo"
3. `status == CALLED` -> "E il tuo turno"
4. `status == SERVED` -> pianifica feedback a +1h o giorno successivo, secondo configurazione del locale

In produzione queste notifiche devono essere generate dal backend e consegnate con FCM/APNs. Expo Notifications puo essere usato come livello client, ma il provider server va configurato separatamente.
