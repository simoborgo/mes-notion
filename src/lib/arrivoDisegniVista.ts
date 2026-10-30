import {
  costruisciBucket, diffGiorni, minMax, riepilogo,
  type ArrivoCommessa, type Bucket, type Granularita, type RiepilogoArrivo,
} from "./arrivoDisegniCalc";

export interface DatiCommessaArrivo {
  id: string;
  numeroCommessa: string;
  cliente: string;
  localita: string;
  stato: string;
  inizioProduzione: string | null;
  fineProduzione: string | null;
  dataCarico: string | null; // solo come riferimento quando manca la fine produzione
}

export interface VistaArrivo {
  buckets: Bucket[];
  granularita: Granularita;
  riepilogo: RiepilogoArrivo;
  fine: string | null;       // fine produzione, o carico come riferimento
  fineDaCarico: boolean;
}

// Intervallo mostrato: dal giorno 0 (inizio produzione o primo arrivo) fino all'ultimo arrivo,
// alla fine produzione (o al carico) e a oggi se la commessa non è chiusa.
export function costruisciVista(
  c: DatiCommessaArrivo, arrivo: ArrivoCommessa, oggi: string, granularitaScelta?: Granularita,
): VistaArrivo | null {
  const r = riepilogo(arrivo, c.inizioProduzione);
  if (!r.primoArrivo || !r.ultimoArrivo || !r.giorno0) return null;
  const fine = c.fineProduzione ?? c.dataCarico;
  const da = minMax(r.giorno0, r.primoArrivo, "min");
  let a = r.ultimoArrivo;
  if (fine) a = minMax(a, fine, "max");
  if (c.stato !== "Chiusa") a = minMax(a, oggi, "max");
  const granularita = granularitaScelta ?? (diffGiorni(da, a) > 60 ? "settimana" : "giorno");
  return {
    buckets: costruisciBucket(arrivo.giorni, granularita, da, a, c.inizioProduzione),
    granularita, riepilogo: r, fine, fineDaCarico: !c.fineProduzione && !!c.dataCarico,
  };
}
