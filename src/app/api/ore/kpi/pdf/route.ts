import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import {
  getKpiTotali, getKpiPerOdp, getKpiPerOperatore, getKpiPerCausale,
  getKpiPerReparto, getTop5OdpRifacimento,
} from "@/lib/oreRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch { /* skip */ }
  return "";
}

function fmtData(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric" });
}

// Semaforo % rifacimento — stesse soglie di VistaKpi.tsx (semaforo()).
function semaforo(perc: number): { bg: string; color: string } {
  if (perc < 5) return { bg: "#D1FAE5", color: "#065F46" };
  if (perc <= 10) return { bg: "#FEF3C7", color: "#92400E" };
  return { bg: "#FEE2E2", color: "#991B1B" };
}

// Barre orizzontali generiche — niente libreria di grafici: la pagina è statica (render server-side
// via Puppeteer), quindi barre proporzionali via CSS bastano e restano nitide in stampa.
function barreOrizzontali(items: { label: string; value: number; extra?: string; extraStyle?: string }[], color: string, unit = "h"): string {
  const max = Math.max(...items.map(i => i.value), 1);
  return items.map(i => {
    const pct = i.value > 0 ? Math.max((i.value / max) * 100, 3) : 0;
    return `
      <div class="bar-row">
        <div class="bar-label" title="${esc(i.label)}">${esc(i.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="bar-value">${i.value}${unit}</div>
        ${i.extra ? `<div class="bar-extra" style="${i.extraStyle ?? ""}">${i.extra}</div>` : ""}
      </div>`;
  }).join("");
}

const PALETTE_CAUSALE = ["var(--brand)", "#1D4ED8", "#991B1B", "#065F46", "#6D28D9", "#A4A4A6"];

