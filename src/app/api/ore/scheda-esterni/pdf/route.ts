import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getTuttiOperatori } from "@/lib/operatoriRepository";
import { getOreLavoratePerGiornoPeriodo } from "@/lib/oreRepository";
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

function fmtOre(n: number): string {
  return `${Math.round(n * 100) / 100}`;
}

interface GiornoCalendario {
  giorno: number;
  data: string;
  weekday: number; // 0 = domenica … 6 = sabato, come Date.getDay()
  festivo: boolean;
}

// weekday calcolato qui, dalla stessa istanza Date costruita con anno/mese/giorno espliciti
// (mai da un parsing di stringa YYYY-MM-DD, che verrebbe interpretata come UTC e potrebbe
// spostare il giorno della settimana a seconda del fuso del server).
function giorniDelMese(meseStr: string): GiornoCalendario[] {
  const [anno, mese] = meseStr.split("-").map(Number);
  const nGiorni = new Date(anno, mese, 0).getDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return Array.from({ length: nGiorni }, (_, i) => {
    const d = new Date(anno, mese - 1, i + 1);
    return { giorno: i + 1, data: `${anno}-${p(mese)}-${p(i + 1)}`, weekday: d.getDay(), festivo: !giornoLavorativo(d) };
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

    const giorni = giorniDelMese(mese);
    const da = giorni[0].data;
    const a = giorni[giorni.length - 1].data;

    const [tuttiOperatori, oreGiornaliere] = await Promise.all([
      getTuttiOperatori(),
      getOreLavoratePerGiornoPeriodo(da, a),
    ]);

    // Un esterno non più in forza che ha lavorato durante il mese richiesto non deve sparire dal
    // proprio calendario di fine mese: qui conta chi è in forza oggi O chi ha almeno un'ora
    // lavorata nel periodo, non solo il primo caso (vedi stesso bug già corretto in
    // getPresentiPerData/oreRepository.ts). Permessi/ferie non danno diritto a comparire da soli:
    // non sono pagati, quindi un mese di sola assenza non produce nulla da fatturare.
    const matricoleConOreLavorate = new Set(oreGiornaliere.map(r => r.matricola));
    const esterni = tuttiOperatori
      .filter(o => o.tipo === "Esterno" && (o.inForza || matricoleConOreLavorate.has(o.matricola)))
      .sort((a2, b) => a2.azienda.localeCompare(b.azienda) || a2.cognome.localeCompare(b.cognome));

    if (esterni.length === 0) {
      return NextResponse.json({ error: "Nessun dipendente esterno per il mese richiesto" }, { status: 404 });
    }

    const oreLavoratePerMatricolaGiorno = new Map<string, Map<string, number>>();
    for (const r of oreGiornaliere) {
      if (!oreLavoratePerMatricolaGiorno.has(r.matricola)) oreLavoratePerMatricolaGiorno.set(r.matricola, new Map());
      oreLavoratePerMatricolaGiorno.get(r.matricola)!.set(r.data, r.ore);
    }

    // Griglia calendario Lunedì-Domenica: celle vuote per completare la prima e l'ultima settimana.
    const primoWeekdayMonFirst = (giorni[0].weekday + 6) % 7;
    const celle: (GiornoCalendario | null)[] = [
      ...Array(primoWeekdayMonFirst).fill(null),
      ...giorni,
    ];
    while (celle.length % 7 !== 0) celle.push(null);
    const settimane: (GiornoCalendario | null)[][] = [];
    for (let i = 0; i < celle.length; i += 7) settimane.push(celle.slice(i, i + 7));

    const logoUri = getLogoDataUri();
    const weekdayLabels = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

    const paginaHtml = (o: (typeof esterni)[number]) => {
      const oreMatricola = oreLavoratePerMatricolaGiorno.get(o.matricola) ?? new Map<string, number>();

      let totaleMese = 0;
      const settimaneHtml = settimane.map(settimana => {
        const celleHtml = settimana.map(g => {
          if (!g) return `<td class="cella vuota"></td>`;
          // Solo ore effettivamente lavorate: permessi e ferie non sono pagati agli esterni,
          // quindi non entrano nel totale — decisione esplicita dell'utente 2026-09-13.
          const totale = oreMatricola.get(g.data) ?? 0;
          totaleMese += totale;
          return `
            <td class="cella${g.festivo ? " riposo" : ""}">
              <div class="num-giorno">${g.giorno}</div>
              ${totale > 0 ? `<div class="ore-giorno">${fmtOre(totale)}</div>` : ""}
            </td>`;
        }).join("");
        return `<tr>${celleHtml}</tr>`;
      }).join("");

      return `
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
          <div class="box"><div class="l">Totale ore mese</div><div class="v">${fmtOre(totaleMese)}h</div></div>
        </div>
        <table class="calendario">
          <thead><tr>${weekdayLabels.map(w => `<th>${w}</th>`).join("")}</tr></thead>
          <tbody>${settimaneHtml}</tbody>
        </table>
        <div class="firma-riga">
          <span>Firma</span>
          <span class="linea"></span>
        </div>
      </section>`;
    };

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
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:2.5mm;border-bottom:2px solid #1A1918;margin-bottom:4mm}
.hd .lbl{font-size:9px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:18px;font-weight:700;margin-top:1mm}
.hd .sub{font-size:10px;color:#6b6966;margin-top:0.5mm}
.hd .logo{height:14mm;width:auto;object-fit:contain;flex-shrink:0}
.info-riga{display:flex;gap:3mm;margin-bottom:4mm}
.info-riga .box{flex:1;border:1px solid #E4E0DA;border-radius:2mm;padding:1.5mm 4mm}
.info-riga .l{font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#6b6966}
.info-riga .v{font-size:13px;font-weight:700;margin-top:0.3mm}
table.calendario{width:100%;border-collapse:collapse;table-layout:fixed}
table.calendario th{text-align:center;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:1.5mm 0;border-bottom:2px solid #1A1918}
td.cella{border:1px solid #E4E0DA;height:24mm;vertical-align:top;padding:1.5mm 2mm}
td.cella.vuota{border-color:#F5F3EF;background:#FBFAF8}
td.cella.riposo{background:#F5F3EF}
.num-giorno{font-size:9px;color:#A4A4A6;font-weight:600}
.ore-giorno{font-size:19px;font-weight:700;text-align:center;margin-top:5mm;color:#1A1918}
.firma-riga{display:flex;align-items:center;gap:4mm;margin-top:8mm}
.firma-riga span:first-child{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6b6966}
.firma-riga .linea{flex:1;border-bottom:1px solid #1A1918;height:1px;max-width:90mm}
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
