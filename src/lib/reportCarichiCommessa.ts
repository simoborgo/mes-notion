import { getCommessaById } from "./commesseRepository";
import { getCarichiByCommessa } from "./carichiRepository";
import { getSchede } from "./schedeRepository";
import type { Carico, Commessa, Scheda } from "./types";

export interface CaricoConOdp {
  carico: Carico;
  odp: Scheda[];
}

export interface CarichiCommessaReport {
  commessa: Commessa;
  gruppi: CaricoConOdp[];
}

// Stessa logica della vista /carichi/odp: carichi per data, ODP per numero. Gli ODP collegati
// che non sono schede principali (sottoschede, archiviate) non compaiono, come a video.
export async function buildCarichiCommessaReport(commessaId: string): Promise<CarichiCommessaReport> {
  const [commessa, carichi, schede] = await Promise.all([getCommessaById(commessaId), getCarichiByCommessa(commessaId), getSchede()]);
  const schedaMap = new Map(schede.map((s) => [s.id, s]));
  const gruppi = carichi
    .sort((a, b) => (a.dataCarico ?? "9999").localeCompare(b.dataCarico ?? "9999"))
    .map((carico) => ({
      carico,
      odp: carico.odpIds
        .map((id) => schedaMap.get(id))
        .filter((s): s is Scheda => !!s)
        .sort((a, b) => a.odp.localeCompare(b.odp, "it", { numeric: true })),
    }));
  return { commessa, gruppi };
}