function donut(items: { label: string; value: number }[]): { gradient: string; legend: string } {
  const totale = items.reduce((s, i) => s + i.value, 0) || 1;
  let acc = 0;
  const stops: string[] = [];
  const legendRows: string[] = [];
  items.forEach((it, i) => {
    const colore = PALETTE_CAUSALE[i % PALETTE_CAUSALE.length];
    const start = (acc / totale) * 360;
    acc += it.value;
    const end = (acc / totale) * 360;
    stops.push(`${colore} ${start}deg ${end}deg`);
    const perc = (it.value / totale) * 100;
    legendRows.push(`
      <div class="legend-row">
        <span class="legend-dot" style="background:${colore}"></span>
        <span class="legend-label">${esc(it.label)}</span>
        <span class="legend-value">${it.value}h · ${perc.toFixed(0)}%</span>
      </div>`);
  });
  return { gradient: `conic-gradient(${stops.join(",")})`, legend: legendRows.join("") };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const da = searchParams.get("da");
    const a = searchParams.get("a");
    if (!da || !a) return NextResponse.json({ error: "Parametri da/a mancanti" }, { status: 400 });

    const [totali, perOdp, perOperatore, perCausale, perReparto, top5Rifacimento] = await Promise.all([
      getKpiTotali(da, a),
      getKpiPerOdp(da, a),
      getKpiPerOperatore(da, a),
      getKpiPerCausale(da, a),
      getKpiPerReparto(da, a),
      getTop5OdpRifacimento(da, a),
    ]);

    const topOperatori = perOperatore.slice().sort((x, y) => y.oreTotali - x.oreTotali).slice(0, 10);
    const TOP_ODP_LIMIT = 20;
    const perOdpMostrati = perOdp.slice(0, TOP_ODP_LIMIT);

    const donutData = donut(perCausale.map(c => ({ label: c.causale, value: c.ore })));

    const logoUri = getLogoDataUri();
    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Dashboard KPI Ore ${esc(da)} — ${esc(a)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root{--brand:#F08F25}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:6mm;border-bottom:2px solid #1A1918;margin-bottom:6mm}
.hd .lbl{font-size:10px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:26px;font-weight:700;margin-top:2mm}
.hd .sub{font-size:13px;color:#6b6966;margin-top:1mm}
.hd .logo{height:24mm;width:auto;object-fit:contain;flex-shrink:0}
.cards{display:flex;gap:3mm;margin-bottom:7mm}
.card{flex:1;border-radius:2mm;padding:3mm;border:1px solid}
.card .n{font-size:19px;font-weight:700;font-family:ui-monospace,'SF Mono',monospace}
.card .l{font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:#6b6966;margin-top:1mm}
.card .s{font-size:9px;margin-top:0.5mm;font-weight:600}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:6mm}
section{margin-bottom:7mm;break-inside:avoid}
h2{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#6b6966;border-bottom:1px solid #E4E0DA;padding-bottom:1.5mm;margin-bottom:3mm}
.bar-row{display:flex;align-items:center;gap:2mm;margin-bottom:1.8mm}
.bar-label{width:34mm;font-size:9.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
.bar-track{flex:1;height:4mm;background:#F0EFEC;border-radius:1mm;overflow:hidden}
.bar-fill{height:100%;border-radius:1mm}
.bar-value{width:14mm;text-align:right;font-size:9.5px;font-weight:700;flex-shrink:0}
.bar-extra{width:16mm;text-align:right;font-size:8.5px;font-weight:700;padding:0.5mm 1.5mm;border-radius:99px;flex-shrink:0}
.donut-wrap{display:flex;align-items:center;gap:6mm}
.donut{width:32mm;height:32mm;border-radius:50%;position:relative;flex-shrink:0}
.donut-hole{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:17mm;height:17mm;border-radius:50%;background:white}
.legend{flex:1}
.legend-row{display:flex;align-items:center;gap:2mm;font-size:10px;margin-bottom:1.5mm}
.legend-dot{width:2.5mm;height:2.5mm;border-radius:50%;flex-shrink:0}
.legend-label{flex:1;font-weight:600}
.legend-value{color:#6b6966}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:8.5px;letter-spacing:.06em;text-transform:uppercase;color:#A4A4A6;padding:1.8mm 2.5mm;border-bottom:1px solid #E4E0DA}
td{padding:1.8mm 2.5mm;border-bottom:1px solid #F0EFEC;font-size:10.5px}
.qty{text-align:right;font-weight:700;white-space:nowrap}
.note{font-size:9px;color:#A4A4A6;margin-top:2mm}
.empty{font-size:10px;color:#A4A4A6;padding:2mm 0}
.ft{margin-top:8mm;font-size:9px;color:#A4A4A6;display:flex;justify-content:space-between;border-top:1px solid #E4E0DA;padding-top:3mm}
@media print{@page{size:A4;margin:14mm}}
</style>
</head>
<body>
<div class="hd">
  <div>
    <div class="lbl">Rilevamento Ore — Dashboard KPI</div>
    <div class="title">Riepilogo periodo</div>
    <div class="sub">${esc(fmtData(da))} → ${esc(fmtData(a))}</div>
  </div>
  ${logoUri ? `<img class="logo" src="${logoUri}" alt="Modar">` : ""}
</div>

<div class="cards">
  <div class="card" style="background:#EFF6FF;border-color:#1D4ED833"><div class="n" style="color:#1D4ED8">${totali.oreTotali}h</div><div class="l">Ore totali</div></div>
  <div class="card" style="background:#ECFDF5;border-color:#06503946"><div class="n" style="color:#065F46">${totali.oreValore}h</div><div class="l">Ore a valore</div></div>
  <div class="card" style="background:#FEF2F2;border-color:#991B1B33"><div class="n" style="color:#991B1B">${totali.oreRifacimento}h</div><div class="l">Ore rifacimento</div><div class="s" style="color:#991B1B">${totali.percRifacimento.toFixed(1)}% del totale</div></div>
  <div class="card" style="background:rgba(240,143,37,0.08);border-color:#F08F2533"><div class="n" style="color:var(--brand)">€${totali.costoTotale.toFixed(0)}</div><div class="l">Costo ore totali</div></div>
  <div class="card" style="background:#FEF2F2;border-color:#991B1B33"><div class="n" style="color:#991B1B">€${totali.costoRifacimento.toFixed(0)}</div><div class="l">Costo rifacimenti</div></div>
</div>

<div class="grid2">
  <section>
    <h2>Per reparto — ore totali</h2>
    ${perReparto.length === 0 ? `<p class="empty">Nessun dato nel periodo</p>` : barreOrizzontali(
      perReparto.slice().sort((x, y) => y.oreTotali - x.oreTotali).map(r => {
        const s = semaforo(r.percRifacimento);
        return { label: r.reparto, value: r.oreTotali, extra: `${r.percRifacimento.toFixed(0)}%`, extraStyle: `background:${s.bg};color:${s.color}` };
      }), "var(--brand)"
    )}
  </section>

  <section>
    <h2>Top 10 operatori — ore totali</h2>
    ${topOperatori.length === 0 ? `<p class="empty">Nessun dato nel periodo</p>` : barreOrizzontali(
      topOperatori.map(o => ({ label: `${o.cognome} ${o.nome}`, value: o.oreTotali })), "#1D4ED8"
    )}
  </section>
</div>

<div class="grid2">
  <section>
    <h2>Per causale rifacimento</h2>
    ${perCausale.length === 0 ? `<p class="empty">Nessun rifacimento nel periodo</p>` : `
      <div class="donut-wrap">
        <div class="donut" style="background:${donutData.gradient}"><div class="donut-hole"></div></div>
        <div class="legend">${donutData.legend}</div>
      </div>`}
  </section>

  <section>
    <h2>Top 5 ODP — ore rifacimento</h2>
    ${top5Rifacimento.length === 0 ? `<p class="empty">Nessun rifacimento nel periodo</p>` : barreOrizzontali(
      top5Rifacimento.map(t => ({ label: t.odp, value: t.oreRifacimento })), "#991B1B"
    )}
  </section>
</div>

<section>
  <h2>Per ODP${perOdp.length > TOP_ODP_LIMIT ? ` — primi ${TOP_ODP_LIMIT} di ${perOdp.length}` : ""}</h2>
  ${perOdpMostrati.length === 0 ? `<p class="empty">Nessun dato nel periodo</p>` : `
    <table>
      <thead><tr><th>ODP</th><th class="qty">Ore tot.</th><th class="qty">Ore rifac.</th><th class="qty">% rifac.</th><th class="qty">Costo</th></tr></thead>
      <tbody>
        ${perOdpMostrati.map(o => `
          <tr>
            <td style="font-weight:600">${esc(o.odp)}</td>
            <td class="qty">${o.oreTotali}h</td>
            <td class="qty" style="${o.oreRifacimento > 0 ? "color:#991B1B" : ""}">${o.oreRifacimento}h</td>
            <td class="qty">${o.percRifacimento.toFixed(1)}%</td>
            <td class="qty">€${o.costo.toFixed(0)}</td>
          </tr>`).join("")}
      </tbody>
    </table>`}
</section>

<div class="ft">
  <span>MES MODAR · RILEVAMENTO ORE — DASHBOARD KPI</span>
  <span>Stampato il ${new Date().toLocaleString("it-IT", { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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
        format: "A4",
        printBackground: true,
        margin: { top: "14mm", right: "14mm", bottom: "14mm", left: "14mm" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="kpi-ore-${da}_${a}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ore/kpi/pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
