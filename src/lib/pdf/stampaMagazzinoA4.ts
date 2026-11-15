import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";
import type { Scheda } from "../types";
import type { CompletezzaSottoschede } from "../completezzaSottoschede";
import { dataBreveIt } from "../completezzaSottoschede";

// Stampe A4 verticali per magazzino e produzione, nella stessa grafica dell'etichetta Ritiri e
// Consegne (api/ritiri/[id]/etichetta): fascia colore, logo, codice grande, QR, badge. Le tre
// stampe (foglio produzione, etichetta bancale, e quella dei Ritiri) restano riconoscibili fianco a
// fianco; qui sta solo la parte nuova, l'etichetta dei Ritiri non è stata toccata.

export function esc(s: string | number | null | undefined) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
    const pjpg = path.join(process.cwd(), "public", "modar-logo.jpg");
    if (fs.existsSync(pjpg)) return `data:image/jpeg;base64,${fs.readFileSync(pjpg).toString("base64")}`;
  } catch { /* senza logo: fallback testuale */ }
  return "";
}

const CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;background:#fff;margin:0;padding:0;width:100%}
.page{font-family:'Jost',sans-serif;background:#fff;color:#1A1918;display:flex;flex-direction:column;width:100%;height:272mm;overflow:hidden;page-break-after:always}
.page:last-child{page-break-after:auto}
.row2{display:flex;border-bottom:1px solid #E4E0DA}
.row2 .row{flex:1;border-bottom:0}
.row.sm{padding:2.5mm 10mm}
.row.sm .val{font-size:18px}
.row.cli .val{font-size:23px}
.strip{height:10mm;flex-shrink:0;background:#8B7B6B}
.strip.info{height:20mm;background:#F08F25;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 10mm}
.strip.info.banc{background:#8B7B6B}
.strip.info .t{font-size:30px;font-weight:700;letter-spacing:.16em;line-height:1}
.strip.info .s{font-size:12px;font-weight:500;letter-spacing:.08em;text-align:right;line-height:1.3;opacity:.95}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding:7mm 10mm 0}
.logo img{height:140px;width:auto;object-fit:contain}
.logo-fallback{font-size:64px;font-weight:700;color:#1A1918;letter-spacing:-.02em}
.hd-right{display:flex;flex-direction:column;align-items:flex-end;gap:4mm}
.dir{display:flex;align-items:center;padding:8px 16px;border-radius:4px;font-weight:700;font-size:13px;letter-spacing:.12em;white-space:nowrap;background:#8B7B6B;color:#fff}
.dir.ok{background:#3F8F5B}
.dir.inc{background:#7A2E3A}
.lbl{font-size:9px;font-weight:600;letter-spacing:.2em;color:#A4A4A6;text-transform:uppercase}
.data-mini{text-align:right}
.data-mini .lbl{margin-bottom:2px}
.data-mini .val{font-size:15px;font-weight:600;color:#1A1918;white-space:nowrap}
.code-section{padding:7mm 10mm 0}
.code{font-weight:700;font-size:48px;line-height:1.08;color:#1A1918;letter-spacing:-.01em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.code.xl{font-size:120px;line-height:1}
.sub{font-size:48px;font-weight:700;color:#1A1918;margin-top:3mm;line-height:1.08;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rule{border-top:2px solid #1A1918;margin:6mm 10mm 0}
.row{padding:4mm 10mm;border-bottom:1px solid #E4E0DA}
.row .lbl{margin-bottom:2px}
.row .val{font-size:20px;font-weight:500;color:#1A1918;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.row .val-lg{font-size:24px}
table.sotto{width:calc(100% - 20mm);margin:4mm 10mm 0;border-collapse:collapse;table-layout:fixed}
table.sotto th{font-size:9px;font-weight:600;letter-spacing:.2em;color:#A4A4A6;text-transform:uppercase;text-align:left;padding:0 0 2mm}
table.sotto td{font-size:15px;padding:2.6mm 2mm 2.6mm 0;border-top:1px solid #E4E0DA;vertical-align:top;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
table.sotto td.n{font-weight:600}
table.sotto.d2 td{font-size:12px;padding:1.4mm 2mm 1.4mm 0}
table.sotto.d3 td{font-size:10px;padding:.7mm 2mm .7mm 0}
table.sotto.d2 .st{font-size:9px;padding:1px 7px}
table.sotto.d3 .st{font-size:8px;padding:0 6px}
.altre{font-size:12px;font-weight:600;color:#991B1B;padding:0 10mm}
.altre:not(:empty){padding-top:2mm}
.st{display:inline-block;padding:3px 10px;border-radius:12px;font-weight:700;font-size:11px;letter-spacing:.05em;white-space:nowrap}
.st.ok{background:#D1FAE5;color:#065F46}
.st.manca{background:#FEE2E2;color:#991B1B}
.qrwrap{display:flex;align-items:center;justify-content:space-between;gap:10mm;padding:6mm 10mm;margin-top:auto}
.qrwrap .brand{height:112px;max-width:90mm;width:auto;object-fit:contain;align-self:flex-start}
.qr-col{display:flex;flex-direction:column;align-items:center;gap:6px;flex:0 0 auto}
.qrbox{border:1px solid #E4E0DA;border-radius:6px;padding:6px;flex-shrink:0;line-height:0}
.qrbox svg{display:block;width:100px;height:100px}
.qr-cap{text-align:center}
.qr-apri{font-size:14px;font-weight:600;color:#1A1918}
.qr-rif{font-size:11px;color:#A4A4A6;margin-top:2px}
.ft{display:flex;justify-content:space-between;align-items:center;padding:4mm 10mm 5mm;border-top:1px solid #E4E0DA}
.ft span{font-size:10px;color:#A4A4A6;letter-spacing:.06em}
@media print{@page{size:A4;margin:12mm}body{padding:0}}
`;

function shell(titolo: string, pagine: string[]): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>${esc(titolo)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
${pagine.join("\n")}
</body>
</html>`;
}

function intestazione(badgeClasse: string, badgeTesto: string, dataLabel: string, dataValore: string, fascia = `<div class="strip"></div>`): string {
  const logo = getLogoDataUri();
  return `${fascia}
  <div class="hd">
    <div class="logo">${logo ? `<img src="${logo}" alt="Modar">` : `<span class="logo-fallback">MODAR</span>`}</div>
    <div class="hd-right">
      ${badgeTesto ? `<div class="dir ${badgeClasse}">${badgeTesto}</div>` : ""}
      <div class="data-mini"><div class="lbl">${esc(dataLabel)}</div><div class="val">${esc(dataValore)}</div></div>
    </div>
  </div>`;
}

function oggiRoma(): string {
  return new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" });
}

function riga(label: string, valore: string, grande = true): string {
  return valore ? `<div class="row"><div class="lbl">${esc(label)}</div><div class="val${grande ? " val-lg" : ""}">${esc(valore)}</div></div>` : "";
}

// QR a sinistra; il logo del brand (se la commessa ne ha uno) all'estremo destro.
function qrBlocco(qrSvg: string, caption: string, rif: string, brandLogo?: string | null): string {
  return `<div class="qrwrap">
    <div class="qr-col">
      <div class="qrbox">${qrSvg}</div>
      <div class="qr-cap"><div class="qr-apri">${esc(caption)}</div><div class="qr-rif">Rif. ${esc(rif)}</div></div>
    </div>
    ${brandLogo ? `<img class="brand" src="${brandLogo}" alt="">` : ""}
  </div>`;
}

// ── Foglio produzione ────────────────────────────────────────────────────────────────────────
// Un foglio per scheda padre: dice alla produzione (falegnameria) se il set di componenti è tutto
// in sede e, se no, cosa manca e da quale fornitore.
export function buildFoglioProduzioneHtml(p: {
  scheda: Scheda; figlie: Scheda[]; completezza: CompletezzaSottoschede | null; qrSvg: string; clienteInfo: string; brandLogo?: string | null;
}): string {
  const { scheda, figlie, completezza, qrSvg, clienteInfo, brandLogo } = p;
  const mancanti = new Map((completezza?.mancanti ?? []).map((m) => [m.id, m]));
  const titolo = scheda.numeroScheda || scheda.odp || "—";

  const badge = !completezza
    ? { c: "", t: "PER LA PRODUZIONE" }
    : completezza.completo
      ? { c: "ok", t: `✓ MATERIALE COMPLETO ${completezza.inSede}/${completezza.totale}` }
      : { c: "inc", t: `MATERIALE INCOMPLETO ${completezza.inSede}/${completezza.totale}` };

  const visibili = figlie.filter((f) => f.statoProduzione !== "Annullata");
  // La stampa resta sempre a una pagina: oltre queste soglie la tabella si fa più fitta, e oltre
  // MAX_RIGHE si elencano solo le prime (le incomplete per prime) con "+N altre".
  const MAX_RIGHE = 22;
  const densita = visibili.length <= 6 ? "" : visibili.length <= 11 ? "d2" : "d3";
  const ordinate = [...visibili].sort((a, b) => Number(mancanti.has(b.id)) - Number(mancanti.has(a.id)));
  const mostrate = ordinate.slice(0, MAX_RIGHE);
  const righe = mostrate.map((f) => {
    const m = mancanti.get(f.id);
    const stato = m
      ? `<span class="st manca">${m.fase === "fuori" ? `PRESSO FORNITORE · rientro ${esc(dataBreveIt(m.dataRientroPrevista))}` : "DA INVIARE AL FORNITORE"}</span>`
      : `<span class="st ok">IN SEDE</span>`;
    return `<tr>
      <td class="n">${esc(f.numeroScheda || f.odp || "—")}${f.tipologia === "Rilavorazione" ? " <span class=\"lbl\">rilavorazione</span>" : ""}</td>
      <td>${esc(f.fornitore || "—")}</td>
      <td>${stato}</td>
    </tr>`;
  }).join("");
  const nascoste = ordinate.length - mostrate.length;

  const pagina = `<div class="page">
  ${intestazione(badge.c, badge.t, "Stampato il", oggiRoma(),
    `<div class="strip info"><span class="t">INFO PRODUZIONE</span><span class="s">Stato del materiale<br>sottoschede in sede e presso fornitori</span></div>`)}
  <div class="code-section">
    <div class="lbl">Scheda / Commessa</div>
    <div class="code">${esc(titolo)}</div>
    ${scheda.odp && scheda.odp !== titolo ? `<div class="sub">${esc(scheda.odp)}</div>` : ""}
  </div>
  <div class="rule"></div>
  ${riga("Cliente", clienteInfo).replace('class="row"', 'class="row sm cli"')}
  <div class="row2">
    <div class="row sm"><div class="lbl">Quantità</div><div class="val">${scheda.quantita != null ? esc(scheda.quantita) : "—"}</div></div>
    <div class="row sm"><div class="lbl">Cod. articolo / Posizione</div><div class="val">${esc([scheda.codiceArticolo, scheda.posizione].filter(Boolean).join(" - ") || "—")}</div></div>
  </div>
  ${righe ? `<table class="sotto ${densita}"><colgroup><col style="width:40%"><col style="width:22%"><col style="width:38%"></colgroup><thead><tr><th>Sottoscheda</th><th>Fornitore</th><th>Stato</th></tr></thead><tbody>${righe}</tbody></table>` : ""}
  <div class="altre" data-n="${nascoste}">${nascoste > 0 ? `+ ${nascoste} altre sottoschede non mostrate` : ""}</div>
  ${qrBlocco(qrSvg, "Apri Scheda", scheda.odp || titolo, brandLogo)}
  <div class="ft"><span>MES MODAR · FOGLIO PRODUZIONE</span><span>${esc(scheda.odp)}</span></div>
</div>`;
  return shell(`Foglio produzione ${titolo}`, [pagina]);
}

// ── Etichetta bancale ────────────────────────────────────────────────────────────────────────
// Etichetta libera: nessun dato salvato. Una pagina per bancale ("2 / 3"), con la scheda a cui si
// riferisce e un testo libero opzionale (contenuto, destinazione).
export function buildEtichetteBancaleHtml(p: {
  scheda: Scheda; clienteInfo: string; totale: number; contenuto: string; qrSvg: string; brandLogo?: string | null;
}): string {
  const { scheda, clienteInfo, totale, contenuto, qrSvg, brandLogo } = p;
  const titolo = scheda.numeroScheda || scheda.odp || "—";
  const pagine = Array.from({ length: totale }, (_, i) => `<div class="page">
  ${intestazione("", "", "Data", oggiRoma(),
    `<div class="strip info banc"><span class="t">BANCALE</span><span class="s">Identificazione bancale<br>${i + 1} di ${totale}</span></div>`)}
  <div class="code-section">
    <div class="lbl">Bancale</div>
    <div class="code xl">${i + 1} / ${totale}</div>
  </div>
  <div class="rule"></div>
  <div class="code-section" style="padding-top:5mm">
    <div class="lbl">Scheda / Commessa</div>
    <div class="code">${esc(titolo)}</div>
    ${scheda.odp && scheda.odp !== titolo ? `<div class="sub">${esc(scheda.odp)}</div>` : ""}
  </div>
  <div style="height:5mm"></div>
  ${riga("Cliente", clienteInfo)}
  ${riga("Commessa", scheda.commessaNr)}
  ${riga("Contenuto", contenuto)}
  ${qrBlocco(qrSvg, "Apri Scheda", scheda.odp || titolo, brandLogo)}
  <div class="ft"><span>MES MODAR · BANCALE ${i + 1}/${totale}</span><span>${esc(scheda.odp)}</span></div>
</div>`);
  return shell(`Bancale ${titolo}`, pagine);
}

// Ogni stampa deve restare a una pagina: se il contenuto sfora, prima si tolgono le ultime righe
// della tabella sottoschede (le incomplete stanno in cima) e, solo se non basta, si riduce in scala.
// Codice come stringa: i bundler/transpiler non devono riscrivere la funzione eseguita nel browser.
export const SCRIPT_ADATTA_PAGINA = `(() => {
      document.querySelectorAll(".page").forEach((p) => {
        const sfora = () => p.scrollHeight > p.clientHeight + 1;
        const tb = p.querySelector("table.sotto tbody");
        let tolte = 0;
        while (sfora() && tb && tb.rows.length > 3) { tb.deleteRow(tb.rows.length - 1); tolte++; }
        const altre = p.querySelector(".altre");
        if (tolte && altre) altre.textContent = "+ " + (Number(altre.dataset.n || 0) + tolte) + " altre sottoschede non mostrate";
        for (let z = 1; sfora() && z > 0.5; ) {
          z -= 0.05;
          Array.from(p.children).forEach((c) => { c.style.zoom = String(z); });
        }
      });
    })()`;

export async function htmlToPdfA4(html: string): Promise<Buffer> {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    await page.evaluateHandle("document.fonts.ready");
    // Ogni stampa deve restare a una pagina: se il contenuto sfora, prima si tolgono le ultime righe
    // della tabella sottoschede (le incomplete stanno in cima) e, solo se non basta, si riduce in scala.
    await page.evaluate(SCRIPT_ADATTA_PAGINA);
    const pdf = await page.pdf({ format: "A4", printBackground: true, margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" } });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
