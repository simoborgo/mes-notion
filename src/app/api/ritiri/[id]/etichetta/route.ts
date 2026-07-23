import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { getRitiroById, getSchedaById, getCommessaById } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtData(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  const dateStr = dt.toLocaleDateString("it-IT", {
    weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
  });
  if (d.includes("T")) {
    const h = dt.getHours(), m = dt.getMinutes();
    if (h !== 0 || m !== 0)
      return `${dateStr} · ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  return dateStr;
}

// Logo Modar letto da /public e convertito in data URI (evita dipendenze URL in Puppeteer)
function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
    const pjpg = path.join(process.cwd(), "public", "modar-logo.jpg");
    if (fs.existsSync(pjpg)) return `data:image/jpeg;base64,${fs.readFileSync(pjpg).toString("base64")}`;
  } catch { /* skip */ }
  return "";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const ritiro = await getRitiroById(id);

    // Fetch scheda / commessa
    let schedaOdp = ritiro.numeroOrdine;
    let nScheda = "";
    let clienteInfo = "";
    let clienteLocalita = "";

    if (ritiro.numeroOrdineId) {
      try {
        const scheda = await getSchedaById(ritiro.numeroOrdineId);
        schedaOdp = scheda.odp || ritiro.numeroOrdine;
        nScheda = scheda.numeroScheda || "";
        clienteInfo = scheda.clienteInfo || "";
        if (!clienteInfo && scheda.parentId) {
          const parent = await getSchedaById(scheda.parentId);
          clienteInfo = parent.clienteInfo || "";
        }
      } catch { /* fallback */ }
    } else if (!schedaOdp && ritiro.commessaId) {
      try {
        const commessa = await getCommessaById(ritiro.commessaId);
        schedaOdp = commessa.numeroCommessa;
        clienteInfo = commessa.cliente || "";
        clienteLocalita = commessa.localita || "";
      } catch { /* fallback */ }
    } else if (!schedaOdp && ritiro.commessaNr) {
      schedaOdp = ritiro.commessaNr;
    }

    const isRitiro = ritiro.tipoMovimento === "Ritiro";
    const badgeClass = isRitiro ? "ritiro" : "consegna";
    const badgeText = isRitiro ? "&#8592; RICEVUTO DA FORNITORE" : "IN USCITA &#8594; FORNITORE";
    const tipoLabel = isRitiro ? "RITIRO" : "CONSEGNA";
    const idShort = id.replace(/-/g, "").slice(0, 8).toUpperCase();

    // QR code come SVG inline
    const qrSvg = await QRCode.toString(ritiro.notionUrl, {
      type: "svg", width: 120, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const logoUri = getLogoDataUri();
    const codeStr = esc(schedaOdp || "—");
    const clienteDisplay = [clienteInfo, clienteLocalita].filter(Boolean).join(" — ");

    // Righe dati extra (oltre data trasporto)
    const extraRows: string[] = [];

    if (ritiro.nrCollo != null || ritiro.totColli != null) {
      const colloVal = `${ritiro.nrCollo ?? "—"} / ${ritiro.totColli ?? "—"}`;
      extraRows.push(`<div class="row"><div class="lbl">Collo</div><div class="val">${esc(colloVal)}</div></div>`);
    }
    if (clienteDisplay) {
      extraRows.push(`<div class="row"><div class="lbl">Cliente</div><div class="val">${esc(clienteDisplay)}</div></div>`);
    }
    if (ritiro.fornitore) {
      extraRows.push(`<div class="row"><div class="lbl">Fornitore</div><div class="val">${esc(ritiro.fornitore)}</div></div>`);
    }
    const desc = ritiro.causale || ritiro.descrizioneMerce || "";
    if (desc) {
      extraRows.push(`<div class="row"><div class="lbl">Descrizione</div><div class="val">${esc(desc)}</div></div>`);
    }

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta ${codeStr}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff;display:flex;justify-content:center;padding:0}
.page{font-family:'Jost',sans-serif;background:#fff;color:#1A1918;display:flex;flex-direction:column;width:100mm;min-height:148mm}
.strip{height:7mm;flex-shrink:0;background:#8B7B6B}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:5mm 6mm 0}
.logo img{height:52px;width:auto;object-fit:contain}
.logo-fallback{font-size:22px;font-weight:700;color:#1A1918;letter-spacing:-.02em;line-height:52px}
.dir{display:flex;align-items:center;gap:6px;padding:6px 10px;border-radius:3px;font-weight:700;font-size:10.5px;letter-spacing:.1em;margin-top:10px;white-space:nowrap}
.dir.ritiro{background:#3F8F5B;color:#fff}
.dir.consegna{background:#7A2E3A;color:#fff}
.lbl{font-size:7.5px;font-weight:600;letter-spacing:.2em;color:#A4A4A6;text-transform:uppercase}
.code-section{padding:5mm 6mm 0}
.code{font-family:'Jost',sans-serif;font-weight:700;font-size:46px;line-height:.95;color:#1A1918;letter-spacing:-.01em;margin-top:1.5mm}
.sub{font-size:14px;font-weight:600;color:#374151;margin-top:2mm;line-height:1.2}
.rule{border-top:1.5px solid #1A1918;margin:4mm 6mm 0}
.row{padding:2.5mm 6mm;border-bottom:1px solid #E4E0DA}
.row .lbl{margin-bottom:1.5px}
.row .val{font-size:16px;font-weight:500;color:#1A1918;line-height:1.25}
.qrwrap{display:flex;align-items:center;gap:10px;padding:3mm 6mm;margin-top:auto}
.qrbox{border:1px solid #E4E0DA;border-radius:4px;padding:4px;flex-shrink:0;line-height:0}
.qrbox svg{display:block}
.qr-apri{font-size:14px;font-weight:600;color:#1A1918}
.qr-rif{font-size:9.5px;color:#A4A4A6;margin-top:2px}
.ft{display:flex;justify-content:space-between;align-items:center;padding:2.5mm 6mm 3.5mm;border-top:1px solid #E4E0DA;margin-top:auto}
.ft span{font-size:8px;color:#A4A4A6;letter-spacing:.05em}
@media print{@page{size:A4;margin:12mm}body{padding:0}}
</style>
</head>
<body>
<div class="page">
  <div class="strip"></div>
  <div class="hd">
    <div class="logo">
      ${logoUri
        ? `<img src="${logoUri}" alt="Modar">`
        : `<span class="logo-fallback">MODAR</span>`}
    </div>
    <div class="dir ${badgeClass}">${badgeText}</div>
  </div>
  <div class="code-section">
    <div class="lbl">Scheda / Commessa</div>
    <div class="code">${codeStr}</div>
    ${nScheda ? `<div class="sub">${esc(nScheda)}</div>` : ""}
  </div>
  <div class="rule"></div>
  <div class="row">
    <div class="lbl">Data Trasporto Previsto</div>
    <div class="val">${esc(fmtData(ritiro.dataTrasporto))}</div>
  </div>
  ${extraRows.join("\n  ")}
  <div class="qrwrap">
    <div class="qrbox">${qrSvg}</div>
    <div>
      <div class="qr-apri">Apri Scheda</div>
      <div class="qr-rif">Rif. ${codeStr}</div>
    </div>
  </div>
  <div class="ft">
    <span>MES MODAR · ${tipoLabel}</span>
    <span>ID ${idShort}</span>
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
      // Attende caricamento font Google Fonts
      await browserPage.evaluateHandle("document.fonts.ready");
      const pdfBuffer = await browserPage.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="etichetta-${(schedaOdp || id).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
