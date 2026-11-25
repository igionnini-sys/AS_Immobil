# Immobiliare

Calcolatore di investimenti immobiliari offline, convertito da Python/Streamlit a Node.js e TypeScript. Interfaccia React condivisa, Electron per Windows/Linux e Capacitor per Android.

Sono implementati i 19 parametri originali, simulazione annuale, rivalutazione, inflazione, costi, mutuo, commissioni, CAGR, TIR, ROI e ROE, italiano/inglese, salvataggio automatico della bozza, scenari con nome, backup e import/export JSON. La versione desktop è `0.2.1`, con modello `3.0.0`; l'ultima build Android è `0.2.0`.

## Italia e Germania

Tre sezioni indipendenti: **Generale**, **Italia**, **Germania**. I profili nazionali coprono privati residenti nel Paese dell'immobile e locazioni residenziali a lungo termine; bozze e scenari restano separati.

- Italia: cedolare 21%/10% con conferma dei requisiti, IRPEF incrementale 2026, addizionali stimate, IMU catastale, riduzioni per canone concordato e acquisto seconda casa da privato oppure imposte manuali.
- Germania: Einkommensteuer 2026 e splitting, costi/interessi deducibili, AfA residua, Soli, Kirchensteuer, Grundsteuer da avviso e Grunderwerbsteuer con aliquota del Land inserita.
- Entrambe: costi e ricavi annui personalizzati, indicizzazione, costi iniziali extra e imposte di vendita manuali; dettaglio di imponibile, deduzioni e imposte annuali.

Le aliquote generiche su canoni/valore immobiliare vengono sostituite dal profilo nazionale, senza doppia tassazione. Le regole 2026 restano costanti nella proiezione. Le imposte di vendita non sono calcolate automaticamente: zero significa nessuna imposta di vendita aggiunta. Le stime non includono tutte le variabili di una dichiarazione fiscale; leggere [fonti, formule e limiti](docs/FISCALITA.md).

## Avvio

Prerequisito: Node.js 24 LTS (verificato con 24.15.0) e npm. I pacchetti installabili finali non richiedono Node.js o Python sul dispositivo dell'utente.

Per avviare l'app desktop dalla cartella del progetto:

- **Windows:** aprire `avvia.bat` con un doppio clic.
- **Linux:** eseguire `chmod +x avvia.sh` una volta, poi `./avvia.sh` da terminale.

Gli script usano la propria cartella come directory di lavoro, installano le dipendenze al primo avvio se `node_modules` è assente, compilano il progetto e aprono l'app desktop. Il primo avvio richiede una connessione per scaricare le dipendenze.

Su Windows la finestra viene mostrata quando l'interfaccia è pronta e usa il rendering software, per migliorare la compatibilità con i driver video. Se il caricamento non riesce, viene visualizzato un messaggio con la possibilità di riprovare.

```sh
npm ci
npm run dev
```

Aprire `http://127.0.0.1:5173`. L'anteprima usa IndexedDB per salvare i dati; il pacchetto desktop usa file locali e Android l'area privata dell'app.

Per avviare direttamente il desktop:

```sh
npm run desktop:dev
```

## Verifiche e build

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm run desktop:smoke
npm run desktop:dist
```

`npm test` include confronti con 15 scenari Python, prove analitiche del TIR, validazione, persistenza, recupero da backup e flussi dell'interfaccia. `npm run test:ui` esegue solo i test UI. Lo smoke desktop verifica il caricamento reale del renderer e una scrittura tramite IPC in una directory temporanea, senza usare l'archivio personale.

`desktop:dist` produce un installer NSIS su Windows e un AppImage su Linux nella cartella `release/`. Eseguire la build su ciascun sistema; non si presume che una compilazione Windows verifichi Linux. `desktop:pack` produce la cartella eseguibile senza installer. L'installer Windows di prova non ha una firma di produzione.

## Android

Il progetto nativo si trova in `apps/mobile/android`. Richiede JDK 21, Android SDK Platform 36, Build Tools 36 e un WebView aggiornato; la versione minima dichiarata è Android 7 / API 24, il bundle web richiede almeno WebView Chromium 100. La prova effettuata usa Android 16 / API 36 e WebView 133, non certifica tutte le versioni precedenti.

Configurare `JAVA_HOME` e `ANDROID_HOME` per il proprio toolchain, oppure aprire il progetto in Android Studio compatibile con Capacitor 8.

```sh
npm run android:debug
```

Il comando compila la UI, sincronizza gli asset e genera `apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk`. Per generare l'AAB, ancora da firmare per la distribuzione:

```sh
npm run android:bundle
```

Per aprire Android Studio: `npm run open --workspace @immobil/mobile`. Java e SDK portabili eventualmente presenti in `.tools/java` e `.tools/sdk` sono riconosciuti dallo script senza cambiare le impostazioni globali; non vengono distribuiti né inclusi in Git.

## Dati e trasferimento

- La bozza valida viene salvata automaticamente dopo una pausa nella modifica. I campi non validi non sostituiscono l'ultima bozza valida.
- «Salva scenario» crea uno scenario con nome, oppure aggiorna quello aperto. «Nuovo scenario» inizia una nuova simulazione.
- Desktop: `data/archive.json` e `data/backup.json` nella directory `userData` di Electron (tipicamente `%APPDATA%/Immobiliare` su Windows o `~/.config/Immobiliare` su Linux).
- Android: `files/immobiliare/archive.json` e relativo backup nell'area privata dell'app. La disinstallazione può cancellarli.
- Browser: database IndexedDB `immobiliare-v1`, separato dai dati desktop/Android.
- Esportare JSON per creare un backup trasferibile. Importare aggiunge nuove copie degli scenari; una bozza differente viene aggiunta come «Bozza importata». Non sovrascrive gli scenari esistenti.
- Formato `schemaVersion: 2`, massimo 5 MiB e 1000 scenari. Migrazione automatica degli archivi versione 1. I nuovi archivi richiedono la nuova app; non alternare la vecchia versione sullo stesso archivio. Versioni future, valori non validi e duplicati interni sono rifiutati.

## Stato della conversione

Consultare [progressi](docs/migrazione/PROGRESSI.md), [stato strutturato](docs/migrazione/stato.json) e [verifiche](docs/migrazione/VERIFICHE.md) per distinguere ciò che è implementato, compilato e provato sulle singole piattaforme. La pipeline manuale `.github/workflows/build.yml` prepara build Windows/Linux/Android una volta inserito il progetto in un repository GitHub; non è stata eseguita in questa sessione.

Il motore mantiene il mutuo semplificato: non calcola ammortamento o debito residuo; il ROE con mutuo è una stima. Le differenze numeriche rispetto a Python sono descritte nelle verifiche. L'app è una simulazione educativa e non costituisce consulenza finanziaria.

## Riferimento Python

I sorgenti originali sono conservati e la copia verificata `docs/migrazione/legacy-v1.zip` permette di ricostruire la versione iniziale. Per avviarla: `python -m streamlit run REIT.py` dopo aver installato `requirements.txt`. La baseline originale non è stata rigenerata durante il porting.
