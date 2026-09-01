import { pool } from "./db";

// Stessa logica di scripts/importa-vernici.mjs (import CLI da terminale), duplicata qui perché lo
// script gira come processo Node standalone fuori dalla build Next (niente import di moduli TS)
// — vedi quel file per il contesto completo della scelta di non fare mai DELETE/TRUNCATE.

const CLIENTI_VERNICIATURA = [
  "Gucci", "Armani", "Cartier", "Diesel", "Bottega Veneta",
  "Brioni", "Boucheron", "Mage", "Villa Giuseppina", "Valentino",
];

// Da "TABELLA CATEGORIE VERNICI.pdf" (fornita dall'utente, 2026-08-09). Sigle non presenti qui
// (es. "0") restano solo grezze in bilancio_massa_raw, non decodificate.
const CATEGORIE_BILANCIO_MASSA: Record<string, string> = {
  A: "ACETONE", F: "DILUENTE", B: "VERNICE ALL'ACQUA", D: "CATALIZZATORE ACRILICO",
  G: "VERNICE ACRILICA", L: "FONDO ACRILICO", E: "CATALIZZATORE POLIURETANICO",
  H: "VERNICE POLIURETANICA", N: "FONDO POLIURETANICO", M: "FONDO POLIESTERE",
  NO: "VERNICE NITRO", Q: "TINTA SOLVENTE",
};

// Parser CSV minimale RFC4180 con separatore ';'.
function parseCsv(text: string, delimiter = ";"): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delimiter) { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c === "\r") { /* skip */ }
    else field += c;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

// Non persiste più un "sistema colore" separato: normalizza solo la formattazione del codice
// colore libero (es. "RAL7016" -> "RAL 7016").
function classificaColore(raw: string | undefined): { codice: string | null; nome: string | null } {
  const v = (raw || "").trim();
  if (!v) return { codice: null, nome: null };

  const compattaRal = v.toUpperCase().match(/^RAL\s*(\d+)/);
  if (compattaRal && compattaRal[1].length === 4) return { codice: `RAL ${compattaRal[1]}`, nome: null };

  const compattaNcs = v.toUpperCase().replace(/\s|-/g, "").match(/^NCS?S?(\d{4})([A-Z0-9]*)$/);
  if (compattaNcs) {
    const [, cifre, tinta] = compattaNcs;
    return { codice: tinta ? `NCS S${cifre}-${tinta}` : `NCS S${cifre}`, nome: null };
  }

  const pantone = v.toUpperCase().match(/^PANTONE\s*(.+)/);
  if (pantone) return { codice: `PANTONE ${pantone[1].trim()}`, nome: null };

  const nome = v.toLowerCase().split(/\s+/).map(p => p ? p[0].toUpperCase() + p.slice(1) : p).join(" ");
  return { codice: nome, nome };
}

export interface RigaImportVernici {
  bilancioMassaRawGrezzo?: string;
  codiceInventario: string;
  nomeColore?: string;
  tipoVernice?: string;
  codiceTintometro?: string;
  colore?: string;
  gloss?: string;
  cliente?: string;
  unitaMisuraRaw?: string;
  fornitore?: string;
}

// Riga 0 dell'estratto OS1 è uno scarto ("Tabella 1"), la vera intestazione è la riga con la
// colonna del codice inventario — "Cod. inventario" nel formato storico, "Codice Inventario" nel
// formato OS1 aggiornato (2026-09-01, aggiunte anche le colonne "Nome Colore" e "Fornitore").
export function estraiRigheDalCsv(testo: string): RigaImportVernici[] {
  const allRows = parseCsv(testo);
  const headerIdx = allRows.findIndex(r => r.some(c => c.includes("Codice Inventario") || c.includes("Cod. inventario")));
  if (headerIdx === -1) throw new Error('Intestazione "Codice Inventario" non trovata nel CSV: formato inatteso');
  const dati = allRows.slice(headerIdx + 1).filter(r => r.length >= 9 && r[1]?.trim());
  return dati.map(r => {
    const [bilancioMassaRawGrezzo, codiceInventario, nomeColore, tipoVernice, codiceTintometro, colore, gloss, cliente, unitaMisuraRaw, fornitore] = r;
    return { bilancioMassaRawGrezzo, codiceInventario: codiceInventario.trim(), nomeColore, tipoVernice, codiceTintometro, colore, gloss, cliente, unitaMisuraRaw, fornitore };
  });
}

export interface AnteprimaImportVernici {
  totaleRighe: number;
  nuovi: string[];
  daAggiornare: string[];
  invariate: number;
}

