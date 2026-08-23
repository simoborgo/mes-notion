# Prossime implementazioni possibili

Elenco di idee/gap emersi durante lo sviluppo, non ancora implementati. Ogni voce ha lo stato,
il contesto/perché, e cosa verificare prima di partire — pensato per essere letto da qualunque
sessione (umana o Claude Code) senza dover recuperare il contesto della conversazione originale.

Aggiungere qui ogni volta che emerge un gap o un'idea rimandata, invece di lasciarla solo in una
conversazione. Segnare come fatto (barrato o rimosso) quando implementata, con riferimento al commit.

---

## Magazzino — motore generico multi-categoria

### ~~Inventario Vernici + motore di magazzino generico condiviso~~ — fatto (2026-08-09)

**Stato:** fatto. OS1 tiene un'unica tabella "merci" per Ferramenta/Vernici/Legname/Tranciato/
Bordi/Metalli, ma l'utente vuole anagrafiche separate in MES per poterle personalizzare
liberamente (un merge verso OS1 solo in fase di export, non ancora specificato — vedi sotto).
Ferramenta era già fatta con un proprio schema dedicato (`movimenti_ferramenta`/
`inventari_ferramenta`); invece di riscrivere lo stesso schema/repository da capo per ognuna delle
altre categorie, è stato costruito un **motore di magazzino generico condiviso**, usato per la
prima volta da Vernici e pronto per Legname/Tranciato/Bordi/Metalli.

Schema: `verifiche-backend/schema_magazzino_generico.sql` — tabelle `movimenti_magazzino`
(append-only: carico/scarico/rettifica, colonna `categoria`) e `inventari_magazzino`/
`inventario_righe_magazzino` (sessioni di riconteggio apri/conta/chiudi, **una sola sessione
aperta per categoria**, non globale — un inventario Vernici aperto non blocca un futuro
inventario Legname). `entita_id` è l'UUID della riga anagrafica di quella categoria (es.
`vernici.id`), mai un nome tabella dinamico — il motore non conosce mai l'anagrafica specifica.
Ferramenta non è stata toccata/migrata: resta sul proprio schema separato, zero rischio su ciò
che già funzionava. `verifiche-backend/schema_verniciatura_fase7_giacenza.sql` aggiunge
`vernici.giacenza_attuale` (a differenza di Ferramenta: **nessuna soglia minima/riordino** per
Vernici, richiesta esclusa esplicitamente dall'utente, vale anche per le categorie future — solo
giacenza + carico/scarico libero + inventario periodico).

Repository generico: `src/lib/magazzinoRepository.ts` (movimenti) +
`src/lib/inventarioMagazzinoRepository.ts` (sessioni), entrambi parametrizzati da `categoria` e
mai a conoscenza della tabella anagrafica — la lettura/scrittura della giacenza resta
responsabilità del repository di categoria (`verniciRepository.aggiornaGiacenzaVernice`),
orchestrata dalla route API in due chiamate sequenziali (stesso pattern già in uso in
`ferramenta/scarico/route.ts`).

Ruoli: nuovo `magazziniere_vernici` in `src/lib/auth.ts` (+ `MAGAZZINO_VERNICI_ROLES`) — separato
da `VERNICIATURA_ROLES` perché l'addetto al magazzino Vernici non deve necessariamente accedere a
Cicli/Campionature (produzione verniciatura pezzi, processo diverso). **Assegnare questo ruolo
richiede modificare `USERS_JSON` sulla VPS** (nessuna UI admin). Navigazione: Vernici resta dentro
il modulo "Verniciatura" esistente come 4ª tab "Magazzino" in `VerniciaturaSubNav.tsx` (ora accetta
`canProduzione`/`canMagazzino` per filtrare le tab in base al ruolo) — non una voce di nav
separata, su scelta esplicita dell'utente.

