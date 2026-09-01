export const STATI_CHIUSI_ODP = ["Completato", "Annullata"];

export interface Scheda {
  id: string;
  odp: string;
  clienteInfo: string;
  numeroScheda: string;
  descrizioneFasi: string;
  codiceArticolo: string;
  posizione: string;
  quantita: number | null;
  tipologia: string;
  statoProduzione: string;
  faseCorrente: string;
  dataSchedaRicevuta: string | null;
  dataProduzionePrevista: string | null;
  pdfAllegato: { id: string | null; name: string; url: string }[];
  foto: { id: string | null; name: string; url: string }[];
  produzioneEsterna: boolean;
  statoProdEsterna: string;
  fornitore: string;
  fornitoreId: string | null;
  ordineFornitore: string;
  pdfOrdineFornitore: { id: string | null; name: string; url: string }[];
  dataRientroPrevista: string | null;
  dataUscitaMateriale: string | null;
  dataRientroEffettiva: string | null;
  copertina: string | null;
  note: string;
  commessaId: string | null;
  commessaNr: string;
  areaId: string | null;
  areaLabel: string;
  parentId: string | null;
  notionUrl: string;
  kitFerramenta: string;
  noteStato: string;
  priorita: PrioritaOdp;
  // Ricetta di verniciatura usata per questo ODP (1 scheda_verniciatura può essere referenziata da
  // molti ODP nel tempo — cardinalità 1:N, vedi VerniciaturaOdpTab.tsx).
  schedaVerniciaturaId: string | null;
}

export type PrioritaOdp = "critica" | "alta" | "media" | "bassa";

export interface SchedaUpdate {
  odp?: string;
  numeroScheda?: string;
  commessaId?: string | null;
  priorita?: PrioritaOdp;
  statoProduzione?: string;
  dataProduzionePrevista?: string | null;
  produzioneEsterna?: boolean;
  statoProdEsterna?: string;
  fornitore?: string;
  fornitoreId?: string | null;
  ordineFornitore?: string;
  dataRientroPrevista?: string | null;
  dataUscitaMateriale?: string | null;
  dataRientroEffettiva?: string | null;
  note?: string;
  codiceArticolo?: string;
  posizione?: string;
  quantita?: number | null;
  dataSchedaRicevuta?: string | null;
  noteStato?: string;
  areaId?: string | null;
  schedaVerniciaturaId?: string | null;
}

export interface Ritiro {
  id: string;
  causale: string;
  numeroOrdine: string;
  numeroOrdineId: string | null;
  rilavorazioneId: string | null;
  commessaId: string | null;
  commessaNr: string;
  descrizioneMerce: string;
  dataTrasporto: string | null;
  dataFatto: string | null;
  tipoMovimento: string;
  stato: string;
  urgenza: boolean;
  nc: boolean;
  nrCollo: number | null;
  totColli: number | null;
  fornitore: string;
  fornitoreId: string | null;
  ordineFornitore: { name: string; url: string }[];
  note: string;
  documentiAllegati: { name: string; url: string }[];
  pdfScheda: { name: string; url: string }[];
  pdfOrdineFornitore: { name: string; url: string }[];
  foto: { name: string; url: string }[];
  notionUrl: string;
}

export interface RitiroUpdate {
  causale?: string;
  descrizioneMerce?: string;
  dataTrasporto?: string | null;
  tipoMovimento?: string;
  stato?: string;
  urgenza?: boolean;
  nc?: boolean;
  nrCollo?: number | null;
  totColli?: number | null;
  commessaId?: string | null;
  fornitore?: string;
  schedaId?: string | null;
  fornitoreId?: string | null;
  rilavorazioneId?: string | null;
}

export interface Commessa {
  id: string;
  numeroCommessa: string;
  cliente: string;
  localita: string;
  info: string;
  responsabile: string;
  stato: string;
  dataCarico: string | null;
  inizioMontaggio: string | null;
  fineMontaggio: string | null;
  giorniMontaggio: number | null;
  notionUrl: string;
}

