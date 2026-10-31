import type { Scheda } from "../types";

function esc(s: string | number | null | undefined) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmt(d: string | null) {
  return d ? new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString("it-IT") : "—";
}

export interface OpzioniVista {
  // Etichetta dei filtri attivi così come mostrata nella stampa del browser
  filtri: string;
  // scheda.id con la prima pagina del PDF allegato accodata / con il PDF non scaricabile
  conPdf: Set<string>;
  errori: Set<string>;
}

// Riepilogo della vista corrente di /schede (stesse colonne della stampa del browser) con la colonna
// "Disegno" che dice quali schede hanno la prima pagina del PDF allegato in coda al documento.
export function buildSchedeVistaHtml(schede: Scheda[], { filtri, conPdf, errori }: OpzioniVista): string {
  const ora = new Date();
  const righe = schede.map((s) => {
    const disegno = conPdf.has(s.id)
      ? `<td class="ok">Pag. allegata</td>`
      : errori.has(s.id) ? `<td class="ko">Errore PDF</td>` : `<td class="na">Nessun PDF</td>`;
    return `<tr>
      <td>${esc(s.clienteInfo || "—")}${s.commessaNr ? ` (${esc(s.commessaNr)})` : ""}</td>
      <td class="odp">${esc(s.odp || "—")}</td>
      <td>${esc(s.codiceArticolo || "—")}</td>
      <td>${esc(s.numeroScheda || "—")}</td>
      <td>${esc(s.descrizioneFasi || "—")}</td>
      <td class="num">${s.quantita ?? "—"}</td>
      <td>${esc(s.statoProduzione || "—")}</td>
      <td>${esc(s.faseCorrente || "—")}</td>
      <td class="nw">${fmt(s.dataProduzionePrevista)}</td>
      <td>${esc(s.fornitore || "—")}</td>
      <td class="nw">${fmt(s.dataRientroPrevista)}</td>
      ${disegno}
    </tr>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Schede di Produzione</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918;font-size:11px}
.hd{padding-bottom:4mm;border-bottom:2px solid #1A1918;margin-bottom:4mm}
.hd .lbl{font-size:9px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:24px;font-weight:700;margin-top:1mm}
.hd .sub{font-size:11px;color:#6b6966;margin-top:1mm}
.vuoto{color:#A4A4A6;padding:3mm 0}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
th{text-align:left;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:1.5mm 1.5mm;border-bottom:1px solid #E4E0DA}
td{padding:1.2mm 1.5mm;border-bottom:1px solid #EFEDE9;vertical-align:top}
tr{break-inside:avoid}
.num{text-align:right}
.nw{white-space:nowrap}
.odp{font-weight:700;white-space:nowrap}
.ok{color:#065F46;white-space:nowrap}.ko{color:#991B1B;white-space:nowrap}.na{color:#A4A4A6;white-space:nowrap}
.ft{margin-top:6mm;font-size:9px;color:#A4A4A6;display:flex;justify-content:space-between}
</style>
</head>
<body>
<div class="hd">
  <div class="lbl">Schede di Produzione — Stampa con disegni</div>
  <div class="title">Schede di Produzione</div>
  <div class="sub"><strong>Filtri:</strong> ${esc(filtri)}</div>
  <div class="sub">${schede.length} schede · ${conPdf.size} disegni allegati</div>
</div>
${schede.length === 0 ? `<p class="vuoto">Nessuna scheda nella vista</p>` : `<table>
  <thead><tr><th>Cliente / Commessa</th><th>ODP</th><th>Cod. Articolo</th><th>N° Scheda</th><th>Descrizione</th><th class="num">Q.tà</th><th>Stato</th><th>Fase</th><th>Prod. prev.</th><th>Fornitore</th><th>Rientro prev.</th><th>Disegno</th></tr></thead>
  <tbody>${righe}</tbody>
</table>`}
<div class="ft"><span>MES MODAR · SCHEDE</span><span>Stampato il ${ora.toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })} alle ${ora.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" })}</span></div>
</body>
</html>`;
}
