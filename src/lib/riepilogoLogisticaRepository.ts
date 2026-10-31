import { pool, dateToStr } from "./db";
import { dataOggiRoma } from "./oraLocale";
import { escapeHtml, dataBreve } from "./notificheGiri";

// Riepilogo del mattino per la Logistica, via email (webhook /api/webhooks/riepilogo-logistica,
// n8n lun–ven 06:45). Una sola query per sezione, direttamente su Postgres; oggetto e corpo HTML
// escono già pronti, n8n li passa al nodo Email.

const MAX_RIGHE = 10;

interface MovimentoRiepilogo { tipo: string; descrizione: string; odp: string; fornitore: string; data: string | null }
interface GiroInRitardo { odp: string; numeroScheda: string; fornitore: string; lavorazione: string; giorni: number }
interface RilavorazioneSenzaRitiro { odp: string; numeroScheda: string; fornitore: string }

export interface RiepilogoLogistica {
  data: string;
  oggi: MovimentoRiepilogo[];
  ritardo: { totale: number; righe: MovimentoRiepilogo[] };
  giriInRitardo: { totale: number; righe: GiroInRitardo[] };
  rilavorazioniSenzaRitiro: RilavorazioneSenzaRitiro[];
}

const SELECT_MOVIMENTI = `
  SELECT r.tipo_movimento, r.descrizione, r.data_trasporto, COALESCE(s.odp, c.numero_commessa, '') AS odp, COALESCE(f.nome, '') AS fornitore
  FROM ritiri r
  LEFT JOIN schede s ON s.id = r.scheda_id
  LEFT JOIN commesse c ON c.id = r.commessa_id
  LEFT JOIN fornitori f ON f.id = r.fornitore_id
  WHERE r.archiviato = false AND r.stato <> 'Fatto'`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mapMovimento = (r: any): MovimentoRiepilogo => ({
  tipo: r.tipo_movimento ?? "", descrizione: r.descrizione ?? "", odp: r.odp ?? "", fornitore: r.fornitore ?? "",
  data: r.data_trasporto ? dateToStr(r.data_trasporto) : null,
});

export async function getRiepilogoLogistica(oggi: string = dataOggiRoma()): Promise<RiepilogoLogistica> {
  const [movOggi, ritardoTot, ritardo, giriTot, giri, rilav] = await Promise.all([
    pool.query(`${SELECT_MOVIMENTI} AND r.data_trasporto = $1 ORDER BY r.tipo_movimento, r.creato_il`, [oggi]),
    pool.query(`SELECT count(*)::int AS n FROM ritiri WHERE archiviato = false AND stato <> 'Fatto' AND data_trasporto < $1`, [oggi]),
    pool.query(`${SELECT_MOVIMENTI} AND r.data_trasporto < $1 ORDER BY r.data_trasporto, r.creato_il LIMIT ${MAX_RIGHE}`, [oggi]),
    // Solo giri col materiale davvero dal fornitore ("In Lavorazione"), su schede non chiuse: i giri
    // storici senza stato o ancora da ordinare/inviare non sono un sollecito per la logistica.
    pool.query(
      `SELECT count(*)::int AS n FROM schede_giri g JOIN schede s ON s.id = g.scheda_id
       WHERE s.archiviata = false AND s.stato NOT IN ('Completato','Annullata')
         AND g.stato = 'In Lavorazione' AND g.data_rientro_prevista < $1`, [oggi]),
    pool.query(
      `SELECT s.odp, s.numero_scheda, COALESCE(f.nome, '') AS fornitore, g.lavorazione, ($1::date - g.data_rientro_prevista) AS giorni
       FROM schede_giri g JOIN schede s ON s.id = g.scheda_id LEFT JOIN fornitori f ON f.id = g.fornitore_id
       WHERE s.archiviata = false AND s.stato NOT IN ('Completato','Annullata')
         AND g.stato = 'In Lavorazione' AND g.data_rientro_prevista < $1
       ORDER BY g.data_rientro_prevista LIMIT ${MAX_RIGHE}`, [oggi]),
    // Stessa regola di Rientro Qualità: Rilavorazione aperta senza nessun movimento collegato.
    pool.query(
      `SELECT s.odp, s.numero_scheda, COALESCE(f.nome, '') AS fornitore
       FROM schede s LEFT JOIN fornitori f ON f.id = s.fornitore_id
       WHERE s.tipologia = 'Rilavorazione' AND s.archiviata = false AND s.stato NOT IN ('Completato','Annullata')
         AND NOT EXISTS (SELECT 1 FROM ritiri r WHERE r.rilavorazione_id = s.id AND r.archiviato = false)
       ORDER BY s.creato_il`),
  ]);
  return {
    data: oggi,
    oggi: movOggi.rows.map(mapMovimento),
    ritardo: { totale: ritardoTot.rows[0].n, righe: ritardo.rows.map(mapMovimento) },
    giriInRitardo: {
      totale: giriTot.rows[0].n,
      righe: giri.rows.map((r) => ({ odp: r.odp ?? "", numeroScheda: r.numero_scheda ?? "", fornitore: r.fornitore, lavorazione: r.lavorazione ?? "", giorni: Number(r.giorni) })),
    },
    rilavorazioniSenzaRitiro: rilav.rows.map((r) => ({ odp: r.odp ?? "", numeroScheda: r.numero_scheda ?? "", fornitore: r.fornitore })),
  };
}

