import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getPresentiPerData } from "@/lib/oreRepository";
import { getOrariTurno } from "@/lib/parametriGeneraliRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";
import { ODP_SPECIALI, ATTIVITA_SPECIALI_COMMESSA } from "@/lib/attivitaSpecialiCommessa";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Stessa tecnica di ritiri/[id]/etichetta/route.ts — logo incorporato come data URI.
function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch { /* skip */ }
  return "";
}

// Stesso helper già duplicato in presenti/pdf e presenze-giornaliere — vedi commento lì.
function fmtDataLunga(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const raw = dt.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Righe vuote da compilare a mano — 12 bastano per una giornata anche molto frammentata (il
// caso reale più fitto visto finora, sette cambi ODP in un giorno, ci sta con ampio margine).
const N_RIGHE_VUOTE = 12;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const data = searchParams.get("data");
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: "Parametro data mancante o non valido (YYYY-MM-DD)" }, { status: 400 });
    }

    const [{ presenti }, orariTurno] = await Promise.all([getPresentiPerData(data), getOrariTurno()]);

    const [y, m, d] = data.split("-").map(Number);
    const weekday = new Date(y, m - 1, d).getDay();
    const turnoLabel = weekday === 0
      ? "Nessun turno previsto (domenica)"
      : weekday === 6
      ? `${orariTurno.turnoSabatoInizio}–${orariTurno.turnoSabatoFine}`
      : `${orariTurno.turnoFerialeInizio}–${orariTurno.turnoFerialeFine} (pausa ${orariTurno.turnoFerialePausaInizio}–${orariTurno.turnoFerialePausaFine})`;

    const operatoriOrdinati = presenti
      .slice()
      .sort((a, b) => a.reparto.localeCompare(b.reparto) || a.cognome.localeCompare(b.cognome));

    const legendaSpeciali = ODP_SPECIALI.map(s => `${s.prefix} = ${s.label}`).join(" · ");
    const legendaCommessa = ATTIVITA_SPECIALI_COMMESSA.map(a => `‹n. commessa›-${a.suffix} = ${a.label}`).join(" · ");

    const righeVuoteHtml = Array.from({ length: N_RIGHE_VUOTE }, (_, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="cell-odp"></td>
        <td class="cell-ore"></td>
        <td class="cell-rif">☐</td>
      </tr>`).join("");

    const logoUri = getLogoDataUri();

    const paginaHtml = (p: (typeof operatoriOrdinati)[number]) => `
      <section class="pagina">
        <div class="hd">
          <div>
            <div class="lbl">Rilevamento Ore — Scheda Operatore</div>
            <div class="title">${esc(p.cognome)} ${esc(p.nome)}</div>
            <div class="sub">${esc(p.matricola)} · ${esc(p.azienda || "")} · ${esc(p.reparto)}</div>
          </div>
          ${logoUri ? `<img class="logo" src="${logoUri}" alt="Modar">` : ""}
        </div>
        <div class="info-riga">
          <div class="box"><div class="l">Data</div><div class="v">${esc(fmtDataLunga(data))}</div></div>
          <div class="box"><div class="l">Turno previsto</div><div class="v">${esc(turnoLabel)}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="num">#</th>
              <th>ODP / codice</th>
              <th class="cell-ore">Ore</th>
              <th class="cell-rif">Rif.</th>
            </tr>
          </thead>
          <tbody>${righeVuoteHtml}</tbody>
          <tfoot>
            <tr>
              <td colspan="2" class="tot-label">Totale ore</td>
              <td class="cell-ore tot-cell"></td>
              <td class="tot-cell"></td>
            </tr>
          </tfoot>
        </table>
        <div class="legenda">
          <p><strong>Codici speciali</strong> — ${esc(legendaSpeciali)}</p>
          <p><strong>Legati a una commessa</strong> (scrivi ‹n. commessa›-CODICE) — ${esc(legendaCommessa)}</p>
        </div>
        <div class="firma">Firma operatore ________________________________________</div>
      </section>`;

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Scheda Ore Operatore ${esc(data)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.pagina{break-after:page}
.pagina:last-child{break-after:auto}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:4mm;border-bottom:2px solid #1A1918;margin-bottom:4mm}
.hd .lbl{font-size:10px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:22px;font-weight:700;margin-top:1.5mm}
.hd .sub{font-size:11px;color:#6b6966;margin-top:1mm}
.hd .logo{height:18mm;width:auto;object-fit:contain;flex-shrink:0}
.info-riga{display:flex;gap:3mm;margin-bottom:4mm}
.info-riga .box{flex:1;border:1px solid #E4E0DA;border-radius:2mm;padding:2.5mm 4mm}
.info-riga .l{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#6b6966}
.info-riga .v{font-size:12.5px;font-weight:600;margin-top:0.5mm}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:2mm 2.5mm;border-bottom:2px solid #1A1918}
td{padding:3mm 2.5mm;border-bottom:1px solid #E4E0DA;font-size:12px}
.num{width:8mm;color:#A4A4A6;text-align:center}
.cell-ore{width:22mm;text-align:center}
.cell-rif{width:16mm;text-align:center;font-size:14px}
.tot-label{text-align:right;font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.06em;border-bottom:none;border-top:2px solid #1A1918;padding-top:3.5mm}
.tot-cell{border-bottom:none;border-top:2px solid #1A1918;padding-top:3.5mm}
.legenda{margin-top:4mm;font-size:9.5px;color:#6b6966;line-height:1.5}
.legenda strong{color:#1A1918}
.firma{margin-top:8mm;font-size:12px;color:#1A1918}
@media print{@page{size:A4;margin:14mm}}
</style>
</head>
<body>
${operatoriOrdinati.map(paginaHtml).join("")}
</body>
</html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const browserPage = await browser.newPage();
      await browserPage.setContent(html, { waitUntil: "load" });
      await browserPage.evaluateHandle("document.fonts.ready");
      const pdfBuffer = await browserPage.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="scheda-ore-operatore-${data}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ore/scheda-operatore/pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
