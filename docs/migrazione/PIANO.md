# Piano di conversione da eseguire

Data: 30 ottobre 2026. Piano di riferimento; implementazione avviata e prima versione compilata. Lo stato effettivo delle fasi e delle verifiche è conservato in `stato.json`, `PROGRESSI.md` e `VERIFICHE.md`.

## Risultato atteso

Un'app per analisi immobiliare installabile su Windows, Linux e Android, sviluppata con Node.js e TypeScript, utilizzabile offline, con calcoli condivisi, italiano/inglese e recupero dei dati dopo chiusura. Nessuna dipendenza Python nei pacchetti finali.

## Struttura proposta

```text
Immobil/
  package.json                  # npm workspaces e comandi comuni
  package-lock.json             # versioni risolte
  packages/
    core/src/                   # tipi, validazione, simulazione, TIR e metriche
    i18n/src/                   # dizionari it/en e codici dei messaggi
    storage/src/                # contratti e formato JSON versionato
  apps/
    web/src/                    # UI React condivisa e adapter IndexedDB
    desktop/                    # Electron main, preload, adapter file, packaging
    mobile/                     # configurazione Capacitor, adapter, progetto android/
  tests/
    numerical/                  # confronti baseline e casi analitici
    integration/                # persistenza e import/export
    e2e/                        # flussi UI principali
  docs/migrazione/               # analisi, piano e avanzamento
  REIT.py, calcoli.py, ...       # riferimento Python durante il porting
```

Non creare un server HTTP per i calcoli: `core` gira nella UI web, nel renderer desktop e nella WebView Android. I contenitori delegano la sola persistenza e le funzioni native ai rispettivi adapter. Le dipendenze native non entrano nel bundle condiviso.

## M0 — Analisi e preparazione (completata)

- [x] Inventario di funzioni, dipendenze, parametri e traduzioni.
- [x] Problemi esistenti documentati con riferimenti al sorgente.
- [x] Architettura proposta e separazione dei runtime.
- [x] Registro progressi e acquisizione riproducibile dei risultati Python.

Uscita: documenti presenti, JSON leggibili e baseline acquisita. Il completamento di M0 non significa che l'app sia convertita.

## M1 — Base Node.js e contratti

Dipendenze: M0.

1. Verificare gli hash della baseline contro i sorgenti correnti; creare una copia verificata o repository Git prima di spostare file.
2. Fissare la patch Node LTS e versioni compatibili di TypeScript, React, Vite, Electron, Capacitor e relativi plugin; registrare requisiti OS e toolchain.
3. Creare npm workspaces, TypeScript con controlli rigorosi, lint, build e test. Preferire script Node o comandi npm portabili, evitando comandi specifici di PowerShell/bash.
4. Definire tipi di input/risultati, unità, messaggi diagnostici, `schemaVersion` e `modelVersion`. Usare ID stabili per l'adeguamento: `property_value`, `inflation`, `none`.
5. Separare i campi UI dai parametri annuali del motore, conservando i 19 parametri attuali. Fissare un limite operativo agli anni, proposto 100, documentando la differenza rispetto all'assenza di limite attuale.

Uscita: installazione riproducibile con `npm ci`, compilazione dei pacchetti base e validazione dei valori iniziali. Nessuna importazione Node nei pacchetti condivisi.

## M2 — Motore di calcolo e confronto numerico

Dipendenze: M1.

1. Portare simulazione annuale, investimento iniziale, costi, affitti, flussi e metriche da `calcoli.py` in funzioni pure.
2. Confrontare tutte le serie e le metriche numeriche con `baseline.json`. Ignorare nei confronti numerici i testi di presentazione; conservare i codici delle note.
3. Implementare TIR con limite di iterazioni, intervallo valido, controllo di convergenza e residuo NPV; casi senza soluzione e ambigui producono un esito esplicito.
4. Aggiungere prove analitiche indipendenti: `[-100, 110]` -> 10%; `[-100, 0, 121]` -> 10%; flussi tutti dello stesso segno -> assente; `[-100, 230, -132]` -> ambiguità (radici 10% e 20%).
5. Gestire correzioni N01–N06 separatamente e mantenere la tracciabilità delle differenze. Per il flusso reale terminale verificare l'equivalenza alla deflazione del flusso nominale completo.
6. Validare valori finiti, interi, intervalli e combinazioni. Rata positiva con zero anni residui richiede un messaggio chiaro. Annualizzazione non definita -> valore assente e motivazione.