Testato: build (`npx tsc --noEmit`, `npm run lint`, `next build`) pulita; flusso end-to-end
diretto sul DB (crea vernice → carico 10 → scarico 4 → apri inventario categoria vernici →
blocco su doppia apertura stessa categoria (23505) → conta con scostamento -1 → verifica
movimento rettifica + giacenza aggiornata → chiudi → riapertura successiva senza conflitti),
dati di test rimossi. Non testato via UI/click-through browser (nessuna sessione autenticata
disponibile in questo ambiente).

**Aggiornamento stessa sessione**: aggiunto bottone "Inventario →" nella pagina Magazzino (prima
raggiungibile solo digitando l'URL), conferma esplicita (`confirm()`) prima di chiudere un
inventario con righe non ancora contate (restano alla giacenza teorica, mai un'uscita silenziosa),
e **scelta dell'ambito all'apertura**: Tutto il catalogo / per Tipologia / per Colore-codice
(ricerca testuale) — `inventari_magazzino.ambito`/`ambito_valore`
(`schema_magazzino_generico_ambito.sql`), stesso pattern di `inventari_ferramenta` ma con
vocabolario proprio di Vernici. **Richiesta dall'utente ma non implementata**: ambito "per
Posizione" — campo non ancora presente su `vernici`, verrà aggiunto in futuro dall'utente; quando
arriva basta estendere la CHECK `ambito` e il filtro nella route apertura, stesso schema di
tipologia/colore_codice.

**Prossimo passo per Legname/Tranciato/Bordi/Metalli** (quando richiesto, non ora): (a) estendere
la CHECK `categoria` in `movimenti_magazzino`/`inventari_magazzino` con una micro-migrazione
(`ALTER TABLE ... DROP CONSTRAINT / ADD CONSTRAINT`, stesso pattern di
`schema_ferramenta_inventario_ambito_inventariato.sql`) — altrimenti l'INSERT fallisce con 23514;
(b) tabella anagrafica + repository dedicati con la propria `aggiornaGiacenza*`; (c) nuove route
API; (d) nuovo ruolo `magazziniere_<categoria>` stesso pattern di sopra; (e) **queste categorie non
hanno un modulo esistente in cui infilarsi come tab** (a differenza di Vernici) — a quel punto va
creata una voce di nav "Magazzino ▾" a dropdown (pattern di "Amministrazione ▾"), non prima.

**Fuori scope, non dimenticato**: export/merge unificato verso OS1 (oggi un'unica tabella
"merci") — `vernici.codice_inventario` è già pronto come chiave di aggancio; il formato OS1
unificato non è stato specificato, si progetterà quando tutte le categorie saranno pronte.

### ~~Etichette QR su Codice Inventario, segnalazione movimento leggero, inventario libero~~ — fatto (2026-08-22)

**Stato:** fatto. Batch di richieste della stessa sessione, tutte su Vernici/Magazzino.

- **Due formati etichetta**: "Etichetta Scaffale" (76x51mm, più dati, per lo scaffale) ed
  "Etichetta Vernice" (76x25mm, per il contenitore) — route separate
  `[id]/etichetta-scaffale` e `[id]/etichetta-vernice`.
- **QR sul Codice Inventario, non più sull'UUID**: scelta esplicita dell'utente per generare le
  etichette in batch dal software Zebra senza passare dall'app. Cutover netto — le vecchie
  etichette con l'UUID nel QR non funzionano più, vanno ristampate. Nuova
  `getVerniceByCodiceInventario()`, pagina di scan rinominata da `[id]` a `[codiceInventario]`.
- **Segnalazione movimento leggero** (`vernici.segnalata_uso_il`, `schema_verniciatura_fase10`):
  un operatore può dichiarare "ho usato questa vernice" senza ripesarla — bottone dedicato nella
  card di scan, nessuna quantità richiesta, registra comunque un movimento tipo `segnalazione`
  (quantità 0) per tracciare chi/quando. **Decisione chiave**: il flag lo mette QUALSIASI
  movimento (segnalazione leggera O un vero carico/scarico, anche preciso), e si azzera SOLO con
  una conta fisica al prossimo inventario — mai da un movimento successivo. Badge "Da
  inventariare" in tabella Magazzino + filtro dedicato.
- **Ambiti di apertura inventario semplificati**: rimossi "Per tipologia"/"Per colore-codice"
  (troppe opzioni per l'uso pratico), restano "Tutto il catalogo", "Solo vernici segnalate come
  movimentate" e il nuovo **"Inventario libero"** (`schema_verniciatura_fase11`) — lista costruita
  a mano aggiungendo vernici una alla volta (via ricerca Codice Modar/Tintometro, da scan o da
  desktop), pensato per cose come i diluenti che non vengono mai "segnalate" (usate al volo) ma
  vanno ricontate ogni tanto. Nuova `aggiungiRigaInventario()` per aggiungere righe a una sessione
  già aperta (prima le righe si decidevano tutte insieme all'apertura).
- **Riconteggio con conferma**: ricontare una riga già contata in quella sessione ora mostra un
  avviso esplicito "Già contata da X il ___: valore Y" con bottone "Riconta comunque" prima di
  sovrascrivere — prima sovrascriveva silenziosamente.
- **"Cerca vernice (senza QR)"** (`/verniciatura/magazzino/cerca`): punto di ingresso alternativo
  alla scansione — cerchi per Codice Modar o Tintometro, redirect diretto alla stessa pagina di
  scan (stessa logica carico/scarico/segnalazione/conteggio, zero duplicazione). Pensato per un
  tablet tenuto sempre aperto in magazzino.
- **Toggle "Solo Attive (nascondi obsolete)"** in Magazzino Vernici (prima le obsolete non
  arrivavano nemmeno dal server) + colonne Bilancio Massa/Finitura/Gloss rimosse da entrambe le
  tabelle Vernici/Magazzino per ridurre la larghezza; Codice Tintometro spostato come seconda
  colonna in Vernici; filtro select "Tutti i clienti" rimosso (già coperto dalla ricerca testuale).

---

## Ferramenta

### ~~Tab "Kit Ferramenta" nel dettaglio Scheda~~ — fatto (2026-08-10)

**Stato:** fatto. Prima il Kit Ferramenta (distinta articoli A Pezzo per ODP) era raggiungibile
solo da `/admin/ferramenta/kit/[schedaId]`, separato dal flusso normale di consultazione di una
Scheda. L'utente ha chiesto una tab dedicata anche dentro il modal Scheda (`DettaglioSchedaModal.tsx`),
per vedere/inserire la distinta senza uscire dal contesto.

`DettaglioSchedaModal` non aveva alcun sistema di tab (solo sezioni sequenziali) — aggiunto un
piccolo tab-switcher locale (`activeTab: "info" | "kit"`), visibile **solo** se `userRole` è tra
`FERRAMENTA_ROLES` (duplicato locale della costante, stesso pattern già usato in `Navbar.tsx` —
`auth.ts` importa `next/headers`, non bundlabile in un client component). Nuovo componente
`KitFerramentaTab.tsx`: la Scheda è già disponibile come prop (nessuna fetch aggiuntiva), righe e
articoli A Pezzo vengono caricati on-demand via due nuove route GET (`GET /api/ferramenta/kit/[schedaId]`
e `GET /api/ferramenta/articoli?metodoGestione=A Pezzo`, quest'ultima aggiunta perché non esisteva
alcun GET su `articoli/route.ts`), poi renderizza **lo stesso** `GestioneKitOdp.tsx` già usato dalla
pagina admin — zero duplicazione di logica, `scheda.id` coincide già con l'`odpId` usato dal
repository Kit Ferramenta (nessuna trasformazione necessaria).

### ~~Distinte di Scarico collegabili a una Commessa (non solo a un ODP)~~ — fatto (2026-08-10)

**Stato:** fatto. L'utente non ricordava se fosse già possibile — non lo era: le Distinte di
Scarico avevano già `odp_id` opzionale ("distinta libera" se vuoto), ma nessun aggancio a una
Commessa specifica.

Aggiunte colonne `commessa_id`/`commessa_label` a `distinte_scarico` (nullable, stesso pattern di
`odp_id`/`odp_label` — Notion page id + label denormalizzata, nessuna vera FK), alternative a
odp_id ma non vincolate a esclusione reciproca a livello DB (la UI garantisce di popolare solo
l'uno o l'altro). `FormNuovaDistintaScarico.tsx` ora ha un selettore radio a 3 vie — Libera / ODP /
Commessa — con nuovo `CommessaAutocomplete.tsx` (stesso pattern di `OdpAutocomplete.tsx`, riceve
`commesseList: Commessa[]` già caricata server-side via `getCommesse()`, nessuna fetch aggiuntiva).
Titoli/liste (`distinte-scarico/page.tsx`, `DettaglioDistintaScarico.tsx`) mostrano
`odpLabel || commessaLabel || "Distinta libera"`. La nota sul movimento di magazzino generato alla
chiusura cita la Commessa quando non c'è un ODP. Nessuna modifica a `kit_ferramenta_righe`, che
resta correttamente vincolata al singolo ODP (è una BOM attesa, non una sessione di prelievo).

Testato: `tsc`/`eslint`/`next build` puliti; verifica diretta su Postgres che una distinta con solo
`commessa_id` popolato (e `odp_id` nullo) si crei e persista correttamente.

### Kit Ferramenta riutilizzabili (per Codice Articolo e per Commessa)

**Stato:** annotata dall'utente (sessione 2026-08-10), non ancora specificata nei dettagli —
esplicitamente "per il futuro", non implementare finché non richiesta esplicitamente.

Oggi sia `kit_ferramenta_righe` (BOM per ODP) sia `distinte_scarico` (sessione di prelievo) si
compilano da zero ogni volta, anche quando la lista è concettualmente sempre la stessa. L'utente
ha confermato di aver bisogno di **entrambi** questi meccanismi, che sono strutturalmente diversi
e vanno progettati separatamente:

1. **Per Codice Articolo** (vera distinta base/BOM): un articolo specifico richiede sempre la
   stessa ferramenta, indipendentemente dalla commessa. Andrebbe definita una volta (tabella tipo
   `kit_template_righe` con `codice_articolo` + `articolo_id` + `quantita`) e applicata
   automaticamente quando si crea un nuovo ODP/Scheda con quel codice articolo — popolando
   `kit_ferramenta_righe` per quell'ODP a partire dal template, invece di reinserirla a mano.
   Da chiarire: cosa succede se il template cambia dopo che alcuni ODP l'hanno già usato (gli ODP
   esistenti restano con la versione applicata a suo tempo, presumibilmente sì — nessuna retroattività).
2. **Per Commessa** (duplicazione): commesse simili tendono a riusare la stessa lista complessiva,
   non legata a un singolo articolo — qui serve più un bottone "Duplica questa distinta" che copi
   le righe di una vecchia `distinta_scarico` (o di un vecchio Kit ODP) in una nuova, come punto di
   partenza da poi modificare, non un'applicazione automatica.

**Come affrontarla, quando richiesta**: partire dal caso più chiaramente specificato tra i due
(probabilmente il Codice Articolo, essendo un vero BOM); il caso Commessa è più semplice (solo un
"duplica", nessuna nuova tabella necessaria, basta una route che legge le righe di una distinta/kit
esistente e le re-inserisce in una nuova).

### ~~Ruolo Ufficio Tecnico per le Distinte di Scarico~~ — fatto (2026-08-10)

**Stato:** fatto. L'Ufficio Tecnico non aveva alcun accesso al MES — quando riceve/prepara una
lista di ferramenta per una Commessa da mandare in cantiere, non aveva modo di inserirla nel
sistema per farla preparare al magazziniere.

Nuovo ruolo `ufficio_tecnico` in `src/lib/auth.ts`, con permessi volutamente limitati: nuova
costante `DISTINTE_SCARICO_CREA_ROLES` (= `FERRAMENTA_ROLES` + `ufficio_tecnico`) usata per
creare/vedere/aggiungere-togliere righe nelle Distinte di Scarico — **ma non per chiudere**
(scarico reale della giacenza), che resta esclusiva di `FERRAMENTA_ROLES`
(`chiudi/route.ts` non toccata apposta). Separazione netta tra chi pianifica (Ufficio Tecnico) e
chi esegue fisicamente in magazzino (magazziniere/produzione/admin).

Il ruolo vede in nav solo "Ferramenta" (ridiretto automaticamente a `/ferramenta/distinte-scarico`,
mai alla home giacenze) e nella sotto-nav Ferramenta solo la tab "Distinte di Scarico"
(`FerramentaSubNav` nuovo prop `soloDistinteScarico`). Nel dettaglio distinta, il bottone "Chiudi"
è sostituito da un testo informativo se `puoChiudere=false`.

**Assegnare questo ruolo richiede modificare `USERS_JSON` sulla VPS** (nessuna UI admin per farlo,
stessa limitazione già nota per gli altri ruoli custom di questa sessione).

**Correzione nella stessa sessione**: la Distinta di Scarico era pensata solo per il magazziniere
che scopre/aggiunge articoli scansionando i QR mentre gira in magazzino (`DettaglioDistintaScarico.tsx`
non aveva alcun form di inserimento diretto) — inutilizzabile per l'Ufficio Tecnico, che riceve una
lista già completa (tipicamente un file Excel da UTT) e deve poterla inserire tutta subito, non
scoprirla articolo per articolo camminando in magazzino. Aggiunto un form diretto (articolo via
`ArticoloAutocomplete` + quantità, stesso pattern di `GestioneKitOdp`) che convive con la modalità
QR esistente — l'utente può scegliere quale usare, nessuna delle due sostituisce l'altra.

**Ulteriore correzione, stessa sessione**: mancava ancora il pezzo centrale richiesto — "Kit
Commessa" con lo **stesso comportamento del Kit Ferramenta ODP**: conferma che notifica il
magazziniere, separata dallo scarico effettivo. Aggiunta `distinte_scarico.confermata_il`
(indipendente da stato/chiusura) + `POST /api/ferramenta/distinte-scarico/[id]/conferma`
(stessa logica di `kit/[schedaId]/conferma`, stesso `sendNotifica`/webhook
`N8N_WEBHOOK_FERRAMENTA`, `eventType: "kit_pronto"`) — a differenza del Kit ODP, qui l'`eventId`
è l'id della distinta stessa (non un UUID casuale ad ogni click), quindi riconfermare non genera
mai una seconda notifica duplicata. UI: bottone "Conferma e notifica magazziniere" in
`DettaglioDistintaScarico.tsx`, stesso stile del blocco conferma di `GestioneKitOdp.tsx`. Il flusso
finale è quindi identico al Kit ODP: crea lista → conferma (notifica) → magazziniere prepara →
chiudi (scarico reale) — ultimo passo indipendente dal terzo, si può chiudere anche senza aver
mai confermato.

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

### Riferimento Fornitori (`fornitore_id`) non popolato per gli articoli reimportati da OS1

**Stato:** gap noto (sessione 2026-08-06), nessuna implementazione richiesta per ora — nota
aggiornata dopo la migrazione Fornitori a Postgres (`fornitori`, FK reale da
`articoli_ferramenta.fornitore_id`, vedi `schema_fornitori_fk_articoli.sql`): il disallineamento
per rinomina non può più accadere strutturalmente, ma resta il gap di popolamento sotto.

Il reimport completo dell'anagrafica (2026-08-06, 8358 articoli da
`scripts/importa-anagrafica-ferramenta.mjs`) popola `fornitore_nome_os1` (Ragione sociale OS1) ma
**non** `fornitore_id` — il file OS1 non contiene alcun riferimento all'anagrafica Fornitori. Non
esiste UI per riassegnare il fornitore di un articolo esistente o crearne uno nuovo fuori
dall'import CSV.

**Come affrontarla**: se serve correggere/assegnare un fornitore oggi si fa via query diretta su
Postgres. Costruire una UI di riassegnazione solo se richiesta esplicitamente.

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

### ~~Valore di riordino per articoli "A Pezzo"~~ — fatto (2026-08-09)

**Stato:** fatto. L'utente ha scelto di riusare lo stesso campo dei Kanban (`quantitaStandardVaschetta`,
impostato a mano in tabella) invece di un campo dedicato o di un valore calcolato, e di lasciare
fuori scope per ora il modal "sotto soglia → stampa etichetta di riordino".

Il backend (`updateArticoloFerramentaClassificazione`/`articoliFerramentaRepository.ts`) era già
generico — scrive il valore indipendentemente dal `metodoGestione`, nessuna modifica necessaria.
Cambiato solo `TabellaArticoliFerramenta.tsx`: input "Qtà Riordino" (rinominata da "Qtà Vaschetta")
non più disabilitato per A Pezzo (`disabled={!metodoGestione}` invece di `!== "Kanban"`), e il
payload di salvataggio non azzera più il valore digitato quando il metodo non è Kanban. Resta
obbligatorio (>0) solo per Kanban, opzionale per A Pezzo.

**Deliberatamente fuori scope**: `ScaricoAPezzoCard.tsx` non ha lo stato "sotto-soglia" e la route
`etichetta-riordino` resta bloccata ai soli Kanban (`etichetta-riordino/route.ts:23-28`) — da
riprendere se/quando l'utente chiede anche la stampa etichetta per A Pezzo.

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

### ~~Nav bar principale usciva dai limiti orizzontali per l'admin~~ — fatto (2026-08-09)

**Stato:** fatto. L'admin vede tutte le 9 sezioni base più le 5 voci solo-admin (Previsionale,
Import Schede, Kit Ferramenta ODP, Audit Log, PIN Operatori) più Guida = 15 voci in una riga
`flex` senza wrap né scroll — nessun contenimento. Problema specifico dell'admin: gli altri ruoli
vedono al massimo 6-7 voci, mai overflow.

