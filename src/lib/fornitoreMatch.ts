// Abbinamento del nome fornitore letto da un PDF ("PORRO", "CVM", "Cattaneo") con l'anagrafica
// ("Porro & Porro Srl", "C.V.M.", "Cattaneo SRL"). Funzione pura: serve sia al client (per
// preselezionare il menu dell'anteprima) sia al server (import senza scelta esplicita).

export interface FornitoreRef { id: string; nome: string }
export interface FornitoreMatch<T extends FornitoreRef> { fornitore: T; tipo: "esatto" | "parziale" }

// Forme societarie e parole di collegamento che non distinguono un'azienda dall'altra
const PAROLE_IGNORATE = new Set(["srl", "spa", "snc", "sas", "sa", "ltd", "gmbh", "sl", "di", "e", "and", "et", "c", "co"]);

function parole(nome: string): string[] {
  const pulito = nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.'’]/g, "") // "C.V.M." → "cvm", "s.r.l." → "srl"
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const viste = new Set<string>();
  const out: string[] = [];
  for (const p of pulito.split(" ")) {
    if (!p || PAROLE_IGNORATE.has(p) || viste.has(p)) continue; // "Porro & Porro" → "porro"
    viste.add(p);
    out.push(p);
  }
  return out;
}

// Esatto: nome identico, oppure stesse parole significative (ordine e forma societaria ininfluenti). Parziale: le parole
// del nome del PDF sono tutte nell'anagrafica (o viceversa), accettato solo se un unico candidato —
// con più candidati è ambiguo e non si sceglie al posto dell'utente.
export function abbinaFornitore<T extends FornitoreRef>(nomePdf: string, anagrafica: T[]): FornitoreMatch<T> | null {
  const cercate = parole(nomePdf);
  if (!cercate.length) return null;
  const chiave = [...cercate].sort().join(" ");

  // 1) Nome identico (anagrafica con varianti dello stesso nome, es. "CVM" e "C.V.M.": vince quello scritto uguale)
  const identici = anagrafica.filter((f) => f.nome.trim().toLowerCase() === nomePdf.trim().toLowerCase());
  if (identici.length === 1) return { fornitore: identici[0], tipo: "esatto" };

  const esatti = anagrafica.filter((f) => [...parole(f.nome)].sort().join(" ") === chiave);
  if (esatti.length === 1) return { fornitore: esatti[0], tipo: "esatto" };
  if (esatti.length > 1) return null;

  const parziali = anagrafica.filter((f) => {
    const loro = parole(f.nome);
    if (!loro.length) return false;
    const [piccolo, grande] = cercate.length <= loro.length ? [cercate, loro] : [loro, cercate];
    return piccolo.every((p) => grande.includes(p));
  });
  return parziali.length === 1 ? { fornitore: parziali[0], tipo: "parziale" } : null;
}
