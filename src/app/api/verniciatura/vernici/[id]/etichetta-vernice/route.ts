import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { getVerniceById } from "@/lib/verniciRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// "Etichetta Vernice" — formato piccolo 76x25mm, da attaccare sul contenitore stesso. Sorella
// grande: "Etichetta Scaffale" (76x51mm, src/app/api/verniciatura/vernici/[id]/etichetta-scaffale),
// pensata per lo scaffale/ripiano di magazzino. Stesso motore (Puppeteer + QR) dell'etichetta
// Ferramenta (src/app/api/ferramenta/articoli/[id]/etichetta) — il QR codifica il Codice
// Inventario (non l'id Postgres, scelta esplicita dell'utente 2026-08-22 per poter generare le
// etichette in batch dal software Zebra senza passare dall'app) e punta alla pagina di scan
// Vernici, che sceglie da sola cosa mostrare (carico/scarico normale o conteggio, se c'è un
// inventario aperto che include questa vernice).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const vernice = await getVerniceById(id);
    if (!vernice.codiceInventario) {
      return NextResponse.json({ error: "Vernice senza Codice Inventario: impossibile generare l'etichetta (il QR ha bisogno di un codice univoco stampabile)." }, { status: 400 });
    }

    const qrTarget = `${getPublicBaseUrl(req)}/verniciatura/magazzino/vernici/${encodeURIComponent(vernice.codiceInventario)}`;
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
.label{width:76mm;height:25mm;padding:1.8mm;display:flex;align-items:center;gap:2mm}
.qrbox{line-height:0;flex-shrink:0}
.qrbox svg{display:block;width:20mm;height:20mm}
.info{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.5mm;overflow:hidden}
.header{font-size:9px;font-weight:800;color:#1A1918;letter-spacing:.03em;text-transform:uppercase;margin-bottom:0.3mm}
.row{font-size:6.3px;color:#1A1918;line-height:1.3}
.row b{font-weight:700}
@media print{@page{size:76mm 25mm;margin:0}}
</style>
</head>
<body>
<div class="label">
  <div class="qrbox">${qrSvg}</div>
  <div class="info">
    <div class="header">Magazzino Vernici</div>
    <div class="row"><b>COD. MODAR:</b> ${esc(vernice.codiceInventario || "—")}</div>
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
        height: "25mm",
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
    console.error("[verniciatura/vernici/etichetta-vernice]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
