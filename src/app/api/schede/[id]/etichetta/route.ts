import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { getSchedaById } from "@/lib/schedeRepository";
import { getOrCreateQrCodice } from "@/lib/schedaQrRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Etichetta 76x51mm con il QR della scheda di produzione — stesso motore (Puppeteer + qrcode) e
// formato dell'etichetta della Scheda di Verniciatura (verniciatura/schede/[id]/etichetta). Il QR
// punta a /q/<codice> con un codice breve opaco (vedi schedaQrRepository), non all'id interno né
// all'ODP: le sottoschede condividono l'ODP del padre. Il codice si crea alla prima stampa, così le
// schede già importate non vengono toccate finché qualcuno non chiede la loro etichetta.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const scheda = await getSchedaById(id);
    const codice = await getOrCreateQrCodice(scheda.id);

    const qrSvg = await QRCode.toString(`${getPublicBaseUrl(req)}/q/${codice}`, {
      type: "svg", width: 240, margin: 1, errorCorrectionLevel: "M",
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const qta = scheda.quantita != null ? `${scheda.quantita}` : "—";
    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta ${esc(scheda.odp)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff}
.label{width:76mm;height:51mm;padding:3mm;display:flex;gap:3mm}
.qrcol{flex-shrink:0;display:flex;flex-direction:column;align-items:center;width:27mm}
.qrbox{line-height:0}
.qrbox svg{display:block;width:27mm;height:27mm}
.codice{margin-top:1mm;font-family:monospace;font-size:9px;font-weight:700;color:#1A1918;letter-spacing:.08em}
.tipo{margin-top:auto;font-size:7px;font-weight:700;color:#6b6966;text-transform:uppercase;letter-spacing:.04em}
.info{flex:1;min-width:0;display:flex;flex-direction:column;gap:1.1mm}
.odp{font-size:16px;font-weight:800;color:#1A1918;line-height:1;letter-spacing:.01em}
.row{font-size:8px;color:#1A1918;line-height:1.2;overflow:hidden}
.row b{font-weight:700}
.descr{font-size:9px;font-weight:600;line-height:1.2;max-height:11mm;overflow:hidden;border-top:0.35mm solid #ece9e4;padding-top:1.2mm}
@media print{@page{size:76mm 51mm;margin:0}}
</style>
</head>
<body>
<div class="label">
  <div class="qrcol">
    <div class="qrbox">${qrSvg}</div>
    <div class="codice">${esc(codice)}</div>
    <div class="tipo">${esc(scheda.tipologia)}</div>
  </div>
  <div class="info">
    <div class="odp">${esc(scheda.odp || "—")}</div>
    <div class="row"><b>COMMESSA:</b> ${esc(scheda.commessaNr || "—")}</div>
    <div class="row"><b>ARTICOLO:</b> ${esc(scheda.codiceArticolo || "—")}</div>
    <div class="row"><b>POS.:</b> ${esc(scheda.posizione || "—")} &nbsp; <b>Q.TÀ:</b> ${esc(qta)}</div>
    ${scheda.fornitore ? `<div class="row"><b>FORN.:</b> ${esc(scheda.fornitore)}</div>` : ""}
    <div class="descr">${esc(scheda.numeroScheda || "")}</div>
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
          "Content-Disposition": `inline; filename="etichetta-${(scheda.odp || scheda.id).replace(/[^\w.-]/g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[schede/etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
