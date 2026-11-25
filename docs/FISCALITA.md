# Profili fiscali Italia e Germania — versione 0.2.1

Regole di riferimento: 2026. Verifica delle fonti: 30 ottobre 2026. Modello di calcolo: `3.1.0`.

Il perimetro concordato con l'utente è quello delle persone fisiche residenti nel Paese in cui si trova l'immobile. Le sezioni Italia e Germania coprono immobili residenziali locati a lungo termine, per anni interi e intera proprietà. La sezione Generale resta disponibile per i calcoli precedenti.

La fiscalità usa la residenza e l'ubicazione, non la cittadinanza. Investimenti transfrontalieri, società, attività professionali, locazioni brevi, comproprietà e dichiarazioni fiscali complete richiedono modelli ulteriori. Le proiezioni pluriennali mantengono costanti le regole 2026: non anticipano modifiche normative future.

## Italia

- Cedolare 21% e 10%. Il 10% richiede conferma esplicita dei requisiti del contratto e dell'ubicazione. Durante l'opzione il locatore rinuncia all'aggiornamento ISTAT: l'adeguamento all'inflazione non viene applicato e i ricavi accessori restano fissi. L'adeguamento al valore dell'immobile viene invece applicato ogni N anni come nuovo contratto al rinnovo: impostare N sulla durata effettiva (es. 8 anni per 4+4, 5 per 3+2).
- Ordinario: base pari al maggiore fra rendita catastale rivalutata attribuita al periodo locato e 95% dei canoni simulati. L'ulteriore riduzione del 30% è un'opzione separata che richiede requisiti verificati dall'utente (canone concordato in comune ad alta tensione abitativa); la stessa opzione porta al 70% la base del registro.
- IRPEF lorda 2026 per scaglioni: 23% fino a 28.000 EUR, 33% fra 28.000 e 50.000 EUR, 43% oltre. Per stimare l'effetto dell'investimento si sottrae l'imposta sull'altro imponibile dall'imposta sull'imponibile comprensivo della locazione. Non si applica l'aliquota più alta all'intero reddito.
- Addizionali: aliquota incrementale stimata inserita dall'utente; non è una riproduzione delle soglie e delle aliquote di tutti i Comuni e le Regioni.
- IMU abitazioni: rendita × 1,05 × 160 × aliquota comunale in per mille / 1000. Non usa il valore di mercato rivalutato. La riduzione al 75% per canone concordato è indipendente dalla scelta della cedolare e richiede un'apposita selezione.
- Registro sulla locazione ordinaria: di default è calcolata la quota del locatore (50%) del 2% del canone annuo, inclusi i ricavi accessori, con base al 70% per il canone concordato e minimo di 67 EUR sulla prima annualità; segue quindi gli adeguamenti del canone. In alternativa si può inserire un importo annuo manuale. Il bollo è escluso, così come rinnovi, proroghe e pagamento anticipato per l'intera durata. Nullo nei profili cedolare. Gli scenari salvati con il modello 3.0.0 restano in modalità manuale.
- Acquisto: importo manuale da rogito, oppure prezzo-valore per seconda casa residenziale da privato, senza IVA e senza agevolazione prima casa. L'automatismo richiede conferma dei requisiti: 9% di rendita × 1,05 × 120, minimo 1.000 EUR, più 50 EUR ipotecaria e 50 EUR catastale. Notaio, agenzia e altri costi non già inseriti restano voci distinte.

- Vendita entro 5 anni dall'acquisto: viene mostrata una stima dell'imposta sostitutiva del 26% sulla plusvalenza (valore finale meno commissione finale, al netto di prezzo d'acquisto, ristrutturazione, commissione iniziale, imposte e costi d'acquisto), con un avviso se non è stata inserita un'imposta di vendita. La stima non entra nei risultati: va riportata manualmente se dovuta. Non considera l'esenzione per abitazione principale né il termine di 10 anni per gli immobili con lavori Superbonus.
- Avvisi: rendita catastale nulla, imposte d'acquisto manuali pari a zero, aliquota IMU oltre l'11,4‰ o addizionali oltre il 4,5% in regime ordinario.