export interface Carico {
  id: string;
  titolo: string;
  descrizione: string;
  dataCarico: string | null;
  commessaId: string | null;
  odpIds: string[];
  modalita: string;
  stato: string;
  documenti: { name: string; url: string }[];
  notionUrl: string;
}

export interface CaricoUpdate {
  titolo?: string;
  descrizione?: string;
  dataCarico?: string | null;
  commessaId?: string | null;
  odpIds?: string[];
  modalita?: string;
  stato?: string;
}

// Packing List: casse di una Commessa, con le Schede assegnate (N:N — una Scheda può stare su più
// casse se il suo contenuto viene fisicamente diviso, vedi schema_casse.sql).
export interface CassaSchedaRiga {
  schedaId: string;
  note: string;
}

export interface Cassa {
  id: string;
  commessaId: string;
  numero: number;
  descrizione: string;
  stato: string; // "Da preparare" | "Pronta" | "Caricata"
  note: string;
  schede: CassaSchedaRiga[];
  creatoIl: string;
  aggiornatoIl: string;
}

export interface CassaUpdate {
  descrizione?: string;
  stato?: string;
  note?: string;
  schede?: CassaSchedaRiga[];
}

export interface Area {
  id: string;
  nomeArredo: string;
  codiceArticoloA: string;
  commessaId: string | null;
  dataConsegnaPrevista: string | null;
  descrizione: string;
  // localitaCliente/statoCommessa non sono più colonne proprie: derivate via JOIN dalla Commessa
  // collegata (prima erano rollup/formula Notion che mirroravano lo stesso dato).
  localitaCliente: string;
  note: string;
  posizione: string;
  quantita: number | null;
  statoCommessa: string;
  statoProduzione: string;
  notionUrl: string;
}

export interface CommessaUpdate {
  numeroCommessa?: string;
  cliente?: string;
  localita?: string;
  info?: string;
  responsabile?: string;
  stato?: string;
  dataCarico?: string | null;
  inizioMontaggio?: string | null;
  fineMontaggio?: string | null;
}

export interface AreaUpdate {
  nomeArredo?: string;
  codiceArticoloA?: string;
  commessaId?: string;
  dataConsegnaPrevista?: string | null;
  descrizione?: string;
  note?: string;
  posizione?: string;
  quantita?: number | null;
  statoProduzione?: string;
}

export interface Operatore {
  id: string;
  matricola: string; // DIP-0072
  cognome: string;
  nome: string;
  reparto: string;
  tipo: string;
  azienda: string;
  inForza: boolean;
}

export interface Fornitore {
  id: string;
  nome: string;
  codiceOs1: string;
  email: string | null;
}

export interface OdpAttivo {
  id: string | null;
  odp: string;
  label: string;
  numeroScheda?: string;
  clienteInfo?: string;
  codiceArticolo?: string;
  commessaNr?: string;
  copertina?: string | null;
  isSpeciale: boolean;
  completato?: boolean;
}

// Etichette per le categorie ore_registrate non-COMMESSA (ODP_SPECIALI in src/lib/notion.ts),
// condivise fra route API (server) e viste Rilevamento Ore (client): non hanno un codice
// articolo per definizione, quindi nei riepiloghi si mostra questa etichetta al suo posto
// invece del badge "NON CLASSIFICATO" (che segnala invece una vera Scheda senza Codice Art.).
export const CATEGORIA_ODP_LABEL: Record<string, string> = {
  SETUP: "Setup", MANUTENZIONE: "Manutenzione", RIUNIONE: "Riunione", FORMAZIONE: "Formazione", PULIZIE: "Pulizie",
  ARREDI_MASSELLI: "Arredi e Masselli", FERMO_MACCHINA: "Fermo Macchina",
};

export type MetodoGestioneFerramenta = "Kanban" | "A Pezzo";

