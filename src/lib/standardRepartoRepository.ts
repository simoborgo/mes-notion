import { pool } from "./db";
import { getArticoloByCodice } from "./articoliRepository";
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

// Chiamata quando una Scheda transita a statoProduzione = "Completato" (Fase 4 Gestione Ore
// avanzato). Somma le ore a consuntivo (rif = false) per reparto, aggiorna storico_consuntivo_articolo
// e la media Welford in standard_reparto. Non propaga mai eccezioni: un problema qui non deve
// mai impedire la chiusura reale della Scheda, che è già avvenuta su Notion quando questa gira.
export async function registraChiusuraOdp(odp: string, codiceArticolo: string | null): Promise<void> {
  if (!codiceArticolo) {
    console.warn(`[standardReparto] ODP ${odp} completato senza Codice Art. — registrazione storico saltata`);
    return;
  }
  const articolo = await getArticoloByCodice(codiceArticolo).catch(() => null);
  if (!articolo) {
    console.warn(`[standardReparto] Codice Art. "${codiceArticolo}" (ODP ${odp}) non presente in articoli — registrazione storico saltata`);
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: oreReparto } = await client.query(
      `SELECT reparto, SUM(ore) AS ore FROM ore_registrate
       WHERE odp = $1 AND rif = false AND reparto = ANY($2::text[])
       GROUP BY reparto`,
      [odp, REPARTI_PRODUZIONE]
    );

    for (const riga of oreReparto) {
      const reparto = riga.reparto as string;
      const oreNuove = Number(riga.ore);

      const { rows: vecchiaRows } = await client.query(
        `SELECT ore FROM storico_consuntivo_articolo WHERE odp = $1 AND reparto = $2 FOR UPDATE`,
        [odp, reparto]
      );
      const vecchioValore = vecchiaRows[0] ? Number(vecchiaRows[0].ore) : null;

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
