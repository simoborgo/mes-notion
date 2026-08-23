import type { PoolClient } from "pg";
import { pool, dateToStr } from "./db";
import { oggiIso, prossimaDataDisponibilitaDopo } from "./apsSchedulerRepository";
import { ensureArticoloEsiste } from "./articoliRepository";

export interface SchedaFase {
  id: string;
  schedaId: string;
  patternCicloFaseId: string;
  repartoId: string;
  repartoNome: string;
  ordine: number;
  sottoFase: string | null;
  oreStimate: number | null;
  statoFase: "Da iniziare" | "In lavorazione" | "Completato";
  dataDisponibilita: string | null;
  dataInizioPianificata: string | null;
  dataFinePianificata: string | null;
  corsia: number | null;
  aRischio: boolean;
  esclusa: boolean;
  oreConsuntivate: number | null;
  pianificazioneManuale: boolean;
}

// Il tracciamento ore storico (Rilevamento Ore / standard_reparto) usa i nomi dell'elenco
// REPARTI_PRODUZIONE (src/lib/types.ts), non gli id/slug della nuova tabella `reparti` — e
// "Imballaggio & Logistica" (nome nuovo) non coincide con "Imballaggio" (nome storico). Mappa
// esplicita invece di affidarsi a reparti.nome, che potrebbe cambiare in UI senza riflettersi
// qui. Dal 2026-08-23 anche Ufficio Tecnico/Tranciatura-Pressa/Levigatura sono tracciati per
// davvero (REPARTI_PRODUZIONE esteso) — nomi allineati alle rinomine decise con l'utente:
// "Ufficio Tecnico" -> "Distinte e Sviluppo", "Tranciatura-Pressa" -> "Pressa" (reparto unico).
export const REPARTO_ID_A_NOME_STORICO: Record<string, string> = {
  sezionatura: "Sezionatura",
  cnc: "CNC",
  falegnameria: "Falegnameria",
  verniciatura: "Verniciatura",
  assemblaggio: "Assemblaggio",
  imballaggio: "Imballaggio",
  cablaggi: "Cablaggi",
  ufficio_tecnico: "Distinte e Sviluppo",
  tranciatura_pressa: "Pressa",
  levigatura: "Levigatura",
};