Le 5 voci solo-admin (già isolate nel codice come blocco `isAdmin`) raggruppate sotto un unico
menu a tendina "Amministrazione ▾" (`NavDropdown`/`NavDropdownItem`, nuovi in `Navbar.tsx`) — click
per aprire, chiusura su click esterno o su selezione di una voce. Riduce l'admin da 15 a 11 voci in
riga. Menu mobile lasciato invariato (lista piatta): lì le voci si impilano verticalmente, nessun
overflow da risolvere, un livello di click in più sarebbe stato solo peggiorativo.

Scelto tra 3 opzioni proposte all'utente (raggruppamento mirato vs overflow menu automatico "Altro"
vs nav a sole icone) — l'utente ha scelto il raggruppamento mirato.

### ~~Vista "Standard Articoli" in Rilevamento Ore~~ — fatto (2026-08-08)

**Stato:** fatto. L'utente vuole vedere direttamente in UI come gli standard ore per articolo/reparto
(`standard_reparto`, usati dal Previsionale per la capacità) passano da stima seminata una tantum
a media reale via chiusure ODP — oggi visibile solo con query dirette su Postgres.

Nuova tab "Standard Articoli": una riga per articolo, una colonna per reparto (`REPARTI_PRODUZIONE`),
cella con ore medie — marcata `~` in ambra se `origine = 'stimato'` (nessuna chiusura reale ancora,
stesso linguaggio visivo già usato nel Previsionale per "basato su stima"), altrimenti ore + numero
di osservazioni reali tra parentesi. Cella vuota ("—") se quell'articolo non ha mai avuto ore su
quel reparto. Ricerca per codice/descrizione, badge riepilogo "Celle a consuntivo: N / totale".