Uscita: nessun `NaN`, infinito o valore complesso nei risultati serializzati; parità sui casi non interessati dalle correzioni. Tolleranza iniziale proposta per parità: errore assoluto <= `1e-6` oppure relativo <= `1e-9`; per TIR in frazione errore <= `1e-7` e residuo NPV <= `1e-8 * max(1, somma dei valori assoluti dei flussi)`. Eventuali deroghe motivate e registrate, mai nascoste da arrotondamenti della UI.

## M3 — UI e traduzioni

Dipendenze: M2.

1. Ricreare i gruppi immobile, costi/mutuo ed economia in layout responsive, con campi utilizzabili su telefono e tastiera numerica appropriata.
2. Trasferire 193 chiavi per lingua, includendo i testi oggi scritti direttamente in italiano. Formattare valuta e numeri per lingua; gli ID dei parametri non cambiano con le traduzioni.
3. Visualizzare gli stessi risultati, note sul modello e stima ROE; mantenere risultati e form in uno stato esplicito. Segnalare quando i risultati si riferiscono a input precedenti.
4. Aggiungere i comandi per nuovo scenario, salvataggio, elenco e recupero bozza, collegandoli all'interfaccia di persistenza di M4.

Uscita: flusso inserimento -> calcolo -> modifica -> nuovo calcolo verificato in italiano e inglese, navigabile da tastiera e su larghezza telefono; nessun contenuto tagliato nei risultati.

## M4 — Salvataggio di simulazioni e progressi utente

Dipendenze: M1; integrazione con M3 e contenitori M5/M6.

1. Implementare repository e serializzazione JSON con validazione in ingresso e uscita, bozza, preferenze, identificatori e date ISO.
2. Salvare input normalizzati e versione del modello. I risultati possono essere una cache con versione: ricalcolarli o segnalarli se obsoleti, senza sostituire silenziosamente risultati di un modello differente.
3. Gestire coda scritture, backup, recupero dopo interruzione, file corrotto, spazio esaurito e migrazione dello schema.
4. Realizzare import/export JSON con limite iniziale proposto di 5 MiB, controllo versione, duplicati e numero massimo di scenari proposto 1000; rifiutare versioni future non supportate senza alterare l'archivio.

Contratto proposto (esempio strutturale, non un file utente importabile):

```text
schemaVersion: 1
preferences: { language: "it", activeScenarioId: UUID | null }
draft: { inputs: tutti i 19 parametri validati, updatedAt: ISO-8601 } | null
scenarios: [
  { id: UUID, name: string, createdAt: ISO-8601, updatedAt: ISO-8601,
    modelVersion: string, inputs: tutti i 19 parametri validati }
]
```

Uscita: chiusura e riapertura recuperano bozza e scenari; import/export conserva dati e unità; il recupero da backup è verificato. I file dell'utente risiedono nella directory dati della piattaforma, separatamente dai documenti di migrazione del progetto.

## M5 — App Windows e Linux

Dipendenze: M2, M3, M4.

1. Integrare Electron con `nodeIntegration: false`, `contextIsolation: true`, sandbox, policy sui contenuti e preload con API minime. Validare richieste IPC e limitare le scritture alla directory dati.
2. Caricare asset locali compilati e implementare adapter file, dialoghi di import/export e gestione della chiusura con salvataggi pendenti.
3. Configurare packaging, icona, nome app, versione e percorso dati stabile; produrre installer Windows e AppImage Linux su host appropriati.
4. Provare avvio, calcolo, cambio lingua, riapertura, import/export e aggiornamento dell'app conservando i dati. Registrare sistemi e architetture realmente provati.

