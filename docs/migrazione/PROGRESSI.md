# Registro progressi

## 30 ottobre 2026 — M0 completata

Attività eseguite:

- Letti tutti i sorgenti dell'app e `requirements.txt`.
- Estratti 19 parametri del motore e i relativi valori iniziali; verificate 193 chiavi per ciascuna delle due lingue.
- Identificati calcoli condivisibili, dipendenze Streamlit, assenza di salvataggio e limiti numerici.
- Verificati Node.js/npm/Python e disponibilità delle dipendenze Python; toolchain Android non risolto dal PATH.
- Consultata documentazione ufficiale Node.js, Electron e Capacitor.
- Preparati analisi, piano M0–M7, decisioni, stato elaborabile e generatore del riferimento Python.
- Acquisita `baseline.json` con scenari normali, casi limite, diagnostica TIR e hash dei sorgenti.
- Verificati sintassi Python del generatore, JSON, collegamenti locali, presenza degli artefatti e corrispondenza degli hash. La baseline contiene 15 scenari e 5 casi TIR.

La conversione applicativa non è iniziata. Nessun sorgente Python esistente è stato modificato; nessuna dipendenza installata. Non sono state eseguite build o prove native della futura app.

## 30 ottobre 2026 — Prima implementazione eseguibile

Autorizzazione ricevuta: «ok incomincia a convertire».

- Verificati hash originali e copia `legacy-v1.zip`; sorgenti Python conservati.
- M1: creati workspace npm, TypeScript rigoroso, lockfile e script portabili; verificata anche reinstallazione con `npm ci`.
- M2: portati i 19 parametri e tutti i calcoli in `packages/core`; confrontata la baseline e introdotte le rettifiche documentate N01–N06, modello `2.0.0`.
- M3: UI React responsive, tutte le traduzioni originali e nuovi testi bilingui; schermata mobile controllata tramite screenshot dell'app Android.
- M4: archivio JSON validato, bozza, scenari, backup e import/export; una bozza esportata viene recuperata anche se non era stata salvata come scenario con nome.
- M5: pacchetto Windows e installer NSIS prodotti; avvio del renderer e scrittura IPC verificati sia dal sorgente sia dall'eseguibile confezionato. AppImage configurato; host Linux non disponibile.
- M6: progetto Capacitor Android generato; APK compilato, installato e avviato su Android 16 API 36 nell'emulatore. Provati calcolo, modifica dell'affitto, salvataggio su file, riapertura e recupero da backup dopo corruzione intenzionale dell'archivio di prova.
- Predisposta pipeline manuale per Windows/Linux/Android; nessuna esecuzione su servizi remoti o pubblicazione effettuata.
- Verifiche: `npm ci`, lint, controlli TypeScript, 39 test in 4 file, build web/desktop e Android. Dettagli e limiti in `VERIFICHE.md`.
- Compilato anche l'AAB release Android senza firma di produzione; dimensioni e checksum degli artefatti in `verifica.json`. Conservate evidenze native in `evidenze/` e chiuso l'emulatore di prova al termine.

Toolchain Java/SDK portabile in `.tools/`, ignorato da Git. Nessuna variazione globale delle variabili d'ambiente. Il Browser della sessione non era disponibile: i test UI usano DOM simulato; la revisione visiva mobile usa screenshot nativi Android.

## Prossimo passo

Completare M5/M6: build e avvio su Linux, controllo visivo desktop, installazione/aggiornamento Windows, prove Android su dispositivo fisico e verifica dei selettori import/export, rotazione e sospensione. M7 resta aperta finché non è completata la matrice delle tre piattaforme. Consultare `stato.json` e `VERIFICHE.md`.

## 30 ottobre 2026 — Profili nazionali, app 0.2.0

Richiesta: due sezioni per investitori italiani e tedeschi con tassazione e calcoli personalizzabili. Perimetro confermato dall'utente: prima i casi nazionali dei privati.

- Aggiunte sezioni Generale / Italia / Germania, bozze indipendenti e scenari filtrati per profilo.
- Modello `3.0.0`: cedolare/IRPEF/IMU/acquisto Italia; ESt 2026, splitting, AfA, interessi e costi deducibili, Soli, Kirchensteuer, Grundsteuer e Grunderwerbsteuer Germania.
- Voci personalizzate annuali di costo/ricavo, indicizzazione, deducibilità tedesca, costi iniziali extra e imposta di vendita manuale. Nessuna esecuzione di formule JavaScript dall'utente.
- Schema archivio `2`, con migrazione automatica dei vecchi archivi, conservazione dei profili in import/export e recupero di tutte le bozze.
- Verificate le regole contro fonti primarie, con fonti e perimetro visibili nell'app e documentati in `docs/FISCALITA.md`.
- Le due aliquote generiche vengono sostituite dal profilo nazionale, senza doppio addebito. Il ROI senza leva elimina anche il beneficio fiscale degli interessi.
- Controlli statici e compilazione superati; 67 test superati in 5 file, inclusi casi fiscali indipendenti e flussi delle due sezioni.
- Rigenerati installer Windows 0.2.0, APK Android e AAB. Nessuna firma o pubblicazione di produzione.
- Eseguito lo smoke dell'eseguibile Windows confezionato. Su emulatore Android API36 verificate UI fiscali Italia/Germania e presenza delle due bozze indipendenti nel file privato; screenshot in `evidenze/android-fiscalita-*.png`. Esiti e checksum della 0.2.0 in `verifica-fiscalita.json`.

