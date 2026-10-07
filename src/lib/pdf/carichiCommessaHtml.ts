import type { CarichiCommessaReport } from "../reportCarichiCommessa";

function esc(s: string | number | null | undefined) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const GIORNI = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const MESI = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];

// Data in evidenza dell'intestazione carico, es. "Ven 9 Ottobre 2026"
function fmtEsteso(d: string | null) {
  if (!d) return "Data da definire";
  const dt = new Date(`${d}T00:00:00`);
  return `${GIORNI[dt.getDay()]} ${dt.getDate()} ${MESI[dt.getMonth()]} ${dt.getFullYear()}`;
}

function fmt(d: string | null) {
  return d ? new Date(`${d}T00:00:00`).toLocaleDateString("it-IT") : "—";
}

export interface OpzioniRiepilogo {
  // scheda.id → data URI della copertina (solo Drive; le altre restano senza miniatura)
  copertine: Map<string, string>;
  // scheda.id per cui la prima pagina del PDF allegato verrà accodata (solo stampa dettagliata)
  conPdf?: Set<string>;
  dettagliato: boolean;
}

export function buildCarichiCommessaHtml({ commessa, gruppi }: CarichiCommessaReport, { copertine, conPdf, dettagliato }: OpzioniRiepilogo): string {
  const totOdp = gruppi.reduce((n, g) => n + g.odp.length, 0);

  const sezioni = gruppi.map(({ carico, odp }) => {
    const righe = odp.map((s) => {
      const thumb = copertine.get(s.id);
      const nota = dettagliato ? (conPdf?.has(s.id) ? "Pag. allegata" : "Pagina vuota (errore PDF)") : "";
      return `<tr>
        <td class="th">${thumb ? `<img src="${thumb}" alt="">` : ""}</td>
        <td class="odp">${esc(s.odp)}${s.numeroScheda ? `<div class="sub">${esc(s.numeroScheda)}</div>` : ""}</td>
        <td>${esc(s.clienteInfo || s.descrizioneFasi || "—")}</td>
        <td>${esc([s.codiceArticolo, s.posizione].filter(Boolean).join(" · ") || "—")}</td>
        <td class="num">${s.quantita ?? "—"}</td>
        <td>${esc(s.statoProduzione || "—")}${s.faseCorrente ? `<div class="sub">${esc(s.faseCorrente)}</div>` : ""}</td>
        <td class="nw">${fmt(s.dataProduzionePrevista)}</td>
        ${dettagliato ? `<td class="${conPdf?.has(s.id) ? "ok" : "ko"}">${nota}</td>` : ""}
      </tr>`;
    }).join("");

    return `<section>
      <div class="ch">
        <h2>${esc(carico.titolo || "Carico")}</h2>
        <span class="dt">${esc(fmtEsteso(carico.dataCarico))}</span>
        ${carico.modalita ? `<span class="tag">${esc(carico.modalita)}</span>` : ""}
        ${carico.stato ? `<span class="tag">${esc(carico.stato)}</span>` : ""}
        <span class="cnt">${odp.length} ODP</span>
      </div>
      ${carico.descrizione ? `<p class="desc">${esc(carico.descrizione)}</p>` : ""}
      ${odp.length === 0 ? `<p class="vuoto">Nessun ODP collegato a questo carico</p>` : `<table>
        <thead><tr><th></th><th>ODP</th><th>Cliente / Descrizione</th><th>Articolo</th><th class="num">Q.tà</th><th>Stato / Fase</th><th>Prod. prevista</th>${dettagliato ? "<th>Disegno</th>" : ""}</tr></thead>
        <tbody>${righe}</tbody>
      </table>`}
    </section>`;
  }).join("");

  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Carichi ${esc(commessa.numeroCommessa)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918;font-size:11px}
.hd{padding-bottom:4mm;border-bottom:2px solid #1A1918;margin-bottom:5mm}
.hd .lbl{font-size:9px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:22px;font-weight:700;margin-top:1mm}
.hd .sub{font-size:12px;color:#6b6966;margin-top:1mm}
section{margin-bottom:7mm}
.ch{display:flex;align-items:center;gap:3mm;padding-bottom:2mm;border-bottom:1px solid #E4E0DA;margin-bottom:2mm;break-after:avoid}
.ch h2{font-size:15px;font-weight:700}
.dt{order:-1;background:#E87722;color:#fff;font-size:20px;font-weight:700;padding:1mm 4mm;border-radius:3px;white-space:nowrap}
.tag{background:#F3F4F6;border-radius:3px;padding:1px 6px;font-size:10px}
.cnt{margin-left:auto;font-weight:600;color:#6b6966}
.desc{font-style:italic;color:#6b6966;margin-bottom:2mm}
.vuoto{color:#A4A4A6;padding:3mm 0}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:8.5px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:1.5mm 2mm;border-bottom:1px solid #E4E0DA}
td{padding:1.5mm 2mm;border-bottom:1px solid #EFEDE9;vertical-align:middle}
tr{break-inside:avoid}
.num{text-align:right}
.nw{white-space:nowrap}
.odp{font-weight:700;white-space:nowrap}
.sub{font-weight:400;font-size:9px;color:#6b6966}
.th{width:16mm;padding:1mm 2mm}
.th img{display:block;width:14mm;height:10.5mm;object-fit:cover;border-radius:2px}
.ok{color:#065F46}.ko{color:#991B1B}
.ft{margin-top:6mm;font-size:9px;color:#A4A4A6;display:flex;justify-content:space-between}
@media print{@page{size:A4 landscape;margin:12mm}}
</style>
</head>
<body>
<div class="hd">
  <div class="lbl">${dettagliato ? "Carichi — Stampa dettagliata" : "Carichi — Riepilogo"}</div>
  <div class="title">${esc(commessa.numeroCommessa)}${commessa.cliente ? " — " + esc(commessa.cliente) : ""}</div>
  <div class="sub">${esc([commessa.localita, commessa.stato, `${gruppi.length} carichi`, `${totOdp} ODP`].filter(Boolean).join(" · "))}</div>
</div>
${gruppi.length === 0 ? `<p class="vuoto">Nessun carico per questa commessa</p>` : sezioni}
<div class="ft"><span>MES MODAR · CARICHI</span><span>Stampato il ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}</span></div>
</body>
</html>`;
}
