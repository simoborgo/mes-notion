import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { getVerniceById } from "@/lib/verniciRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Stesso motore (Puppeteer + QR) dell'etichetta Ferramenta (src/app/api/ferramenta/articoli/[id]/etichetta),
// ma formato più grande (76x51mm invece di 76x25mm, richiesto esplicitamente dall'utente) — il QR
// punta alla pagina di scan Vernici, che sceglie da sola cosa mostrare (carico/scarico normale o
// conteggio, se c'è un inventario aperto che include questa vernice).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const vernice = await getVerniceById(id);

    const qrTarget = `${getPublicBaseUrl(req)}/verniciatura/magazzino/vernici/${id}`;
    const qrSvg = await QRCode.toString(qrTarget, {
      type: "svg", width: 200, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta ${esc(vernice.codiceInventario || id)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff}
.label{width:76mm;height:51mm;padding:3mm;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:3mm;margin-bottom:2mm}
.qrbox{line-height:0;flex-shrink:0}
.qrbox svg{display:block;width:22mm;height:22mm}
.top-info{flex:1;min-width:0}
.header{font-size:10.5px;font-weight:800;color:#1A1918;letter-spacing:.03em;text-transform:uppercase;margin-bottom:1.2mm}
.cod-modar-label{font-size:7.5px;font-weight:700;color:#6b6966;letter-spacing:.02em}
.cod-modar{font-size:15px;font-weight:800;color:#1A1918;line-height:1.15;margin-top:0.3mm}
.rows{border-top:0.35mm solid #ece9e4;padding-top:1.8mm;display:flex;flex-direction:column;gap:1.6mm}
.row{font-size:9px;color:#1A1918;line-height:1.25}
.row b{font-weight:700}
@media print{@page{size:76mm 51mm;margin:0}}
</style>
</head>
<body>
<div class="label">
  <div class="top">
    <div class="qrbox">${qrSvg}</div>
    <div class="top-info">
      <div class="header">Magazzino Vernici</div>
      <div class="cod-modar-label">COD. MODAR</div>
      <div class="cod-modar">${esc(vernice.codiceInventario || "—")}</div>
    </div>
  </div>
  <div class="rows">
    <div class="row"><b>COD. COLORE:</b> ${esc(vernice.coloreCodice || "—")}</div>
    <div class="row"><b>COD. TINTOMETRO:</b> ${esc(vernice.codiceTintometro || "—")} - Fornitore: ${esc(vernice.fornitore || "—")}</div>
    <div class="row"><b>TIPO:</b> ${esc(vernice.tipologia || "—")}</div>
    <div class="row"><b>RIF. CLIENTE:</b> ${esc(vernice.clienteRiferimento || "—")}</div>
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
          "Content-Disposition": `inline; filename="etichetta-vernice-${(vernice.codiceInventario || id).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[verniciatura/vernici/etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
