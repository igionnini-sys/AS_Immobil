# Verifiche della prima conversione

Aggiornamento 0.2.0: ora sono presenti profili fiscali nazionali e 67 test in 5 file. Vedere [fiscalità](../FISCALITA.md) e `verifica-fiscalita.json` per gli esiti della nuova versione. Il seguito conserva le verifiche storiche della 0.1.0; i vecchi conteggi/versioni si riferiscono a quella prima consegna.

Data: 30 ottobre 2026. Versione app `0.1.0`, modello numerico `2.0.0`.

## Implementazione disponibile

- Workspace npm con motore TypeScript puro, archivio condiviso e traduzioni; UI React/Vite.
- Tutti i 19 parametri originali, risultati nominali/reali, indicatori CAGR/TIR/ROI/ROE, dettaglio annuale e note sul mutuo.
- 193 chiavi originali per lingua conservate, più i testi dei nuovi flussi e traduzione delle note precedentemente fisse in italiano. La privacy è stata aggiornata al salvataggio locale effettivo.
- Bozza automatica, scenari con nome, import/export JSON, limiti e validazione del formato, coda scritture e recupero del backup.
- Electron con renderer isolato, preload ristretto, verifica del mittente IPC, file sostituiti tramite temporaneo e attesa del salvataggio prima della chiusura.
- Progetto Android nativo, area file privata, salvataggio alla sospensione, selettore file e condivisione dell'export. Backup automatico del sistema disabilitato: il trasferimento avviene tramite export esplicito.

## Controlli automatici

| Controllo | Esito |
| --- | --- |
| `npm run lint` | Superato |
| `npm run typecheck` | Superato |
| `npm test` | 39 test superati in 4 file |
| Confronto con baseline Python | 15 scenari, inclusi 3 input invalidi; differenze del modello 2 escluse esplicitamente e provate separatamente |
| TIR analitico e residuo NPV | Superato; casi senza soluzione e con radici ambigue gestiti |
| Archivio: accodamento, backup, errore di lettura/scrittura, riapertura e import | Superato |
| UI: calcolo, modifica, scenario, riapertura, lingua, export e input invalidi | Superato in ambiente DOM simulato |
| Compilazione asset web e bundle principale desktop | Superata |

I test UI con DOM simulato non costituiscono una prova browser completa. Il Browser della sessione non era disponibile; non è stata simulata una verifica visiva desktop che non si è potuta effettuare.

## Windows

Prodotti installer NSIS `release/Immobiliare-0.1.0-win-x64.exe` e cartella `release/win-unpacked/`. Eseguito lo smoke sia dal sorgente sia dall'eseguibile confezionato: renderer caricato e scrittura reale dell'archivio tramite IPC completata, `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`.

Il test usa una directory temporanea separata dall'archivio personale. Il pacchetto non include Python. Installer senza certificato di produzione; l'installazione guidata, l'aggiornamento di una versione precedente e una revisione visiva desktop completa restano da provare. Alla chiusura del test l'ambiente ha emesso messaggi GPU di Chromium, senza impedire caricamento o scrittura.

## Android

Prodotto `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk` con JDK Microsoft 21.0.13, SDK Platform 36, Build Tools disponibili 35.0.0/35.0.1/36.0.0, Gradle 8.14.3 e Android Gradle Plugin 8.13.0. L'APK è firmato con chiave di debug, non destinato alla pubblicazione.

Compilato anche `apps/mobile/android/app/build/outputs/bundle/release/app-release.aab`, senza firma di produzione. Percorsi, dimensioni e SHA-256 degli artefatti sono conservati in `verifica.json`.

Installazione e avvio verificati sull'emulatore Android 16 / API 36, x86_64, WebView 133, 1080×2400. Avviato in modalità senza finestra e senza scritture permanenti nell'AVD originale (`-read-only -no-snapshot`).

Verifiche native effettuate:

