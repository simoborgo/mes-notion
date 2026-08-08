import { pool } from "./db";
import { ensureArticoloEsiste } from "./articoliRepository";
import { getCodiceArticoloPerOdp } from "./notion";
import { REPARTI_PRODUZIONE } from "./types";

// Media/varianza online (Welford) per (codice_articolo, reparto). Le formule di
// aggiunta/rimozione sono esatte e simmetriche: rimuovere un valore precedentemente
// aggiunto riporta lo stato esattamente a come sarebbe stato senza quel valore, il che
// rende sicura la richiusura di un ODP (rimuovi il vecchio contributo, poi aggiungi il nuovo).
interface StatoWelford {
  mediaOre: number;
  sommaScartiQuadrati: number;
  nOsservazioni: number;
  origine: "stimato" | "consuntivo";
}

function rimuoviOsservazione(stato: StatoWelford, x: number): StatoWelford {
  const nNuovo = stato.nOsservazioni - 1;
  if (nNuovo <= 0) return { ...stato, mediaOre: 0, sommaScartiQuadrati: 0, nOsservazioni: 0 };
  const delta = x - stato.mediaOre;
  const mediaNuova = stato.mediaOre - delta / nNuovo;
  const delta2 = x - mediaNuova;
  const scartiNuovi = Math.max(stato.sommaScartiQuadrati - delta * delta2, 0);
  return { ...stato, mediaOre: mediaNuova, sommaScartiQuadrati: scartiNuovi, nOsservazioni: nNuovo };
}

