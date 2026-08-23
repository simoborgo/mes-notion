import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import type { CommessaConCarichi, OrdinamentoCommesse } from "../reportCommesse";
import { fmtDateIt, fmtDateEsteso, MESI_IT } from "./date";

const ARANCIO = "FFE87722";
const GRIGIO_TESTO = "FF888780";
const GRIGIO_BORDO = "FFE0DED8";
const GRIGIO_SFONDO = "FFF5F5F3";
const NERO = "FF1A1A1A";
const ARANCIO_CHIARO = "FFFDE8D0";
const BIANCO = "FFFFFFFF";

const N_COLONNE = 9; // A..I

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

// Un carico per riga, ordinato cronologicamente — a differenza dell'elenco compatto usato
// altrove, qui ogni carico ha la sua sottoriga con Titolo + Data estesa affiancati.
function carichiOrdinati(r: CommessaConCarichi): { titolo: string; data: Date }[] {
  return r.carichi
    .filter((c) => c.dataCarico)
    .map((c) => ({ titolo: c.titolo || "Carico", data: new Date(`${c.dataCarico}T00:00:00`) }))
    .sort((a, b) => a.data.getTime() - b.data.getTime());
}

const thinGrigio = { style: "thin" as const, color: { argb: GRIGIO_BORDO } };
const mediumNero = { style: "medium" as const, color: { argb: NERO } };
const thickArancio = { style: "thick" as const, color: { argb: ARANCIO } };

