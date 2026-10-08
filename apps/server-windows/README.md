# Eliminacode Windows 1.2.3

Server, totem, operatore e display usano la rete privata del negozio (Wi-Fi o Ethernet). Il cliente usa la propria connessione mobile o qualsiasi rete Internet. Il database e l’amministrazione restano sul PC Windows.

## Accesso clienti dalla rete mobile

1. Installa il nuovo Setup Windows; conserva il database esistente. Non eseguire due server contemporaneamente.
2. In Configurazione, lascia l’indirizzo interno del PC per le postazioni (porta 8787).
3. Nel tuo account Cloudflare, crea un tunnel gestito con un hostname pubblico stabile, per esempio `turni.tuodominio.it`. Configura la destinazione del tunnel come `HTTP`, `127.0.0.1:8788`. Non pubblicare la porta 8787. Il dominio deve essere gestito/configurato nel tuo account Cloudflare; nessun dominio o account è creato dal programma.
4. Nel programma Windows, incolla solo il token del tunnel nel campo dedicato. Il connettore ufficiale cloudflared 2026.10.0 è incluso nell’EXE, verificato con SHA256 durante la compilazione. Il token è cifrato con la protezione Windows, escluso dal database/backup e dai log. Il tunnel riparte all’avvio e si riconnette in caso di interruzione.
5. Salva `https://turni.tuodominio.it` come indirizzo pubblico clienti e premi “Verifica accesso pubblico HTTPS”. Il controllo richiede che quel dominio raggiunga proprio questo server e che l’amministrazione risponda 403.
6. Emetti un nuovo ticket e prova il QR con Wi-Fi disattivato sul telefono. I QR già stampati con l’indirizzo LAN non cambiano; devono essere rigenerati/ristampati. Anche il tag NFC deve usare il nuovo indirizzo pubblico.

Il gateway clienti ascolta solo su 127.0.0.1:8788, con percorsi esplicitamente autorizzati. Amministrazione, pairing, totem, display e azioni operatore sono esclusi anche se una richiesta pubblica presenta cookie o intestazioni delle postazioni. Non serve aprire porte del router. Serve una connessione Internet del server per tunnel e notifiche; le postazioni locali continuano a funzionare senza Internet. È possibile usare un reverse proxy HTTPS alternativo diretto esclusivamente al gateway clienti.

Senza dominio e token configurati, il programma indica chiaramente che l’accesso mobile è ancora da configurare; il QR di fallback raggiunge solo la LAN. Il programma non dichiara online un dominio non verificato.

## iPhone: audio e notifiche

- Audio: nella pagina ticket premi “Prova voce”, poi “Sì, sento la voce”. Il suono usa Web Audio attivato tramite tocco e verificato in esecuzione, con sessione playback su iPhone quando disponibile e file WAV come alternativa sui browser privi di Web Audio; gli avvisi durante l’attesa/chiamata richiedono la pagina visibile e un volume adeguato. Riattivare mentre il numero è già chiamato riproduce l’avviso. Un errore di riproduzione viene mostrato e non viene segnato come avviso consegnato.
- Notifiche anche a pagina chiusa: usa HTTPS, iOS/iPadOS 16.4 o successivo. Apri il QR in Safari, Condividi → Aggiungi alla schermata Home; riapri dalla Home e premi “Attiva notifiche”. Il manifest conserva il ticket nel collegamento iniziale dell’app. Consenti il permesso richiesto.
- Premi “Invia notifica di prova” per verificare il telefono. “Accettata dal servizio push” indica la risposta del servizio, non una conferma del dispositivo. Suono delle notifiche, Full immersion e Silenzioso dipendono dalle impostazioni iOS.
- Sono implementati Service Worker, Web Push cifrato/VAPID persistente, sottoscrizioni protette dal token ticket, avvisi a due/una/zero persone di distanza, chiamata/richiamo, servizio completato e cancellazione/assenza. La coda persistente ritenta gli errori temporanei, scade gli avvisi vecchi e rimuove endpoint scaduti. Non viene richiesto di inviare push invisibili.

## Tempi di attesa per reparto

In Reparti → Modifica scegli Manuale o Automatico. Il tempo manuale è espresso in minuti per cliente ed è anche il valore iniziale in assenza di campioni. La stima per il ticket è `persone davanti × minuti medi per cliente` (arrotondata per eccesso): è indicativa, non una promessa di appuntamento.

L’automatico calcola la media degli intervalli tra due “Servito” consecutivi dello stesso reparto. Il campione è configurabile da 1 a 100 intervalli (predefinito 20). Esclude cambi di giorno del PC server e pause oltre la soglia configurata (predefinita 30 minuti). L’interfaccia mostra media, numero campioni e provenienza; nessun dato inventato. I ticket mantengono FIFO, numero e storico.

## Postazioni e stampa

Primo avvio: crea l’amministratore sul PC. Associa le postazioni tramite codice/QR monouso; l’associazione resta sulla rete interna. La finestra principale può essere chiusa: il server resta nell’area di notifica. Arrestalo dalla relativa icona. Installa il Setup per l’avvio automatico con Windows.

Configura la stampante e il driver Windows, formato 58/80 mm, poi esegui la stampa di prova. La stampa silenziosa è disponibile per il totem aperto nell’app Windows. Un browser su altro dispositivo usa il proprio dialogo di stampa. Il tag NFC fisico deve contenere il collegamento al totem associato; la sessione si abilita per 45 secondi. Stampante, lettore/tag NFC e consegna push su un iPhone reale richiedono una prova sul posto.

Le precedenti app APK collegate a Supabase non sono integrate con questo server: le postazioni qui fornite usano le interfacce web della suite.

## Verifica e compilazione

Node 22: `npm ci`, `npm rebuild better-sqlite3 --runtime=node`, `npm test`. Browser: `npx playwright install --with-deps chromium`, `npm run test:browser`. La pipeline verifica API/SQLite, gateway pubblico, VAPID e dispatch push con trasporto controllato, tempi, flusso browser e interfacce responsive. Le prove automatiche non attestano la consegna Apple su hardware reale.

La pipeline Windows include il connettore ufficiale verificato, genera Setup e portable e avvia l’EXE compilato per controllare Electron, SQLite e rendering amministratore. Gli installer non sono firmati con un certificato commerciale. Avvio rapido temporaneo “trycloudflare” non utilizzato: per i clienti serve un hostname stabile.

Gli avvisi a pagina aperta mostrano un banner e pronunciano il reparto con uno o due numeri davanti, prossimo e chiamata. Le frasi per Salumeria, Macelleria, Panetteria, Pescheria, Pasticceria, Gastronomia e Ortofrutta sono registrazioni sintetiche italiane generate con eSpeak NG 1.51, incluse in turn-voice.mp3 e indicizzate da turn-voice.json. Per nomi personalizzati si usa la voce italiana del browser, verificata dalla prova vocale. La conferma è richiesta dopo la frase completa; un errore disattiva gli avvisi vocali.
