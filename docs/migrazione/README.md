# Conversione Immobiliare a Node.js

Data: 30 ottobre 2026. Stato: prima implementazione TypeScript disponibile, con build Windows e Android; qualificazione delle piattaforme in corso. Consultare `stato.json` e `VERIFICHE.md` per le prove effettive.

Questa cartella conserva il contesto necessario per eseguire la conversione anche in sessioni successive.

| File | Contenuto |
| --- | --- |
| [ANALISI.md](ANALISI.md) | Applicazione attuale, dipendenze, parametri e problemi rilevati |
| [PIANO.md](PIANO.md) | Architettura proposta, attività ordinate e criteri di completamento |
| [DECISIONI.md](DECISIONI.md) | Scelte tecniche e assunzioni da usare durante l'esecuzione |
| [PROGRESSI.md](PROGRESSI.md) | Registro leggibile delle attività svolte e istruzioni di ripresa |
| [stato.json](stato.json) | Stato delle fasi e prossimo passo in formato elaborabile |
| [baseline.json](baseline.json) | Risultati Python di riferimento, casi limite e impronte dei sorgenti |
| [genera_baseline.py](genera_baseline.py) | Script riproducibile di acquisizione dei risultati esistenti |
| [VERIFICHE.md](VERIFICHE.md) | Prove svolte, rettifiche numeriche e limiti della prima versione |
| [legacy-v1.zip](legacy-v1.zip) | Copia verificata dei sorgenti originali |
| [verifica.json](verifica.json) | Esiti e checksum degli artefatti prodotti |
| [verifica-fiscalita.json](verifica-fiscalita.json) | Esiti e checksum della versione 0.2.0 con profili nazionali |

Le regole dei nuovi profili sono descritte in [Fiscalità Italia/Germania](../FISCALITA.md). `verifica.json` è il rapporto storico della versione 0.1.0: alcuni percorsi di output di build Android vengono riutilizzati nelle versioni successive; per gli artefatti correnti usare il rapporto della 0.2.0, che punta a file di rilascio con versione nel nome.

La cartella documenta i progressi dello sviluppo. Il piano prevede separatamente il salvataggio delle simulazioni dell'utente dentro la futura app.

Per riprendere: leggere `stato.json`, `DECISIONI.md` e la fase indicata in `PIANO.md`; eseguire il prossimo passo; aggiornare `stato.json` e `PROGRESSI.md` con evidenze e problemi effettivamente riscontrati. Non segnare una piattaforma come verificata prima di averla eseguita.

L'app Python originale rimane avviabile con `python -m streamlit run REIT.py`, usando le dipendenze di `requirements.txt`. La nuova app si avvia con `npm run dev` oppure `npm run desktop:dev` dalla radice; consultare il README principale per gli artefatti installabili e i prerequisiti Android.
