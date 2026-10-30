import ExcelJS from "exceljs";
import { intervalliCommessa, type CommessaConCarichi, type PeriodoCommesse } from "../reportCommesse";
import { MESI_IT } from "./date";

const BLU_HEADER = "FF2C3E50";
const ARANCIO = "FFFF8C00";
const BLU_MONTAGGIO = "FF1F5C99";
const TEAL_PRODUZIONE = "FF0D9488";
const GRIGIO_1 = "FFF5F5F5";
const GRIGIO_2 = "FFFFFFFF";
const BIANCO = "FFFFFFFF";

const BADGE_STATO: Record<string, string> = {
  "In produzione": "FF3498DB",
  "In montaggio": "FFE67E22",
  "In spedizione": "FF27AE60",
  "ShopDrawing": "FF9B59B6",
};

function weekMonday(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // domenica (0) -> lunedì della stessa settimana è 6 giorni prima
  const m = new Date(d);
  m.setDate(d.getDate() + diff);
  m.setHours(0, 0, 0, 0);
  return m;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtGgMm(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelRiga(commessa: { numeroCommessa: string; cliente: string; localita: string; info: string }): string {
  let label = `${commessa.numeroCommessa} | ${commessa.cliente}`;
  if (commessa.localita) label += ` ${commessa.localita}`;
  if (commessa.info) label += ` – ${commessa.info}`;
  return label;
}

export async function buildGanttWorkbook(righe: CommessaConCarichi[], periodo: PeriodoCommesse = { da: null, a: null }): Promise<Buffer> {
  const tutteLeDate: Date[] = [];
  for (const r of righe) {
    tutteLeDate.push(...r.caricoDates);
    if (r.commessa.inizioMontaggio) tutteLeDate.push(new Date(`${r.commessa.inizioMontaggio}T00:00:00`));
    if (r.commessa.fineMontaggio) tutteLeDate.push(new Date(`${r.commessa.fineMontaggio}T00:00:00`));
    if (r.commessa.inizioProduzione) tutteLeDate.push(new Date(`${r.commessa.inizioProduzione}T00:00:00`));
    if (r.commessa.fineProduzione) tutteLeDate.push(new Date(`${r.commessa.fineProduzione}T00:00:00`));
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Gantt");

  if (tutteLeDate.length === 0) {
    ws.getCell("A1").value = periodo.da || periodo.a ? "Nessuna commessa con date nel periodo scelto." : "Nessuna commessa aperta con date disponibili.";
    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  // Range del Gantt: parte sempre da una settimana prima di oggi, mai dalla data più vecchia tra
  // i dati — un carico preliminare passato da mesi non deve allungare tutta la vista all'indietro
  // (stessa scelta già fatta per il Gantt della Dashboard il 2026-08-13). Arriva fino all'ultima
  // data rilevante (carico o montaggio più recente), con un minimo di 90 giorni di vista.
  const oggi = new Date(); oggi.setHours(0, 0, 0, 0);
  // Con mesi Da/A scelti in Dashboard il range è esattamente quello dei mesi scelti (un estremo
  // non scelto resta automatico).
  const inizioRange = periodo.da ? weekMonday(periodo.da) : weekMonday(addDays(oggi, -7));
  const fineRangeDati = new Date(Math.max(...tutteLeDate.map((d) => d.getTime())));
  const fineRange = periodo.a ?? (fineRangeDati > addDays(inizioRange, 90) ? fineRangeDati : addDays(inizioRange, 90));

  const settimane: Date[] = [];
  for (let w = inizioRange; w <= fineRange; w = addDays(w, 7)) {
    settimane.push(new Date(w));
  }

  const COL_WEEK_START = 4; // colonna D (A commessa, B stato, C fase)

  ws.getColumn(1).width = 45;
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 11;
  for (let i = 0; i < settimane.length; i++) ws.getColumn(COL_WEEK_START + i).width = 5;

  // Riga 1 — intestazione mesi (merge celle dello stesso mese)
  const row1 = ws.getRow(1);
  let i = 0;
  while (i < settimane.length) {
    const mese = settimane[i].getMonth();
    const anno = settimane[i].getFullYear();
    let j = i;
    while (j < settimane.length && settimane[j].getMonth() === mese && settimane[j].getFullYear() === anno) j++;
    const startCol = COL_WEEK_START + i;
    const endCol = COL_WEEK_START + j - 1;
    if (endCol > startCol) ws.mergeCells(1, startCol, 1, endCol);
    const cell = row1.getCell(startCol);
    cell.value = `${MESI_IT[mese]} ${anno}`;
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: BIANCO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
    cell.alignment = { horizontal: "center" };
    i = j;
  }
  row1.height = 20;
  ws.getCell(1, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
  ws.getCell(1, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
  ws.getCell(1, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };

  // Riga 2 — date settimane
  const row2 = ws.getRow(2);
  row2.height = 18;
  ws.getCell(2, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
  ws.getCell(2, 2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
  ws.getCell(2, 3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
  settimane.forEach((w, idx) => {
    const cell = row2.getCell(COL_WEEK_START + idx);
    cell.value = fmtGgMm(w);
    cell.font = { name: "Arial", size: 8, bold: true, color: { argb: BIANCO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_HEADER } };
    cell.alignment = { horizontal: "center" };
  });

  // Righe 3+ — tre righe per commessa, una per fase (carico, montaggio, produzione): ogni riga
  // colora solo le settimane della propria fase, così le fasi non si coprono più a vicenda.
  righe.forEach((r, idx) => {
    const baseRow = 3 + idx * 3;
    const bg = idx % 2 === 0 ? GRIGIO_2 : GRIGIO_1;
    const sfondo = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: bg } };
    const { montaggio, produzione } = intervalliCommessa(r);
    const nelPeriodo = (iv: [Date, Date] | null, wStart: Date, wEnd: Date) => !!iv && !(wEnd < iv[0] || wStart > iv[1]);

    const fasi: { nome: string; colore: string; attiva: (wStart: Date, wEnd: Date) => boolean }[] = [
      { nome: "Carico", colore: ARANCIO, attiva: (a, b) => r.caricoDates.some((d) => d >= a && d <= b) },
      { nome: "Montaggio", colore: BLU_MONTAGGIO, attiva: (a, b) => nelPeriodo(montaggio, a, b) },
      { nome: "Produzione", colore: TEAL_PRODUZIONE, attiva: (a, b) => nelPeriodo(produzione, a, b) },
    ];

    fasi.forEach((fase, k) => {
      const row = ws.getRow(baseRow + k);
      row.height = 16;
      const ultima = k === fasi.length - 1;
      const bordoSotto = ultima ? { bottom: { style: "thin" as const, color: { argb: "FFD0D0D0" } } } : undefined;

      for (const col of [1, 2]) {
        const cell = row.getCell(col);
        cell.fill = sfondo;
        if (bordoSotto) cell.border = bordoSotto;
      }

      const faseCell = row.getCell(3);
      faseCell.value = fase.nome;
      faseCell.font = { name: "Arial", size: 8, bold: true, color: { argb: fase.colore } };
      faseCell.fill = sfondo;
      faseCell.alignment = { vertical: "middle" };
      if (bordoSotto) faseCell.border = bordoSotto;

      settimane.forEach((wStart, wIdx) => {
        const cell = row.getCell(COL_WEEK_START + wIdx);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fase.attiva(wStart, addDays(wStart, 6)) ? fase.colore : bg } };
        if (bordoSotto) cell.border = bordoSotto;
      });
    });

    // Commessa e stato sono uniti sulle tre righe della commessa
    ws.mergeCells(baseRow, 1, baseRow + 2, 1);
    ws.mergeCells(baseRow, 2, baseRow + 2, 2);

    const labelCell = ws.getCell(baseRow, 1);
    labelCell.value = labelRiga(r.commessa);
    labelCell.font = { name: "Arial", size: 9, color: { argb: "FF1A1A1A" } };
    labelCell.alignment = { vertical: "middle", wrapText: true };

    const badgeColor = BADGE_STATO[r.commessa.stato];
    const statoCell = ws.getCell(baseRow, 2);
    statoCell.value = r.commessa.stato;
    statoCell.font = { name: "Arial", size: 8, bold: true, color: { argb: BIANCO } };
    if (badgeColor) statoCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: badgeColor } };
    statoCell.alignment = { horizontal: "center", vertical: "middle" };
  });

  ws.views = [{ state: "frozen", xSplit: 3, ySplit: 2, showGridLines: false }];

  // Legenda
  const legRow1Idx = 3 + righe.length * 3 + 2;
  ws.getRow(legRow1Idx).height = 18;
  const legCarico = ws.getCell(legRow1Idx, 1);
  legCarico.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ARANCIO } };
  ws.getCell(legRow1Idx, 2).value = "Data Carico";
  ws.getCell(legRow1Idx, 2).font = { name: "Arial", size: 9, color: { argb: "FF1A1A1A" } };

  const legRow2Idx = legRow1Idx + 1;
  const legMontaggio = ws.getCell(legRow2Idx, 1);
  legMontaggio.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLU_MONTAGGIO } };
  ws.getCell(legRow2Idx, 2).value = "Periodo Montaggio";
  ws.getCell(legRow2Idx, 2).font = { name: "Arial", size: 9, color: { argb: "FF1A1A1A" } };

  const legRow3Idx = legRow2Idx + 1;
  ws.getCell(legRow3Idx, 1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: TEAL_PRODUZIONE } };
  ws.getCell(legRow3Idx, 2).value = "Periodo Produzione";
  ws.getCell(legRow3Idx, 2).font = { name: "Arial", size: 9, color: { argb: "FF1A1A1A" } };

  let legCol = 4;
  const legBadgeRow = legRow1Idx;
  for (const [stato, colore] of Object.entries(BADGE_STATO)) {
    const cell = ws.getCell(legBadgeRow, legCol);
    cell.value = stato;
    cell.font = { name: "Arial", size: 8, bold: true, color: { argb: BIANCO } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: colore } };
    cell.alignment = { horizontal: "center" };
    legCol++;
  }

  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };

  const buffer = await wb.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
