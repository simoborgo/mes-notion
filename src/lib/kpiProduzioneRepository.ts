import { pool, dateToStr } from "./db";
import { getCostoOrarioManodopera } from "./parametriGeneraliRepository";
import { dataOggiRoma } from "./oraLocale";
import { REPARTO_ID_A_NOME_STORICO } from "./schedeFasiRepository";

// KPI Produzione. Un ODP è la scheda principale (tipologia 'Scheda'); entra nei KPI "a consuntivo"
// solo se tutte le sue schede principali non annullate sono "Completato" con data produzione
// effettiva (nessun backfill: i completamenti precedenti all'introduzione della data restano fuori).
//  - Lead Time = giorni di calendario tra data scheda ricevuta (prima scheda dell'ODP) e data
//    produzione effettiva (ultima scheda dell'ODP);
//  - Scarto di consegna = data produzione effettiva − data produzione prevista (+ ritardo, − anticipo);
//  - Costo = ore registrate sull'ODP (incluse le rilavorazioni ODP/Rxx) × costo orario manodopera
//    corrente (Parametri Generali): non storicizzato, un cambio tariffa ricalcola anche il passato.

// Identificativi mostrati in ogni dettaglio (tooltip, popup, tabelle).
export interface Anagrafica {
  odp: string;
  titolo: string;          // N° Scheda
  codiceArticolo: string;
  clienteInfo: string;     // "commessa cliente - località"
}

export interface OdpKpi extends Anagrafica {
  dataRicevuta: string | null;
  dataPrevista: string | null;
  dataProduzione: string;
  leadTimeGiorni: number | null;
  scartoGiorni: number | null;
  ore: number;
  costo: number | null;
  // Operatori distinti con ore registrate sull'ODP (rilavorazioni incluse); 0 = nessuna ora.
  persone: number;
  // Giorni tra scheda ricevuta e prima ora registrata sull'ODP (min 0); null senza ore o senza data.
  attesaGiorni: number | null;
  oreRif: number;
  nRilavorazioni: number;
  // Stima APS (schede_fasi.ore_stimate) vs ore consuntive degli stessi reparti; null senza stima.
  oreStimate: number | null;
  oreConsuntivateStimate: number | null;
  scostamentoPct: number | null;
}

// Lavorazione esterna rientrata dal fornitore.
export interface EsternaKpi extends Anagrafica {
  fornitore: string;
  dataUscita: string | null;
  dataRientro: string;
  dataRientroPrevista: string | null;
  // Uscita → rientro effettivo (null senza data di uscita).
  giorni: number | null;
  // Rientro effettivo − rientro previsto (+ ritardo, − anticipo); null senza data prevista.
  scartoGiorni: number | null;
}

// ODP ancora in produzione (fotografia di oggi, non filtrata per periodo).
export interface OdpApertoKpi extends Anagrafica {
  stato: string;
  dataRicevuta: string | null;
  dataPrevista: string | null;
  etaGiorni: number | null;
  inRitardo: boolean;
}

export interface RepartoOre {
  reparto: string;
  ore: number;
  odp: (Anagrafica & { ore: number })[];
}

export interface KpiProduzione {
  odp: OdpKpi[];
  esterne: EsternaKpi[];
  aperti: OdpApertoKpi[];
  oreReparto: RepartoOre[];
  costoOrario: number;
}

const GIORNO_MS = 86400000;
const giorniTra = (da: string, a: string) => Math.round((Date.parse(a) - Date.parse(da)) / GIORNO_MS);

const CLIENTE_INFO_SQL = `min(CASE WHEN c.id IS NOT NULL THEN c.numero_commessa || ' ' || c.cliente || ' - ' || c.localita END)`;
const TITOLO_SQL = `COALESCE(string_agg(DISTINCT NULLIF(s.numero_scheda, ''), ', '), '')`;
const ARTICOLO_SQL = `COALESCE(string_agg(DISTINCT NULLIF(s.codice_articolo, ''), ', '), '')`;
// Ore dell'ODP: righe sull'ODP stesso o sulle sue rilavorazioni (ODP/Rxx).
const ORE_ODP = `(o.odp = g.odp OR o.odp LIKE g.odp || '/R%')`;

