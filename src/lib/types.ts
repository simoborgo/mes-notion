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
  produzioneEsterna: boolean;
  statoProdEsterna: string;
  fornitore: string;
  ordineFornitore: string;
  dataRientroPrevista: string | null;
  dataUscitaMateriale: string | null;
  dataRientroEffettiva: string | null;
  copertina: string | null;
  note: string;
  commessaId: string | null;
  commessaNr: string;
  areaId: string | null;
  areaLabel: string;
  notionUrl: string;
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
}

export interface Ritiro {
  id: string;
  causale: string;
  numeroOrdine: string;
  numeroOrdineId: string | null;
  descrizioneMerce: string;
  dataTrasporto: string | null;
  tipoMovimento: string;
  stato: string;
  urgenza: boolean;
  fornitore: string;
  note: string;
  documentiAllegati: { name: string; url: string }[];
  notionUrl: string;
}

export interface RitiroUpdate {
  causale?: string;
  descrizioneMerce?: string;
  dataTrasporto?: string | null;
  tipoMovimento?: string;
  stato?: string;
  urgenza?: boolean;
  fornitore?: string;
  note?: string;
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