const GIORNI = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MESI = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function dataEstesa(d: string): string {
  const [y, m, g] = d.split("-").map(Number);
  const giorno = GIORNI[new Date(Date.UTC(y, m - 1, g)).getUTCDay()];
  return `${giorno} ${g} ${MESI[m - 1]}`;
}

// Stili in linea: i client di posta ignorano i <style> nell'head.
const ST = {
  corpo: "font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1A1918;max-width:640px",
  titolo: "font-size:18px;margin:0 0 4px",
  sezione: "font-size:15px;margin:20px 0 6px;padding-bottom:4px;border-bottom:2px solid #E87722",
  tabella: "border-collapse:collapse;width:100%;font-size:13px",
  cella: "padding:5px 8px 5px 0;border-bottom:1px solid #EEE;vertical-align:top",
  nota: "color:#6B6560;font-size:13px;margin:4px 0",
  link: "color:#C06A10",
};

function tabella(intestazioni: string[], righe: string[][]): string {
  const th = intestazioni.map((h) => `<th align="left" style="${ST.cella};color:#888780;font-size:11px;text-transform:uppercase">${h}</th>`).join("");
  const tr = righe.map((r) => `<tr>${r.map((c) => `<td style="${ST.cella}">${c}</td>`).join("")}</tr>`).join("");
  return `<table style="${ST.tabella}" cellpadding="0" cellspacing="0"><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
}

function altri(totale: number, mostrati: number): string {
  return totale > mostrati ? `<p style="${ST.nota}">… e altri ${totale - mostrati}.</p>` : "";
}

const tipoMov = (t: string) => (t === "Consegna" ? "↗ Consegna" : t === "Ritiro" ? "↙ Ritiro" : escapeHtml(t || "—"));
const rigaMov = (m: MovimentoRiepilogo, conData: boolean) => [
  ...(conData ? [dataBreve(m.data)] : []), tipoMov(m.tipo), `<b>${escapeHtml(m.odp || "—")}</b>`, escapeHtml(m.descrizione || "—"), escapeHtml(m.fornitore || "—"),
];

export function emailRiepilogo(r: RiepilogoLogistica, baseUrl: string): { oggetto: string; html: string } {
  const quando = dataEstesa(r.data);
  const sintesi = [
    r.oggi.length ? `${r.oggi.length} trasport${r.oggi.length === 1 ? "o" : "i"} oggi` : "nessun trasporto oggi",
    ...(r.ritardo.totale ? [`${r.ritardo.totale} in ritardo`] : []),
    ...(r.giriInRitardo.totale ? [`${r.giriInRitardo.totale} rientri scaduti`] : []),
    ...(r.rilavorazioniSenzaRitiro.length ? [`${r.rilavorazioniSenzaRitiro.length} rilavorazioni senza ritiro`] : []),
  ].join(", ");
  const oggetto = `Logistica · ${quando} · ${sintesi}`;

  const parti = [`<div style="${ST.corpo}">`, `<h1 style="${ST.titolo}">Logistica · ${quando}</h1>`, `<p style="${ST.nota}">${escapeHtml(sintesi.charAt(0).toUpperCase() + sintesi.slice(1))}.</p>`];
  parti.push(`<h2 style="${ST.sezione}">Oggi</h2>`);
  parti.push(r.oggi.length
    ? tabella(["Tipo", "ODP", "Descrizione", "Fornitore"], r.oggi.map((m) => rigaMov(m, false)))
    : `<p style="${ST.nota}">Nessun trasporto in programma.</p>`);
  if (r.ritardo.totale > 0) {
    parti.push(`<h2 style="${ST.sezione}">Movimenti in ritardo (${r.ritardo.totale})</h2>`,
      tabella(["Data", "Tipo", "ODP", "Descrizione", "Fornitore"], r.ritardo.righe.map((m) => rigaMov(m, true))),
      altri(r.ritardo.totale, r.ritardo.righe.length));
  }
  if (r.giriInRitardo.totale > 0) {
    parti.push(`<h2 style="${ST.sezione}">Dal fornitore oltre il rientro previsto (${r.giriInRitardo.totale})</h2>`,
      tabella(["ODP", "Scheda", "Fornitore", "Lavorazione", "Ritardo"], r.giriInRitardo.righe.map((g) => [
        `<b>${escapeHtml(g.odp)}</b>`, escapeHtml(g.numeroScheda || "—"), escapeHtml(g.fornitore || "—"), escapeHtml(g.lavorazione || "—"), `+${g.giorni} gg`,
      ])),
      altri(r.giriInRitardo.totale, r.giriInRitardo.righe.length));
  }
  if (r.rilavorazioniSenzaRitiro.length > 0) {
    parti.push(`<h2 style="${ST.sezione}">Rilavorazioni senza ritiro concordato (${r.rilavorazioniSenzaRitiro.length})</h2>`,
      tabella(["ODP", "Scheda", "Fornitore"], r.rilavorazioniSenzaRitiro.slice(0, MAX_RIGHE).map((x) => [
        `<b>${escapeHtml(x.odp)}</b>`, escapeHtml(x.numeroScheda || "—"), escapeHtml(x.fornitore || "—"),
      ])),
      altri(r.rilavorazioniSenzaRitiro.length, MAX_RIGHE));
  }
  parti.push(`<p style="margin-top:20px"><a style="${ST.link}" href="${baseUrl}/ritiri">Apri Ritiri e Consegne</a> · <a style="${ST.link}" href="${baseUrl}/rientro-qualita">Rientro Qualità</a></p>`, "</div>");
  return { oggetto, html: parti.join("\n") };
}