Backend: `getStandardRepartoMatrix()` (`standardRepartoRepository.ts`) — join `standard_reparto` +
`articoli`, raggruppato per codice articolo. Nuova route `GET /api/ore/standard-articoli`.

Verificato contro dati reali: 156 articoli con almeno una riga standard, 6 con almeno una cella già
a consuntivo (su 8 celle totali su 624) — coerente con quanto osservato nelle sessioni precedenti
sul nuovo meccanismo di aggiornamento automatico. `tsc`/`eslint` puliti.

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
`'email'` non richiede migrazione schema. `fornitori.email` esiste già su Postgres (aggiunta in
previsione di questa feature) ma resta `NULL` per tutti — va popolata prima di poter usarla.

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

**Stato:** pianificato, non iniziato — schema confermato con l'utente (sessione 2026-08-13),
aggiornato Notion → Postgres (Schede è su Postgres dalla migrazione di questa sessione)

Sezione per l'operatore di imballo sulle Schede in stato `Verificato`. Oggi `schede.stato` è
**sempre manuale** (nessun trigger automatico da nessuna parte, nemmeno dalla Verifica Spedizione
appena corretta in questa sessione — il vecchio codice tentava di scrivere `Completato` su Notion,
mai su Postgres, ed era comunque rotto). Schema confermato in due passi:
1. Quando `POST /api/verifiche/[scheda]/finalize` completa con successo (PDF caricato su Drive),
   impostare automaticamente `schede.stato = "Verificato"` (opzione già presente nel dropdown di
   `FormModificaScheda.tsx`, mai collegata a nulla finora).
