import ExcelJS from "exceljs";
import type { CarichiCommessaReport } from "../reportCarichiCommessa";
import { fmtDateIt } from "./date";

const ARANCIO = "FFE87722";
const GRIGIO_TESTO = "FF888780";
const GRIGIO_BORDO = "FFE0DED8";
const GRIGIO_SFONDO = "FFF5F5F3";
const NERO = "FF1A1A1A";

const COLONNE: { header: string; width: number }[] = [
  { header: "ODP", width: 16 },
  { header: "Scheda", width: 14 },
  { header: "Cliente / Descrizione", width: 40 },
  { header: "Articolo", width: 22 },
  { header: "Posizione", width: 14 },
  { header: "Q.tà", width: 8 },
  { header: "Stato", width: 18 },
  { header: "Fase", width: 20 },
  { header: "Prod. prevista", width: 15 },
];

function fmtData(d: string | null): string {
  return d ? fmtDateIt(new Date(`${d}T00:00:00`)) : "";
}

// Excel vieta []:*?/\ nei nomi foglio e oltre 31 caratteri; i nomi devono essere unici
function nomeFoglio(base: string, usati: Set<string>): string {
  const pulito = base.replace(/[[\]:*?/\\]/g, "-").trim() || "Carico";
  let nome = pulito.slice(0, 31);
  for (let i = 2; usati.has(nome.toLowerCase()); i++) {
    const suffisso = ` (${i})`;
    nome = pulito.slice(0, 31 - suffisso.length) + suffisso;
  }
  usati.add(nome.toLowerCase());
  return nome;
}

export async function buildCarichiCommessaWorkbook({ commessa, gruppi }: CarichiCommessaReport): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const usati = new Set<string>();
  const intestazione = [commessa.numeroCommessa, commessa.cliente, commessa.localita].filter(Boolean).join(" · ");

  if (gruppi.length === 0) {
    const ws = wb.addWorksheet(nomeFoglio("Carichi", usati));
    ws.getCell("A1").value = intestazione;
    ws.getCell("A1").font = { bold: true, size: 14 };
    ws.getCell("A3").value = "Nessun carico per questa commessa";
  }

  for (const { carico, odp } of gruppi) {
    const base = [carico.titolo || "Carico", carico.dataCarico ? fmtData(carico.dataCarico) : ""].filter(Boolean).join(" ");
    const ws = wb.addWorksheet(nomeFoglio(base, usati));
    ws.views = [{ showGridLines: false }];
    COLONNE.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

    ws.getCell("A1").value = intestazione;
    ws.getCell("A1").font = { bold: true, size: 14, color: { argb: NERO } };
    ws.getCell("A2").value = [carico.titolo || "Carico", fmtData(carico.dataCarico), carico.modalita, carico.stato].filter(Boolean).join(" · ");
    ws.getCell("A2").font = { size: 11, color: { argb: GRIGIO_TESTO } };
    if (carico.descrizione) {
      ws.getCell("A3").value = carico.descrizione;
      ws.getCell("A3").font = { italic: true, size: 10, color: { argb: GRIGIO_TESTO } };
    }

    const headerRow = ws.getRow(5);
    COLONNE.forEach((c, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = c.header;
      cell.font = { bold: true, size: 10, color: { argb: GRIGIO_TESTO } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIGIO_SFONDO } };
      cell.border = { bottom: { style: "medium", color: { argb: ARANCIO } } };
      cell.alignment = { vertical: "middle", horizontal: c.header === "Q.tà" ? "right" : "left" };
    });
    headerRow.height = 22;

    odp.forEach((s, idx) => {
      const row = ws.getRow(6 + idx);
      row.values = [
        s.odp,
        s.numeroScheda,
        s.clienteInfo || s.descrizioneFasi,
        s.codiceArticolo,
        s.posizione,
        s.quantita ?? "",
        s.statoProduzione,
        s.faseCorrente,
        fmtData(s.dataProduzionePrevista),
      ];
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = { bottom: { style: "thin", color: { argb: GRIGIO_BORDO } } };
        cell.alignment = { vertical: "middle", horizontal: col === 6 ? "right" : "left", wrapText: col === 3 };
        cell.font = { size: 10, bold: col === 1, color: { argb: NERO } };
      });
    });

    if (odp.length === 0) {
      ws.getCell("A6").value = "Nessun ODP collegato a questo carico";
      ws.getCell("A6").font = { italic: true, color: { argb: GRIGIO_TESTO } };
    } else {
      const tot = ws.getRow(6 + odp.length + 1);
      tot.getCell(1).value = `${odp.length} ODP`;
      tot.getCell(1).font = { bold: true, size: 10 };
    }

    ws.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
