import { pool, dateToStr } from "./db";
import { sendNotifica, type NotificaResult } from "./notify";
import { dataOggiRoma } from "./oraLocale";

// Notifiche dei giri esterni verso Telegram, tramite un solo webhook n8n (N8N_WEBHOOK_GIRI_ESTERNI)
// che smista su `destinatario`. Il `testo` arriva già pronto in HTML Telegram: in n8n basta lo
// Switch e i nodi Telegram. Vedi scripts/n8n/notifiche-giri-esterni.json.
//   - rientro di un giro → Produzione (pezzo tornato; per una Rilavorazione, controllo qualità)
//   - uscita/rientro che non torna con Ritiri e Consegne → Logistica
//   - riepilogo del mattino → Logistica (src/app/api/webhooks/riepilogo-logistica)

export type Destinatario = "produzione" | "logistica";
export type AzioneGiro = "uscita" | "rientro";

export interface ContestoNotifica {
  autore: string;
  origine: string; // "QR", "Scheda", "Lavorazioni Esterne", "Ritiri e Consegne"
  baseUrl: string;
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function dataBreve(d: string | null): string {
  if (!d) return "senza data";
  const [y, m, g] = d.slice(0, 10).split("-");
  return y && m && g ? `${g}/${m}` : d;
}

// Nome da mostrare per chi ha agito dal tablet col PIN: "Nome Cognome", o la matricola se non trovato.
export async function nomeOperatore(matricola: string): Promise<string> {
  try {
    const { rows } = await pool.query(`SELECT nome, cognome FROM operatori WHERE matricola = $1`, [matricola]);
    const nome = rows[0] ? `${rows[0].nome ?? ""} ${rows[0].cognome ?? ""}`.trim() : "";
    return nome || `matricola ${matricola}`;
  } catch {
    return `matricola ${matricola}`;
  }
}

export async function inviaNotificaGiri(
  destinatario: Destinatario,
  evento: { entityType: string; entityId: string; eventType: string; eventId: string },
  testo: string,
  extra: Record<string, unknown> = {},
): Promise<NotificaResult> {
  return sendNotifica({
    ...evento,
    webhookUrl: process.env.N8N_WEBHOOK_GIRI_ESTERNI,
    payload: { tipo: "giri_esterni", evento: evento.eventType, destinatario, testo, timestamp: new Date().toISOString(), ...extra },
  });
}

interface GiroConScheda {
  giroId: string;
  ordine: number;
  stato: string;
  lavorazione: string;
  fornitore: string;
  dataRientroEffettiva: string | null;
  schedaId: string;
  odp: string;
  numeroScheda: string;
  tipologia: string;
  clienteInfo: string;
}

async function caricaGiro(giroId: string): Promise<GiroConScheda | null> {
  const { rows } = await pool.query(
    `SELECT g.id, g.ordine, g.stato, g.lavorazione, g.data_rientro_effettiva, COALESCE(f.nome, '') AS fornitore,
       s.id AS scheda_id, s.odp, s.numero_scheda, s.tipologia,
       CASE WHEN c.id IS NOT NULL THEN c.cliente || ' - ' || c.localita ELSE '' END AS cliente_info
     FROM schede_giri g
     JOIN schede s ON s.id = g.scheda_id
     LEFT JOIN fornitori f ON f.id = g.fornitore_id
     LEFT JOIN commesse c ON c.id = s.commessa_id
     WHERE g.id = $1`,
    [giroId],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    giroId: r.id, ordine: r.ordine, stato: r.stato, lavorazione: r.lavorazione ?? "", fornitore: r.fornitore,
    dataRientroEffettiva: r.data_rientro_effettiva ? dateToStr(r.data_rientro_effettiva) : null,
    schedaId: r.scheda_id, odp: r.odp ?? "", numeroScheda: r.numero_scheda ?? "", tipologia: r.tipologia ?? "",
    clienteInfo: r.cliente_info ?? "",
  };
}

function intestazioneScheda(g: GiroConScheda): string {
  const parti = [`<b>${escapeHtml(g.odp || "ODP senza numero")}</b>`];
  if (g.numeroScheda) parti.push(escapeHtml(g.numeroScheda));
  if (g.clienteInfo) parti.push(escapeHtml(g.clienteInfo));
  return parti.join(" · ");
}

function descrizioneGiro(g: GiroConScheda): string {
  const lav = g.lavorazione ? `, ${escapeHtml(g.lavorazione)}` : "";
  return `giro ${g.ordine}${lav}`;
}

function campiGiro(g: GiroConScheda, ctx: ContestoNotifica) {
  return {
    odp: g.odp, numero_scheda: g.numeroScheda, cliente: g.clienteInfo, tipologia: g.tipologia,
    fornitore: g.fornitore, giro: g.ordine, lavorazione: g.lavorazione,
    autore: ctx.autore, origine: ctx.origine, scheda_url: `${ctx.baseUrl}/schede/${g.schedaId}`,
  };
}

// Pezzo rientrato in Modar → Produzione. Da chiamare dopo ogni azione che può portare il giro in
// "Rientrato" (QR, tab Fornitore, Lavorazioni Esterne/form Modifica, Ritiro Fatto): se il giro non
// è rientrato non fa nulla, e l'idempotenza per giro+data fa partire un solo messaggio anche quando
// più percorsi scattano insieme. Non lancia mai: si chiama in background dopo l'azione (`void`).
export async function notificaRientroGiro(giroId: string | null | undefined, ctx: ContestoNotifica): Promise<NotificaResult | null> {
  if (!giroId) return null;
  try {
    return await notificaRientro(giroId, ctx);
  } catch (e) {
    console.error("[notificaRientroGiro]", e);
    return null;
  }
}

async function notificaRientro(giroId: string, ctx: ContestoNotifica): Promise<NotificaResult | null> {
  const g = await caricaGiro(giroId);
  if (!g || g.stato !== "Rientrato") return null;

  const da = g.fornitore ? ` da ${escapeHtml(g.fornitore)}` : "";
  const righe = [
    `📦 <b>Rientrato</b> ${intestazioneScheda(g)}`,
    `${da ? `Torna${da}` : "Torna dal fornitore"} (${descrizioneGiro(g)}) · segnato da ${escapeHtml(ctx.autore)} (${escapeHtml(ctx.origine)})`,
  ];
  const rilavorazione = g.tipologia === "Rilavorazione";
  if (rilavorazione) {
    righe.push(`⚠️ Rilavorazione: conferma il controllo qualità in <a href="${ctx.baseUrl}/rientro-qualita">Rientro Qualità</a>, poi l'ODP madre riparte.`);
  }
  righe.push(`<a href="${ctx.baseUrl}/schede/${g.schedaId}">Apri la scheda</a>`);

  return inviaNotificaGiri(
    "produzione",
    { entityType: "scheda_giro", entityId: g.giroId, eventType: "rientro", eventId: `${g.giroId}:${g.dataRientroEffettiva ?? dataOggiRoma()}` },
    righe.join("\n"),
    { ...campiGiro(g, ctx), rilavorazione },
  );
}

const TIPO_PER_AZIONE: Record<AzioneGiro, "Consegna" | "Ritiro"> = { uscita: "Consegna", rientro: "Ritiro" };

export type CasoAnomalia = "nessun_movimento" | "movimenti_aperti" | "ok";

// Uscita/rientro segnato da QR o dalla scheda che non torna con Ritiri e Consegne → Logistica.
// Ricalcola dal DB: nessun movimento del tipo giusto sul giro, oppure movimenti rimasti aperti
// (l'utente ha scelto "Lascia aperti"). Al massimo un avviso al giorno per giro e azione.
export async function notificaAnomaliaGiro(giroId: string, azione: AzioneGiro, ctx: ContestoNotifica): Promise<{ caso: CasoAnomalia; esito: NotificaResult | null }> {
  const g = await caricaGiro(giroId);
  if (!g) return { caso: "ok", esito: null };
  const tipo = TIPO_PER_AZIONE[azione];
  const { rows } = await pool.query(
    `SELECT descrizione, data_trasporto, stato FROM ritiri
     WHERE giro_id = $1 AND tipo_movimento = $2 AND archiviato = false
     ORDER BY data_trasporto NULLS LAST, creato_il`,
    [giroId, tipo],
  );
  const aperti = rows.filter((r) => r.stato !== "Fatto");
  const caso: CasoAnomalia = rows.length === 0 ? "nessun_movimento" : aperti.length > 0 ? "movimenti_aperti" : "ok";
  if (caso === "ok") return { caso, esito: null };

  const verso = azione === "uscita"
    ? `🚚 <b>Uscita</b> ${intestazioneScheda(g)}${g.fornitore ? ` verso ${escapeHtml(g.fornitore)}` : ""}`
    : `🚚 <b>Rientro</b> ${intestazioneScheda(g)}${g.fornitore ? ` da ${escapeHtml(g.fornitore)}` : ""}`;
  const giro = descrizioneGiro(g);
  const righe = [verso, `${giro.charAt(0).toUpperCase()}${giro.slice(1)} · segnato da ${escapeHtml(ctx.autore)} (${escapeHtml(ctx.origine)})`];
  if (caso === "nessun_movimento") {
    righe.push(`In Ritiri e Consegne non c'è nessun${azione === "uscita" ? "a Consegna" : " Ritiro"} per questo giro.`);
  } else {
    righe.push(`Restano aperti in Ritiri e Consegne:`);
    for (const r of aperti) {
      righe.push(`• ${dataBreve(r.data_trasporto ? dateToStr(r.data_trasporto) : null)} · ${escapeHtml(r.descrizione || tipo)}`);
    }
  }
  righe.push(`<a href="${ctx.baseUrl}/ritiri">Apri Ritiri e Consegne</a>`);

  const esito = await inviaNotificaGiri(
    "logistica",
    { entityType: "scheda_giro", entityId: g.giroId, eventType: `anomalia_${azione}`, eventId: `${g.giroId}:${dataOggiRoma()}` },
    righe.join("\n"),
    { ...campiGiro(g, ctx), azione, caso, movimenti_aperti: aperti.length },
  );
  return { caso, esito };
}