export async function buildProgrammaRiunioneWorkbook(righe: CommessaConCarichi[], ordinamento: OrdinamentoCommesse = "carichi"): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Programma");
  ws.views = [{ showGridLines: false }];

  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 24;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 12;
  ws.getColumn(6).width = 20;
  ws.getColumn(7).width = 15;
  ws.getColumn(8).width = 15;
  ws.getColumn(9).width = 13;

  // Header — logo + titolo (righe 1-4)
  ws.mergeCells(1, 1, 4, 2);
  ws.mergeCells(1, 3, 2, N_COLONNE);
  ws.getCell("C1").value = "Programma commesse";
  ws.getCell("C1").font = { name: "Arial", size: 15, bold: true, color: { argb: NERO } };
  ws.mergeCells(3, 3, 3, N_COLONNE);
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
  ws.mergeCells(5, 1, 5, N_COLONNE);
  ws.getCell("A5").fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARANCIO } };
  ws.getRow(5).height = 3;

  // Riga 6 — spaziatore
  ws.getRow(6).height = 8;

  // Riga 7 — intestazioni colonna
  const headerLabels = ["N° COMMESSA", "CLIENTE", "SEDE / INFO", "STATO", "INFO", "DATA CARICO", "INIZIO MONT.", "FINE MONT.", "GG CANTIERE"];
  const headerRow = ws.getRow(7);
  headerRow.height = 26;
  headerLabels.forEach((label, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = label;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: GRIGIO_TESTO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRIGIO_SFONDO } };
    cell.border = { top: thinGrigio, bottom: mediumNero };
  });

  // Raggruppamento per mese in base all'ordinamento richiesto (stesso toggle Carichi/Montaggio
  // della Dashboard): per "carichi" si usa il prossimo carico non ancora passato, non il primo
  // in assoluto — un carico preliminare fatto due mesi fa non deve ancorare la commessa in un
  // gruppo del passato se il carico vero è più avanti. Le commesse senza quella data finiscono
  // comunque in un gruppo a parte in fondo, mai escluse dal programma.
  const SENZA_DATA_LABEL = ordinamento === "montaggio" ? "Senza montaggio programmato" : "Senza carico programmato";
  const gruppi = new Map<string, CommessaConCarichi[]>();
  for (const r of righe) {
    const d = r.dataOrdinamento;
    const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "senza-data";
    const arr = gruppi.get(key);
    if (arr) arr.push(r);
    else gruppi.set(key, [r]);
  }

  let rowIdx = 8;
  let indiceAlternanza = 0;

  for (const [key, gruppo] of gruppi) {
    const titoloGruppo = key === "senza-data"
      ? SENZA_DATA_LABEL
      : `${MESI_IT[Number(key.split("-")[1]) - 1]}  ${key.split("-")[0]}`;

    const sepRow = ws.getRow(rowIdx);
    sepRow.height = 22;
    ws.mergeCells(rowIdx, 1, rowIdx, N_COLONNE);
    const sepCell = sepRow.getCell(1);
    sepCell.value = `  ${titoloGruppo}`;
    sepCell.font = { name: "Arial", size: 10, bold: true, color: { argb: ARANCIO } };
    sepCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARANCIO_CHIARO } };
    sepCell.border = { left: thickArancio, top: thinGrigio, bottom: thinGrigio };
    rowIdx++;

    for (let i = 0; i < gruppo.length; i++) {
      const { commessa } = gruppo[i];
      const isUltimaCommessa = i === gruppo.length - 1;
      const bg = indiceAlternanza % 2 === 0 ? BIANCO : GRIGIO_SFONDO;
      indiceAlternanza++;

      const paia = carichiOrdinati(gruppo[i]);
      const nSottoRighe = Math.max(paia.length, 1);
      const startRow = rowIdx;
      const endRow = rowIdx + nSottoRighe - 1;

      if (nSottoRighe > 1) {
        for (const col of [1, 2, 3, 4, 7, 8, 9]) ws.mergeCells(startRow, col, endRow, col);
      }

      const badge = BADGE_STATO[commessa.stato];
      const gg = commessa.giorniMontaggio;
      const ggAlta = gg != null && gg >= 30;

      const valoriUnaVolta: [number, string | number, { bold?: boolean; color: string; align?: "left" | "center"; size?: number }][] = [
        [1, commessa.numeroCommessa, { bold: true, color: NERO }],
        [2, commessa.cliente, { bold: true, color: NERO, size: 11 }],
        [3, sedeInfoLabel(commessa.localita, commessa.info), { bold: true, color: NERO }],
        [4, commessa.stato, { bold: true, color: badge?.fg ?? NERO, align: "center" }],
        [7, commessa.inizioMontaggio ? fmtDateIt(new Date(`${commessa.inizioMontaggio}T00:00:00`)) : "—", { color: commessa.inizioMontaggio ? NERO : GRIGIO_TESTO }],
        [8, commessa.fineMontaggio ? fmtDateIt(new Date(`${commessa.fineMontaggio}T00:00:00`)) : "—", { color: commessa.fineMontaggio ? NERO : GRIGIO_TESTO }],
        [9, gg != null ? gg : "—", { bold: ggAlta, color: gg == null ? GRIGIO_TESTO : ggAlta ? ARANCIO : NERO, size: 11 }],
      ];
      for (const [col, value, style] of valoriUnaVolta) {
        const cell = ws.getCell(startRow, col);
        cell.value = value;
        cell.font = { name: "Arial", size: style.size ?? 10, bold: style.bold, color: { argb: style.color } };
        cell.alignment = { horizontal: style.align ?? "left", vertical: "middle" };
      }

      for (let k = 0; k < nSottoRighe; k++) {
        const rowN = startRow + k;
        const pair = paia[k];
        const row = ws.getRow(rowN);
        row.height = 24;

        for (const col of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
          const cell = ws.getCell(rowN, col);
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          const isUltimaRigaCommessa = rowN === endRow;
          cell.border = {
            left: col === 1 ? thickArancio : undefined,
            bottom: isUltimaRigaCommessa && isUltimaCommessa ? mediumNero : thinGrigio,
          };
        }

        const titoloCell = ws.getCell(rowN, 5);
        titoloCell.value = pair ? pair.titolo : "—";
        titoloCell.font = { name: "Arial", size: 9, color: { argb: GRIGIO_TESTO } };
        titoloCell.alignment = { horizontal: "left", vertical: "middle" };

        const dataCell = ws.getCell(rowN, 6);
        dataCell.value = pair ? fmtDateEsteso(pair.data) : "—";
        dataCell.font = { name: "Arial", size: 10, bold: true, color: { argb: pair ? NERO : GRIGIO_TESTO } };
        dataCell.alignment = { horizontal: "left", vertical: "middle" };
      }

      rowIdx = endRow + 1;
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
    printArea: `A1:I${rowIdx}`,
  };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
