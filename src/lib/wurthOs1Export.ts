import ExcelJS from "exceljs";

// Colonne identiche, stesso ordine, del template fornito dall'utente (template_ordini.xlsx).
// COMMESSA resta sempre vuota: gli ordini di reintegro Ferramenta generica non sono legati a
// una commessa cliente specifica — la compila a mano l'utente Ferramenta prima di incollare in OS1.
const COLONNE = ["CODICE PRODOTTO", "DESCRIZIONE", "UM", "QUANTITA'", "PREZZO UNITARIO", "COMMESSA"];

export interface RigaOs1 {
  codiceOs1: string;
  descrizione: string;
  unitaMisura: string;
  quantita: number;
  prezzoUnitario: number;
}

// Genera il file .xlsx pronto per l'import in OS1 — una riga per articolo matchato. Le righe
// non matchate (articolo non censito) non entrano qui: vanno segnalate a parte, per non
// rischiare un inserimento in OS1 con CODICE PRODOTTO vuoto o sbagliato.
export async function buildOs1Workbook(righe: RigaOs1[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ordine");

  ws.addRow(COLONNE);
  const header = ws.getRow(1);
  header.font = { bold: true };

  for (const r of righe) {
    ws.addRow([r.codiceOs1, r.descrizione, r.unitaMisura, r.quantita, r.prezzoUnitario, ""]);
  }

  ws.columns.forEach((col) => {
    col.width = 20;
  });

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
