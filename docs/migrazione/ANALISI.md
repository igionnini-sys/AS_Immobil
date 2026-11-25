# Analisi dell'applicazione esistente

Analisi del 30 ottobre 2026, basata sui sorgenti presenti in `D:/WORK/VSC/Immobil` e su esecuzioni del motore Python. L'interfaccia Streamlit non è stata verificata visivamente in questa fase.

## Inventario

| File | Righe | Responsabilità | Destinazione proposta |
| --- | ---: | --- | --- |
| `REIT.py` | 17 | Avvio e inizializzazione lingua | Bootstrap della UI e dei contenitori nativi |
| `config.py` | 13 | Titolo, icona e layout Streamlit | Metadati web, Electron e Android |
| `ui.py` | 430 | Form, risultati, messaggi e confronti | UI React responsive |
| `calcoli.py` | 349 | Simulazione annuale, TIR, ROI, ROE e CAGR | Libreria TypeScript senza dipendenze dalla UI |
| `i18n.py` | 528 | Dizionari e lingua in sessione | Dizionari JSON e preferenza persistente |
| `utils.py` | 5 | Formattazione euro e percentuali | Funzioni di presentazione con `Intl.NumberFormat` |
| `requirements.txt` | 4 dipendenze | Streamlit, python-dateutil, NumPy, SciPy | Dipendenze npm della nuova app |
| `README.md` | 2 | Descrizione minima | Guida a sviluppo, installazione e migrazione |

Non sono presenti repository Git, test, configurazioni npm, database, API, accessi utente, build desktop/mobile o procedure CI nella cartella esaminata. Prima della conversione creare una copia verificata dei sorgenti o inizializzare il controllo versione.

## Comportamento da conservare

- Una simulazione immobiliare con rivalutazione, inflazione, sfitto, costi, imposte percentuali, commissioni e rate di mutuo.
- Affitto inserito al mese e convertito in valore annuo prima del calcolo.
- Tre modalità di adeguamento: valore dell'immobile, inflazione e nessun adeguamento; intervallo configurabile.
- Possibilità di usare acquisto e ristrutturazione effettivi come investimento iniziale e di evidenziare plus/minusvalore iniziale.
- Risultati nominali e reali, crescita degli affitti, costo mutuo e flussi annuali; metriche CAGR, TIR, ROI e ROE.
- Confronti delle metriche, indicazioni sul mutuo, note tecniche e avvertenze già presenti.
- Italiano predefinito e inglese: 193 chiavi per lingua, con identico insieme di chiavi. Diverse etichette e spiegazioni in `ui.py` e `calcoli.py` sono però direttamente in italiano.

La UI mostra prevalentemente testo e metriche. Le serie annuali sono restituite dal motore, ma non ci sono grafici, esportazioni o tabelle annuali nella UI attuale: non sono requisiti di parità già implementati.

## Parametri e valori iniziali

| Parametro del motore | Valore iniziale | Vincoli attuali della UI |
| --- | --- | --- |
| `valore_immobile` | 200000 EUR | >= 5000 |
| `costo_acquisto` | 0 EUR | >= 0 |
| `costo_ristrutturazione` | 0 EUR | >= 0 |
| `affitto_lordo` | 12000 EUR/anno | UI: 1000 EUR/mese, >= 0 |
| `rivalutazione_annua` | 2% | 0–50 |
| `anni_investimento` | 10 | Intero >= 1, nessun massimo |
| `commissione_iniziale` | 0 EUR | >= 0 |
| `commissione_finale` | 0 EUR | >= 0 |
| `costi_assicurazione_euro` | 250 EUR/anno | 0–10000 |
| `costi_gestione_euro` | 250 EUR/anno | 0–100000 |
| `manutenzione_straordinaria_perc` | 1% | 0–99 |
| `tassazione_affitti_perc` | 21% | 0–99 |
| `tassa_catastale_perc` | 0.8% | 0–99 |
| `rata_mutuo_mensile` | 0 EUR | 0–10000 |
| `anni_restanti_mutuo` | 0 | Intero 0–50 |
| `periodo_sfitto_perc` | 5% | 0–100 |
| `inflazione_perc` | 2% | 0–100 |
| `tipo_adeguamento` | Valore Immobile | Tre opzioni |
| `adeguamento_affitto_anni` | 4 | Intero 1–99 |

Totale: 19 parametri del motore, corrispondenti a 18 input numerici e un selettore. La lingua è un'ulteriore preferenza della UI.

## Semantica dei calcoli da rendere esplicita

Ogni anno vengono prima rivalutati l'immobile e i costi fissi; l'eventuale adeguamento dell'affitto avviene negli anni multipli dell'intervallo. Manutenzione e imposta immobiliare usano il valore rivalutato dello stesso anno. Lo sfitto riduce l'affitto prima della tassazione. La rata è sottratta fino alla durata residua del mutuo, senza ammortamento del debito.