export interface ArticoloFerramenta {
  id: string;
  descrizione: string;
  codiceOs1: string;
  unitaMisura: string;
  fornitoreId: string | null;
  fornitoreNome: string;
  fornitoreNomeOs1: string;
  codiceFornitore: string;
  metodoGestione: MetodoGestioneFerramenta | null;
  giacenzaAttuale: number;
  quantitaStandardVaschetta: number | null;
  sogliaMinima: number | null;
  attivo: boolean;
  note: string;
  ubicazione: string;
  notionUrl: string;
  prezzoRiferimento: number | null;
  prezzoRiferimentoAggiornatoIl: string | null;
  descrizioneFornitore: string;
  // Fase 4 anagrafica (import OS1 2026-08-06): compliance col file "Codici Valorizzati"/OS1.
  inventariato: boolean;
  descrizioneCategoria: string;
  categoriaMerceologica: string;
  codInv: string;
  prezzoUltimoAcquisto: number | null;
}

export interface ArticoloFerramentaUpdate {
  descrizione?: string;
  metodoGestione?: MetodoGestioneFerramenta | null;
  quantitaStandardVaschetta?: number | null;
  sogliaMinima?: number | null;
  attivo?: boolean;
  note?: string;
  ubicazione?: string | null;
  codiceFornitore?: string | null;
  prezzoRiferimento?: number | null;
  descrizioneFornitore?: string;
}

export interface DistintaKitRiga {
  id: string;
  odpId: string;
  articoloId: string | null;
  articoloDescrizione: string;
  articoloCodiceOs1: string;
  quantita: number;
  preparataDa: string | null;
  preparataIl: string | null;
  notionUrl: string;
}

// 21 valori fissi — select Notion su DB_FERRAMENTA, property "Ubicazione"
export const UBICAZIONI_FERRAMENTA: string[] = [
  ...Array.from({ length: 10 }, (_, i) => `Scaffale ${i + 1}`),
  "Scaffale Esterno",
  ...Array.from({ length: 10 }, (_, i) => `Scaffale Piano Superiore ${i + 1}`),
];

// Reparti "di produzione" per Standard_Reparto/Capacity Planner (modulo Offerte/Storico/
// Previsionale) — sottoinsieme degli 8 valori Notion Personale→Reparto: esclude i reparti
// di supporto (Logistica, Spedizioni, Ferramenta, Produzione) non rilevanti per il calcolo
// ore-articolo. Assemblaggio/Imballaggio/Sezionatura aggiunti come opzioni Notion apposta
// per questo modulo — nessun operatore ancora classificato lì, riclassificazione manuale.
// Distinte e Sviluppo/Pressa/Levigatura aggiunti il 2026-08-23 per allineare il tracciamento
// ore reali ai 3 reparti APS introdotti dopo i 7 storici (decisione utente: nessun operatore
// ancora classificato lì in Notion, stesso trattamento "0 finché non riclassificato" degli
// altri — vedi capacityPlannerRepository.ts, che già gestisce un reparto senza parametri).
export const REPARTI_PRODUZIONE: string[] = [
  "CNC",
  "Falegnameria",
  "Verniciatura",
  "Assemblaggio",
  "Imballaggio",
  "Cablaggi",
  "Sezionatura",
  "Distinte e Sviluppo",
  "Pressa",
  "Levigatura",
];

// --- Modulo Verniciatura -----------------------------------------------------------------

export type UnitaMisuraVernice = "KG" | "LT" | "NR";
// Categorie reali da "TABELLA CATEGORIE VERNICI.pdf" (fornita dall'utente, 2026-08-09) —
// sostituisce l'enum ipotizzato inizialmente (mai usato in produzione, vedi memoria di sessione).
export type TipoBilancioMassa =
  | "ACETONE"
  | "DILUENTE"
  | "VERNICE ALL'ACQUA"
  | "CATALIZZATORE ACRILICO"
  | "VERNICE ACRILICA"
  | "FONDO ACRILICO"
  | "CATALIZZATORE POLIURETANICO"
  | "VERNICE POLIURETANICA"
  | "FONDO POLIURETANICO"
  | "FONDO POLIESTERE"
  | "VERNICE NITRO"
  | "TINTA SOLVENTE";

