import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { getArticoloFerramentaById } from "@/lib/notion";
import { getSessionFromRequest, FERRAMENTA_ROLES } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !FERRAMENTA_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { id } = await params;
    const articolo = await getArticoloFerramentaById(id);

    if (articolo.metodoGestione !== "Kanban") {
      return NextResponse.json(
        { error: "Articolo non gestito a Kanban: nessuna quantità di riordino da stampare" },
        { status: 400 }
      );
    }

    const qrTarget = `${req.nextUrl.origin}/riordino/${id}`;
    const qrSvg = await QRCode.toString(qrTarget, {
      type: "svg", width: 200, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const stampatoIl = new Date().toLocaleString("it-IT", {
      day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta riordino ${esc(articolo.codiceOs1)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff}
.label{width:100mm;height:60mm;padding:5mm;display:flex;flex-direction:column;justify-content:space-between}
.hd{font-size:9px;font-weight:600;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.desc{font-size:16px;font-weight:700;color:#1A1918;line-height:1.2;margin-top:2mm}
.codice{font-size:13px;font-weight:600;color:#6b6966;margin-top:1mm}
.body{display:flex;align-items:center;gap:6mm;margin-top:3mm}
.qrbox{border:1px solid #E4E0DA;border-radius:4px;padding:3px;line-height:0;flex-shrink:0}
.qrbox svg{display:block;width:80px;height:80px}
.info{font-size:11px;color:#6b6966}
.info div{margin-bottom:2px}
.qty{font-size:15px;font-weight:700;color:#1A1918}
.ft{font-size:9px;font-weight:600;color:#1A1918;text-align:right}
@media print{@page{size:100mm 60mm;margin:0}}
</style>
</head>
<body>
<div class="label">
  <div>
    <div class="hd">Riordino Kanban &middot; Ferramenta MES Modar</div>
    <div class="desc">${esc(articolo.descrizione || "—")}</div>
    <div class="codice">${esc(articolo.codiceOs1 || "—")}</div>
  </div>
  <div class="body">
    <div class="qrbox">${qrSvg}</div>
    <div class="info">
      <div>Cod. Fornitore: ${esc(articolo.fornitoreNomeOs1 || "—")}</div>
      <div class="qty">Qtà da riordinare: ${articolo.quantitaStandardVaschetta ?? "—"}</div>
      <div>Scansiona per la scheda di riordino</div>
    </div>
  </div>
  <div class="ft">Stampato il ${esc(stampatoIl)}</div>
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
        width: "100mm",
        height: "60mm",
        printBackground: true,
        margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="etichetta-riordino-${(articolo.codiceOs1 || id).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ferramenta/etichetta-riordino]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
