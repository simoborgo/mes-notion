import ExcelJS from "exceljs";
import type { RigaOreMensili } from "../reportOreMensili";
import { CATEGORIA_ODP_LABEL } from "../types";

const ARANCIO = "FFE87722";
const GRIGIO_TESTO = "FF888780";
const GRIGIO_BORDO = "FFE0DED8";
const GRIGIO_SFONDO = "FFF5F5F3";

const COLONNE: { header: string; width: number }[] = [
  { header: "Commessa", width: 14 },
  { header: "ODP", width: 20 },
  { header: "Operatore", width: 26 },
  { header: "Data", width: 12 },
  { header: "Ore", width: 8 },
  { header: "Interno/Esterno", width: 16 },
  { header: "Azienda", width: 22 },
  { header: "Reparto", width: 18 },
  { header: "Categoria", width: 20 },
  { header: "Rifacimento", width: 12 },
];

function dataExcel(d: string): Date {
  const [y, m, g] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, g));
}

export async function buildOreMensiliWorkbook(righe: RigaOreMensili[], da: string, a: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Ore");
  ws.views = [{ state: "frozen", ySplit: 1, showGridLines: false }];
  COLONNE.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });

  const header = ws.getRow(1);
  COLONNE.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, size: 10, color: { argb: GRIGIO_TESTO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIGIO_SFONDO } };
    cell.border = { bottom: { style: "medium", color: { argb: ARANCIO } } };
    cell.alignment = { vertical: "middle", horizontal: c.header === "Ore" ? "right" : "left" };
  });
  header.height = 22;

  righe.forEach((r, idx) => {
    const row = ws.getRow(2 + idx);
    row.values = [
      r.commessa, r.odp, r.operatore, dataExcel(r.data), r.ore, r.tipo, r.azienda, r.reparto,
      CATEGORIA_ODP_LABEL[r.categoria as keyof typeof CATEGORIA_ODP_LABEL] ?? r.categoria,
      r.rifacimento ? "Sì" : "",
    ];
    row.getCell(4).numFmt = "dd/mm/yyyy";
    row.getCell(5).numFmt = "0.00";
    row.eachCell({ includeEmpty: true }, (cell, col) => {
      cell.border = { bottom: { style: "thin", color: { argb: GRIGIO_BORDO } } };
      cell.font = { size: 10 };
      cell.alignment = { vertical: "middle", horizontal: col === 5 ? "right" : "left" };
    });
  });

  if (righe.length > 0) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1 + righe.length, column: COLONNE.length } };
    const tot = ws.getRow(righe.length + 3);
    tot.getCell(4).value = "Totale";
    tot.getCell(5).value = { formula: `SUBTOTAL(109,E2:E${righe.length + 1})`, result: righe.reduce((s, r) => s + r.ore, 0) };
    tot.getCell(5).numFmt = "0.00";
    tot.getCell(4).font = tot.getCell(5).font = { bold: true, size: 10 };
    tot.getCell(5).alignment = { horizontal: "right" };
  }

  // Foglio di sintesi per Commessa/Operatore, utile per fatturare/riconciliare senza pivot
  const sint = wb.addWorksheet("Riepilogo operatore");
  sint.columns = [{ width: 26 }, { width: 16 }, { width: 22 }, { width: 10 }];
  sint.addRow(["Operatore", "Interno/Esterno", "Azienda", "Ore"]).font = { bold: true };
  const perOp = new Map<string, { operatore: string; tipo: string; azienda: string; ore: number }>();
  for (const r of righe) {
    const o = perOp.get(r.matricola) ?? { operatore: r.operatore, tipo: r.tipo, azienda: r.azienda, ore: 0 };
    o.ore += r.ore;
    perOp.set(r.matricola, o);
  }
  [...perOp.values()].sort((x, y) => x.operatore.localeCompare(y.operatore)).forEach(o => {
    const row = sint.addRow([o.operatore, o.tipo, o.azienda, o.ore]);
    row.getCell(4).numFmt = "0.00";
  });
  sint.addRow([]);
  sint.addRow([`Periodo ${da} → ${a}`]).font = { italic: true, color: { argb: GRIGIO_TESTO } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
