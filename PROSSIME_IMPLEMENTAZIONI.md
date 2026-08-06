# Prossime implementazioni possibili

Elenco di idee/gap emersi durante lo sviluppo, non ancora implementati. Ogni voce ha lo stato,
il contesto/perché, e cosa verificare prima di partire — pensato per essere letto da qualunque
sessione (umana o Claude Code) senza dover recuperare il contesto della conversazione originale.

Aggiungere qui ogni volta che emerge un gap o un'idea rimandata, invece di lasciarla solo in una
conversazione. Segnare come fatto (barrato o rimosso) quando implementata, con riferimento al commit.

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

### Modifica ed eliminazione di un'offerta

**Stato:** richiesta esplicitamente dall'utente (sessione 2026-08-05), non implementata

- **Modifica**: il backend esiste già — `PATCH /api/offerte/[id]` + `aggiornaCampiOfferta` (`src/lib/offerteRepository.ts`) accettano `cliente`/`valoreCommessa`/`dataOfferta`/`dataConsegnaPrevista`/`probabilitaChiusura` — ma **non c'è nessuna UI** che lo richiami: `DettaglioOfferta.tsx` oggi permette solo aggiungere righe, confermare, segnare persa. Manca un form di modifica testata (pattern simile a `FormNuovaOfferta.tsx`, precompilato). Nota: `aggiornaCampiOfferta` oggi non controlla lo stato — modifica anche un'offerta già Confermata, il che tocca anche il Previsionale (Fase 5.3) se cambia `dataOfferta`/`dataConsegnaPrevista`; da decidere se vietarlo per le Confermate o lasciarlo permesso.
- **Eliminazione**: non esiste né endpoint né UI. Serve `DELETE /api/offerte/[id]` (CASCADE su `offerte_righe` già garantito dallo schema) + conferma in UI. Da decidere: eliminazione libera per qualunque stato, o solo per `Offerta` (evitare di cancellare per sbaglio una Confermata/Persa che è ormai storico)?

---

## Modulo Gestione Ore avanzato — Previsionale (Capacity Planner)

### Risincronizzazione data_consegna_prevista dopo la conferma di un'offerta

**Stato:** proposta (sessione 2026-08-05), non implementata

Oggi, quando un'offerta passa a "Confermata", `data_consegna_prevista` viene copiata una tantum
da `Commessa.dataCarico` (in `confermaOfferta`, `src/lib/offerteRepository.ts`) e resta congelata
per sempre — se la Commessa collegata viene poi riprogrammata su Notion (ritardo, anticipo), il
Previsionale continua a distribuire le ore sul periodo vecchio, senza saperlo.

**Perché non blocca l'uso oggi**: il Previsionale è comunque una stima aggregata mese-per-mese,
non un vincolo rigido — ma più passa tempo tra conferma e chiusura di una Commessa, più il rischio
di uno scostamento reale cresce.

**Come affrontarla**: possibili approcci — (a) un job/endpoint che ricontrolla periodicamente
`Commessa.dataCarico` per le offerte Confermate e aggiorna `data_consegna_prevista` se diversa;
(b) ricalcolare `data_consegna_prevista` al volo leggendo Notion ad ogni richiesta del Previsionale
invece di congelarla in Postgres (più aggiornato ma più lento/dipendente da Notion ad ogni caricamento
pagina); (c) un pulsante manuale "risincronizza data" nella pagina dettaglio offerta. Da discutere con
l'utente quale approccio preferisce prima di implementare.

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