// Sola lettura: classifica ogni riga del CSV contro lo stato attuale del DB senza scrivere nulla.
export async function anteprimaImportVernici(righe: RigaImportVernici[]): Promise<AnteprimaImportVernici> {
  const { rows: esistenti } = await pool.query(
    `SELECT codice_inventario, cliente_riferimento, tipo_bilancio_massa, descrizione_colore, fornitore FROM vernici WHERE codice_inventario IS NOT NULL`
  );
  const mappa = new Map(esistenti.map((r) => [r.codice_inventario as string, r]));

  const nuovi: string[] = [];
  const daAggiornare: string[] = [];
  let invariate = 0;
  for (const r of righe) {
    if (!r.codiceInventario) continue;
    const rigaEsistente = mappa.get(r.codiceInventario);
    if (!rigaEsistente) { nuovi.push(r.codiceInventario); continue; }
    const clienteRiferimentoNuovo = r.cliente?.trim() || null;
    const tipoBilancioNuovo = r.bilancioMassaRawGrezzo?.trim()
      ? (CATEGORIE_BILANCIO_MASSA[r.bilancioMassaRawGrezzo.trim().toUpperCase()] ?? null)
      : null;
    const descrizioneNuova = r.nomeColore?.trim() || null;
    const fornitoreNuovo = r.fornitore?.trim() || null;
    const cambiaCliente = rigaEsistente.cliente_riferimento === null && clienteRiferimentoNuovo !== null;
    const cambiaBilancio = rigaEsistente.tipo_bilancio_massa === null && tipoBilancioNuovo !== null;
    const cambiaDescrizione = rigaEsistente.descrizione_colore === null && descrizioneNuova !== null;
    const cambiaFornitore = rigaEsistente.fornitore === null && fornitoreNuovo !== null;
    if (cambiaCliente || cambiaBilancio || cambiaDescrizione || cambiaFornitore) daAggiornare.push(r.codiceInventario); else invariate++;
  }
  return { totaleRighe: righe.length, nuovi, daAggiornare, invariate };
}

export interface RisultatoImportVernici {
  inseriteONuove: number;
  invariate: number;
  bilancioDecodificato: number;
  bilancioSconosciuto: number;
  clientiVisti: string[];
}

// Scrittura vera e propria — mai DELETE/TRUNCATE: solo INSERT ... ON CONFLICT DO UPDATE che
// tocca al massimo cliente_riferimento/tipo_bilancio_massa sulle righe già esistenti (mai
// sovrascrive modifiche fatte medio tempore da UI). Transazionale: rollback completo su errore.
export async function eseguiImportVernici(righe: RigaImportVernici[]): Promise<RisultatoImportVernici> {
  const clientiVisti = new Set<string>();
  let bilancioDecodificato = 0, bilancioSconosciuto = 0;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    let inseriteONuove = 0, invariate = 0;

    for (const r of righe) {
      const { codice: coloreCodice, nome: coloreNomeEuristico } = classificaColore(r.colore);
      // "Nome Colore" (ex "DESCRIZIONE") è testo libero reale dall'estratto OS1: quando presente
      // prevale sempre sulla deduzione euristica dal Codice Colore.
      const descrizioneColore = r.nomeColore?.trim() || coloreNomeEuristico;

      const umNorm = (r.unitaMisuraRaw || "").trim().toUpperCase();
      const unitaMisura = ["KG", "LT", "NR"].includes(umNorm) ? umNorm : null;

      let clienteRiferimento: string | null = null;
      if (r.cliente?.trim()) {
        const trovato = CLIENTI_VERNICIATURA.find((c) => c.toLowerCase() === r.cliente!.trim().toLowerCase());
        clienteRiferimento = trovato || r.cliente.trim();
        clientiVisti.add(clienteRiferimento);
      }

      const fornitore = r.fornitore?.trim() || null;

      const bilancioMassaRaw = r.bilancioMassaRawGrezzo?.trim() || null;
      const tipoBilancioMassa = bilancioMassaRaw ? (CATEGORIE_BILANCIO_MASSA[bilancioMassaRaw.toUpperCase()] ?? null) : null;
      if (bilancioMassaRaw) { if (tipoBilancioMassa) bilancioDecodificato++; else bilancioSconosciuto++; }

      const { rows: risultato } = await client.query(
        `INSERT INTO vernici
           (colore_codice, descrizione_colore, codice_tintometro, codice_inventario,
            unita_misura, tipologia, tipo_bilancio_massa, bilancio_massa_raw, gloss, cliente_riferimento, fornitore)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (codice_inventario) WHERE codice_inventario IS NOT NULL
         DO UPDATE SET
           cliente_riferimento = EXCLUDED.cliente_riferimento,
           tipo_bilancio_massa = COALESCE(vernici.tipo_bilancio_massa, EXCLUDED.tipo_bilancio_massa),
           descrizione_colore = COALESCE(vernici.descrizione_colore, EXCLUDED.descrizione_colore),
           fornitore = COALESCE(vernici.fornitore, EXCLUDED.fornitore)
           WHERE (vernici.cliente_riferimento IS NULL AND EXCLUDED.cliente_riferimento IS NOT NULL)
              OR (vernici.tipo_bilancio_massa IS NULL AND EXCLUDED.tipo_bilancio_massa IS NOT NULL)
              OR (vernici.descrizione_colore IS NULL AND EXCLUDED.descrizione_colore IS NOT NULL)
              OR (vernici.fornitore IS NULL AND EXCLUDED.fornitore IS NOT NULL)
         RETURNING id`,
        [
          coloreCodice,
          descrizioneColore,
          r.codiceTintometro?.trim() || null,
          r.codiceInventario,
          unitaMisura,
          (r.tipoVernice || "").trim() || "NON CLASSIFICATO",
          tipoBilancioMassa,
          bilancioMassaRaw,
          r.gloss?.trim() || null,
          clienteRiferimento,
          fornitore,
        ]
      );
      if (risultato.length > 0) inseriteONuove++; else invariate++;
    }

    await client.query("COMMIT");
    return { inseriteONuove, invariate, bilancioDecodificato, bilancioSconosciuto, clientiVisti: [...clientiVisti].sort() };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
