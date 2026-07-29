import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { getArticoloFerramentaById } from "@/lib/articoliFerramentaRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const articolo = await getArticoloFerramentaById(id);

    const qrTarget = `${getPublicBaseUrl(req)}/ferramenta/scarico/${id}`;
    const qrSvg = await QRCode.toString(qrTarget, {
      type: "svg", width: 200, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta ${esc(articolo.codiceOs1)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff}
.label{width:76mm;height:25mm;padding:2mm;display:flex;align-items:center;gap:2.5mm}
.qrbox{line-height:0;flex-shrink:0}
.qrbox svg{display:block;width:20mm;height:20mm}
.info{flex:1;min-width:0;display:flex;flex-direction:column;gap:0.6mm;overflow:hidden}
.desc{font-size:9px;font-weight:700;color:#1A1918;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.codice{font-size:8px;font-weight:600;color:#1A1918}
.fornitore{font-size:7px;color:#6b6966;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.um{font-size:7px;color:#A4A4A6}
@media print{@page{size:76mm 25mm;margin:0}}
</style>
</head>
<body>
<div class="label">
  <div class="qrbox">${qrSvg}</div>
  <div class="info">
    <div class="desc">${esc(articolo.descrizione || "—")}</div>
    <div class="codice">${esc(articolo.codiceOs1 || "—")}</div>
    <div class="fornitore">${esc(articolo.fornitoreNome || "—")}</div>
    <div class="um">UM: ${esc(articolo.unitaMisura || "—")}</div>
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
          "Content-Disposition": `inline; filename="etichetta-ferramenta-${(articolo.codiceOs1 || id).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ferramenta/etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