Rimangono aperte le verifiche native e i limiti di piattaforma della conversione iniziale. La fiscalità di vendita è manuale e le proiezioni usano regole 2026 costanti: non dichiarare il motore equivalente a un software completo di dichiarazione fiscale.

## 30 ottobre 2026 — Avvio rapido desktop

- Aggiunti `avvia.bat` per Windows e `avvia.sh` per Linux; verificano Node.js/npm e installano le dipendenze se mancanti prima di compilare e avviare l'app.
- Aggiornate le istruzioni nel README, compreso il comando per rendere eseguibile lo script Linux.
- Provato l'avvio Windows da una directory diversa con `--smoke-test`: renderer e salvataggio IPC funzionanti.
- Verificati sintassi e avvio di `avvia.sh` tramite Git Bash su Windows, sempre con `--smoke-test`. Non è una prova nativa su Linux: resta aperta la verifica su un host Linux.

## 30 ottobre 2026 — Avvio con schermata grigia

- Segnalazione dell'utente: finestra grigia avviando `avvia.bat`.
- Archivio e backup esistenti risultano leggibili. Una prova isolata con copia dei dati salvati ha visualizzato l'interfaccia correttamente; la causa esatta della segnalazione non è stata riprodotta.
- Su Windows l'app desktop usa ora il rendering software e la finestra viene mostrata solo dopo la conferma che l'interfaccia è pronta. In caso di caricamento fallito o bloccato, una finestra di errore consente di riprovare o chiudere.
- Aggiunta una schermata di recupero per errori di rendering React, senza cancellare dati.
- Verificato l'avvio visibile da `avvia.bat` con una copia isolata dei dati, controllando lo screenshot e l'attivazione del rendering software. Simulata anche l'assenza dell'interfaccia per controllare che l'avvio fallisca senza bloccarsi. Lint, compilazione e 68 test superati.
- Preparato installer Windows desktop `0.2.1`. La conferma sul caso segnalato resta da ottenere all'avvio dell'utente.
- Verificato anche l'eseguibile confezionato con finestra visibile e copia isolata dei dati: rendering software attivo, scrittura riuscita e screenshot identico alla prova dal sorgente.
- La policy dell'ambiente ha bloccato la rimozione automatica delle copie diagnostiche. Restano `%TEMP%/immobiliare-smoke-8`, `%TEMP%/immobiliare-smoke-10056`, `%TEMP%/immobiliare-smoke-15836` e gli screenshot `.tools/windows-current-data.png`, `.tools/windows-fixed-visible.png`, `.tools/windows-packaged-fixed.png`.

## 30 ottobre 2026 — Correzione dell'avvio della finestra

- Dopo il nuovo screenshot dell'utente, la prova è stata ripetuta con la stessa chiamata di apertura della finestra usata dall'app, invece di `showInactive()`.
- Con `windowsHide: true` il controllo ha rilevato `WINDOW_NOT_VISIBLE`; con `windowsHide: false` la finestra è risultata visibile e l'interfaccia è stata verificata anche tramite acquisizione del desktop Windows.
- Modificato `scripts/desktop-run.mjs` affinché l'app interattiva sia avviata senza nascondere la finestra. Il rendering software e la gestione degli errori di avvio restano attivi.
- Lint e 68 test superati; prova `avvia.bat --smoke-test --smoke-show` da ripetere dopo ogni modifica all'avvio. La conferma nel normale utilizzo dell'utente rimane utile.

## Regole per aggiornare questo registro

Al termine di ogni attività significativa aggiornare anche `stato.json`: stato della fase, elenco file, comando di verifica, esito, problemi aperti e prossimo passo. Stati ammessi: `todo`, `in_progress`, `done`, `blocked`. Una fase è `done` solo quando soddisfa i criteri di uscita; usare `blocked` solo per impedimenti concreti, con descrizione di ciò che manca.

Per ogni piattaforma conservare sistema operativo, architettura, versione dell'app, artefatto e prove effettuate. Non dedurre la compatibilità nativa dalla sola compilazione della UI.

La baseline è una fotografia del codice esistente: non rigenerarla dopo modifiche per eliminare differenze inattese. In caso di modifiche intenzionali ai sorgenti conservare il riferimento precedente con un nuovo nome/versione.
