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
  pdfAllegato: { name: string; url: string }[];
  foto: { name: string; url: string }[];
  produzioneEsterna: boolean;
  statoProdEsterna: string;
  fornitore: string;
  ordineFornitore: string;
  pdfOrdineFornitore: { name: string; url: string }[];
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
}

export interface SchedaUpdate {
  statoProduzione?: string;
  dataProduzionePrevista?: string | null;
  produzioneEsterna?: boolean;
  statoProdEsterna?: string;
  fornitore?: string;
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

export interface Area {
  id: string;
  nomeArredo: string;
  cliente: string;
  codiceArticoloA: string;
  commessaId: string | null;
  commessaCliente: string;
  completamento: number | null;
  dataConsegnaPrevista: string | null;
  descrizione: string;
  localitaCliente: string;
  note: string;
  posizione: string;
  quantita: number | null;
  statoCommessa: string;
  statoProduzione: string;
  notionUrl: string;
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
}

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
  articoloId: string;
  articoloDescrizione: string;
  articoloCodiceOs1: string;
  quantita: number;
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
export const REPARTI_PRODUZIONE: string[] = [
  "CNC",
  "Falegnameria",
  "Verniciatura",
  "Assemblaggio",
  "Imballaggio",
  "Cablaggi",
  "Sezionatura",
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
export type EsitoCampionatura = "approvato" | "rifiutato" | "in_revisione";
export type StatoCiclo = "bozza" | "validato";

// Clienti ricostruiti dal catalogo reale (ETICHETTE_VERNICI_estratto.csv, 2026-08-08): lista
// fissa applicativa, non una tabella — evita varianti di scrittura sullo stesso cliente.
// Prada/Hermès esclusi finché non diventano clienti attivi davvero (mai visti nei dati reali).
// Valori più frequenti osservati nel catalogo reale (ETICHETTE_VERNICI_estratto.csv,
// 2026-08-08). Suggerimento in UI, non un vincolo DB: tipologia resta TEXT libero in
// Postgres (nessun CHECK) — la UI offre "Altro" per qualsiasi valore non in lista.
export const TIPOLOGIE_VERNICIATURA: string[] = [
  "OPACO", "LUCIDO", "SEMILUCIDO", "FONDO", "FINITURA", "SMALTO", "METALLIZZATO",
  "GOFFRATO", "PRIMER", "PATINA", "TINTA", "IDROPITTURA", "VERNICE", "RESINA",
  "CATALIZZATORE", "DILUENTE", "INDURITORE", "ADDITIVO", "CONCENTRATO", "ISOLANTE",
  "COLORANTE", "ACETONE", "ACQUA",
];

export const CLIENTI_VERNICIATURA: string[] = [
  "Gucci",
  "Armani",
  "Cartier",
  "Diesel",
  "Bottega Veneta",
  "Brioni",
  "Boucheron",
  "Mage",
  "Villa Giuseppina",
  "Valentino",
];

export interface Vernice {
  id: string;
  coloreCodice: string | null;
  coloreNome: string | null;
  // Testo libero: in futuro collegato alla vera tabella Fornitori condivisa (non ancora
  // esistente) — nel frattempo niente registro dedicato, solo un campo informativo.
  fornitore: string | null;
  codiceTintometro: string | null;
  codiceVendita: string | null;
  codiceInventario: string | null;
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
  createdAt: string;
  updatedAt: string;
}

export interface VerniceUpdate {
  coloreCodice?: string | null;
  coloreNome?: string | null;
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

export interface CicloFaseProdottoRiga {
  id: string;
  verniceId: string;
  ruoloInFase: RuoloInFase;
  // Quantità libera: percentuale su base vernice principale (unita="%") o quantità assoluta
  // di una formula (es. "160" + unita="gr") — stessa colonna copre entrambi i casi reali.
  quantita: number | null;
  unita: string | null;
  note: string | null;
}

export interface CicloFase {
  id: string;
  ordine: number;
  nomeFase: string | null;
  note: string | null;
  prodotti: CicloFaseProdottoRiga[];
}

export interface Ciclo {
  id: string;
  nome: string | null;
  cicloPadreId: string | null;
  stato: StatoCiclo;
  versione: number;
  validatoAt: string | null;
  validatoDaCampionaturaId: string | null;
  note: string | null;
  // Sempre presenti nella distinta di verniciatura reale, insieme a Commessa/Negozio.
  essenza: string | null;
  ignifuga: boolean | null;
  attivo: boolean;
  createdAt: string;
  updatedAt: string;
  fasi?: CicloFase[];
}

export interface CampionaturaFoto {
  id: string;
  driveFileId: string;
  nomeFile: string | null;
  ordine: number | null;
}

export interface Campionatura {
  id: string;
  cicloId: string;
  cliente: string;
  codiceCampioneMaterialista: string | null;
  codicePubblico: string;
  dataCampionatura: string;
  esito: EsitoCampionatura;
  note: string | null;
  driveFolderId: string | null;
  attivo: boolean;
  validatoAt: string | null;
  createdAt: string;
  updatedAt: string;
  foto?: CampionaturaFoto[];
}