export const TIPI_BILANCIO_MASSA_VERNICIATURA: TipoBilancioMassa[] = [
  "ACETONE", "DILUENTE", "VERNICE ALL'ACQUA", "CATALIZZATORE ACRILICO", "VERNICE ACRILICA",
  "FONDO ACRILICO", "CATALIZZATORE POLIURETANICO", "VERNICE POLIURETANICA", "FONDO POLIURETANICO",
  "FONDO POLIESTERE", "VERNICE NITRO", "TINTA SOLVENTE",
];
export type RuoloInFase = "vernice" | "catalizzatore" | "diluente" | "indurente" | "additivo" | "altro";
// Stato unificato della Scheda di Verniciatura (fonde l'ex StatoCiclo/bozza-validato con l'ex
// EsitoCampionatura/approvato-rifiutato-in_revisione): bozza -> in_revisione -> approvato|rifiutato.
// "approvato" è l'ex "validato". Se rifiutato, si genera una nuova versione (genera-figlio) che
// riparte da bozza, invece di sbloccare la stessa riga.
export type StatoSchedaVerniciatura = "bozza" | "in_revisione" | "approvato" | "rifiutato";

// Valori più frequenti osservati nel catalogo reale (ETICHETTE_VERNICI_estratto.csv,
// 2026-08-08). Suggerimento in UI, non un vincolo DB: tipologia resta TEXT libero in
// Postgres (nessun CHECK) — la UI offre "Altro" per qualsiasi valore non in lista.
export const TIPOLOGIE_VERNICIATURA: string[] = [
  "OPACO", "LUCIDO", "SEMILUCIDO", "FONDO", "FINITURA", "SMALTO", "METALLIZZATO",
  "GOFFRATO", "PRIMER", "PATINA", "TINTA", "IDROPITTURA", "VERNICE", "RESINA",
  "CATALIZZATORE", "DILUENTE", "INDURITORE", "ADDITIVO", "CONCENTRATO", "ISOLANTE",
  "COLORANTE", "ACETONE", "ACQUA",
];

// Clienti verniciatura: tabella clienti_verniciatura (vedi schema_verniciatura_fase8_clienti.sql),
// non più una lista fissa qui — il form Campionatura può aggiungerne di nuovi al volo
// (ClienteVerniciaturaAutocomplete / ensureClienteVerniciaturaEsiste in
// clientiVerniciaturaRepository.ts), con univocità case-insensitive garantita lato DB.