// Inverso della mappa sopra — usata da registraChiusuraOdp (standardRepartoRepository.ts) per
// risalire da un nome storico (così com'è in ore_registrate/storico_consuntivo_articolo) al
// reparto_id da aprire in schede_fasi (iniziaFasePerOdpReparto, Fase 8a).
export const NOME_STORICO_A_REPARTO_ID: Record<string, string> = Object.fromEntries(
  Object.entries(REPARTO_ID_A_NOME_STORICO).map(([id, nome]) => [nome, id])
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRow(r: any, oreConsuntivate: number | null): SchedaFase {
  return {
    id: r.id,
    schedaId: r.scheda_id,
    patternCicloFaseId: r.pattern_ciclo_fase_id,
    repartoId: r.reparto_id,
    repartoNome: r.reparto_nome,
    ordine: Number(r.ordine),
    sottoFase: r.sotto_fase,
    oreStimate: r.ore_stimate != null ? Number(r.ore_stimate) : null,
    statoFase: r.stato_fase,
    dataDisponibilita: r.data_disponibilita ? dateToStr(r.data_disponibilita) : null,
    dataInizioPianificata: r.data_inizio_pianificata ? dateToStr(r.data_inizio_pianificata) : null,
    dataFinePianificata: r.data_fine_pianificata ? dateToStr(r.data_fine_pianificata) : null,
    corsia: r.corsia != null ? Number(r.corsia) : null,
    aRischio: r.a_rischio,
    esclusa: r.esclusa,
    oreConsuntivate,
    pianificazioneManuale: r.pianificazione_manuale,
  };
}

// Ore consuntivate per fase (solo informativo — confronto stima/reale, mai letto dal motore di
// pianificazione, deciso con l'utente 2026-08-23): storico_consuntivo_articolo è tenuto per
// (odp, reparto) con lo stesso nome storico di REPARTO_ID_A_NOME_STORICO, non per singola fase
// — un reparto attraversato più volte dallo stesso pattern (es. Distinte e Sviluppo: Distinta
// Base + Sviluppo CNC) mostrerebbe lo stesso totale su entrambe le sotto-fasi, non essendoci
// modo di sapere quanto è andato all'una o all'altra.
export async function getFasiPerScheda(schedaId: string): Promise<SchedaFase[]> {
  const { rows } = await pool.query(
    `SELECT sf.*, r.nome AS reparto_nome, s.odp
     FROM schede_fasi sf JOIN reparti r ON r.id = sf.reparto_id JOIN schede s ON s.id = sf.scheda_id
     WHERE sf.scheda_id = $1 ORDER BY sf.ordine`,
    [schedaId]
  );
  if (rows.length === 0) return [];

  const { rows: consuntivoRows } = await pool.query(
    `SELECT reparto, ore FROM storico_consuntivo_articolo WHERE odp = $1`,
    [rows[0].odp]
  );
  const consuntivoPerNomeStorico = new Map(consuntivoRows.map((r) => [r.reparto as string, Number(r.ore)]));

  return rows.map((r) => mapRow(r, consuntivoPerNomeStorico.get(REPARTO_ID_A_NOME_STORICO[r.reparto_id]) ?? null));
}

export type MotivoNonGenerato =
  | "tipologia_non_supportata"
  | "fasi_gia_presenti"
  | "codice_articolo_mancante"
  | "pattern_non_risolvibile";

export interface RisultatoGenerazione {
  generato: boolean;
  motivo?: MotivoNonGenerato;
}

// Genera tutte le fasi di una Scheda leggendo il Pattern_Ciclo del suo articolo. Idempotente:
// se la scheda ha già fasi, non fa nulla — non rigenera mai automaticamente (protegge lavoro
// reale già in corso). patternIdForzato è usato dal selettore manuale in UI quando l'articolo
// non ha ancora un pattern assegnato: in quel caso lo scrive anche su articoli.pattern_id, così
// le prossime Schede con lo stesso codice_articolo si risolvono da sole.
export async function generaFasiPerScheda(schedaId: string, opts?: { patternIdForzato?: string }): Promise<RisultatoGenerazione> {
  const { rows: schedaRows } = await pool.query(
    `SELECT tipologia, codice_articolo, data_scheda_ricevuta FROM schede WHERE id = $1`,
    [schedaId]
  );
  const scheda = schedaRows[0];
  if (!scheda) return { generato: false, motivo: "codice_articolo_mancante" };
  if (scheda.tipologia !== "Scheda") return { generato: false, motivo: "tipologia_non_supportata" };

  const codiceArticolo = scheda.codice_articolo as string;
  if (!codiceArticolo) return { generato: false, motivo: "codice_articolo_mancante" };

  const { rows: esistenti } = await pool.query(`SELECT 1 FROM schede_fasi WHERE scheda_id = $1 LIMIT 1`, [schedaId]);
  if (esistenti.length > 0) return { generato: false, motivo: "fasi_gia_presenti" };

  const { rows: articoloRows } = await pool.query(
    `SELECT categoria, pattern_id, programma_cnc_disponibile FROM articoli WHERE codice_articolo = $1`,
    [codiceArticolo]
  );
  let articolo = articoloRows[0];
  if (!articolo) {
    // L'articolo non è ancora censito (comune: solo una minoranza delle Schede ha un
    // codice_articolo già presente in anagrafica). Se l'utente ha scelto esplicitamente un
    // pattern dal selettore, non serve bloccarsi: lo censiamo al volo (stesso pattern già usato
    // per Ore/Offerte, ensureArticoloEsiste) invece di fallire con un motivo fuorviante.
    if (!opts?.patternIdForzato) return { generato: false, motivo: "pattern_non_risolvibile" };
    await ensureArticoloEsiste(codiceArticolo);
    articolo = { categoria: null, pattern_id: null, programma_cnc_disponibile: false };
  }

  let patternId: string | null = opts?.patternIdForzato ?? articolo.pattern_id ?? null;
  if (!patternId && articolo.categoria) {
    const { rows: catRows } = await pool.query(
      `SELECT pattern_id FROM categoria_pattern_default WHERE categoria = $1`,
      [articolo.categoria]
    );
    patternId = catRows[0]?.pattern_id ?? null;
  }
  if (!patternId) return { generato: false, motivo: "pattern_non_risolvibile" };

  const { rows: fasiPattern } = await pool.query(
    `SELECT id, reparto_id, ordine, sotto_fase, condizionale, condizione
     FROM pattern_ciclo_fasi WHERE pattern_id = $1 ORDER BY ordine`,
    [patternId]
  );
  const fasiIncluse = fasiPattern.filter((f) => {
    if (!f.condizionale) return true;
    if (f.condizione === "programma_cnc_non_esistente") return !articolo.programma_cnc_disponibile;
    return true; // condizione sconosciuta: inclusa per default, non silenziosamente scartata
  });

  const client: PoolClient = await pool.connect();
  try {
    await client.query("BEGIN");

    if (opts?.patternIdForzato && !articolo.pattern_id) {
      await client.query(`UPDATE articoli SET pattern_id = $1 WHERE codice_articolo = $2`, [patternId, codiceArticolo]);
    }

    const dataPrimaFase = scheda.data_scheda_ricevuta ? dateToStr(scheda.data_scheda_ricevuta) : dateToStr(new Date());

    for (let i = 0; i < fasiIncluse.length; i++) {
      const f = fasiIncluse[i];
      const nomeStorico = REPARTO_ID_A_NOME_STORICO[f.reparto_id];
      let oreStimate: number | null = null;
      if (nomeStorico) {
        const { rows: standardRows } = await client.query(
          `SELECT media_ore FROM standard_reparto WHERE codice_articolo = $1 AND reparto = $2`,
          [codiceArticolo, nomeStorico]
        );
        oreStimate = standardRows[0] ? Number(standardRows[0].media_ore) : null;
      }
      const dataDisponibilita = i === 0 ? dataPrimaFase : null;

      await client.query(
        `INSERT INTO schede_fasi (scheda_id, pattern_ciclo_fase_id, reparto_id, ordine, sotto_fase, ore_stimate, data_disponibilita)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [schedaId, f.id, f.reparto_id, f.ordine, f.sotto_fase, oreStimate, dataDisponibilita]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }

  return { generato: true };
}

// Completamento manuale (Fase 5) — nessuna deduzione automatica dalle ore consuntivate: non è
// un segnale affidabile (una fase può richiedere più ore di quelle stimate senza per questo
// essere finita). Un responsabile marca la fase completata quando il pezzo passa fisicamente al
// reparto successivo. Idempotente: un secondo click su una fase già completata non fa nulla.
export async function segnaFaseCompletata(faseId: string): Promise<boolean> {
  const oggi = oggiIso();
  // data_inizio_pianificata si allinea a oggi solo se mancava o era ancora una stima futura
  // (fase mai davvero iniziata secondo il piano) — altrimenti lasciarla com'era (fine < inizio)
  // darebbe un intervallo invertito e senza senso in UI/Gantt.
  const { rows } = await pool.query(
    `UPDATE schede_fasi SET stato_fase = 'Completato', data_fine_pianificata = $2, aggiornato_il = now(),
       data_inizio_pianificata = CASE WHEN data_inizio_pianificata IS NULL OR data_inizio_pianificata > $2
         THEN $2 ELSE data_inizio_pianificata END
     WHERE id = $1 AND stato_fase != 'Completato' AND esclusa = false RETURNING scheda_id, ordine`,
    [faseId, oggi]
  );
  if (rows.length === 0) return false;
  const { scheda_id: schedaId, ordine } = rows[0];

  // Propaga alla fase successiva dello stesso ODP (4d) — solo se è ancora "Da iniziare": non
  // tocca una fase già avviata/completata per conto proprio. La sotto-query salta anche le fasi
  // escluse (esclusa = true): altrimenti, se la prossima fase per ordine fosse esclusa, ci si
  // fermerebbe lì invece di continuare fino alla prossima vera fase disponibile.
  await pool.query(
    `UPDATE schede_fasi SET data_disponibilita = $1
     WHERE scheda_id = $2 AND ordine = (
       SELECT MIN(ordine) FROM schede_fasi WHERE scheda_id = $2 AND ordine > $3 AND esclusa = false
     ) AND stato_fase = 'Da iniziare'`,
    [prossimaDataDisponibilitaDopo(oggi), schedaId, ordine]
  );

  return true;
}

// Apertura manuale (Fase 8a) — bottone "Inizia lavorazione": il lavoro è fisicamente cominciato,
// ma non è ancora finito (quello resta segnaFaseCompletata). NON propaga data_disponibilita alla
// fase successiva: quella si sblocca solo al completamento, non all'inizio. Idempotente: un
// secondo click su una fase già avviata/completata non fa nulla.
export async function iniziaFase(faseId: string): Promise<boolean> {
  const oggi = oggiIso();
  const { rows } = await pool.query(
    `UPDATE schede_fasi SET stato_fase = 'In lavorazione', aggiornato_il = now(),
       data_inizio_pianificata = CASE WHEN data_inizio_pianificata IS NULL OR data_inizio_pianificata > $2
         THEN $2 ELSE data_inizio_pianificata END
     WHERE id = $1 AND stato_fase = 'Da iniziare' AND esclusa = false RETURNING id`,
    [faseId, oggi]
  );
  return rows.length > 0;
}

// Apertura automatica (Fase 8a) — chiamata da registraChiusuraOdp (standardRepartoRepository.ts)
// alla prima ora reale registrata su un odp/reparto ancora "Da iniziare": stesso effetto del
// bottone manuale, senza bisogno che qualcuno lo clicchi. Risolve odp+reparto (nome storico) in
// una singola query, senza dover prima risalire a scheda_id. No-op se non trova nulla da aprire
// (fase già avviata/completata, esclusa, o reparto/odp non corrispondenti).
export async function iniziaFasePerOdpReparto(odp: string, repartoId: string): Promise<boolean> {
  const oggi = oggiIso();
  const { rows } = await pool.query(
    `UPDATE schede_fasi sf SET stato_fase = 'In lavorazione', aggiornato_il = now(),
       data_inizio_pianificata = CASE WHEN sf.data_inizio_pianificata IS NULL OR sf.data_inizio_pianificata > $3
         THEN $3 ELSE sf.data_inizio_pianificata END
     FROM schede s
     WHERE s.id = sf.scheda_id AND s.odp = $1 AND sf.reparto_id = $2
       AND sf.stato_fase = 'Da iniziare' AND sf.esclusa = false
     RETURNING sf.id`,
    [odp, repartoId, oggi]
  );
  return rows.length > 0;
}

export interface RisultatoPianificazioneManuale {
  ok: boolean;
  conflitto?: boolean;
}

// Pianificazione manuale (Fase 9, drag&drop) — la data scelta a mano diventa definitiva: il
// motore (ricalcolaPiano) la rispetta nei giri successivi finché non viene sbloccata (vedi sotto).
// Solo su fasi 'Da iniziare' non escluse, stesso perimetro di impostaEsclusioneFase/iniziaFase —
// una fase già avviata/completata non è più "da piazzare", spostarla non avrebbe senso.
export async function pianificaManualmente(faseId: string, dataInizio: string, dataFine: string): Promise<RisultatoPianificazioneManuale> {
  const { rows: faseRows } = await pool.query(
    `SELECT sf.reparto_id, sf.corsia, sf.stato_fase, sf.esclusa, r.tipo_capacita
     FROM schede_fasi sf JOIN reparti r ON r.id = sf.reparto_id WHERE sf.id = $1`,
    [faseId]
  );
  const fase = faseRows[0];
  if (!fase || fase.stato_fase !== "Da iniziare" || fase.esclusa) return { ok: false };

  // Su un reparto a corsie, due fasi pinnate sulla stessa corsia con date sovrapposte sarebbero
  // due lavori fisicamente impossibili nello stesso posto — mai scriverlo silenziosamente, va
  // segnalato invece di lasciare che il Gantt mostri due barre accavallate senza spiegazione.
  if (fase.tipo_capacita === "corsie" && fase.corsia != null) {
    const { rows: conflittoRows } = await pool.query(
      `SELECT 1 FROM schede_fasi
       WHERE reparto_id = $1 AND corsia = $2 AND pianificazione_manuale = true AND id != $3
         AND data_inizio_pianificata <= $5 AND data_fine_pianificata >= $4
       LIMIT 1`,
      [fase.reparto_id, fase.corsia, faseId, dataInizio, dataFine]
    );
    if (conflittoRows.length > 0) return { ok: false, conflitto: true };
  }

  const { rows } = await pool.query(
    `UPDATE schede_fasi SET pianificazione_manuale = true, data_inizio_pianificata = $2, data_fine_pianificata = $3, aggiornato_il = now()
     WHERE id = $1 AND stato_fase = 'Da iniziare' AND esclusa = false RETURNING id`,
    [faseId, dataInizio, dataFine]
  );
  return { ok: rows.length > 0 };
}

// Sblocca una fase pinnata — torna una fase normale, il prossimo ricalcolo la ripiazza da capo
// usando la sua data_disponibilita (invariata da questa operazione).
export async function sbloccaPianificazione(faseId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `UPDATE schede_fasi SET pianificazione_manuale = false, aggiornato_il = now()
     WHERE id = $1 AND pianificazione_manuale = true RETURNING id`,
    [faseId]
  );
  return rows.length > 0;
}

// Esclude/re-include manualmente una fase (solo su 'Da iniziare' — non ha senso su una già
// avviata o completata). Soft: mai un DELETE, sempre reversibile.
export async function impostaEsclusioneFase(faseId: string, esclusa: boolean): Promise<boolean> {
  // Esclusione: azzera anche le date/corsia già calcolate — il motore non le rivede più da
  // ora in poi (query filtrata su esclusa = false), lasciarle sarebbe un dato congelato e
  // fuorviante (una fase "esclusa" che mostra comunque una data pianificata). Inclusione:
  // le lascia NULL, le ricalcolerà da capo il prossimo giro del motore.
  const { rows } = await pool.query(
    `UPDATE schede_fasi SET esclusa = $2, aggiornato_il = now(),
       data_inizio_pianificata = CASE WHEN $2 THEN NULL ELSE data_inizio_pianificata END,
       data_fine_pianificata   = CASE WHEN $2 THEN NULL ELSE data_fine_pianificata END,
       corsia                  = CASE WHEN $2 THEN NULL ELSE corsia END
     WHERE id = $1 AND stato_fase = 'Da iniziare' AND esclusa != $2
     RETURNING scheda_id, ordine, data_disponibilita`,
    [faseId, esclusa]
  );
  if (rows.length === 0) return false;
  const { scheda_id: schedaId, ordine, data_disponibilita: dataDisponibilita } = rows[0];

  // Se la fase esclusa era già "pronta" (data_disponibilita valorizzata), va passata attraverso
  // alla prossima fase non esclusa ancora senza data — altrimenti, non completandosi mai
  // (è esclusa), la catena resterebbe bloccata lì per sempre. Se era ancora NULL, non serve
  // fare nulla: il motore la salta già da solo (query fasiRows con esclusa = false).
  if (esclusa && dataDisponibilita) {
    await pool.query(
      `UPDATE schede_fasi SET data_disponibilita = $1
       WHERE scheda_id = $2 AND ordine = (
         SELECT MIN(ordine) FROM schede_fasi WHERE scheda_id = $2 AND ordine > $3 AND esclusa = false
       ) AND stato_fase = 'Da iniziare' AND data_disponibilita IS NULL`,
      [dateToStr(dataDisponibilita), schedaId, ordine]
    );
  }

  return true;
}