function aggiungiOsservazione(stato: StatoWelford, x: number): StatoWelford {
  const nNuovo = stato.nOsservazioni + 1;
  const delta = x - stato.mediaOre;
  const mediaNuova = stato.mediaOre + delta / nNuovo;
  const delta2 = x - mediaNuova;
  const scartiNuovi = stato.sommaScartiQuadrati + delta * delta2;
  return { mediaOre: mediaNuova, sommaScartiQuadrati: scartiNuovi, nOsservazioni: nNuovo, origine: "consuntivo" };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStandardRow(r: any): StatoWelford {
  return {
    mediaOre: Number(r.media_ore),
    sommaScartiQuadrati: Number(r.somma_scarti_quadrati),
    nOsservazioni: Number(r.n_osservazioni),
    origine: r.origine,
  };
}

// Ricalcola storico_consuntivo_articolo e la media Welford in standard_reparto per un ODP,
// sommando le ore a consuntivo (rif = false) per reparto. Fino al 2026-08-08 girava una tantum
// al passaggio della Scheda a "Completato" — problema reale segnalato dall'utente: ore segnate
// dopo quel momento (fisiologico: la sera, il giorno dopo, in ritardo) non venivano mai
// propagate. Ora è scollegata dallo stato Scheda e va richiamata (via aggiornaStandardRepartoPerOdp,
// sotto) ad OGNI scrittura di ore su un odp, indipendentemente da quando/in che stato si trova
// la Scheda — è idempotente per lo stesso odp (rimuove il vecchio contributo di quell'odp prima
// di aggiungere quello nuovo, non lo duplica mai, vedi storico_consuntivo_articolo chiave
// (odp, reparto)) quindi richiamarla più volte per lo stesso odp è sicuro. Non propaga mai
// eccezioni: un problema qui non deve mai impedire la scrittura delle ore, che è già avvenuta.
export async function registraChiusuraOdp(odp: string, codiceArticolo: string | null): Promise<void> {
  if (!codiceArticolo) {
    console.warn(`[standardReparto] ODP ${odp} completato senza Codice Art. — registrazione storico saltata`);
    return;
  }
  // articoli non cresce da sola (import una tantum, 2026-08-04) — un codice di una commessa
  // nuova o mai censita prima va creato al volo, non scartato in silenzio (deciso con l'utente
  // 2026-08-08): senza articoli.codice_articolo la FK di storico_consuntivo_articolo/standard_reparto
  // impedirebbe comunque la scrittura più sotto.
  await ensureArticoloEsiste(codiceArticolo);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: oreRepartoRows } = await client.query(
      `SELECT reparto, SUM(ore) AS ore FROM ore_registrate
       WHERE odp = $1 AND rif = false AND reparto = ANY($2::text[])
       GROUP BY reparto`,
      [odp, REPARTI_PRODUZIONE]
    );
    const oreAttualiPerReparto = new Map(oreRepartoRows.map(r => [r.reparto as string, Number(r.ore)]));

    // Reparti già tracciati per QUESTO odp in una chiamata precedente — necessario per
    // accorgersi se ore che c'erano prima sono state spostate/cancellate (es. correggiReparto
    // sposta ore da un reparto all'altro: il reparto di partenza sparisce dalla query sopra
    // ma senza questo controllo il suo vecchio contributo in standard_reparto non verrebbe
    // mai rimosso).
    const { rows: repartiPrecedentiRows } = await client.query(
      `SELECT reparto FROM storico_consuntivo_articolo WHERE odp = $1`,
      [odp]
    );
    const repartiDaProcessare = new Set<string>([...oreAttualiPerReparto.keys(), ...repartiPrecedentiRows.map(r => r.reparto as string)]);

    for (const reparto of repartiDaProcessare) {
      const oreNuove = oreAttualiPerReparto.get(reparto) ?? 0;

      const { rows: vecchiaRows } = await client.query(
        `SELECT ore FROM storico_consuntivo_articolo WHERE odp = $1 AND reparto = $2 FOR UPDATE`,
        [odp, reparto]
      );
      const vecchioValore = vecchiaRows[0] ? Number(vecchiaRows[0].ore) : null;

      if (oreNuove <= 0) {
        // Questo odp non ha (più) ore su questo reparto — se non c'era nulla da rimuovere,
        // non c'è nulla da fare. Se c'era, va tolto sia dallo storico che dalla media.
        if (vecchioValore == null) continue;
        await client.query(`DELETE FROM storico_consuntivo_articolo WHERE odp = $1 AND reparto = $2`, [odp, reparto]);

        const { rows: standardRows } = await client.query(
          `SELECT media_ore, somma_scarti_quadrati, n_osservazioni, origine FROM standard_reparto
           WHERE codice_articolo = $1 AND reparto = $2 FOR UPDATE`,
          [codiceArticolo, reparto]
        );
        if (!standardRows[0]) continue;
        const statoRimosso = rimuoviOsservazione(mapStandardRow(standardRows[0]), vecchioValore);
        if (statoRimosso.nOsservazioni <= 0) {
          await client.query(`DELETE FROM standard_reparto WHERE codice_articolo = $1 AND reparto = $2`, [codiceArticolo, reparto]);
        } else {
          await client.query(
            `UPDATE standard_reparto SET media_ore = $3, somma_scarti_quadrati = $4, n_osservazioni = $5, aggiornato_il = now()
             WHERE codice_articolo = $1 AND reparto = $2`,
            [codiceArticolo, reparto, statoRimosso.mediaOre, statoRimosso.sommaScartiQuadrati, statoRimosso.nOsservazioni]
          );
        }
        continue;
      }

      await client.query(
        `INSERT INTO storico_consuntivo_articolo (odp, reparto, codice_articolo, ore, data_chiusura)
         VALUES ($1,$2,$3,$4, CURRENT_DATE)
         ON CONFLICT (odp, reparto) DO UPDATE SET
           ore = EXCLUDED.ore, codice_articolo = EXCLUDED.codice_articolo, data_chiusura = EXCLUDED.data_chiusura`,
        [odp, reparto, codiceArticolo, oreNuove]
      );

      const { rows: standardRows } = await client.query(
        `SELECT media_ore, somma_scarti_quadrati, n_osservazioni, origine FROM standard_reparto
         WHERE codice_articolo = $1 AND reparto = $2 FOR UPDATE`,
        [codiceArticolo, reparto]
      );

      if (!standardRows[0]) {
        await client.query(
          `INSERT INTO standard_reparto (codice_articolo, reparto, media_ore, somma_scarti_quadrati, n_osservazioni, origine)
           VALUES ($1,$2,$3,0,1,'consuntivo')`,
          [codiceArticolo, reparto, oreNuove]
        );
        continue;
      }

      let stato = mapStandardRow(standardRows[0]);
      if (stato.origine === "stimato") {
        // Prima osservazione reale: sostituisce lo stimato, non lo media mai con un consuntivo.
        stato = { mediaOre: oreNuove, sommaScartiQuadrati: 0, nOsservazioni: 1, origine: "consuntivo" };
      } else {
        if (vecchioValore != null) stato = rimuoviOsservazione(stato, vecchioValore);
        stato = aggiungiOsservazione(stato, oreNuove);
      }

      await client.query(
        `UPDATE standard_reparto
         SET media_ore = $3, somma_scarti_quadrati = $4, n_osservazioni = $5, origine = $6, aggiornato_il = now()
         WHERE codice_articolo = $1 AND reparto = $2`,
        [codiceArticolo, reparto, stato.mediaOre, stato.sommaScartiQuadrati, stato.nOsservazioni, stato.origine]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    console.error(`[standardReparto] errore registrando chiusura ODP ${odp}`, e);
  } finally {
    client.release();
  }
}

// Punto d'ingresso da chiamare (fire-and-forget, `void aggiornaStandardRepartoPerOdp(odp)`) da
// ogni scrittura di ore_registrate — risolve il Codice Art. dell'odp (da Notion, cache calda
// nella quasi totalità dei casi) e richiama registraChiusuraOdp. Se l'odp è uno speciale
// (SET/MNT/MEET/FORM/PUL) o non corrisponde a nessuna Scheda nota, non fa nulla (nessun
// Codice Art. da cui derivare uno standard di reparto). Non propaga mai eccezioni per lo
// stesso motivo di registraChiusuraOdp: mai bloccare la scrittura delle ore, già avvenuta.
export async function aggiornaStandardRepartoPerOdp(odp: string): Promise<void> {
  try {
    const codiceArticolo = await getCodiceArticoloPerOdp(odp);
    await registraChiusuraOdp(odp, codiceArticolo);
  } catch (e) {
    console.error(`[standardReparto] errore risolvendo Codice Art. per ODP ${odp}`, e);
  }
}

export interface CellaStandard {
  mediaOre: number;
  nOsservazioni: number;
  origine: "stimato" | "consuntivo";
}

export interface RigaStandardArticolo {
  codiceArticolo: string;
  descrizione: string;
  perReparto: Record<string, CellaStandard>;
}

// Vista "Standard Articoli" (Rilevamento Ore) — un articolo per riga, una colonna per reparto,
// per vedere a colpo d'occhio quali standard sono ancora la stima seminata dall'import una tantum
// (origine 'stimato', n_osservazioni=0) e quali sono già stati sostituiti da una media reale su
// chiusure ODP (origine 'consuntivo', vedi registraChiusuraOdp sopra). Solo articoli con almeno
// una riga standard_reparto — un codice puramente a catalogo senza mai una chiusura non ha nulla
// da mostrare qui.
export async function getStandardRepartoMatrix(): Promise<RigaStandardArticolo[]> {
  const { rows } = await pool.query(
    `SELECT sr.codice_articolo, a.descrizione, sr.reparto, sr.media_ore, sr.n_osservazioni, sr.origine
     FROM standard_reparto sr
     JOIN articoli a ON a.codice_articolo = sr.codice_articolo
     ORDER BY a.descrizione, sr.reparto`
  );
  const map = new Map<string, RigaStandardArticolo>();
  for (const r of rows) {
    if (!map.has(r.codice_articolo)) {
      map.set(r.codice_articolo, { codiceArticolo: r.codice_articolo, descrizione: r.descrizione, perReparto: {} });
    }
    map.get(r.codice_articolo)!.perReparto[r.reparto] = {
      mediaOre: Number(r.media_ore),
      nOsservazioni: Number(r.n_osservazioni),
      origine: r.origine,
    };
  }
  return [...map.values()];
}
