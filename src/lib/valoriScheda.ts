// Regole di conversione dei valori economici della Scheda. Solo funzioni pure (nessun import
// server-only): usate sia dall'API sia dai moduli client di modifica.

// Il costo di un ODP è il 60% del valore di vendita.
export const PCT_COSTO_SU_VENDITA = 0.6;

const arrotonda = (n: number, decimali: number) => {
  const f = 10 ** decimali;
  return Math.round((n + Number.EPSILON) * f) / f;
};

export const costoDaVendita = (vendita: number) => arrotonda(vendita * PCT_COSTO_SU_VENDITA, 2);
export const venditaDaCosto = (costo: number) => arrotonda(costo / PCT_COSTO_SU_VENDITA, 2);
// Manodopera € <-> ore con la tariffa oraria corrente (parametri_generali). Le ore tengono 4 decimali
// (colonna NUMERIC(10,4)) così convertire € -> h -> € restituisce la cifra di partenza.
export const oreDaEuro = (euro: number, tariffa: number) => (tariffa > 0 ? arrotonda(euro / tariffa, 4) : 0);
export const euroDaOre = (ore: number, tariffa: number) => arrotonda(ore * tariffa, 2);

// Risposta di GET /api/schede/[id]/economia. `admin` c'è solo se chi chiede è admin.
export interface EconomiaScheda {
  oreConsumate: number;
  oreStandard: number | null;
  admin?: { valoreVendita: number | null; tariffa: number };
}