export async function getKpiProduzione(dal: string | null): Promise<KpiProduzione> {
  const oggi = dataOggiRoma();
  const [costoOrario, { rows }, { rows: righeEsterne }, { rows: righeAperti }, { rows: righeStima }, { rows: righeCons }, { rows: righeReparto }, { rows: righeAnag }] = await Promise.all([
    getCostoOrarioManodopera(),
    pool.query(
      `SELECT g.*,
              COALESCE((SELECT sum(o.ore) FROM ore_registrate o WHERE ${ORE_ODP}), 0) AS ore,
              (SELECT count(DISTINCT o.matricola) FROM ore_registrate o WHERE ${ORE_ODP}) AS persone,
              (SELECT min(o.data) FROM ore_registrate o WHERE o.odp = g.odp) AS prima_ora,
              COALESCE((SELECT sum(o.ore) FROM ore_registrate o WHERE o.rif AND ${ORE_ODP}), 0) AS ore_rif,
              (SELECT count(*) FROM schede r JOIN schede p ON p.id = r.parent_id
                WHERE r.tipologia = 'Rilavorazione' AND r.archiviata = false AND p.tipologia = 'Scheda' AND p.odp = g.odp) AS n_rilavorazioni
       FROM (
         SELECT s.odp, ${TITOLO_SQL} AS titolo, ${ARTICOLO_SQL} AS codice_articolo,
                COALESCE(${CLIENTE_INFO_SQL}, '') AS cliente_info,
                min(s.data_scheda_ricevuta) AS inizio,
                max(s.data_produzione_prevista) AS prevista,
                max(s.data_produzione_effettiva) AS fine
         FROM schede s
         LEFT JOIN commesse c ON c.id = s.commessa_id
         WHERE s.tipologia = 'Scheda' AND s.archiviata = false AND s.stato <> 'Annullata' AND s.odp <> ''
         GROUP BY s.odp
         HAVING bool_and(s.stato = 'Completato' AND s.data_produzione_effettiva IS NOT NULL)
       ) g
       ORDER BY g.fine DESC, g.odp`,
    ),
    // Rientri dal fornitore: serve almeno la data di uscita (tempo di arrivo) o la prevista (puntualità).
    pool.query(
      `SELECT s.odp, s.numero_scheda, s.codice_articolo, COALESCE(f.nome, '') AS fornitore,
              CASE WHEN c.id IS NOT NULL THEN c.numero_commessa || ' ' || c.cliente || ' - ' || c.localita ELSE '' END AS cliente_info,
              s.data_uscita_materiale, s.data_rientro_effettiva, s.data_rientro_prevista
       FROM schede s
       LEFT JOIN fornitori f ON f.id = s.fornitore_id
       LEFT JOIN commesse c ON c.id = s.commessa_id
       WHERE s.archiviata = false AND s.data_rientro_effettiva IS NOT NULL
         AND (s.data_uscita_materiale IS NOT NULL OR s.data_rientro_prevista IS NOT NULL)
       ORDER BY s.data_rientro_effettiva DESC, s.odp`,
    ),
    pool.query(
      `SELECT s.odp, ${TITOLO_SQL} AS titolo, ${ARTICOLO_SQL} AS codice_articolo,
              COALESCE(${CLIENTE_INFO_SQL}, '') AS cliente_info,
              string_agg(DISTINCT s.stato, ', ') AS stato,
              min(s.data_scheda_ricevuta) AS inizio, max(s.data_produzione_prevista) AS prevista
       FROM schede s LEFT JOIN commesse c ON c.id = s.commessa_id
       WHERE s.tipologia = 'Scheda' AND s.archiviata = false AND s.odp <> '' AND s.stato NOT IN ('Completato', 'Annullata')
       GROUP BY s.odp`,
    ),
    // Stima per ODP e reparto dalle fasi APS (fotografia presa alla generazione delle fasi).
    pool.query(
      `SELECT s.odp, f.reparto_id, sum(f.ore_stimate) AS stima
       FROM schede_fasi f JOIN schede s ON s.id = f.scheda_id
       WHERE s.tipologia = 'Scheda' AND f.ore_stimate IS NOT NULL AND f.esclusa = false
       GROUP BY s.odp, f.reparto_id`,
    ),
    // Consuntivo per ODP e reparto, senza rifacimenti (come lo storico standard).
    pool.query(`SELECT odp, reparto, sum(ore) AS ore FROM ore_registrate WHERE rif = false GROUP BY odp, reparto`),
    pool.query(
      `SELECT reparto, odp, sum(ore) AS ore FROM ore_registrate
       WHERE categoria = 'COMMESSA' AND COALESCE(reparto, '') <> '' AND ($1::date IS NULL OR data >= $1::date)
       GROUP BY reparto, odp`,
      [dal],
    ),
    pool.query(
      `SELECT s.odp, ${TITOLO_SQL} AS titolo, ${ARTICOLO_SQL} AS codice_articolo, COALESCE(${CLIENTE_INFO_SQL}, '') AS cliente_info
       FROM schede s LEFT JOIN commesse c ON c.id = s.commessa_id
       WHERE s.tipologia = 'Scheda' AND s.archiviata = false AND s.odp <> '' GROUP BY s.odp`,
    ),
  ]);

  const stimaPerOdp = new Map<string, Map<string, number>>();
  for (const r of righeStima) {
    const nome = REPARTO_ID_A_NOME_STORICO[r.reparto_id as string];
    if (!nome) continue;
    const m = stimaPerOdp.get(r.odp) ?? new Map<string, number>();
    m.set(nome, (m.get(nome) ?? 0) + Number(r.stima));
    stimaPerOdp.set(r.odp, m);
  }
  const consPerOdp = new Map<string, Map<string, number>>();
  for (const r of righeCons) {
    const m = consPerOdp.get(r.odp) ?? new Map<string, number>();
    m.set(r.reparto, Number(r.ore));
    consPerOdp.set(r.odp, m);
  }

  const odp: OdpKpi[] = rows.map((r) => {
    const dataRicevuta = r.inizio ? dateToStr(r.inizio) : null;
    const dataPrevista = r.prevista ? dateToStr(r.prevista) : null;
    const dataProduzione = dateToStr(r.fine);
    const ore = Number(r.ore);
    const primaOra = r.prima_ora ? dateToStr(r.prima_ora) : null;

    let oreStimate: number | null = null;
    let oreCons: number | null = null;
    const stime = stimaPerOdp.get(r.odp);
    if (stime && stime.size > 0) {
      const cons = consPerOdp.get(r.odp);
      oreStimate = [...stime.values()].reduce((s, v) => s + v, 0);
      oreCons = [...stime.keys()].reduce((s, reparto) => s + (cons?.get(reparto) ?? 0), 0);
    }

    return {
      odp: r.odp, titolo: r.titolo, codiceArticolo: r.codice_articolo, clienteInfo: r.cliente_info,
      dataRicevuta, dataPrevista, dataProduzione,
      leadTimeGiorni: dataRicevuta ? giorniTra(dataRicevuta, dataProduzione) : null,
      scartoGiorni: dataPrevista ? giorniTra(dataPrevista, dataProduzione) : null,
      ore,
      costo: ore > 0 && costoOrario > 0 ? ore * costoOrario : null,
      persone: Number(r.persone),
      attesaGiorni: primaOra && dataRicevuta ? Math.max(0, giorniTra(dataRicevuta, primaOra)) : null,
      oreRif: Number(r.ore_rif),
      nRilavorazioni: Number(r.n_rilavorazioni),
      oreStimate, oreConsuntivateStimate: oreCons,
      // Senza ore nei reparti con stima non c'è confronto possibile (non è un −100%).
      scostamentoPct: oreStimate && oreStimate > 0 && oreCons ? ((oreCons - oreStimate) / oreStimate) * 100 : null,
    };
  });

  const esterne: EsternaKpi[] = righeEsterne.map((r) => {
    const dataUscita = r.data_uscita_materiale ? dateToStr(r.data_uscita_materiale) : null;
    const dataRientro = dateToStr(r.data_rientro_effettiva);
    const dataPrevista = r.data_rientro_prevista ? dateToStr(r.data_rientro_prevista) : null;
    const giorni = dataUscita ? giorniTra(dataUscita, dataRientro) : null;
    return {
      odp: r.odp, titolo: r.numero_scheda, codiceArticolo: r.codice_articolo, clienteInfo: r.cliente_info,
      fornitore: r.fornitore, dataUscita, dataRientro, dataRientroPrevista: dataPrevista,
      // Uscita successiva al rientro = dato incoerente: escluso dal tempo di arrivo.
      giorni: giorni != null && giorni >= 0 ? giorni : null,
      scartoGiorni: dataPrevista ? giorniTra(dataPrevista, dataRientro) : null,
    };
  });

  const aperti: OdpApertoKpi[] = righeAperti.map((r) => {
    const dataRicevuta = r.inizio ? dateToStr(r.inizio) : null;
    const dataPrevista = r.prevista ? dateToStr(r.prevista) : null;
    return {
      odp: r.odp, titolo: r.titolo, codiceArticolo: r.codice_articolo, clienteInfo: r.cliente_info, stato: r.stato,
      dataRicevuta, dataPrevista,
      etaGiorni: dataRicevuta ? Math.max(0, giorniTra(dataRicevuta, oggi)) : null,
      inRitardo: !!dataPrevista && dataPrevista < oggi,
    };
  });

  const anag = new Map<string, Anagrafica>(
    righeAnag.map((r) => [r.odp, { odp: r.odp, titolo: r.titolo, codiceArticolo: r.codice_articolo, clienteInfo: r.cliente_info }]),
  );
  const perReparto = new Map<string, RepartoOre>();
  for (const r of righeReparto) {
    const rep = perReparto.get(r.reparto) ?? { reparto: r.reparto as string, ore: 0, odp: [] };
    const ore = Number(r.ore);
    rep.ore += ore;
    rep.odp.push({ ...(anag.get(r.odp) ?? { odp: r.odp, titolo: "", codiceArticolo: "", clienteInfo: "" }), ore });
    perReparto.set(r.reparto, rep);
  }
  const oreReparto = [...perReparto.values()]
    .map((rep) => ({ ...rep, odp: rep.odp.sort((a, b) => b.ore - a.ore).slice(0, 40) }))
    .sort((a, b) => b.ore - a.ore);

  return { odp, esterne, aperti, oreReparto, costoOrario };
}

// Primo giorno incluso nel periodo "ultimi N giorni" (calendario Italia); null = nessun limite.
export function dataLimiteKpi(giorni: number | null): string | null {
  return giorni == null ? null : dataOggiRoma(new Date(Date.now() - giorni * GIORNO_MS));
}
