import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { getSchedaById, getPrimoPdfAllegatoDriveFileId } from "@/lib/schedeRepository";
import { getDistintaKitByOdp } from "@/lib/kitFerramentaRepository";
import { downloadDriveFile } from "@/lib/googleDriveSchede";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ schedaId: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { schedaId } = await params;
    const [scheda, righe] = await Promise.all([getSchedaById(schedaId), getDistintaKitByOdp(schedaId)]);

    const righeHtml = righe.map(r => `
      <tr>
        <td class="chk"><span class="box"></span></td>
        <td>${esc(r.articoloCodiceOs1)}</td>
        <td>${esc(r.articoloDescrizione)}</td>
        <td class="qty">${r.quantita}</td>
      </tr>`).join("");

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Kit Ferramenta ${esc(scheda.odp)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.hd{padding-bottom:6mm;border-bottom:2px solid #1A1918;margin-bottom:6mm}
.hd .lbl{font-size:10px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:28px;font-weight:700;margin-top:2mm}
.hd .sub{font-size:14px;color:#6b6966;margin-top:1mm}
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
  <div class="lbl">Kit Ferramenta — Distinta di preparazione</div>
  <div class="title">${esc(scheda.numeroScheda || scheda.odp)}</div>
  <div class="sub">${esc(scheda.odp)}${scheda.clienteInfo ? " — " + esc(scheda.clienteInfo) : ""}</div>
</div>
<table>
  <thead><tr><th></th><th>Codice</th><th>Descrizione</th><th class="qty">Quantità</th></tr></thead>
  <tbody>${righeHtml}</tbody>
</table>
<div class="ft">
  <span>MES MODAR · KIT FERRAMENTA</span>
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

      // Seconda pagina: la prima pagina (copertina/disegno) del PDF Allegato della Scheda, se
      // presente — così chi prepara il kit ha subito sotto mano anche il riferimento visivo del
      // pezzo, senza dover aprire la Scheda a parte. Best-effort: se manca o il download fallisce,
      // si stampa comunque solo la distinta, mai un errore che blocca la stampa.
      let outputBuffer = Buffer.from(pdfBuffer);
      try {
        const driveFileId = await getPrimoPdfAllegatoDriveFileId(schedaId);
        if (driveFileId) {
          const schedaPdfBuffer = await downloadDriveFile(driveFileId);
          const schedaPdfDoc = await PDFDocument.load(schedaPdfBuffer);
          if (schedaPdfDoc.getPageCount() > 0) {
            const distintaDoc = await PDFDocument.load(outputBuffer);
            const [copertina] = await distintaDoc.copyPages(schedaPdfDoc, [0]);
            distintaDoc.addPage(copertina);
            outputBuffer = Buffer.from(await distintaDoc.save());
          }
        }
      } catch (e) {
        console.error("[kit/pdf] copertina Scheda non allegata:", e instanceof Error ? e.message : String(e));
      }

      return new NextResponse(outputBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="kit-ferramenta-${(scheda.odp || schedaId).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[kit/pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
