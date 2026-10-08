# Eliminacode Windows — suite locale 1.1.0

Il pacchetto comprende server, amministrazione, totem, operatore e display. Le postazioni condividono un database SQLite sul PC del negozio; non richiedono Supabase o credenziali di altri progetti.

## Installazione

1. Installa `Eliminacode Server Setup 1.1.0.exe` sul PC che rimarrà acceso durante l'apertura del negozio. La versione senza Setup è portatile e non configura l'avvio con Windows.
2. Al primo avvio scegli nome negozio, nome utente e password (almeno 10 caratteri). Conserva le credenziali.
3. In **Configurazione**, seleziona l'indirizzo di rete del PC. Il server usa la porta 8787; non scegliere 127.0.0.1 per collegare altri dispositivi. Se hai più schede di rete, scegli quella della rete del negozio. Preferisci una prenotazione DHCP dal router per mantenere lo stesso indirizzo.
4. Consenti il programma su **rete privata** quando Windows Firewall lo richiede. Disattiva la sospensione automatica del PC durante l'orario di utilizzo. Le postazioni devono raggiungere il server sulla stessa LAN: la rete ospiti può bloccare le comunicazioni.
5. In **Reparti**, modifica i reparti iniziali o aggiungine altri. Sono dati iniziali configurabili, non ticket di esempio. I ticket esistenti dell'installazione precedente sono conservati.
6. In **Configurazione**, installa il driver della stampante termica, selezionala, scegli carta 58/80 mm, abilita la stampa e salva. Esegui la prova stampa sul dispositivo reale.

## Totem

Da **Panoramica → Apri totem** si apre una finestra dedicata sul PC server. Il cliente sceglie reparto e carta, QR o NFC. Il QR viene visualizzato come immagine ed è stampato sul ticket. Se la stampa fallisce il ticket resta valido: è possibile ristampare lo stesso numero, senza crearne un altro.

Per un PC totem distinto, crea una postazione Totem in **Postazioni** e apri il relativo QR/collegamento nel browser del PC. In questo caso si usa il dialogo di stampa del browser; la stampa silenziosa configurata nel server funziona solo nella finestra totem del pacchetto Windows sul PC server.

## Operatore e display

In **Postazioni**, crea un operatore per ogni reparto e associa il tablet con il codice monouso o il QR (10 minuti). Su Android si utilizza il browser; è possibile aggiungere il collegamento alla schermata iniziale. **Gli APK preesistenti basati su Supabase non sono collegati a questa suite locale.**

L'operatore può chiamare il prossimo, richiamare, segnare servito o assente. La coda è FIFO, condivisa tra ticket digitali e cartacei. Ogni reparto può avere un solo numero chiamato; l'operatore deve completarlo o saltarlo prima del successivo. Le azioni non valide sono rifiutate dal server.

Per il monitor crea una postazione Display, apri il collegamento su un PC collegato alla TV e premi **Attiva voce** e **Schermo intero**. L'annuncio usa la sintesi vocale italiana disponibile sul dispositivo. Il display mostra esclusivamente chiamate vere, senza animazioni o numeri dimostrativi.

## Cliente digitale

La fotocamera del telefono apre il QR nel browser. Il cliente segue il suo turno, invia note d'ordine e valuta il servizio dopo essere stato servito. La pagina deve raggiungere il server sulla rete del negozio e rimanere aperta per gli avvisi. Non sono previste push a pagina/app chiusa o accesso da rete mobile esterna nella suite locale 1.1.0.

## NFC

Richiede un tag fisico NDEF programmato con il link `/tap?device=ID_TOTEM` mostrato nella schermata NFC. Scegliendo il reparto il totem apre una sessione monouso di 45 secondi. Il telefono legge il tag e conferma l'emissione. Non viene simulato un lettore NFC e non basta avvicinare il telefono a un PC privo del tag. L'effettiva lettura del tag va verificata con l'hardware scelto.

## Numeri, dati e backup

I numeri sono progressivi per reparto, senza azzeramento automatico a mezzanotte: i ticket pendenti mantengono ordine e identità. Il database precedente viene aggiornato senza eliminare ticket o reparti. La modifica del prefisso non rinumera i vecchi ticket.

In **Configurazione → Scarica backup** viene prodotta una copia SQLite coerente, anche mentre il server è attivo. Conserva il backup in una posizione riservata: contiene configurazione, sessioni e dati dei ticket. Per ripristinare, arresta il server dall'area di notifica, conserva una copia del database corrente, sostituisci `eliminacode.sqlite` nella cartella indicata in Configurazione e rimuovi i soli file `eliminacode.sqlite-wal` e `eliminacode.sqlite-shm` della copia precedente prima di riaprire. Non sostituire il database mentre il server è attivo.

Chiudere la finestra amministratore mantiene il server nell'area di notifica. Per arrestarlo usa **Arresta server** dall'icona vicino all'orologio. L'avvio con Windows si configura nell'app installata.

## Accesso e rete

Accesso amministratore con password scrypt; sessione limitata a 12 ore; codici di associazione monouso; revoca dispositivi; autorizzazione server sulle azioni; validazione dei token ticket; protezione richieste cross-origin; limiti ai tentativi di accesso; rendering dei dati come testo. La rete HTTP locale non cifra il traffico: utilizzare la rete privata controllata del negozio, non esporre la porta su Internet. Per accesso esterno occorre un'installazione HTTPS/VPN separata, non inclusa in questo pacchetto.

## Verifiche

La CI esegue test delle API e un avvio dell'eseguibile Windows impacchettato (SQLite nativo, server e caricamento della pagina amministratore). I test browser verificano il percorso ticket → telefono → operatore → display → servito → valutazione, l'associazione e il layout a larghezza desktop/tablet/telefono. Stampa fisica, driver, firewall sul PC destinatario e lettura del tag NFC richiedono la verifica sul posto.
