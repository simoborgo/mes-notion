# Prossime implementazioni possibili

Elenco di idee/gap emersi durante lo sviluppo, non ancora implementati. Ogni voce ha lo stato,
il contesto/perché, e cosa verificare prima di partire — pensato per essere letto da qualunque
sessione (umana o Claude Code) senza dover recuperare il contesto della conversazione originale.

Aggiungere qui ogni volta che emerge un gap o un'idea rimandata, invece di lasciarla solo in una
conversazione. Segnare come fatto (barrato o rimosso) quando implementata, con riferimento al commit.

---

## Direzione strategica: abbandono graduale di Notion

**Stato:** dichiarata esplicitamente dall'utente (sessione 2026-08-06) — non un singolo task, una
direzione per le prossime implementazioni. Quando si progetta una nuova feature o si tocca codice
esistente che legge/scrive Notion, preferire Postgres per i nuovi dati e considerare se vale la
pena migrare anche quello esistente, invece di aggiungere altra roba su Notion per inerzia.

### Migrazione tabella Fornitori (Notion → Postgres)

**Stato:** richiesta esplicitamente, non ancora specificata nei dettagli

Oggi "Fornitori" vive solo su Notion (`NOTION_DB_FORNITORI`, letto via `getFornitoriMap()`/
`getFornitoriList()` in `src/lib/notion.ts`). Root cause diretta di due gap già noti:
- **"Fornitori Ferramenta scollegati da Notion dopo l'import"** (vedi voce più sotto) — `fornitore_id`
  è un riferimento testuale a una pagina Notion senza alcuna garanzia di integrità.
- **Il bug "non vedo più il fornitore" di questa sessione** (commit `2e15852`) — esiste solo perché
  `fornitore_nome` va risolto da Notion in scrittura e si può disallineare da `fornitore_nome_os1`.
  Con una vera tabella `fornitori` su Postgres (FK reale da `articoli_ferramenta.fornitore_id`),
  quel disallineamento non potrebbe più accadere strutturalmente.

**Come affrontarla, quando si parte**: probabile pattern — tabella `fornitori` (id, nome, codice_os1,
email se mai serve per le notifiche già rimandate altrove in questo file) + script di migrazione
una tantum da Notion (stesso approccio di `scripts/migrate-ferramenta-to-postgres.mjs`) + FK reale
da `articoli_ferramenta.fornitore_id` invece del riferimento testuale odierno. Da chiarire con
l'utente: migrare anche gli usi di Fornitori fuori da Ferramenta (Ritiri/Consegne, Rientro Qualità
citano "Nome Fornitore" come rollup Notion) nella stessa fase o in un secondo momento.

### CRUD completo Schede di Produzione (backend ancora Notion)

**Stato:** implementato (sessione 2026-08-07), backend resta Notion per scelta esplicita — la
migrazione dati verso Postgres per Schede/Sottoschede/Rilavorazioni/Commesse resta un passo
separato, non ancora pianificato nei dettagli.

Prima di questa sessione, il MES sapeva leggere e aggiornare quasi tutto sulle Schede, ma non
creare una Scheda "vuota" (solo import PDF) né una Sottoscheda generica (solo la variante
Rilavorazione), e non esisteva alcuna eliminazione. Aggiunto: `POST /api/schede` (Scheda
standalone), `POST /api/schede/[id]/sottoscheda` (Sottoscheda generica, eredita ODP/Commessa dal
padre), `DELETE /api/schede/[id]` (soft-delete via `archiveScheda()`, stesso pattern di
`deleteRitiro`/`deleteCarico` — pagina Notion archiviata, ancora leggibile per id, sparisce solo
dalle liste).