1. Schermata iniziale controllata tramite screenshot: campi leggibili e nessun taglio orizzontale.
2. Creazione reale di `files/immobiliare/archive.json` tramite plugin nativo.
3. Modifica dell'affitto mensile a 1500 EUR e conferma di `affitto_lordo=18000` nel file privato.
4. Calcolo dall'interfaccia: risultati e metriche presenti nella gerarchia di accessibilità Android.
5. Arresto dell'app e recupero dei dati; corruzione intenzionale del solo archivio di prova e conferma, dalla UI, di «Dati recuperati dal backup» con affitto mensile 1500 EUR.
6. Ulteriore riapertura normale con affitto 1500 EUR e senza avviso di recupero; reinstallazione dell'APK aggiornato con dati conservati.

Evidenze in `evidenze/`: screenshot dell'avvio, gerarchie di accessibilità dei risultati, recupero e riapertura. Tutti i dati nelle evidenze sono valori di prova.

Il primo avvio dell'emulatore e del WebView richiede attesa: alcuni dump acquisiti troppo presto contenevano solo il contenitore WebView. Le verifiche positive sono state acquisite dopo il caricamento effettivo.

Restano da verificare un dispositivo fisico, rotazione, tasto Indietro, sospensione/ripresa nelle varie condizioni, import/export attraverso i selettori Android e aggiornamento da una precedente installazione. Non si certifica il supporto di ogni versione Android a partire dal minimo dichiarato API 24; il bundle richiede WebView Chromium 100 o superiore.

## Linux e automazione

Configurazione Electron/AppImage x64 presente. Nessun host Linux disponibile per esecuzione locale: nessun AppImage dichiarato prodotto o verificato. Il workflow manuale `.github/workflows/build.yml` prepara controlli e packaging su Windows, Ubuntu 24.04 e Android, ma non è stato eseguito su un servizio remoto.

## Differenze intenzionali rispetto a Python

| ID | Cambiamento e verifica |
| --- | --- |
| N01 | TIR con controllo del residuo, intervallo e iterazioni limitati; più cambi di segno producono esito ambiguo, senza radice arbitraria |
| N02 | Commissione finale deflazionata insieme al flusso terminale; anche rendimento reale e CAGR reale usano la commissione attualizzata |
| N03 | Per il ROI reale le rate riaggiunte sono deflazionate; test indipendente di equivalenza al caso senza mutuo |
| N04 | ROE con mutuo resta una stima sul capitale totale, dichiarata nella UI; non sono inventati dati del finanziamento |
| N05 | Validazione su UI, motore e import; massimo operativo 100 anni e importi limitati a 10^12 EUR dove non esisteva un massimo |
| N06 | Annualizzazione con capitale finale negativo restituisce valore assente e spiegazione, mai numeri complessi nel JSON |

Il comportamento «sola ristrutturazione con acquisto a zero» è conservato e segnalato nella UI. `MODEL_VERSION` separa i nuovi risultati dalla baseline `legacy-v1`; il riferimento originale non è stato aggiornato per eliminare differenze.

## Versioni e ambiente

Node 24.15.0, npm 11.12.1, TypeScript 5.9.3, React 19.3.1, Vite 8.3.5, Vitest 5.0.5, Electron 45.1.0, electron-builder 26.18.0, Capacitor 8.6.0. Versioni esatte e dipendenze transitive nel lockfile.

Toolchain portabile in `.tools/`, ignorato da Git; JDK e piattaforma SDK scaricati dalle fonti ufficiali e verificati con i checksum pubblicati. Build Tools collegati all'installazione SDK esistente; non sono state cambiate variabili globali della macchina. I sorgenti Python restano invariati; il README principale è stato aggiornato intenzionalmente e l'originale è nella copia verificata `legacy-v1.zip`.

## Punto di ripresa

Completare prima la qualificazione Linux e le prove native rimaste su Windows/Android. Conservare gli archivi di prova, le versioni e gli esiti nel registro. Firma e pubblicazione di produzione sono attività successive, non effettuate in questa sessione.