2. Nuova vista "Da Imballare" — pagina a sé o filtro dentro `/schede`/`/spedizioni` (da decidere
   quando si parte) — che elenca le Schede con `stato = "Verificato"`. Bottone "Segna Completato"
   per il magazziniere quando chiude fisicamente la cassa → `updateSchedaStato(id, "Completato")`
   (già esiste in `schedeRepository.ts`, non richiede nuovo codice lato repository).

Chiude il ciclo: Materiale Pronto → Verificato (automatico da Verifica Spedizione) → Da Imballare
(vista, nuova) → Completato (manuale, imballo fisico confermato).

### Checklist Cod. Articoli da produrre — controllo copertura Schede

**Stato:** idea proposta dall'utente (sessione 2026-08-13), da riprendere — non ancora specificata

L'utente vorrebbe poter partire da una lista di Codici Articolo "da produrre" per una Commessa e
usarla come checklist per garantire che ogni codice abbia una Scheda di Produzione corrispondente
— oggi non esiste alcun controllo di copertura: si può chiudere/consegnare una Commessa senza
accorgersi che manca la Scheda per un articolo previsto. Nessun dettaglio ancora su dove dovrebbe
vivere questa lista dei codici "da produrre" (import esterno da OS1? distinta base per Area? altro?)
né su come confrontarla con le Schede esistenti. Riprendere quando l'utente porta più contesto
("ne riparleremo").

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

