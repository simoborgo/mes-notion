import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getKitCommessaById, getRigheByKit } from "@/lib/kitCommessaRepository";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";
import { estraiNumeroCommessa } from "@/lib/attivitaSpecialiCommessa";

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

// Stessa logica/stile di kit/[schedaId]/pdf/route.ts (Kit ODP) — checklist di carta per il
// magazziniere: la stampa da sola non spunta nulla, resta solo un supporto per la raccolta fisica
// in reparto, poi si torna in postazione e si spunta a video.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const [kit, righe] = await Promise.all([getKitCommessaById(id), getRigheByKit(id)]);
    if (!kit) return NextResponse.json({ error: "Kit Commessa non trovato" }, { status: 404 });

    const logoUri = getLogoDataUri();
    const righeHtml = righe.map(r => `
      <tr>
        <td class="chk"><span class="box"></span></td>
        <td>${r.codiceOs1 ? esc(r.codiceOs1) : ""}</td>
        <td>${esc(r.descrizione)}</td>
        <td class="qty">${r.quantita}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Kit Commessa ${esc(kit.commessaLabel || kit.commessaId)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:6mm;border-bottom:2px solid #1A1918;margin-bottom:6mm}
.hd .lbl{font-size:10px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:28px;font-weight:700;margin-top:2mm}
.hd .sub{font-size:14px;color:#6b6966;margin-top:1mm}
.hd .logo{height:28mm;width:auto;object-fit:contain;flex-shrink:0}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#A4A4A6;padding:3mm;border-bottom:1px solid #E4E0DA}
td{padding:4mm 3mm;border-bottom:1px solid #E4E0DA;font-size:14px}
.chk{width:12mm}
.box{display:inline-block;width:6mm;height:6mm;border:2px solid #1A1918;border-radius:2px}
.qty{text-align:right;font-weight:700}
.ft{margin-top:10mm;font-size:10px;color:#A4A4A6;display:flex;justify-content:space-between}
@media print{@page{size:A4;margin:15mm}}
</style>
</head>
<body>
<div class="hd">
  <div>
    <div class="lbl">Kit Commessa — Lista di prelievo</div>
    <div class="title">${esc(kit.commessaLabel || kit.commessaId)}</div>
  </div>
  ${logoUri ? `<img class="logo" src="${logoUri}" alt="Modar">` : ""}
</div>
<table>
  <thead><tr><th></th><th>Codice</th><th>Descrizione</th><th class="qty">Quantità</th></tr></thead>
  <tbody>${righeHtml}</tbody>
</table>
<div class="ft">
  <span>MES MODAR · KIT COMMESSA</span>
  <span>Preparato da: ______________  Data: ______________</span>
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
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });
      // Il nome file va nell'header Content-Disposition, che deve restare ASCII/Latin1 —
      // commessaLabel contiene spesso un em-dash e nomi cliente non ASCII, quindi si usa solo il
      // numero commessa (sempre semplice) invece dell'etichetta completa.
      const nomeFileSicuro = estraiNumeroCommessa(kit.commessaLabel) || kit.id;
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="kit-commessa-${nomeFileSicuro}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[kit-commessa/pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
