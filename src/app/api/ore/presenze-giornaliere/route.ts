import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getPresentiPerData } from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Stessa tecnica di ritiri/[id]/etichetta/route.ts — logo incorporato come data URI (non un
// riferimento a /public, che Puppeteer non risolverebbe senza un server già in ascolto).
function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch { /* skip */ }
  return "";
}

function fmtDataLunga(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const raw = dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// Lista semplice per uso su carta (giro reparti con penna alla mano): niente reparti/ODP/stati,
// solo il nome, le ore già registrate a sistema per quella giornata, e uno spazio libero per
// annotare a mano — richiesta esplicita dell'utente 2026-08-26, distinta dalla stampa dettagliata
// di /api/ore/presenti/pdf.
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

    const { presenti } = await getPresentiPerData(data);
    const nInterni = presenti.filter(p => p.tipo === "Modar").length;
    const nEsterni = presenti.filter(p => p.tipo === "Esterno").length;

    const perReparto = new Map<string, typeof presenti>();
    for (const p of presenti) {
      const list = perReparto.get(p.reparto) ?? [];
      list.push(p);
      perReparto.set(p.reparto, list);
    }
    const reparti = [...perReparto.keys()].sort((a, b) => a.localeCompare(b));

    const sezioniHtml = reparti.map(reparto => {
      const operatori = (perReparto.get(reparto) ?? []).slice().sort((a, b) => a.cognome.localeCompare(b.cognome));
      const righeHtml = operatori.map(p => {
        const ore = Math.round(p.registrazioni.reduce((s, r) => s + r.ore, 0) * 2) / 2;
        return `
          <tr>
            <td class="nome">${esc(p.cognome)} ${esc(p.nome)}</td>
            <td class="qty">${ore}h</td>
            <td class="note"></td>
          </tr>`;
      }).join("");
      return `
        <section class="reparto">
          <h2>${esc(reparto)}</h2>
          <table>
            <thead><tr><th>Operatore</th><th class="qty">Ore lav.</th><th class="note">Note</th></tr></thead>
            <tbody>${righeHtml}</tbody>
          </table>
        </section>`;
    }).join("");

    const logoUri = getLogoDataUri();
    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Presenze Giornaliere ${esc(data)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:6mm;border-bottom:2px solid #1A1918;margin-bottom:5mm}
.hd .lbl{font-size:10px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:26px;font-weight:700;margin-top:2mm;text-transform:capitalize}
.hd .logo{height:24mm;width:auto;object-fit:contain;flex-shrink:0}
.riepilogo{display:flex;gap:3mm;margin-bottom:6mm}
.riepilogo .box{flex:1;border:1px solid #E4E0DA;border-radius:2mm;padding:3mm;text-align:center}
.riepilogo .box .n{font-size:22px;font-weight:700}
.riepilogo .box .l{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#6b6966;margin-top:1mm}
.reparto{margin-bottom:6mm;break-inside:avoid}
.reparto h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:#C06A10;border-bottom:1px solid #E4E0DA;padding-bottom:1.5mm;margin-bottom:2mm}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:2.5mm 3mm;border-bottom:1px solid #E4E0DA}
td{padding:3.5mm 3mm;border-bottom:1px solid #E4E0DA;font-size:13px}
.nome{font-weight:600}
.qty{width:22mm;text-align:right;font-weight:700;white-space:nowrap}
.note{width:100mm}
.ft{margin-top:8mm;font-size:9px;color:#A4A4A6;display:flex;justify-content:space-between;border-top:1px solid #E4E0DA;padding-top:3mm}
tr{break-inside:avoid}
@media print{@page{size:A3;margin:16mm}}
</style>
</head>
<body>
<div class="hd">
  <div>
    <div class="lbl">Rilevamento Ore — Presenze Giornaliere</div>
    <div class="title">${esc(fmtDataLunga(data))}</div>
  </div>
  ${logoUri ? `<img class="logo" src="${logoUri}" alt="Modar">` : ""}
</div>
<div class="riepilogo">
  <div class="box"><div class="n">${presenti.length}</div><div class="l">Operatori in forza oggi</div></div>
  <div class="box"><div class="n">${nInterni}</div><div class="l">Interni</div></div>
  <div class="box"><div class="n">${nEsterni}</div><div class="l">Esterni</div></div>
</div>
${sezioniHtml}
<div class="ft">
  <span>MES MODAR · RILEVAMENTO ORE</span>
  <span>Stampato il ${new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
</div>
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
        format: "A3",
        printBackground: true,
        margin: { top: "16mm", right: "16mm", bottom: "16mm", left: "16mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="presenze-giornaliere-${data}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ore/presenze-giornaliere]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