Il motore usa percentuali di input in scala 0–100. Restituisce CAGR come frazione e TIR/ROI/ROE come percentuali. Nel porting conviene conservare inizialmente questa convenzione con tipi e conversioni espliciti; evitare moltiplicazioni per 100 duplicate.

Se almeno uno fra acquisto e ristrutturazione è positivo, il capitale iniziale usa la loro somma più la commissione iniziale. Un acquisto pari a zero con sola ristrutturazione positiva non aggiunge il valore dell'immobile: comportamento esistente da caratterizzare, non da cambiare incidentalmente.

## Problemi e limiti rilevati

| ID | Evidenza | Conseguenza | Trattamento nel porting |
| --- | --- | --- | --- |
| N01 | `calcoli.py:31`: `fsolve` con stima 0.1, warning soppressi e sola verifica dell'intervallo del risultato | Non sono verificati convergenza o residuo NPV; possibili radici multiple | TIR con ricerca limitata, residuo verificato, esito esplicito e casi analitici |
| N02 | `calcoli.py:94`: commissione finale sottratta dopo la deflazione degli altri importi terminali | Flusso reale terminale non equivalente alla deflazione dell'intero flusso nominale | Caso dedicato con commissione e inflazione; rettifica separata e documentata |
| N03 | `calcoli.py:138`: ROI reale aggiunge rate nominali a un rendimento reale | Mescola importi a diverse basi temporali | Caratterizzare, poi usare le rate deflazionate nel modello corretto |
| N04 | `calcoli.py:146`: capitale proprio equiparato all'investimento totale | ROE con mutuo è una stima; mancano capitale finanziato e debito residuo | Conservare l'etichetta di stima; modello completo del mutuo fuori dalla prima conversione |
| N05 | `calcoli.py:184`, accessi `[-1]`, modulo e potenze | Input esterni non validati possono produrre divisione per zero, liste vuote, overflow o valori complessi | Validazione condivisa anche su file importati e risultati finiti |
| N06 | `ui.py:170`, `ui.py:178` e formule CAGR | Capitale finale negativo o ROI/ROE sotto -100% possono rendere l'annualizzazione non reale | Restituire valore assente con motivazione, mai `NaN`/complessi nel JSON |
| U01 | Risultati dentro il solo ramo `if st.button(...)`; nessun archivio | Modifiche successive provocano un nuovo rendering senza mantenere i risultati; nessun recupero dopo chiusura | Stato UI esplicito, bozza e simulazioni persistenti |
| U02 | Testi italiani direttamente in `ui.py` e note in `calcoli.py` | Localizzazione inglese incompleta e motore accoppiato alla presentazione | Codici messaggio nel motore e traduzioni complete nella UI |
| U03 | `utils.py:2` usa separatori numerici fissi | Formattazione non coerente con la lingua selezionata | Formattazione per locale, mantenendo EUR |
| M01 | `numpy` importato ma non utilizzato; `python-dateutil` non importato dai sorgenti | Dipendenze legacy superflue per la logica esaminata | Nessun equivalente richiesto nel nuovo motore |

Le osservazioni N02–N04 descrivono la coerenza interna del software; non costituiscono una revisione fiscale o una certificazione del modello finanziario. La tassa immobiliare resta la stima percentuale già dichiarata nell'app, senza introdurre regole fiscali aggiornate.

## Persistenza attuale e richiesta

Non esistono scritture di dati dell'app su file o database nei sorgenti. Lingua e widget dipendono dalla sessione Streamlit. Non esiste quindi un formato di dati storico da migrare.

Sono previsti due livelli distinti: questi documenti per salvare i progressi della conversione; nella nuova applicazione un archivio locale di bozze, scenari e preferenze, con esportazione/importazione JSON fra dispositivi. Quest'ultimo è una funzionalità da implementare.

## Ambiente rilevato

- Windows / PowerShell; Node.js 24.15.0, npm 11.12.1, Python 3.11.0.
- Import disponibili: NumPy 1.26.4, SciPy 1.15.3, Streamlit 1.47.1 e dateutil.
- `java`, `adb` e `gradle` non risolti dal PATH; `JAVA_HOME`, `ANDROID_HOME` e `ANDROID_SDK_ROOT` non rilevate. Questo non dimostra che Android Studio non sia installato: serve un controllo del toolchain nella fase Android.
- Nessuna esecuzione su Linux o dispositivo Android effettuata.

`baseline.json` registra risultati effettivi e hash SHA-256 dei sorgenti. Sono riferimenti del comportamento esistente, comprese anomalie; non certificano la correttezza delle formule.