Uscita: due artefatti avviati su Windows e Linux, offline, su macchine senza Python o installazione Node separata. Una build compilata ma non avviata non soddisfa la verifica della piattaforma.

## M6 — App Android

Dipendenze: M2, M3, M4; M5 non necessario per iniziare questa fase.

1. Verificare o predisporre Android Studio/SDK, JDK, Gradle wrapper e dispositivo/emulatore per la versione Capacitor fissata in M1.
2. Creare il progetto Android e collegarlo allo stesso bundle UI tramite `webDir`; includere gli asset nel pacchetto senza URL di sviluppo nella configurazione di rilascio.
3. Implementare adapter Filesystem in area privata, salvataggio alla sospensione, recupero e selettore documenti per import/export. Evitare permessi generali di accesso ai file quando basta il contenitore privato.
4. Verificare tastiera, tasto Indietro, rotazione, sospensione/ripresa e chiusura del processo; provare offline e dopo riavvio.
5. Produrre APK di prova e configurare AAB; annotare API minime/target effettive e dispositivi testati. Le credenziali di firma produzione non entrano nel progetto.

Uscita: APK installato e flussi principali verificati su emulatore/dispositivo; risultati identici a quelli desktop per gli stessi input e versione del modello. Conservazione dati verificata dopo aggiornamento.

## M7 — Chiusura e consegna

Dipendenze: M5 e M6.

1. Verificare su tutte le piattaforme gli stessi scenari, incluse commissioni, costi effettivi, tre adeguamenti, mutuo che termina prima dell'investimento e casi senza TIR.
2. Verificare trasferimento JSON desktop -> Android e Android -> desktop.
3. Aggiornare README principale con comandi realmente funzionanti, ambienti supportati, installazione e dati locali; registrare differenze rispetto a Python.
4. Automatizzare build e verifiche su Windows/Linux e build Android se disponibile un servizio CI; conservare anche istruzioni riproducibili locali. Non pubblicare senza richiesta.
5. Aggiornare progressi con percorsi artefatti, versioni, comandi eseguiti ed esiti. Rimuovere il riferimento Python dalla distribuzione finale solo dopo verifica di parità.

Uscita: compilazione pulita dal lockfile, verifiche numeriche/UI/persistenza superate e prove native documentate per le tre piattaforme. Finché una prova nativa manca, indicare la piattaforma come non verificata.

## Comandi da predisporre durante l'esecuzione

Gli script implementati sono nel `package.json` principale. Per i flussi UI è disponibile `npm run test:ui` (test DOM); non è ancora presente una suite browser `test:e2e`.

| Script | Scopo |
| --- | --- |
| `npm run dev` | Anteprima UI |
| `npm run lint` / `npm run typecheck` | Controlli statici |
| `npm test` | Motore e persistenza |
| `npm run test:e2e` | Flussi UI |
| `npm run build` | Compilazione pacchetti e asset |
| `npm run desktop:dev` | Avvio desktop durante lo sviluppo |
| `npm run desktop:dist` | Packaging per l'host configurato |
| `npm run android:sync` | Compilazione UI e sincronizzazione progetto Android |
| `npm run android:debug` | Build APK di prova tramite Gradle wrapper |

## Ripresa e rischi pratici

Per la prossima attività leggere `stato.json`: il punto di ripresa è stato aggiornato dopo l'implementazione. Il README principale è stato aggiornato intenzionalmente; il suo hash originale è verificabile nella copia `legacy-v1.zip`.

I principali rischi sono divergenze numeriche, localizzazione incompleta, perdita di dati nelle sospensioni Android e disponibilità di host per le prove native. Il piano li affronta con baseline, codici messaggio condivisi, backup e una matrice di verifica per piattaforma. Gli input attuali non permettono di introdurre un modello completo del debito senza ampliare il perimetro.