export interface Vernice {
  id: string;
  coloreCodice: string | null;
  descrizioneColore: string | null;
  // Testo libero: in futuro collegato alla vera tabella Fornitori condivisa (non ancora
  // esistente) — nel frattempo niente registro dedicato, solo un campo informativo.
  fornitore: string | null;
  codiceTintometro: string | null;
  codiceVendita: string | null;
  codiceInventario: string | null;
  // Scritta solo da carico/scarico/rettifica (movimenti_magazzino) — mai da VerniceUpdate.
  giacenzaAttuale: number;
  unitaMisura: UnitaMisuraVernice | null;
  tipologia: string;
  finitura: string | null;
  gloss: string | null;
  tipoBilancioMassa: TipoBilancioMassa | null;
  bilancioMassaRaw: string | null;
  // Informativo/storico (da import CSV): NON è il legame strutturale col cliente, quello vive
  // solo su Campionature. Serve a non perdere il riferimento cliente originale finché non
  // esistono ancora cicli/campionature reali per una vernice migrata dal catalogo legacy.
  clienteRiferimento: string | null;
  driveFolderId: string | null;
  tsDriveFileId: string | null;
  sdsDriveFileId: string | null;
  attivo: boolean;
  // Timestamp dell'ultimo movimento (segnalazione leggera o vero carico/scarico) non ancora
  // verificato da una conta fisica — null se non ci sono movimenti da verificare. Si azzera SOLO
  // al conteggio in un inventario, mai da un carico/scarico successivo (vedi
  // schema_verniciatura_fase10_segnalazione_movimento.sql).
  segnalataUsoIl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VerniceUpdate {
  coloreCodice?: string | null;
  descrizioneColore?: string | null;
  fornitore?: string | null;
  codiceTintometro?: string | null;
  codiceVendita?: string | null;
  // Non esposto in modifica in UI (solo in creazione) — resta comunque un campo aggiornabile
  // lato API se davvero necessario correggerlo a mano.
  codiceInventario?: string | null;
  unitaMisura?: UnitaMisuraVernice | null;
  tipologia?: string;
  finitura?: string | null;
  gloss?: string | null;
  tipoBilancioMassa?: TipoBilancioMassa | null;
  bilancioMassaRaw?: string | null;
  clienteRiferimento?: string | null;
  attivo?: boolean;
}

// Bordi (bordatura pannelli) — prima categoria dopo Vernici a riusare il motore di magazzino
// generico condiviso (vedi schema_magazzino_bordi.sql). Struttura mirror di Vernice/VerniceUpdate,
// campi propri della categoria (spessore/altezza/decor/materiale) al posto di
// tipologia/finitura/gloss/bilancio di massa.
export type UnitaMisuraBordo = "ML" | "MT" | "NR";

export interface Bordo {
  id: string;
  codice: string | null;
  decorCodice: string | null;
  decorNome: string | null;
  materiale: string | null;
  spessoreMm: number | null;
  altezzaMm: number | null;
  finitura: string | null;
  // Testo libero: stesso motivo di Vernice.fornitore (nessun registro Fornitori condiviso).
  fornitore: string | null;
  codiceFornitore: string | null;
  codiceInventario: string | null;
  // Scritta solo da carico/scarico/rettifica (movimenti_magazzino) — mai da BordoUpdate.
  giacenzaAttuale: number;
  unitaMisura: UnitaMisuraBordo | null;
  clienteRiferimento: string | null;
  attivo: boolean;
  // Stesso pattern "da inventariare" di Vernice.segnalataUsoIl.
  segnalataUsoIl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BordoUpdate {
  codice?: string | null;
  decorCodice?: string | null;
  decorNome?: string | null;
  materiale?: string | null;
  spessoreMm?: number | null;
  altezzaMm?: number | null;
  finitura?: string | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: UnitaMisuraBordo | null;
  clienteRiferimento?: string | null;
  attivo?: boolean;
}

// Legname, Tranciati, Profili Metallici — stesso motore di magazzino generico di Bordi, campi
// propri della tipicità di ciascuna categoria. Nessun file Excel disponibile per nessuna delle
// tre: campi scelti sulla tipicità nota del reparto, da affinare quando arriverà un export reale.

export type UnitaMisuraLegno = "M3" | "MQ" | "ML" | "NR";

export interface Legno {
  id: string;
  codice: string | null;
  essenza: string | null; // specie legno: Rovere, Faggio, Noce Canaletto, Abete...
  qualita: string | null; // scelta/qualità: Prima scelta, Nodato...
  spessoreMm: number | null;
  larghezzaMm: number | null;
  lunghezzaMm: number | null;
  fornitore: string | null;
  codiceFornitore: string | null;
  codiceInventario: string | null;
  giacenzaAttuale: number;
  unitaMisura: UnitaMisuraLegno | null;
  clienteRiferimento: string | null;
  attivo: boolean;
  segnalataUsoIl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LegnoUpdate {
  codice?: string | null;
  essenza?: string | null;
  qualita?: string | null;
  spessoreMm?: number | null;
  larghezzaMm?: number | null;
  lunghezzaMm?: number | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: UnitaMisuraLegno | null;
  clienteRiferimento?: string | null;
  attivo?: boolean;
}

export type UnitaMisuraTranciato = "MQ" | "NR" | "KG";

export interface Tranciato {
  id: string;
  codice: string | null;
  essenza: string | null;
  qualita: string | null;
  spessoreMm: number | null;
  larghezzaMm: number | null;
  lunghezzaMm: number | null;
  fornitore: string | null;
  codiceFornitore: string | null;
  codiceInventario: string | null;
  giacenzaAttuale: number;
  unitaMisura: UnitaMisuraTranciato | null;
  clienteRiferimento: string | null;
  attivo: boolean;
  segnalataUsoIl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TranciatoUpdate {
  codice?: string | null;
  essenza?: string | null;
  qualita?: string | null;
  spessoreMm?: number | null;
  larghezzaMm?: number | null;
  lunghezzaMm?: number | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: UnitaMisuraTranciato | null;
  clienteRiferimento?: string | null;
  attivo?: boolean;
}

export type UnitaMisuraProfiloMetallico = "ML" | "NR" | "KG";

export interface ProfiloMetallico {
  id: string;
  codice: string | null;
  tipoProfilo: string | null; // es. Maniglia, Profilo strutturale, Guida scorrevole
  materiale: string | null; // Alluminio, Acciaio, Inox, Ottone...
  sezione: string | null; // es. "20x20mm", testo libero (non un singolo numero)
  lunghezzaMm: number | null; // barra standard, es. 6000
  finitura: string | null; // anodizzato, verniciato, grezzo...
  colore: string | null;
  fornitore: string | null;
  codiceFornitore: string | null;
  codiceInventario: string | null;
  giacenzaAttuale: number;
  unitaMisura: UnitaMisuraProfiloMetallico | null;
  clienteRiferimento: string | null;
  attivo: boolean;
  segnalataUsoIl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfiloMetallicoUpdate {
  codice?: string | null;
  tipoProfilo?: string | null;
  materiale?: string | null;
  sezione?: string | null;
  lunghezzaMm?: number | null;
  finitura?: string | null;
  colore?: string | null;
  fornitore?: string | null;
  codiceFornitore?: string | null;
  codiceInventario?: string | null;
  unitaMisura?: UnitaMisuraProfiloMetallico | null;
  clienteRiferimento?: string | null;
  attivo?: boolean;
}

export interface SchedaFaseProdottoRiga {
  id: string;
  verniceId: string;
  ruoloInFase: RuoloInFase;
  // Quantità libera: percentuale su base vernice principale (unita="%") o quantità assoluta
  // di una formula (es. "160" + unita="gr") — stessa colonna copre entrambi i casi reali.
  quantita: number | null;
  unita: string | null;
  note: string | null;
}

export interface SchedaFase {
  id: string;
  ordine: number;
  nomeFase: string | null;
  note: string | null;
  prodotti: SchedaFaseProdottoRiga[];
}

export interface SchedaVerniciaturaFoto {
  id: string;
  driveFileId: string;
  nomeFile: string | null;
  ordine: number | null;
}

// Scheda di Verniciatura: unifica l'ex Ciclo (fasi ordinate + vernici) e l'ex Campionatura
// (cliente, riferimento colore, barcode, foto) in un'unica entità versionata — ogni versione è
// una prova, fino alla validazione (approvato/rifiutato) del campione. Vedi
// schedeVerniciaturaRepository.ts e la migration fase12 per il contesto della fusione.
export interface SchedaVerniciatura {
  id: string;
  nome: string | null;
  schedaPadreId: string | null;
  stato: StatoSchedaVerniciatura;
  versione: number;
  validatoAt: string | null;
  note: string | null;
  // Sempre presenti nella distinta di verniciatura reale, insieme a Commessa/Negozio.
  essenza: string | null;
  ignifuga: boolean | null;
  // Cliente, commessa di origine e riferimento colore: impostati alla creazione (v1) ed ereditati
  // automaticamente in ogni prova successiva generata (genera-figlio) — non editabili per singola
  // versione. numeroCommessa è denormalizzato (join) solo per comodità di visualizzazione.
  cliente: string | null;
  commessaId: string | null;
  numeroCommessa: string | null;
  codiceCampioneMaterialista: string | null;
  codicePubblico: string | null;
  dataProva: string;
  driveFolderId: string | null;
  attivo: boolean;
  createdAt: string;
  updatedAt: string;
  fasi?: SchedaFase[];
  foto?: SchedaVerniciaturaFoto[];
}
