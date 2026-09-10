import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getOperatori } from "@/lib/operatoriRepository";
import { giornoLavorativo } from "@/lib/calendarioLavorativo";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Stessa tecnica di ritiri/[id]/etichetta/route.ts e scheda-operatore/pdf — logo incorporato come data URI.
function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch { /* skip */ }
  return "";
}

function meseLabel(meseStr: string): string {
  const [anno, mese] = meseStr.split("-").map(Number);
  const raw = new Date(anno, mese - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

interface GiornoCalendario {
  giorno: number;
  weekdayLabel: string;
  festivo: boolean;
}

// Tutti i giorni del mese "YYYY-MM", con etichetta giorno settimana ed eventuale
// evidenziazione weekend/festivi (non lavorativi per un esterno, ma comunque compilabili
// a mano in caso di eccezione — nessuna cella è bloccata).
function giorniDelMese(meseStr: string): GiornoCalendario[] {
  const [anno, mese] = meseStr.split("-").map(Number);
  const nGiorni = new Date(anno, mese, 0).getDate();
  return Array.from({ length: nGiorni }, (_, i) => {
    const d = new Date(anno, mese - 1, i + 1);
    const weekdayLabel = d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "");
    return { giorno: i + 1, weekdayLabel, festivo: !giornoLavorativo(d) };
  });
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const mese = searchParams.get("mese");
    if (!mese || !/^\d{4}-\d{2}$/.test(mese)) {
      return NextResponse.json({ error: "Parametro mese mancante o non valido (YYYY-MM)" }, { status: 400 });
    }

    const operatori = await getOperatori();
    const esterni = operatori
      .filter(o => o.tipo === "Esterno")
      .sort((a, b) => a.azienda.localeCompare(b.azienda) || a.cognome.localeCompare(b.cognome));

    if (esterni.length === 0) {
      return NextResponse.json({ error: "Nessun dipendente esterno in forza" }, { status: 404 });
    }

    const giorni = giorniDelMese(mese);
    const logoUri = getLogoDataUri();

    const righeGiorniHtml = giorni.map(g => `
      <tr class="${g.festivo ? "riposo" : ""}">
        <td class="num">${g.giorno}</td>
        <td class="weekday">${esc(g.weekdayLabel)}</td>
        <td class="cell-ore"></td>
        <td class="cell-firma"></td>
      </tr>`).join("");

    const paginaHtml = (o: (typeof esterni)[number]) => `
      <section class="pagina">
        <div class="hd">
          <div>
            <div class="lbl">Rilevamento Ore — Calendario Mensile Esterno</div>
            <div class="title">${esc(o.cognome)} ${esc(o.nome)}</div>
            <div class="sub">${esc(o.matricola)} · ${esc(o.azienda || "")} · ${esc(o.reparto)}</div>
          </div>
          ${logoUri ? `<img class="logo" src="${logoUri}" alt="Modar">` : ""}
        </div>
        <div class="info-riga">
          <div class="box"><div class="l">Mese</div><div class="v">${esc(meseLabel(mese))}</div></div>
        </div>
        <table>
          <thead>
            <tr>
              <th class="num">Giorno</th>
              <th class="weekday"></th>
              <th class="cell-ore">Ore</th>
              <th class="cell-firma">Firma</th>
            </tr>
          </thead>
          <tbody>${righeGiorniHtml}</tbody>
        </table>
      </section>`;

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Calendario Esterni ${esc(mese)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.pagina{break-after:page}
.pagina:last-child{break-after:auto}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:2.5mm;border-bottom:2px solid #1A1918;margin-bottom:2.5mm}
.hd .lbl{font-size:9px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:18px;font-weight:700;margin-top:1mm}
.hd .sub{font-size:10px;color:#6b6966;margin-top:0.5mm}
.hd .logo{height:14mm;width:auto;object-fit:contain;flex-shrink:0}
.info-riga{display:flex;gap:3mm;margin-bottom:2.5mm}
.info-riga .box{flex:1;border:1px solid #E4E0DA;border-radius:2mm;padding:1.5mm 4mm}
.info-riga .l{font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b6966}
.info-riga .v{font-size:11px;font-weight:600;margin-top:0.3mm}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:1.3mm 2.5mm;border-bottom:2px solid #1A1918}
td{padding:1.15mm 2.5mm;border-bottom:1px solid #E4E0DA;font-size:10.5px;line-height:1.1}
.num{width:14mm;color:#A4A4A6;text-align:center}
.weekday{width:14mm;color:#6b6966;text-transform:capitalize}
.cell-ore{width:22mm;text-align:center}
.cell-firma{width:auto}
tr.riposo td{background:#F5F3EF;color:#A4A4A6}
@media print{@page{size:A4;margin:12mm}}
</style>
</head>
<body>
${esterni.map(paginaHtml).join("")}
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
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="calendario-esterni-${mese}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ore/scheda-esterni/pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
