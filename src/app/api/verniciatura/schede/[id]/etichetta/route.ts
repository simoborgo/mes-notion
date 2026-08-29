import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { getSchedaById } from "@/lib/schedeVerniciaturaRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Etichetta 76x51mm da attaccare dietro ai campioni fisici — stesso motore (Puppeteer + QR) e
// stesso formato "grande" già usato per l'etichetta scaffale Vernici
// (src/app/api/verniciatura/vernici/[id]/etichetta-scaffale). A differenza delle vernici, qui il
// QR codifica l'id Postgres (non codicePubblico/barcode): il barcode è intenzionalmente riusabile
// tra schede diverse con stesso cliente/vernici (vedi barcodeVerniciatura.ts), quindi da solo non
// identificherebbe in modo univoco QUESTA versione della scheda — l'id sì.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const scheda = await getSchedaById(id);

    const qrTarget = `${getPublicBaseUrl(req)}/verniciatura/schede/${scheda.id}`;
    const qrSvg = await QRCode.toString(qrTarget, {
      type: "svg", width: 200, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta ${esc(scheda.codicePubblico || scheda.id)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff}
.label{width:76mm;height:51mm;padding:3mm;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:3mm;margin-bottom:1.5mm}
.qrbox{line-height:0;flex-shrink:0}
.qrbox svg{display:block;width:20mm;height:20mm}
.top-info{flex:1;min-width:0}
.header{font-size:10.5px;font-weight:800;color:#1A1918;letter-spacing:.03em;text-transform:uppercase;margin-bottom:1.2mm}
.barcode-label{font-size:7.5px;font-weight:700;color:#6b6966;letter-spacing:.02em}
.barcode{font-size:14px;font-weight:800;color:#1A1918;line-height:1.15;margin-top:0.3mm;font-family:monospace}
.rows{border-top:0.35mm solid #ece9e4;padding-top:1.2mm;display:flex;flex-direction:column;gap:1mm}
.row{font-size:8px;color:#1A1918;line-height:1.2}
.row b{font-weight:700}
@media print{@page{size:76mm 51mm;margin:0}}
</style>
</head>
<body>
<div class="label">
  <div class="top">
    <div class="qrbox">${qrSvg}</div>
    <div class="top-info">
      <div class="header">Scheda di Verniciatura</div>
      <div class="barcode-label">BARCODE</div>
      <div class="barcode">${esc(scheda.codicePubblico || "—")}</div>
    </div>
  </div>
  <div class="rows">
    <div class="row"><b>NOME:</b> ${esc(scheda.nome || "—")}</div>
    <div class="row"><b>CLIENTE:</b> ${esc(scheda.cliente || "—")}</div>
    <div class="row"><b>ESSENZA:</b> ${esc(scheda.essenza || "—")}</div>
    <div class="row"><b>VERSIONE:</b> v${scheda.versione} — ${esc(scheda.stato)}</div>
    ${scheda.codiceCampioneMaterialista ? `<div class="row"><b>COD. MATERIAL LIST:</b> ${esc(scheda.codiceCampioneMaterialista)}</div>` : ""}
  </div>
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
        width: "76mm",
        height: "51mm",
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="etichetta-scheda-${(scheda.codicePubblico || scheda.id).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[verniciatura/schede/etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
