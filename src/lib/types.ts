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