**Scoperto testando contro Notion reale (non assumibile dal solo codice/mapper)**: i campi
"Fornitore" e "Ordine Fornitore" di `Scheda`/`SchedaUpdate` **non sono mai stati scrivibili**,
né prima né nel primo tentativo di questa sessione — non è un gap dimenticato, è uno schema Notion
diverso da quello che il mapper `pageToScheda` lascia intuire:
- **"Nome Fornitore"** è una **rollup** (deriva dalla relation "Fornitore" verso `DB_FORNITORI`),
  non testo libero — scriverci come rich_text non genera errore ma **viene silenziosamente
  ignorato da Notion** (verificato: `pages.create` risponde 200 ma il valore resta vuoto). Il
  parametro `fornitore` già esistente in `createSchedaPage` (usato da `import-scheda` e
  `createRilavorazione`, non toccato in questa sessione) ha sempre avuto lo stesso problema.
  L'unico modo reale per impostare il fornitore è scrivere sulla relation "Fornitore" (`fornitoreId`,
  già supportato in creazione) — editarlo dopo la creazione richiederebbe un selettore Fornitori
  nel form (non costruito qui).
- **"Ordine Fornitore"** è un campo **files** (allegato), non rich_text — scriverci come testo
  **fa fallire la PATCH con errore 500** (validazione Notion, verificato direttamente). Rimosso
  il tentativo di scrittura da `updateScheda()` e i campi corrispondenti dai form. Se in futuro
  serve renderlo editabile, va trattato come upload (stesso pattern di `pdf-allegato`/`foto`), non
  come testo.

Corretto in `src/lib/notion.ts` (`updateScheda`): entrambi i branch di scrittura sono stati tolti
subito dopo averli scoperti rotti, prima di considerare la feature conclusa.

**Deliberatamente fuori scope, non dimenticato:**
- Editor per la relation "Fornitore" (selettore da `getFornitoriList()`/`getFornitoriMap()`) — è
  l'unico modo reale per cambiare fornitore dopo la creazione, non ancora costruito.
- Upload per "Ordine Fornitore" come allegato — non ancora costruito.
- Assegnazione dell'Area-Cartella Commessa — mai stata scrivibile nemmeno da `createSchedaPage`,
  resta solo gestibile da Notion.
- Nessuna cascata automatica sull'eliminazione (Ritiri collegati, righe Kit Ferramenta su Postgres,
  Verifiche spedizione) — l'archiviazione Notion non rompe questi riferimenti (restano risolvibili
  per id), ma l'utente va avvisato in UI se la Scheda ha figlie prima di confermare.

### Latenza fino a ~20s dopo una scrittura su una Scheda (cache `getSchede()`)

**Stato:** caratteristica nota del sistema, mitigata parzialmente (sessione 2026-08-06), non
eliminabile del tutto senza un ripensamento più ampio

`getSchede()`/`getSottoschede()` (`src/lib/notion.ts`) sono una cache in memoria scritta a mano,
senza TTL, popolata da una query completa del database Notion Schede (~1900 righe, 15-20s) —
scelta deliberata per aggirare il limite dei 2MB della Data Cache di Next.js (vedi
[[project_mes_cache_2mb_bug]]). `invalidateSchedeCache()` azzera la cache e la ripopola in
background dopo ogni scrittura (`pages.update`), ma **chi guarda una pagina che dipende da
questa cache può vedere il valore vecchio per diversi secondi** dopo aver salvato una modifica
— scoperto testando l'eliminazione di un foglio di scarico Kit Ferramenta, ma riproducibile
anche sul PATCH stato Sì/No già esistente, quindi non specifico a quella feature.

Aggiunto un ritardo di 1.5s prima del refetch in background (`invalidateSchedeCache`), per
ridurre il rischio che il refetch parta prima che Notion abbia propagato la scrittura appena
fatta e catturi/congeli in cache lo snapshot vecchio (senza TTL, sarebbe rimasto sbagliato
indefinitamente). Il ritardo riduce il rischio ma **non elimina** il tempo di propagazione reale
del refetch stesso (15-20s) — un utente che ricarica una pagina Schede-dipendente subito dopo
aver salvato può ancora vedere temporaneamente il dato vecchio.

**Come affrontarla, se diventa un problema pratico**: (a) invalidare in modo mirato solo la
Scheda toccata invece di rifare la query intera (richiede una cache indicizzata per id, non un
array piatto); (b) aggiornare otticamente la cache in memoria con la modifica appena scritta,
invece di ributtare via tutto e ripartire da Notion; (c) accettare il limite e comunicarlo in UI
("salvataggio in corso, la vista si aggiorna entro X secondi").

---

## Ferramenta

### Altre categorie di INVENTARIO MP non ancora gestite da mes-notion

