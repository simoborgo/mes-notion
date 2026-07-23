import { NextRequest, NextResponse } from "next/server";
import { getRitiroById, getSchedaById, getCommessaById } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtData(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  const dateStr = dt.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
  if (d.includes("T")) {
    const h = dt.getHours(), m = dt.getMinutes();
    if (h !== 0 || m !== 0) return `${dateStr} · ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
  }
  return dateStr;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const ritiro = await getRitiroById(id);

    // Fetch scheda / commessa per ODP, nScheda, clienteInfo
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
    const badgeText = isRitiro ? "← RICEVUTO DA FORNITORE" : "IN USCITA → FORNITORE";
    const tipoLabel = isRitiro ? "RITIRO" : "CONSEGNA";

    const codeStr = esc(schedaOdp || "—");
    const nSchedaStr = nScheda ? esc(nScheda) : "";
    const clienteStr = clienteInfo ? esc(clienteInfo) : "";
    const localitaStr = clienteLocalita ? esc(clienteLocalita) : "";
    const fornitoreStr = ritiro.fornitore ? esc(ritiro.fornitore) : "";
    const descStr = esc(ritiro.causale || ritiro.descrizioneMerce || "");
    const dataStr = esc(fmtData(ritiro.dataTrasporto));
    const idShort = ritiro.id.replace(/-/g, "").slice(0, 8).toUpperCase();
    const notionUrl = esc(ritiro.notionUrl);

    const colloStr = (ritiro.nrCollo != null || ritiro.totColli != null)
      ? `${ritiro.nrCollo ?? "—"} / ${ritiro.totColli ?? "—"}`
      : "";

    // Rows HTML
    const rows: string[] = [];

    rows.push(`<div class="row">
      <div class="lbl">Data Trasporto Previsto</div>
      <div class="val">${dataStr}</div>
    </div>`);

    if (colloStr) {
      rows.push(`<div class="row">
        <div class="lbl">Collo</div>
        <div class="val">${esc(colloStr)}</div>
      </div>`);
    }

    const clienteDisplay = [clienteStr, localitaStr].filter(Boolean).join(" — ");
    if (clienteDisplay) {
      rows.push(`<div class="row">
        <div class="lbl">Cliente</div>
        <div class="val">${clienteDisplay}</div>
      </div>`);
    }

    if (fornitoreStr) {
      rows.push(`<div class="row">
        <div class="lbl">Fornitore</div>
        <div class="val">${fornitoreStr}</div>
      </div>`);
    }

    if (descStr) {
      rows.push(`<div class="row">
        <div class="lbl">Descrizione</div>
        <div class="val">${descStr}</div>
      </div>`);
    }

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Etichetta ${codeStr} · Modar</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:'Jost',sans-serif;background:#EDE9E3;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:24px;gap:16px}

.print-btn{
  display:inline-flex;align-items:center;gap:8px;
  padding:10px 20px;border-radius:6px;border:none;cursor:pointer;
  font-family:'Jost',sans-serif;font-size:14px;font-weight:600;
  background:#1A1918;color:#fff;transition:opacity .15s;
}
.print-btn:hover{opacity:.85}

.page{
  font-family:'Jost',sans-serif;
  background:#fff;
  width:100mm;
  display:flex;flex-direction:column;
  box-shadow:0 2px 16px rgba(0,0,0,.13);
}

.strip{height:7mm;background:#8B7B6B;flex-shrink:0}

.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:5mm 6mm 0}
.logo img{height:56px;width:auto;object-fit:contain}
.badge{
  display:flex;align-items:center;
  padding:6px 10px;border-radius:3px;
  font-weight:700;font-size:10px;letter-spacing:.1em;
  margin-top:10px;white-space:nowrap;
}
.badge.ritiro{background:#3F8F5B;color:#fff}
.badge.consegna{background:#7A2E3A;color:#fff}

.code-section{padding:5mm 6mm 0}
.lbl{font-size:8px;font-weight:600;letter-spacing:.22em;color:#A4A4A6;text-transform:uppercase}
.code{font-weight:700;font-size:46px;line-height:.95;color:#1A1918;letter-spacing:-.01em;margin-top:1mm}
.sub{font-size:15px;font-weight:600;color:#374151;margin-top:2mm;line-height:1.2}

.rule{border-top:1.5px solid #1A1918;margin:4mm 6mm 0}

.row{padding:2.8mm 6mm;border-bottom:1px solid #E4E0DA}
.row .lbl{margin-bottom:2px}
.row .val{font-size:17px;font-weight:500;color:#1A1918;line-height:1.25}

.qrwrap{display:flex;align-items:center;gap:10px;padding:3mm 6mm;margin-top:auto}
.qrbox{border:1px solid #E4E0DA;border-radius:4px;padding:5px;flex-shrink:0}
.qr-label{font-size:14px;font-weight:600;color:#1A1918}
.qr-sub{font-size:10px;color:#A4A4A6;margin-top:2px}

.ft{display:flex;justify-content:space-between;align-items:center;padding:3mm 6mm 4mm;border-top:1px solid #E4E0DA}
.ft span{font-size:8.5px;color:#A4A4A6;letter-spacing:.04em}

@media print{
  @page{size:A4;margin:12mm}
  body{background:#fff;padding:0;display:block}
  .print-btn{display:none}
  .page{box-shadow:none;width:100mm}
}
</style>
</head>
<body>

<button class="print-btn" onclick="window.print()">🖨 Stampa etichetta</button>

<div class="page">
  <div class="strip"></div>
  <div class="hd">
    <div class="logo">
      <img src="/modar-logo.png" alt="Modar" onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
      <span style="display:none;font-size:26px;font-weight:700;color:#1A1918;letter-spacing:-.02em">MODAR</span>
    </div>
    <div class="badge ${badgeClass}">${esc(badgeText)}</div>
  </div>

  <div class="code-section">
    <div class="lbl">Scheda / Commessa</div>
    <div class="code">${codeStr}</div>
    ${nSchedaStr ? `<div class="sub">${nSchedaStr}</div>` : ""}
  </div>

  <div class="rule"></div>

  ${rows.join("\n  ")}

  <div class="qrwrap">
    <div class="qrbox"><svg id="qr" width="60" height="60"></svg></div>
    <div>
      <div class="qr-label">Apri Scheda</div>
      <div class="qr-sub">Rif. ${codeStr}</div>
    </div>
  </div>

  <div class="ft">
    <span>MES MODAR · ${tipoLabel}</span>
    <span>ID ${idShort}</span>
  </div>
</div>

<script src="https://unpkg.com/qrcode-generator@1.4.4/qrcode.js"></script>
<script>
(function paintQR() {
  if (!window.qrcode) { setTimeout(paintQR, 80); return; }
  var qr = window.qrcode(0, 'M');
  qr.addData("${notionUrl}"); qr.make();
  var n = qr.getModuleCount(), d = '';
  for (var r = 0; r < n; r++) for (var c = 0; c < n; c++) if (qr.isDark(r,c)) d += 'M'+c+' '+r+'h1v1h-1z';
  var svg = document.getElementById('qr');
  svg.setAttribute('viewBox', '0 0 '+n+' '+n);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.innerHTML = '<rect width="'+n+'" height="'+n+'" fill="#fff"/><path d="'+d+'" fill="#1A1918"/>';
})();
</script>
</body>
</html>`;

    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
