import { pool } from "./db";

export interface RigaOreReparto {
  reparto: string;
  ore: number;
}

export interface OreRepartoRisultato {
  righe: RigaOreReparto[];
  basatoSuStima: boolean;
  // true = nessuna riga standard_reparto per questo articolo (o media_ore tutte a 0):
  // nessuna proposta possibile, il chiamante deve chiedere un input manuale.
  manuale: boolean;
}

// Conversione ore-articolo -> ore-reparto (Fase 5.2 Previsionale): distribuisce le ore
// preventivate di UNA riga di offerta (un articolo) tra i reparti secondo le proporzioni
// osservate in standard_reparto. Calcolata al volo, mai congelata — se standard_reparto
// cambia (nuove chiusure via Fase 4), il risultato cambia alla richiesta successiva.
export async function oreReparto(codiceArticolo: string, orePreventivateTotali: number): Promise<OreRepartoRisultato> {
  const { rows } = await pool.query(
    `SELECT reparto, media_ore, origine FROM standard_reparto WHERE codice_articolo = $1`,
    [codiceArticolo]
  );

  const totaleMedia = rows.reduce((s, r) => s + Number(r.media_ore), 0);
  if (rows.length === 0 || totaleMedia <= 0) {
    return { righe: [], basatoSuStima: false, manuale: true };
  }

  const basatoSuStima = rows.some(r => r.origine === "stimato");
  const righe = rows.map(r => ({
    reparto: r.reparto as string,
    ore: orePreventivateTotali * (Number(r.media_ore) / totaleMedia),
  }));

  return { righe, basatoSuStima, manuale: false };
}