**Stato:** annotata (sessione 2026-08-06), decisione esplicitamente rimandata dall'utente

Il file OS1 "INVENTARIO 30.06.2026" ha un foglio `INVENTARIO MP 30.06.2026` con 1861 prodotti
fisicamente contati — ma solo 601 di questi corrispondono a un codice nei 3 fogli categoria
gestiti dal magazzino Ferramenta (Collanti/Ferramenta/Materiale vario di consumo, oggi importati
in `articoli_ferramenta`). I restanti **1260 prodotti appartengono ad altre categorie di materia
prima** (es. legno) non gestite da questo modulo.

L'utente ha detto esplicitamente di dover ancora "capire se usare lo stesso DB (come già in OS1)"
per queste altre categorie quando arriverà il momento di gestirle da mes-notion.

**Come affrontarla, quando richiesto**: lo schema attuale di `articoli_ferramenta` (dopo l'aggiunta
di `descrizione_categoria`/`categoria_merceologica`/`cod_inv` in questa sessione) già generalizza
bene a più categorie — non servirebbe una tabella separata per ogni categoria, basterebbe
importare le righe mancanti con `descrizione_categoria` diversa. Da confermare con l'utente se
vuole davvero lo stesso DB o una separazione (es. per permessi/visibilità diversi tra magazzino
Ferramenta e altri reparti).

### Riferimento Fornitori (`fornitore_id`) non popolato dal nuovo import

**Stato:** gap noto (sessione 2026-08-06), coerente con il gap già esistente sui fornitori Notion