Non vengono dedotte dall'imponibile fondiario le spese operative effettive o gli interessi del mutuo. Cedolare e aliquota personalizzata usano il canone pieno, con il confronto con la rendita rivalutata nel perimetro dichiarato. I ricavi personalizzati italiani devono rappresentare canoni accessori dello stesso regime; anche questi concorrono all'abbattimento ordinario del 5% e restano fissi in cedolare.

Lo sfitto rappresenta assenza di contratto per parte dell'anno, non canoni contrattuali non incassati. In caso di morosità non basta ridurre i canoni percepiti per presumere una riduzione dell'imponibile: tale casistica non è modellata. Non si includono detrazioni personali, crediti, detrazioni da lavoro/pensione o la loro variazione al cambiare del reddito; il reddito inserito è imponibile, non salario lordo.

Fonti primarie:

- [Agenzia delle Entrate, guida agli affitti](https://www.agenziaentrate.gov.it/portale/documents/20143/3015794/GUIDA%2BAFFITTI%2B17%2BOTTOBRE%2BINTERNET%2B%281%29.pdf).
- [Agenzia delle Entrate, fabbricati e regimi di locazione](https://infoprecompilata.agenziaentrate.gov.it/portale/sl/web/guest/semplificata-mod-fabbricati).
- [MEF, TUIR art. 11 vigente dal 1° gennaio 2026](https://def.finanze.it/DocTribFrontend/getArticoloDetailFromResultList.do?codiceOrdinamento=0000000000000110000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000&id=%7BD5368F6F-A959-4AF5-A60F-8CB8BD99E176%7D&idAttoNormativo=%7B31D694E8-4398-4030-873B-FEAF5A6647F9%7D).
- [Agenzia delle Entrate, acquisto e prezzo-valore](https://www1.agenziaentrate.gov.it/web_app_entrate/guida_acquisto_casa.html).
- [Comune di Venezia, base imponibile IMU](https://www.comune.venezia.it/it/node/28631).
- [Comune di Milano, IMU sul canone concordato](https://servizicrm.comune.milano.it/centro-supporto/KA-01874/IMU-calcolo-abitazione-locata-con-canone-concordato).

## Germania

- Reddito da locazione: canoni, compresi i ricavi accessori, meno costi operativi ammessi, interessi e AfA. Le deduzioni non vengono sottratte nuovamente dai flussi di cassa.
- Costi operativi: importo deducibile scelto dall'utente, indicizzato con l'inflazione. È limitato ai costi monetari inseriti, inclusa la Grundsteuer rimasta a carico del proprietario; un messaggio segnala il limite. Non si presume che accantonamenti WEG, lavori capitalizzabili o ogni spesa di manutenzione siano deducibili nell'anno.
- Interessi: solo la quota interessi inserita, limitata alle rate effettivamente pagate fino agli anni residui del mutuo. La quota capitale non è una deduzione. Non si ricostruisce un piano di ammortamento.
- AfA lineare: base fiscale del solo fabbricato, terreno escluso, aliquota modificabile e deduzioni già fruite. L'ammortamento si ferma alla base residua; non costituisce un costo monetario. I riferimenti ordinari sono 3% dopo il 2022, 2% per completamento fra 1925 e 2022, 2,5% prima del 1925. Sono esclusi pro rata del primo anno, AfA speciale/degressiva, incentivi e capitalizzazione automatica dei lavori.
- Einkommensteuer: formula a tratti di §32a EStG, anno 2026; imponibile e imposta arrotondati per difetto all'euro. L'effetto della locazione è la differenza fra imposta con e senza investimento. Lo splitting, se scelto e spettante, usa il doppio della tariffa sul reddito imponibile congiunto dimezzato.
- Soli: franchigia di imposta 20.350 EUR, o 40.700 EUR con splitting; 5,5% con limite della zona di attenuazione all'11,9% dell'eccedenza. Calcolo incrementale e centesimi troncati.
- Kirchensteuer: scelta 0%, 8% o 9% sulla differenza di Einkommensteuer. È una stima senza deduzione della Kirchensteuer stessa, figli, regole speciali di confessione o tetti individuali.
- Le perdite non danno automaticamente luogo a un risparmio: la compensazione immediata con l'altro reddito è un'opzione esplicita. Nessun riporto di perdite; l'eventuale beneficio è limitato all'imposta di base modellata.
- Grundsteuer: importo annuo dell'avviso comunale effettivamente rimasto a carico del proprietario. Non si applica una percentuale al valore di mercato e non si presume che tutti i Länder adottino lo stesso modello catastale.
- Grunderwerbsteuer: aliquota del Land inserita dall'utente sul prezzo d'acquisto; se manca il costo d'acquisto si usa il valore dell'immobile come stima. L'importo viene troncato all'euro. Il 3,5% iniziale è un esempio e non l'aliquota di ogni Land; per un'imposta già compresa in altre voci usare zero per evitare duplicazioni.

Il calcolo parte dall'imponibile fiscale già determinato, non dal reddito lordo da lavoro. Sono esclusi figli, Progressionsvorbehalt, crediti, deduzioni personali, controlli sulla locazione a canone ridotto e limiti legali o contrattuali agli aumenti del canone. Le verifiche di deducibilità e ripartizione terreno/fabbricato spettano all'utilizzatore sulla propria documentazione.

Fonti primarie:

- [EStG §32a, tariffa 2026](https://www.gesetze-im-internet.de/estg/__32a.html).
- [BMF, §7 EStG e AfA](https://ao.bundesfinanzministerium.de/lsth/2026/A-Einkommensteuergesetz/II-Einkommen-2-24b/3-Gewinn-4-7i/Paragraf-7/inhalt.html).
- [EStG §9, Werbungskosten](https://www.gesetze-im-internet.de/estg/__9.html).
- [EStG §21, locazione](https://www.gesetze-im-internet.de/estg/__21.html).
- [SolzG, §§3–4](https://www.gesetze-im-internet.de/solzg_1995/BJNR097500993.html).
- [Finanzverwaltung Brandenburg, Kirchensteuer](https://finanzamt.brandenburg.de/fa/de/steuern/steuerinformationen/kirchensteuer/).
- [BMF, nuova Grundsteuer](https://www.bundesfinanzministerium.de/Content/DE/FAQ/faq-die-neue-grundsteuer.htm).
- [GrEStG §11](https://www.gesetze-im-internet.de/grestg_1983/BJNR017770982.html).

## Voci personalizzate e vendita

Si possono aggiungere fino a 30 voci annue con nome, importo, costo/ricavo, indicizzazione e, in Germania, deducibilità del costo. Sono importi parametrizzati, non formule JavaScript eseguite. I ricavi devono appartenere all'attività di locazione contemplata; ricavi finanziari o d'impresa richiedono altri modelli.

Le imposte iniziali e i costi extra entrano una sola volta nel flusso iniziale. Le imposte stimate di vendita sono un importo manuale nel flusso terminale, deflazionato per i valori reali. Non si presume automaticamente un'esenzione dopo cinque/dieci anni, né si calcolano le plusvalenze: zero significa nessuna imposta di vendita aggiunta. Questa limitazione è visibile nei risultati.

Il ROI senza leva rimuove le rate e, nel caso tedesco, anche il beneficio fiscale legato agli interessi. Il ROE resta la stima sul capitale totale del modello precedente: non sono disponibili capitale finanziato e debito residuo.

## Dati, compatibilità e prove

Formato archivio `schemaVersion: 2`, con profilo fiscale per scenario e bozze per Generale/Italia/Germania. La versione 0.2.1 legge e migra automaticamente gli archivi versione 1, mantenendo gli scenari generici. La vecchia app non è compatibile con un archivio versione 2: non alternare le versioni sullo stesso archivio.

Import/export conserva i profili e tutte le bozze. Una bozza importata distinta dagli scenari viene aggiunta come nuovo scenario; gli ID esistenti non sono sovrascritti. Le fonti sono consultabili nella UI; non è richiesto accesso internet per eseguire i calcoli.

La suite passa 74 test: parità generica con Python, esempi indipendenti di IRPEF/ESt/Soli, acquisto e IMU, cedolare con rinnovo del canone, registro automatico, stima della plusvalenza e avvisi italiani, AfA residua, interessi, perdite, flussi di cassa, migrazione/import, errori di validazione dell'archivio e separazione delle sezioni nella UI. L'altro reddito imponibile resta costante nella proiezione. Non è una certificazione della dichiarazione fiscale: usare le stime come simulazioni e verificare i dati effettivi con il proprio consulente.
