import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { getRitiroById, getSchedaById, getCommessaById } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";

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
    let hasSchedaPdf = false;

    if (ritiro.numeroOrdineId) {
      try {
        const scheda = await getSchedaById(ritiro.numeroOrdineId);
        schedaOdp = scheda.odp || ritiro.numeroOrdine;
        nScheda = scheda.numeroScheda || "";
        clienteInfo = scheda.clienteInfo || "";
        hasSchedaPdf = (scheda.pdfAllegato?.length ?? 0) > 0;
        // Le rilavorazioni create dallo shortcut NC non hanno un proprio PDF Allegato:
        // ricade sul PDF della scheda padre (il disegno tecnico originale)
        if ((!clienteInfo || !hasSchedaPdf) && scheda.parentId) {
          const parent = await getSchedaById(scheda.parentId);
          if (!clienteInfo) clienteInfo = parent.clienteInfo || "";
          if (!hasSchedaPdf) hasSchedaPdf = (parent.pdfAllegato?.length ?? 0) > 0;
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

    // QR: punta al PDF scheda (proxy MES, sempre valido) se disponibile,
    // altrimenti fallback alla pagina Notion (utile per movimenti solo-Commessa)
    const qrTarget = hasSchedaPdf
      ? `${getPublicBaseUrl(req)}/api/ritiri/${id}/scheda-pdf`
      : ritiro.notionUrl;
    const qrCaption = hasSchedaPdf ? "Apri PDF Scheda" : "Apri Scheda";

    const qrSvg = await QRCode.toString(qrTarget, {
      type: "svg", width: 120, margin: 1,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    // Secondo QR — Controllo Qualità: solo sui Ritiri (materiale che rientra)
    // collegati a una Rilavorazione, punta alla pagina mobile "Segna Rientrata"
    const showQualitaQR = isRitiro && !!ritiro.rilavorazioneId;
    let qualitaQrSvg = "";
    if (showQualitaQR) {
      const qualitaTarget = `${getPublicBaseUrl(req)}/rientro-qualita/${ritiro.rilavorazioneId}`;
      qualitaQrSvg = await QRCode.toString(qualitaTarget, {
        type: "svg", width: 120, margin: 1,
        color: { dark: "#991B1B", light: "#ffffff" },
      });
    }

    const logoUri = getLogoDataUri();
    const codeStr = esc(schedaOdp || "—");
    const clienteDisplay = [clienteInfo, clienteLocalita].filter(Boolean).join(" — ");

    // Righe dati extra (Cliente, Fornitore, Descrizione ingrandite del 20%)
    const extraRows: string[] = [];

    if (ritiro.nrCollo != null || ritiro.totColli != null) {
      const colloVal = `${ritiro.nrCollo ?? "—"} / ${ritiro.totColli ?? "—"}`;
      extraRows.push(`<div class="row"><div class="lbl">Collo</div><div class="val">${esc(colloVal)}</div></div>`);
    }
    if (clienteDisplay) {
      extraRows.push(`<div class="row"><div class="lbl">Cliente</div><div class="val val-lg">${esc(clienteDisplay)}</div></div>`);
    }
    if (ritiro.fornitore) {
      extraRows.push(`<div class="row"><div class="lbl">Fornitore</div><div class="val val-lg">${esc(ritiro.fornitore)}</div></div>`);
    }
    const desc = ritiro.causale || ritiro.descrizioneMerce || "";
    if (desc) {
      extraRows.push(`<div class="row"><div class="lbl">Descrizione</div><div class="val val-lg">${esc(desc)}</div></div>`);
    }

    // Badge Urgente / NC (+ Rilavorazione se collegata) — mostrati sopra al QR
    const badges: string[] = [];
    if (ritiro.urgenza) {
      badges.push(`<span class="badge-pill urgente">⚠ URGENTE</span>`);
    }
    if (ritiro.nc) {
      badges.push(
        ritiro.rilavorazioneId
          ? `<span class="badge-pill nc">⛔ NC — RILAVORAZIONE</span>`
          : `<span class="badge-pill nc">⛔ NON CONFORMITÀ</span>`
      );
    }
    // Se presenti, i badge si ancorano insieme al blocco QR in fondo pagina
    // (spostano loro il margin-top:auto, altrimenti resta sul QR come prima)
    const badgesHtml = badges.length > 0
      ? `<div class="badges" style="margin-top:auto">${badges.join("")}</div>`
      : "";
    const qrwrapStyle = badgesHtml ? "" : ` style="margin-top:auto"`;

    // Titolo Scheda (hero) + ODP come riferimento piccolo sotto
    const codeSectionHtml = nScheda
      ? `<div class="code">${esc(nScheda)}</div><div class="sub">${codeStr}</div>`
      : `<div class="code">${codeStr}</div>`;

    // Foto allegate: thumbnail a fianco del QR, altezza fissa indipendente dall'orientamento.
    // Se c'è il QR Controllo Qualità, ha priorità sulle foto (spazio limitato in riga)
    const fotoList = (ritiro.foto || []).slice(0, 2);
    const fotoColHtml = fotoList.length > 0
      ? `<div class="foto-col">
          ${fotoList.map(f => `<img src="${esc(f.url)}" alt="">`).join("\n          ")}
        </div>`
      : "";
    const qualitaColHtml = showQualitaQR
      ? `<div class="qr-col">
          <div class="qrbox qrbox-qualita">${qualitaQrSvg}</div>
          <div class="qr-cap">
            <div class="qr-apri" style="color:#991B1B">Controllo Qualità</div>
            <div class="qr-rif">Segna rientrata</div>
          </div>
        </div>`
      : "";
    const secondColHtml = showQualitaQR ? qualitaColHtml : fotoColHtml;

    // Nota per il fornitore: chiede di restituire l'etichetta col rientro (solo Consegna)
    const returnNoteHtml = !isRitiro
      ? `<div class="return-note">Si prega di restituire<br>questa etichetta al rientro</div>`
      : "";

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Etichetta ${codeStr}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff;margin:0;padding:0;width:100%}
.page{font-family:'Jost',sans-serif;background:#fff;color:#1A1918;display:flex;flex-direction:column;width:100%;min-height:calc(297mm - 24mm)}
.strip{height:10mm;flex-shrink:0;background:#8B7B6B}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:7mm 10mm 0}
.logo img{height:140px;width:auto;object-fit:contain}
.logo-fallback{font-size:64px;font-weight:700;color:#1A1918;letter-spacing:-.02em}
.hd-right{display:flex;flex-direction:column;align-items:flex-end;gap:4mm}
.dir{display:flex;align-items:center;padding:8px 16px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:.12em;white-space:nowrap}
.dir.ritiro{background:#3F8F5B;color:#fff}
.dir.consegna{background:#7A2E3A;color:#fff}
.data-mini{text-align:right}
.data-mini .lbl{margin-bottom:2px}
.data-mini .val{font-size:15px;font-weight:600;color:#1A1918;white-space:nowrap}
.return-note{font-size:8px;color:#92400E;text-align:right;font-style:italic;line-height:1.3}
.lbl{font-size:9px;font-weight:600;letter-spacing:.2em;color:#A4A4A6;text-transform:uppercase}
.code-section{padding:7mm 10mm 0}
.code{font-family:'Jost',sans-serif;font-weight:700;font-size:48px;line-height:1.08;color:#1A1918;letter-spacing:-.01em}
.sub{font-size:48px;font-weight:700;color:#1A1918;margin-top:3mm;line-height:1.08;letter-spacing:-.01em}
.rule{border-top:2px solid #1A1918;margin:6mm 10mm 0}
.row{padding:4mm 10mm;border-bottom:1px solid #E4E0DA}
.row .lbl{margin-bottom:2px}
.row .val{font-size:20px;font-weight:500;color:#1A1918;line-height:1.3}
.row .val-lg{font-size:24px}
.badges{display:flex;flex-wrap:wrap;gap:8px;padding:4mm 10mm 0}
.badge-pill{display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:20px;font-weight:700;font-size:13px;letter-spacing:.06em}
.badge-pill.urgente{background:#FEF3C7;color:#92400E;border:1px solid #FCD34D}
.badge-pill.nc{background:#FEE2E2;color:#991B1B;border:1px solid #FCA5A5}
.qrwrap{display:flex;align-items:stretch;gap:16px;padding:6mm 10mm}
.qr-col{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 auto}
.qrbox{border:1px solid #E4E0DA;border-radius:6px;padding:6px;flex-shrink:0;line-height:0}
.qrbox-qualita{border-color:#FCA5A5}
.qrbox svg{display:block;width:100px;height:100px}
.qr-cap{text-align:center}
.qr-apri{font-size:14px;font-weight:600;color:#1A1918}
.qr-rif{font-size:11px;color:#A4A4A6;margin-top:2px}
.foto-col{flex:1;display:flex;gap:6px;height:140px;max-height:140px;overflow:hidden}
.foto-col img{flex:1 1 0;min-width:0;width:100%;height:140px;max-height:140px;object-fit:contain;background:#F8F7F4;display:block;border-radius:6px;border:1px solid #E4E0DA}
.ft{display:flex;justify-content:space-between;align-items:center;padding:4mm 10mm 5mm;border-top:1px solid #E4E0DA;margin-top:auto}
.ft span{font-size:10px;color:#A4A4A6;letter-spacing:.06em}
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
    <div class="hd-right">
      <div class="dir ${badgeClass}">${badgeText}</div>
      <div class="data-mini">
        <div class="lbl">Data Trasporto Previsto</div>
        <div class="val">${esc(fmtData(ritiro.dataTrasporto))}</div>
      </div>
      ${returnNoteHtml}
    </div>
  </div>
  <div class="code-section">
    <div class="lbl">Scheda / Commessa</div>
    ${codeSectionHtml}
  </div>
  <div class="rule"></div>
  ${extraRows.join("\n  ")}
  ${badgesHtml}
  <div class="qrwrap"${qrwrapStyle}>
    <div class="qr-col">
      <div class="qrbox">${qrSvg}</div>
      <div class="qr-cap">
        <div class="qr-apri">${qrCaption}</div>
        <div class="qr-rif">Rif. ${codeStr}</div>
      </div>
    </div>
    ${secondColHtml}
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