Il reimport completo dell'anagrafica (2026-08-06, 8358 articoli da
`scripts/importa-anagrafica-ferramenta.mjs`) popola `fornitore_nome_os1` (Ragione sociale OS1) ma
**non** `fornitore_id`/`fornitore_nome` (collegamento a Notion Fornitori) — il file OS1 non contiene
alcun riferimento a pagine Notion. Stesso gap già descritto più sopra ("Fornitori Ferramenta
scollegati da Notion dopo l'import"), ora esteso a tutti gli 8358 articoli, non solo ai 6897
originali.

---

## Modulo Gestione Ore avanzato — Offerte

### ~~Modifica ed eliminazione di un'offerta~~ — fatto, commit `3baac08` (2026-08-06)

Bottone "Modifica" in `DettaglioOfferta.tsx` (form precompilato, riusa il `PATCH` già esistente)
+ "Elimina offerta" (nuova `DELETE /api/offerte/[id]`, libera per qualunque stato — nessun
blocco, serve anche per ripulire prove). `offerte_righe` in CASCADE, verificato end-to-end.

---

## Modulo Gestione Ore avanzato — Previsionale (Capacity Planner)

### ~~Risincronizzazione data_consegna_prevista dopo la conferma di un'offerta~~ — fatto, commit `9f3780a` (2026-08-06)

Scelta l'opzione (c): bottone manuale "Risincronizza data con la Commessa" nel dettaglio
offerta (solo se Confermata + collegata) — rilegge `Commessa.dataCarico` da Notion (sempre
fresco, `pages.retrieve` diretto) e aggiorna `data_consegna_prevista` se diversa. Testato con
scostamento simulato + verifica "già allineata" al secondo giro.

### ~~`standard_reparto` copriva solo Verniciatura~~ — corretto, script `importa-standard-altri-reparti.mjs` (2026-08-08)

**Stato:** fatto. Scoperto in sessione 2026-08-07 (vedi sotto per la diagnosi originale), corretto il
giorno dopo quando l'utente ha fatto notare che l'import non era corretto — aveva ragione, il CSV
sorgente conteneva un segnale scartato dal primo import.

Diagnosi iniziale (poi rivista): tutte le 136 righe di `standard_reparto` seminate da
`scripts/importa-standard-verniciatura.mjs` erano `reparto='Verniciatura'`, `origine='stimato'` — zero
righe per gli altri 6 reparti. Quello script usa solo la colonna "H INT-VERN" del CSV
(`Codici_Valorizzati.csv`) come unica riga per articolo. Avevo concluso che non ci fosse altro dato
disponibile da cui derivare gli altri reparti ("H TOTALI non è scomposto"). **Errato**: la colonna
"H TOTALI" (scartata dal primo import) contiene il vero totale storico per articolo — per molti codici
Verniciatura era solo una minoranza (es. RX013-A: H TOTALI 156,5 / H INT-VERN 49,5 = 32%), non il 100%
implicito che risultava avendo `standard_reparto` una sola riga per articolo (`oreReparto()` in
`capacityPlannerRepository.ts:24-42` normalizza sul totale delle righe *trovate*, non su un vero totale).

**Correzione applicata**: nuovo script `scripts/importa-standard-altri-reparti.mjs`, eseguito una tantum
sullo stesso CSV. Per ogni articolo: `resto = media(H TOTALI) - media(H INT-VERN)`; il resto (quando >0)
viene ripartito con uno split fisso deciso dall'utente — **Falegnameria 40%, CNC 40%, Assemblaggio 10%,
Sezionatura 10%** (Imballaggio e Cablaggi esclusi di proposito, non indicati). Verniciatura non è stata
toccata (stesso valore di prima). `ON CONFLICT ... WHERE origine='stimato'`: non sovrascrive mai un
consuntivo reale se nel frattempo `registraChiusuraOdp` ne avesse già scritto uno.

Risultato: 151 codici coperti (da 136), 120 con un resto effettivamente ripartito, 480 righe
inserite. Verificato che per RX013-A la somma delle 5 righe torna esattamente a 156,5h (= H TOTALI
originale) e che il Previsionale ora distribuisce le ore su tutti e 5 i reparti coinvolti invece che
al 100% su Verniciatura. Resta comunque uno split fisso uguale per tutti gli articoli, non una stima
per singolo articolo — `registraChiusuraOdp` lo raffinerà articolo per articolo via via che arrivano
consuntivi reali, sostituendo di netto lo stimato (mai una media stimato/consuntivo).

### `parametri_reparto` non ha uno storico versionato

**Stato:** annotata (sessione 2026-08-05), nessuna richiesta esplicita di implementarla

`calcolaPrevisionale` legge sempre i valori **correnti** di `parametri_reparto` — cambiare
l'organico/parametri oggi ricalcola tutti i mesi dell'orizzonte con i nuovi valori, retroattivamente
rispetto a quando erano stati impostati. Non c'è modo di rivedere "come appariva il planner con
l'organico in vigore 3 mesi fa" — ogni apertura della pagina è sempre una fotografia fresca coi
parametri di adesso, mai uno storico.

**Come affrontarla, se richiesto**: tabella `parametri_reparto_storico` con validità temporale
(valido_da/valido_a), o più semplice: uno snapshot JSON salvato ogni volta che si genera un
export/report del Previsionale, se mai serve un confronto storico "previsto vs poi verificato".

### `parametri_reparto.ore_giorno_esterno` non è collegato a nessun calcolo

**Stato:** campo esistente in schema/UI, deliberatamente lasciato inutilizzato su richiesta
esplicita dell'utente (sessione 2026-08-05) — "lo useremo in futuro"

Il campo esiste in `verifiche-backend/schema_parametri_reparto.sql`, nel repository e nella UI admin,
ma `capacityPlannerRepository.ts` non lo legge mai. L'uso naturale sarebbe convertire le ore esterne
necessarie in giorni-persona esterni: `giorni_uomo_esterni = ore_esterne_necessarie / ore_giorno_esterno`,
utile per capire quante giornate di un fornitore esterno servono, non solo le ore totali.

**Come affrontarla**: quando richiesto, aggiungere il calcolo in `calcolaPrevisionale` e il campo
corrispondente nella UI (`VistaPrevisionale.tsx`), stesso pattern di `oreEsterneNecessarie`/`costoStimato`.

---

## Ferramenta

### Valore di riordino per articoli "A Pezzo"

**Stato:** annunciata dall'utente, non ancora specificata

Solo gli articoli Kanban hanno oggi un concetto di "quantità di riordino"
(`quantitaStandardVaschetta`) e un'etichetta di riordino stampabile. Gli articoli A Pezzo non hanno
alcun valore di riordino configurato — il modal "sotto soglia → stampa etichetta di riordino" in
`ScaricoKanbanCard.tsx` è escluso per A Pezzo in attesa di questa feature.

**Come affrontarla**: chiarire con l'utente la semantica esatta (quantità fissa come Kanban?
calcolata? inserita manualmente all'occorrenza?) prima di toccare `types.ts`/`notion.ts`.

### Conferma manuale di `prezzo_riferimento` estesa a tutti gli articoli

**Stato:** richiesta esplicitamente dall'utente (sessione 2026-08-06), non ancora specificata

Oggi `prezzo_riferimento` si aggiorna solo dal pulsante "Aggiorna prezzo di riferimento" in
`ferramenta/ordini-wurth` (`TabellaOrdiniWurth.tsx`), quando c'è uno scostamento rispetto al
tracciato Wurth — quindi in pratica resta `NULL` per tutti gli articoli non Wurth (compresi i
~8358 reimportati da OS1, che hanno solo `prezzo_ultimo_acquisto` valorizzato). L'utente vuole
poter confermare/impostare `prezzo_riferimento` anche per gli altri articoli, non solo quelli con
un ordine Wurth in corso.

**Come affrontarla**: chiarire con l'utente dove deve comparire l'azione (pagina anagrafica
articoli? scheda articolo singola?) e se il valore di partenza proposto dev'essere
`prezzo_ultimo_acquisto` (già presente per gli articoli OS1) o inserito a mano. Riusare lo stesso
pattern di scrittura di `TabellaOrdiniWurth.tsx` (aggiorna `prezzo_riferimento` +
`prezzo_riferimento_aggiornato_il`) invece di crearne uno nuovo.

### Fornitori Ferramenta scollegati da Notion dopo l'import

**Stato:** limite noto, confermato, nessuna implementazione richiesta per ora

`fornitore_id`/`fornitore_nome` vengono risolti da Notion una sola volta, dentro
`createArticoloFerramenta` (chiamata solo dall'import CSV in
`src/app/api/admin/import-ferramenta/route.ts`). Da lì in poi sono testo congelato in Postgres:
rinominare un fornitore su Notion non si riflette sugli articoli già importati, e non esiste UI
per riassegnare il fornitore di un articolo esistente o crearne uno nuovo fuori dall'import CSV.

**Come affrontarla**: se serve correggere un fornitore sbagliato oggi si fa via query diretta su
Postgres. Costruire una UI di riassegnazione solo se richiesta esplicitamente.

---

## Rilevamento Ore / Logistica

### ~~Ore registrate dopo la chiusura di un ODP non aggiornavano standard_reparto~~ — fatto (2026-08-08)

**Stato:** fatto. Segnalato dall'utente: un operatore può segnare ore la sera, il giorno dopo, o
più tardi rispetto a quando la Scheda passa di stato — con il vecchio design (`registraChiusuraOdp`
scattava una tantum al passaggio a "Completato") quelle ore restavano scritte in `ore_registrate`
ma non venivano mai propagate a `standard_reparto`.

Corretto scollegando del tutto `registraChiusuraOdp` dal cambio di stato Scheda: ora scatta (via
`aggiornaStandardRepartoPerOdp`, `standardRepartoRepository.ts`) ad ogni scrittura di ore per un
ODP — apertura/chiusura segmento tablet, registrazione diretta, correzione reparto, cancellazione
— indipendentemente da quale sia lo stato della Scheda in quel momento. Risolve alla radice il
problema, senza dover intercettare ogni punto che potrebbe cambiare lo stato (incluso il nuovo CRUD
Schede). Idempotente per lo stesso odp (mai doppia contabilità, vedi commento in
`standardRepartoRepository.ts`). Corretto anche un caso limite pre-esistente: se una correzione
sposta ore da un reparto all'altro per lo stesso ODP, il reparto di partenza ora viene azzerato
correttamente in `standard_reparto` (prima restava con il vecchio valore, mai ripulito).

Testato in produzione con dati reali (ODP MP26-512/BV271): registrazione ore su Verniciatura →
standard_reparto passa da stimato a consuntivo correttamente; correzione reparto verso Imballaggio
→ Verniciatura azzerato (riga rimossa) e Imballaggio valorizzato; il trigger ha anche recuperato
4,8h reali già presenti su Cablaggi per lo stesso ODP, mai propagate prima con il vecchio design.

Collegata: `getOdpAttivi()` (`src/lib/notion.ts`) filtrava solo `statoProduzione === "In lavorazione"`,
bloccando la selezione di un ODP per la registrazione ore appena la Scheda avanzava a "Materiale
Pronto"/"Verificato"/"Completato" — motivo diretto per cui l'utente non riusciva più ad aggiungere
ore. Corretto nello stesso intervento: ora esclude solo "Annullata".

### ~~Escludere gli ODP di commesse chiuse dalla lista di Rilevamento Ore~~ — fatto (2026-08-08)

**Stato:** fatto, anticipato rispetto a quanto annotato in un primo momento — l'utente ha chiesto di
farlo subito, chiarendo che il filtro va fatto a livello di **Commessa**, non di Scheda: uno stato
Scheda "Completato" non significa da solo che l'arredo sia stato consegnato, può restare in fabbrica
in attesa di carico/spedizione. Restano quindi selezionabili gli ODP "Completato" finché la loro
Commessa non è "Chiusa" — coerente con la scelta precedente di allargare `getOdpAttivi()`.

Implementato in `getOdpAttivi()` (`src/lib/notion.ts`): oltre al filtro esistente sulla Scheda
(esclude solo "Annullata"), nuovo filtro che esclude le Schede la cui Commessa collegata
(`s.commessaId`, relation "Commessa Nr") ha `stato === "Chiusa"` — usa `getCommesse()` (già cachata,
`unstable_cache` 5 min) per una mappa `id -> stato`, nessuna query aggiuntiva pesante. Schede senza
Commessa collegata non vengono escluse (nessun dato su cui decidere).

Testato in produzione: 74 Commesse totali, 57 "Chiuse" → lista ODP passata da 688 a 524 voci.
Verificato puntualmente: uno ODP "Completato" con Commessa ancora aperta resta selezionabile
(MP26-472); uno ODP la cui Commessa è "Chiusa" viene correttamente escluso (MP26-521).

**Nota per il futuro** (resta valida): quando lo stato "Completato" di Scheda diventerà un vero
endpoint anche a livello di singolo ODP (non solo di Commessa) — cioè quando eventuali rilavorazioni
apriranno sempre un nuovo ODP invece di riaprire il vecchio — si potrà valutare di restringere anche
il filtro sulla Scheda (oggi include "Completato" apposta). Non prima, altrimenti si ricade nel
blocco già risolto in questa sessione.

### ~~Storico Ore per Commessa + restyle tab Rilevamento Ore~~ — fatto (2026-08-08)

**Stato:** fatto. L'utente ha notato che la Dashboard KPI raggruppa ore solo per ODP/operatore/
causale/reparto — mai per Commessa: se una Commessa ha più Aree/Schede con ODP diversi, oggi si
vedono come righe separate, mai un totale unico.

Nuova vista dedicata (non integrata nella Dashboard KPI esistente, stesso pattern già usato per
"Storico ODP"): `/ore/storico-commessa` — selezioni una Commessa, vedi ore totali/rifacimento/costo,
ripartizione **per Codice Articolo** e per operatore. Le Schede della Commessa senza Codice Articolo
non confluiscono in un unico bucket "NON CLASSIFICATO" opaco: restano voci separate, una per Scheda,
etichettate con il proprio Numero Scheda (es. "NON CLASSIFICATO — WINDOW SCREEN"), evidenziate in
ambra — così restano distinguibili l'una dall'altra invece di sparire in un totale indistinto.

Emerso durante la progettazione: il bisogno dell'utente di ODP legati a una Commessa ma trasversali
a più prodotti (es. "cablaggio generale alimentatori") è già coperto dal CRUD Schede esistente —
basta creare una Scheda vera sotto la Commessa, Codice Articolo vuoto, Numero Scheda descrittivo —
nessun nuovo meccanismo introdotto. Verificato inoltre che la ricerca ODP in Rilevamento Ore
(`OdpAutocomplete.tsx`) filtra già anche sul Numero Scheda, quindi un operatore può cercare per testo
descrittivo ("cablaggio") invece di dover ricordare un codice ODP numerico — nessuno schema di
numerazione parallelo legato alla commessa è stato aggiunto (avrebbe snaturato il significato
dell'ODP).

Backend: `getStoricoOdps(odps[])` (`oreRepository.ts`), nuova route
`GET /api/ore/storico-commessa?commessaId=` che incrocia `getSchedeByCommessa` (Notion) con le ore
Postgres. Frontend: `VistaStoricoCommessa.tsx` (ricerca/selezione Commessa, stesso pattern di
`DettaglioOfferta.tsx`), pagina `ore/storico-commessa`. `OreSubNav.tsx` ridisegnata con lo stesso
stile "segmented control" del Previsionale (sfondo `#F5F2EE`, tab attiva piena arancione) al posto
del vecchio sottile bordo inferiore.

Verificato: `tsc --noEmit` ed eslint puliti su tutti i file toccati; logica di aggregazione
verificata direttamente contro dati reali (Postgres + Notion via query dirette, bypassando l'app)
su una Commessa con 37 Schede/ODP — somma per-articolo (181,4h) coincide esattamente con la somma
diretta delle voci ore_registrate, e le voci NON CLASSIFICATO restano correttamente separate per
Scheda (WINDOW SCREEN 78,5h, Vitrine showcase 39,5h, ecc.), non accorpate. Non creata Scheda di test
end-to-end via UI (nessuna credenziale di sessione disponibile in questo ambiente per autenticarsi
all'app) — verifica fatta a livello di dati/logica, non di click-through browser.

### ~~CRUD Personale nella tab Parametri Reparto~~ — fatto (2026-08-08)

**Stato:** fatto. Prima era solo visualizzazione (deciso così esplicitamente qualche ora prima nella
stessa sessione); l'utente ha poi chiesto il CRUD vero e proprio.

`createOperatorePage`/`updateOperatorePage` in `notion.ts` + route `api/admin/operatori` (POST) e
`api/admin/operatori/[id]` (PATCH). Nessuna cancellazione reale — coerente con quanto già deciso
per gli operatori (vedi sezione ore/ODP più sopra): "rimuovere" un operatore significa sempre
disattivarlo (In Forza → No), mai eliminare la pagina Notion, per non perdere il collegamento con
lo storico ore. Editabili tutti i campi (Cognome, Nome, Reparto, Tipo, Azienda, In Forza) — matricola
resta auto-assegnata da Notion (`unique_id`), mai scritta da qui.

`TabellaOperatoriReadOnly.tsx` rinominata `TabellaOperatori.tsx`: bottone "+ Nuovo operatore",
"Modifica" per riga (form completo), toggle rapido "In Forza" direttamente in tabella (senza aprire
il form). Nota tecnica: prima chiamata a `revalidateTag` in tutto il progetto — su Next.js 16 richiede
un secondo argomento obbligatorio (`profile`), usato `"max"`; verificato che invalida correttamente
sia `getOperatori()` che `getTuttiOperatori()` (stesso tag `"operatori"`).

Testato in produzione con un operatore di prova: creazione, modifica campi, toggle In Forza, tutto
verificato e visibile immediatamente (cache invalidata correttamente). Pulizia via archiviazione
diretta della pagina Notion di test (non tramite l'app, che di proposito non offre cancellazione).

### ~~Tabella `articoli` non copre tutti i codici delle Schede attive~~ — fatto, crea al volo (2026-08-08)

**Stato:** fatto. Scoperto testando la correzione precedente: su 58 codici articolo distinti negli
ODP attivi, solo 6 esistevano in `articoli` (import una tantum del 2026-08-04, mai aggiornato) —
bloccava sia `registraChiusuraOdp` (scartava in silenzio) sia l'aggiunta di righe Offerta (FK).

L'utente ha chiarito il punto chiave: `articoli` **deve poter crescere da sola** — nuove commesse
portano codici mai censiti prima, non è un elenco chiuso. Soluzione: `ensureArticoloEsiste()`
(`src/lib/articoliRepository.ts`) crea una riga minima (descrizione = codice stesso, mai sovrascritta
se già presente) invece di bloccare/scartare:
- `standardRepartoRepository.ts`: `registraChiusuraOdp` la chiama prima di scrivere, non scarta più
  in silenzio i codici non censiti.
- `offerteRepository.ts`: `aggiungiRigaOfferta` la chiama prima dell'INSERT.
- `CodiceArticoloAutocomplete.tsx`: nuova voce "+ Nuovo articolo: {testo cercato}" quando il codice
  digitato non esiste ancora — prima l'utente non poteva nemmeno tentare di selezionare un codice
  non in elenco.

Testato in produzione: registrazione ore su ODP con codice mai censito (BV373) → articolo creato al
volo, `standard_reparto` valorizzato correttamente; riga Offerta con codice nuovo (ZZTEST-999) →
stesso comportamento. Dati di test rimossi dopo la verifica.

**Prossimo passo dichiarato dall'utente**: la creazione al volo è un tampone (descrizione = solo il
codice, nessuna categoria) — l'utente vuole poi fare un **export da OS1** e ricaricare l'anagrafica
`articoli` completa (descrizioni vere, categorie), stesso pattern già seguito per l'Anagrafica
Ferramenta ([[project_mes_ferramenta_anagrafica]]). Da fare quando l'utente porta l'export: probabile
script `importa-articoli-os1.mjs` sul modello di `scripts/prepara-anagrafica-ferramenta.py` +
`scripts/importa-anagrafica-ferramenta.mjs` — upsert per non perdere i codici già creati al volo nel
frattempo (mai un `TRUNCATE` cieco, a differenza del reimport Ferramenta che partiva da una tabella
già consapevolmente svuotata).

### Notifiche email aggregate per fornitore (rilavorazioni da programmare)

**Stato:** rimandata esplicitamente dall'utente, non implementare finché non richiesta

Digest email periodico per fornitore con l'elenco del materiale in rilavorazione per cui va ancora
concordato il ritiro (collegata a "Nessun ritiro concordato" in Rientro Qualità). Nessuno
scheduling/cron esiste oggi nel progetto (né via n8n né servizio email diretto). `notify.ts`/tabella
`notifiche_inviate` sono già multi-canale (colonna `canale`, default `'telegram'`) — aggiungere
`'email'` non richiede migrazione schema. Il DB Fornitori su Notion non ha un campo email — va
aggiunto in ogni caso.

### Magazzino ponte — materiale in arrivo tracciato fino alla chiamata della produzione

**Stato:** annunciata esplicitamente da NON implementare ora — "salva nelle cose da fare"

Quando arriva materiale (da fornitore o rilavorazione esterna) dovrebbe poter restare tracciato a
sistema in un "magazzino ponte/staging" finché la produzione non lo "chiama" — modello pull, non
push automatico. Oggi non esiste alcuna giacenza/staging per il materiale generico in arrivo (a
differenza di Ferramenta, che ha giacenza vera).

**Come affrontarla, quando richiesto**: chiarire (a) che tipo di "chiamata" fa la produzione —
richiesta esplicita per ODP o semplice presa visione; (b) se il materiale generico va gestito con
struttura articolo+giacenza come Ferramenta o resta descrittivo/libero come Scarico Materiale;
(c) se sostituisce o affianca la notifica one-shot di Scarico Materiale esistente.

### Vista "Da Imballare" — Operatore Imballo

**Stato:** pianificato, non iniziato

Sezione per l'operatore di imballo sugli ODP in stato `Verificato` (PDF spedizione già firmato).
Bottone "Segna Completato" → Notion stato `Completato` + timestamp + operatore. Chiude il ciclo
MES: Materiale Pronto → Verificato → Completato. Pattern simile a SpedizioneVerifica.

---

## Amministrazione

### Sezione admin per gestire utenti/ruoli (invece di `USERS_JSON` in `.env`)

**Stato:** proposta e rifiutata per ora dall'utente ("no" secco) — non riproporla spontaneamente,
pronta se richiesta

Oggi gli utenti vivono in `USERS_JSON` sulla VPS, **password in chiaro non hashate** — rischio
reale se quell'env var trapela (log, backup, accesso non previsto). Proposta abbozzata: tabella
`users` su Postgres, password con bcrypt/argon2, pagina admin `/admin/utenti`, script di migrazione
una tantum da `USERS_JSON`. Se richiesta: testare a fondo in locale prima del deploy, un errore
qui blocca l'accesso di tutti al MES.
