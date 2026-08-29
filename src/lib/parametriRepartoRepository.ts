import { pool } from "./db";
import { getAuditLogByRisorsa, getAuditLogByAzione, type AuditEntry } from "./audit";

export interface ParametriReparto {
  reparto: string;
  nPersone: number;
  oreGiorno: number;
  pctStraordinariMax: number;
  margineSicurezzaEsterni: number;
  tariffaEsternaEurH: number | null;
  oreGiornoEsterno: number | null;
  aggiornatoIl: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any): ParametriReparto {
  return {
    reparto: r.reparto,
    nPersone: r.n_persone,
    oreGiorno: Number(r.ore_giorno),
    pctStraordinariMax: Number(r.pct_straordinari_max),
    margineSicurezzaEsterni: Number(r.margine_sicurezza_esterni),
    tariffaEsternaEurH: r.tariffa_esterna_eur_h != null ? Number(r.tariffa_esterna_eur_h) : null,
    oreGiornoEsterno: r.ore_giorno_esterno != null ? Number(r.ore_giorno_esterno) : null,
    aggiornatoIl: r.aggiornato_il,
  };
}

export async function getParametriReparto(): Promise<ParametriReparto[]> {
  const { rows } = await pool.query(`SELECT * FROM parametri_reparto ORDER BY reparto`);
  return rows.map(mapRow);
}

export async function aggiornaParametriReparto(reparto: string, entry: {
  nPersone: number;
  oreGiorno: number;
  pctStraordinariMax: number;
  margineSicurezzaEsterni: number;
  tariffaEsternaEurH: number | null;
  oreGiornoEsterno: number | null;
}): Promise<ParametriReparto | null> {
  const { rows } = await pool.query(
    `UPDATE parametri_reparto SET
       n_persone = $2, ore_giorno = $3, pct_straordinari_max = $4, margine_sicurezza_esterni = $5,
       tariffa_esterna_eur_h = $6, ore_giorno_esterno = $7, aggiornato_il = now()
     WHERE reparto = $1 RETURNING *`,
    [reparto, entry.nPersone, entry.oreGiorno, entry.pctStraordinariMax, entry.margineSicurezzaEsterni,
     entry.tariffaEsternaEurH, entry.oreGiornoEsterno]
  );
  return rows[0] ? mapRow(rows[0]) : null;
}

// Storico dei valori nel tempo per un reparto — nessuna tabella di versioning dedicata: riusa
// audit_log, già popolato ad ogni PATCH da /api/admin/parametri-reparto (che invia sempre TUTTI i
// campi, mai un diff parziale — quindi ogni riga di audit è già uno snapshot pieno, non serve
// ricostruire un merge di diff incrementali). Copre "come sono cambiati organico/parametri nel
// tempo", non un ricalcolo storico dell'intero Previsionale (richiederebbe anche uno storico delle
// offerte/richieste, che non esiste).
export interface StoricoParametriRepartoRiga {
  modificatoIl: string;
  operatore: string;
  nPersone: number;
  oreGiorno: number;
  pctStraordinariMax: number;
  margineSicurezzaEsterni: number;
  tariffaEsternaEurH: number | null;
  oreGiornoEsterno: number | null;
}

function parseRigaStorico(entry: AuditEntry): StoricoParametriRepartoRiga | null {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(entry.modifiche);
  } catch {
    return null; // riga di audit corrotta/non-JSON, ignorata invece di far fallire tutto lo storico
  }
  return {
    modificatoIl: entry.timestamp ?? "",
    operatore: entry.operatore,
    nPersone: Number(body.nPersone),
    oreGiorno: Number(body.oreGiorno),
    pctStraordinariMax: Number(body.pctStraordinariMax),
    margineSicurezzaEsterni: Number(body.margineSicurezzaEsterni),
    tariffaEsternaEurH: body.tariffaEsternaEurH != null ? Number(body.tariffaEsternaEurH) : null,
    oreGiornoEsterno: body.oreGiornoEsterno != null ? Number(body.oreGiornoEsterno) : null,
  };
}

export async function getStoricoParametriReparto(reparto: string): Promise<StoricoParametriRepartoRiga[]> {
  const entries = await getAuditLogByRisorsa("UPDATE parametri_reparto", reparto);
  const righe: StoricoParametriRepartoRiga[] = [];
  for (const entry of entries) {
    const riga = parseRigaStorico(entry);
    if (riga) righe.push(riga);
  }
  return righe;
}

// Storico di TUTTI i reparti in un colpo solo (una query invece di N) — usato dal Previsionale
// per risolvere, mese per mese, i parametri effettivamente in vigore in quel mese invece di
// applicare sempre quelli correnti anche ai mesi passati (vedi risolviParametriAlMese in
// capacityPlannerRepository.ts). Ogni array è già ordinato dal più recente al più vecchio
// (stesso ordine di getAuditLogByRisorsa/getAuditLogByAzione, ORDER BY creato_il DESC).
export async function getStoricoParametriRepartoTutti(): Promise<Map<string, StoricoParametriRepartoRiga[]>> {
  const entries = await getAuditLogByAzione("UPDATE parametri_reparto");
  const mappa = new Map<string, StoricoParametriRepartoRiga[]>();
  for (const entry of entries) {
    const riga = parseRigaStorico(entry);
    if (!riga) continue;
    let righe = mappa.get(entry.idRisorsa);
    if (!righe) { righe = []; mappa.set(entry.idRisorsa, righe); }
    righe.push(riga);
  }
  return mappa;
}
