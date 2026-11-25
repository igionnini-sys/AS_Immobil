# Decisioni per la conversione

Data: 30 ottobre 2026. Scelte adottate nella prima implementazione; vedere `VERIFICHE.md` per versioni e limiti verificati.

## D01 — Perimetro della sessione

Il piano è stato preparato nella prima sessione. Con il successivo «ok incomincia a convertire» l'utente ha autorizzato l'implementazione. I sorgenti Python restano il riferimento per il confronto.

## D02 — Node.js, desktop e Android

Usare TypeScript, npm workspaces e Node.js 24 LTS come base iniziale. Per questa implementazione è stata mantenuta la 24.15.0 disponibile, verificata con gli `engines` delle dipendenze, senza aggiornare globalmente il computer. `.node-version` registra la versione provata, il lockfile le dipendenze esatte; prima della distribuzione di produzione aggiornare e riverificare una patch LTS corrente. La versione Node installata per sviluppo è distinta da quella inclusa in Electron.

Motore TypeScript puro e UI React + Vite condivisi. Electron per Linux e Windows; Capacitor per Android. La UI non importa `node:fs` o altre API Node. Il processo principale Electron usa Node per l'accesso locale; Android usa WebView e plugin nativi. Il telefono deve poter funzionare senza un server Node remoto o Python installato.

Questa è l'interpretazione proposta della richiesta «app con Node.js compatibile con Android»: progetto JavaScript/TypeScript sviluppato con Node e runtime appropriato per piattaforma. Un requisito di eseguire specificamente il processo Node sul telefono cambierebbe l'architettura e va distinto da questa proposta.

Motivo della scelta: l'app è un calcolatore senza API server; un motore condiviso evita due implementazioni delle formule. Electron include Node e Chromium per desktop; Capacitor fornisce il contenitore Android. Alternative scartate per questa prima versione: server Node necessario per ogni calcolo; Electron su Android; backend Python incorporato.

## D03 — Dati locali e funzionamento offline

Interfaccia `ScenarioRepository` con operazioni di lettura, salvataggio, elenco, eliminazione, importazione ed esportazione. Record JSON versionati e una sola coda di scrittura per archivio.

- Desktop: file nella directory `app.getPath('userData')`, tramite IPC ristretto; scrittura temporanea, backup e sostituzione nella stessa directory.
- Android: file nel contenitore privato tramite `@capacitor/filesystem`, `Directory.Data`; verificare sostituzione e recupero su dispositivo senza presumere garanzie identiche a quelle desktop.
- Anteprima browser: adapter IndexedDB; serve per sviluppo e verifica della UI, non sostituisce i pacchetti richiesti.
- Preferenze: lingua e scenario attivo; bozza salvata dopo una breve pausa nella modifica e prima della sospensione, con indicazione di eventuali errori.
- Trasferimento fra dispositivi: esportazione/importazione JSON avviata dall'utente; selettore file di sistema su desktop e Android. Il plugin Filesystem gestisce l'archivio privato; la selezione di file condivisi su Android richiede integrazione dedicata con il selettore documenti, da verificare in M6.

Importazione: validare dimensioni, versione e contenuto; non interpretare percorsi provenienti dal JSON; non sovrascrivere record esistenti senza una scelta esplicita nella UI. Per crash o file corrotto recuperare l'ultimo backup valido e mostrare l'esito. La disinstallazione può eliminare i dati locali: offrire backup esportabile.

## D04 — Parità e correzioni numeriche

Separare i riferimenti `legacy-v1` dai risultati del nuovo `modelVersion`. Prima confrontare i risultati sui casi regolari; poi registrare rettifiche N01–N06 con motivazione, input e differenze attese. Non aggiornare i riferimenti Python per far coincidere un risultato nuovo.

Il solver TIR restituisce valore assente e codice diagnostico quando non trova una soluzione con residuo accettabile. Con più cambi di segno segnalare ambiguità e non presentare una radice arbitraria come unica. Non promettere il calcolo esatto del ROE con mutuo senza dati del debito: rimane una stima dichiarata.

## D05 — Distribuzione e verifica

Obiettivo iniziale Windows x64 e Linux x64, con formato Windows installabile e Linux AppImage; Android APK per prova e AAB per distribuzione successiva. Distribuzioni Linux, versioni minime di Windows/Android e architetture aggiuntive saranno fissate dopo la scelta delle versioni dei contenitori e annotate in M1/M6. Non promettere compatibilità con ogni versione del sistema operativo.

Build desktop e verifiche native su host Windows e Linux. Build Android con SDK/JDK/Gradle compatibili con la versione Capacitor scelta, registrando le versioni; test su emulatore e almeno un dispositivo disponibile. Firma di produzione e pubblicazione restano attività separate con credenziali del titolare; sono sufficienti artefatti di prova per verificare la conversione locale.

## Fonti tecniche consultate

Fonti ufficiali consultate il 30 ottobre 2026; ricontrollare requisiti e supporto all'inizio dell'implementazione.

- [Node.js: release e supporto LTS](https://nodejs.org/en/about/previous-releases).
- [Electron: introduzione e piattaforme desktop](https://www.electronjs.org/docs/latest/).
- [Electron: sicurezza e separazione dei processi](https://www.electronjs.org/docs/latest/tutorial/security).
- [Capacitor: runtime mobile](https://capacitorjs.com/docs).
- [Capacitor: ambiente di sviluppo](https://capacitorjs.com/docs/getting-started/environment-setup).
- [Capacitor: Android](https://capacitorjs.com/docs/android).
- [Capacitor Filesystem: API di accesso ai file](https://capacitorjs.com/docs/apis/filesystem).