---

## Modulo APS (Advanced Planning & Scheduling)

### Tabella Schede di Produzione: filtri "Archiviate" e "Fasi APS da pianificare"

**Stato:** idea proposta dall'utente (sessione 2026-08-22), da riprendere — non ancora pianificata

Durante lo sviluppo del motore di scheduling APS (Fase 3+4: `apsSchedulerRepository.ts`) sono
emersi due filtri applicati nel motore che oggi non hanno equivalente visibile nella Tabella
Schede di Produzione (`TabellaSchede.tsx` / `getSchede()`):

- **Archiviate**: `getSchede()` esclude sempre `archiviata = true` in modo rigido — dalla UI non
  si vede mai una scheda archiviata, nemmeno volendo (bisogna interrogare il DB a mano per
  verificarlo, come fatto per debug in questa sessione).
- **Fasi APS "Da iniziare"**: la tabella non sa nulla di `schede_fasi` — nessun modo di vedere a
  colpo d'occhio quali schede hanno ancora fasi APS non pianificate (le uniche che il motore
  tocca), utile finché non esiste la UI Gantt (Fase 7).

**Come affrontarla, se richiesto**: un toggle "Mostra archiviate" (richiede una variante o un
parametro di `getSchede()` che non filtri `archiviata`), più un conteggio/badge per scheda delle
`schede_fasi` con `stato_fase = 'Da iniziare'` (richiede una query aggiuntiva o una JOIN in
`getSchede()`) con relativo filtro. Pensato esplicitamente come aiuto di debug/verifica, non come
sostituto della futura UI Gantt.
