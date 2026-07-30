import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import type { CommessaConCarichi } from "../reportCommesse";
import { fmtDateIt, fmtCarichiMulti, MESI_IT } from "./date";

const ARANCIO = "FFE87722";
const GRIGIO_TESTO = "FF888780";
const GRIGIO_BORDO = "FFE0DED8";
const GRIGIO_SFONDO = "FFF5F5F3";
const NERO = "FF1A1A1A";
const ARANCIO_CHIARO = "FFFDE8D0";

const BADGE_STATO: Record<string, { bg: string; fg: string }> = {
  "In produzione": { bg: "FFE6F1FB", fg: "FF0C447C" },
  "In montaggio": { bg: "FFFAEEDA", fg: "FF633806" },
  "In spedizione": { bg: "FFEAF3DE", fg: "FF27500A" },
  "ShopDrawing": { bg: "FFEEEDFE", fg: "FF3C3489" },
};

function sedeInfoLabel(localita: string, info: string): string {
  if (!localita) return info || "";
  return info ? `${localita} – ${info}` : localita;
}

const thinGrigio = { style: "thin" as const, color: { argb: GRIGIO_BORDO } };
const mediumNero = { style: "medium" as const, color: { argb: NERO } };

export async function buildProgrammaRiunioneWorkbook(righe: CommessaConCarichi[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Programma");
  ws.views = [{ showGridLines: false }];

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 26;
  ws.getColumn(6).width = 15;
  ws.getColumn(7).width = 15;
  ws.getColumn(8).width = 13;

  // Header — logo + titolo (righe 1-4)
  ws.mergeCells("A1:B4");
  ws.mergeCells("C1:H2");
  ws.getCell("C1").value = "Programma commesse";
  ws.getCell("C1").font = { name: "Arial", size: 15, bold: true, color: { argb: NERO } };
  ws.mergeCells("C3:H3");
  const oggi = new Date();
  ws.getCell("C3").value = `Riunione produzione  ·  ${MESI_IT[oggi.getMonth()]} ${oggi.getFullYear()}`;
  ws.getCell("C3").font = { name: "Arial", size: 10, color: { argb: GRIGIO_TESTO } };

  const logoPath = path.join(process.cwd(), "public", "modar-logo.png");
  if (fs.existsSync(logoPath)) {
    const base64 = `data:image/png;base64,${fs.readFileSync(logoPath).toString("base64")}`;
    const imageId = wb.addImage({ base64, extension: "png" });
    ws.addImage(imageId, { tl: { col: 0, row: 0 }, ext: { width: 85, height: 85 } });
  }

  ws.getRow(1).height = 20;
  ws.getRow(2).height = 20;
  ws.getRow(3).height = 18;

  // Riga 5 — barra arancio
  ws.mergeCells("A5:H5");
  ws.getCell("A5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARANCIO } };
  ws.getRow(5).height = 3;

  // Riga 6 — spaziatore
  ws.getRow(6).height = 8;

  // Riga 7 — intestazioni colonna
  const headerLabels = ["N° COMMESSA", "CLIENTE", "SEDE / INFO", "STATO", "DATA CARICO", "INIZIO MONT.", "FINE MONT.", "GG CANTIERE"];
  const headerRow = ws.getRow(7);
  headerRow.height = 26;
  headerLabels.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: GRIGIO_TESTO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIGIO_SFONDO } };
    cell.border = { top: thinGrigio, bottom: mediumNero };
  });

  // Raggruppamento per mese del primo carico — le commesse senza alcun carico finiscono
  // in un gruppo a parte in fondo (la skill non prevede un'etichetta per questo caso, dato
  // che il file sorgente da cui parte non lo gestisce esplicitamente: usiamo un'etichetta
  // di comodo invece di ometterle).
  const gruppi = new Map<string, CommessaConCarichi[]>();
  for (const r of righe) {
    const key = r.primoCarico ? `${r.primoCarico.getFullYear()}-${String(r.primoCarico.getMonth() + 1).padStart(2, "0")}` : "senza-carico";
    const arr = gruppi.get(key);
    if (arr) arr.push(r);
    else gruppi.set(key, [r]);
  }

  let rowIdx = 8;
  let rigaIndiceAlternanza = 0;
  const statoBadgeRows: number[] = [];

  for (const [key, gruppo] of gruppi) {
    const titoloGruppo = key === "senza-carico"
      ? "Senza carico programmato"
      : `${MESI_IT[Number(key.split("-")[1]) - 1]}  ${key.split("-")[0]}`;

    const sepRow = ws.getRow(rowIdx);
    sepRow.height = 22;
    ws.mergeCells(rowIdx, 1, rowIdx, 8);
    const sepCell = sepRow.getCell(1);
    sepCell.value = `  ${titoloGruppo}`;
    sepCell.font = { name: "Arial", size: 10, bold: true, color: { argb: ARANCIO } };
    sepCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARANCIO_CHIARO } };
    sepCell.border = {
      left: { style: "thick", color: { argb: ARANCIO } },
      top: thinGrigio,
      bottom: thinGrigio,
    };
    rowIdx++;

    for (let i = 0; i < gruppo.length; i++) {
      const { commessa, caricoDates } = gruppo[i];
      const isLast = i === gruppo.length - 1;
      const bg = rigaIndiceAlternanza % 2 === 0 ? "FFFFFFFF" : GRIGIO_SFONDO;
      rigaIndiceAlternanza++;

      const wrapDate = caricoDates.length > 4;
      const row = ws.getRow(rowIdx);
      row.height = wrapDate ? 28 : 24;

      const badge = BADGE_STATO[commessa.stato];
      const gg = commessa.giorniMontaggio;
      const ggAlta = gg != null && gg >= 30;

      const values: [number, string | number, { bold?: boolean; color: string; align?: "left" | "center" }][] = [
        [1, commessa.numeroCommessa, { bold: true, color: NERO }],
        [2, commessa.cliente, { bold: true, color: NERO }],
        [3, sedeInfoLabel(commessa.localita, commessa.info), { bold: true, color: NERO }],
        [4, commessa.stato, { bold: true, color: badge?.fg ?? NERO, align: "center" }],
        [5, fmtCarichiMulti(caricoDates), { bold: true, color: NERO }],
        [6, commessa.inizioMontaggio ? fmtDateIt(new Date(`${commessa.inizioMontaggio}T00:00:00`)) : "—", { color: commessa.inizioMontaggio ? NERO : GRIGIO_TESTO }],
        [7, commessa.fineMontaggio ? fmtDateIt(new Date(`${commessa.fineMontaggio}T00:00:00`)) : "—", { color: commessa.fineMontaggio ? NERO : GRIGIO_TESTO }],
        [8, gg != null ? gg : "—", { bold: ggAlta, color: gg == null ? GRIGIO_TESTO : ggAlta ? ARANCIO : NERO }],
      ];

      for (const [col, value, style] of values) {
        const cell = row.getCell(col);
        cell.value = value;
        cell.font = { name: "Arial", size: col === 2 ? 11 : col === 8 ? 11 : col === 3 ? 10 : 10, bold: style.bold, color: { argb: style.color } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
        cell.alignment = { horizontal: style.align ?? "left", vertical: "middle", wrapText: col === 5 && wrapDate };
        cell.border = {
          left: col === 1 ? { style: "thick", color: { argb: ARANCIO } } : undefined,
          bottom: isLast ? mediumNero : thinGrigio,
        };
      }
      if (badge) statoBadgeRows.push(rowIdx);
      rowIdx++;
    }
  }

  // Spaziatore prima della legenda
  ws.getRow(rowIdx).height = 4;
  rowIdx += 2;

  const legRow = ws.getRow(rowIdx);
  legRow.height = 18;
  legRow.getCell(1).value = "LEGENDA";
  legRow.getCell(1).font = { name: "Arial", size: 9, bold: true, color: { argb: GRIGIO_TESTO } };
  let legCol = 2;
  for (const [stato, { bg, fg }] of Object.entries(BADGE_STATO)) {
    const cell = legRow.getCell(legCol);
    cell.value = stato;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: fg } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
    cell.alignment = { horizontal: "center" };
    legCol++;
  }
  const ggCell = legRow.getCell(legCol);
  ggCell.value = "≥ 30 gg cantiere";
  ggCell.font = { name: "Arial", size: 9, bold: true, color: { argb: ARANCIO } };

  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:H${rowIdx}`,
  };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
