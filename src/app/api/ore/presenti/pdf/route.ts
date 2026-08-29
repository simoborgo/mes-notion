import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { getPresentiPerData, type PresenteRow } from "@/lib/oreRepository";
import { getOrariTurno, calcolaOreStandard } from "@/lib/parametriGeneraliRepository";
import { isGiornoChiuso } from "@/lib/giorniChiusiRepository";
import { getSessionFromRequest, RILEVAMENTO_ORE_ROLES } from "@/lib/auth";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Stessa tecnica di ritiri/[id]/etichetta/route.ts — logo incorporato come data URI (non un
// riferimento a /public, che Puppeteer non risolverebbe senza un server già in ascolto).
function getLogoDataUri(): string {
  try {
    const p = path.join(process.cwd(), "public", "modar-logo.png");
    if (fs.existsSync(p)) return `data:image/png;base64,${fs.readFileSync(p).toString("base64")}`;
  } catch { /* skip */ }
  return "";
}

// Stessi helper puri già usati lato client in VistaOggi.tsx — duplicati qui invece che importati
// da un componente "use client" (stesso principio già seguito altrove nel progetto per gli helper
// di file/URL, vedi commento in apsGanttRepository.ts).
function fmtDataLunga(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const raw = dt.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
function defaultTotaleGiornata(dateStr: string, oreFeriale: number, oreSabato: number): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  const weekday = new Date(y, m - 1, d).getDay();
  if (weekday === 0) return 0;
  if (weekday === 6) return oreSabato;
  return oreFeriale;
}
function oreAssenzaEffettiva(a: PresenteRow["assenzaManuale"], totaleGiornata: number): number {
  if (!a) return 0;
  return Math.min(a.ore ?? totaleGiornata, totaleGiornata);
}

// giornoChiuso: con totaleGiornata forzato a 0h, oreAssenzaEffettiva torna 0 per chiunque
// (nessuna assenza può "sforare" un totale già a 0) — senza questo controllo esplicito TUTTI
// gli operatori, presenti o meno, risulterebbero etichettati "Presente".
function statoAssenza(p: PresenteRow, totaleGiornata: number, giornoChiuso: boolean): { label: string; bg: string; color: string } {
  if (giornoChiuso) return { label: "Azienda chiusa", bg: "#F3F4F6", color: "#6B7280" };
  const oreAssenza = oreAssenzaEffettiva(p.assenzaManuale, totaleGiornata);
  if (oreAssenza <= 0) return { label: "Presente", bg: "#DCFCE7", color: "#166534" };
  if (p.assenzaManuale?.ore == null) {
    return { label: `Assente${p.assenza ? ` (${p.assenza.tipo === "FERIE" ? "Ferie" : "Permesso"})` : ""}`, bg: "#FEE2E2", color: "#991B1B" };
  }
  return { label: `Parziale — ${oreAssenza}h assenza`, bg: "#FEF3C7", color: "#92400E" };
}

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session || !RILEVAMENTO_ORE_ROLES.includes(session.role)) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const data = searchParams.get("data");
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      return NextResponse.json({ error: "Parametro data mancante o non valido (YYYY-MM-DD)" }, { status: 400 });
    }

    const [{ presenti }, orariTurno, giornoChiuso] = await Promise.all([
      getPresentiPerData(data), getOrariTurno(), isGiornoChiuso(data),
    ]);
    const { oreFeriale, oreSabato } = calcolaOreStandard(orariTurno);
    const totaleGiornata = giornoChiuso ? 0 : defaultTotaleGiornata(data, oreFeriale, oreSabato);

    const perReparto = new Map<string, PresenteRow[]>();
    for (const p of presenti) {
      const list = perReparto.get(p.reparto) ?? [];
      list.push(p);
      perReparto.set(p.reparto, list);
    }
    const reparti = [...perReparto.keys()].sort((a, b) => a.localeCompare(b));

    let nPresenti = 0, nAssentiInteri = 0, nParziali = 0, oreLavorateTotali = 0;
    for (const p of presenti) {
      if (!giornoChiuso) {
        const oreAssenza = oreAssenzaEffettiva(p.assenzaManuale, totaleGiornata);
        if (oreAssenza <= 0) nPresenti++;
        else if (p.assenzaManuale?.ore == null) nAssentiInteri++;
        else nParziali++;
      }
      oreLavorateTotali += p.registrazioni.reduce((s, r) => s + r.ore, 0);
    }
    oreLavorateTotali = Math.round(oreLavorateTotali * 2) / 2;

    const sezioniHtml = reparti.map(reparto => {
      const operatori = (perReparto.get(reparto) ?? []).slice().sort((a, b) => a.cognome.localeCompare(b.cognome));
      const righeHtml = operatori.map(p => {
        const totaleOre = Math.round(p.registrazioni.reduce((s, r) => s + r.ore, 0) * 2) / 2;
        const stato = statoAssenza(p, totaleGiornata, giornoChiuso);
        const odpHtml = p.registrazioni.length === 0
          ? `<span class="odp-vuoto">—</span>`
          : `<div class="odp-list">${p.registrazioni.map(r =>
              `<span class="odp-chip">${esc(r.odp)}${r.rif ? " <em>rif.</em>" : ""} · ${r.ore}h</span>`
            ).join("")}</div>`;
        return `
          <tr>
            <td>
              <div class="op-nome">${esc(p.cognome)} ${esc(p.nome)}</div>
              <div class="op-sub">${esc(p.azienda || "")}</div>
            </td>
            <td><span class="badge" style="background:${stato.bg};color:${stato.color}">${esc(stato.label)}</span></td>
            <td class="qty">${totaleOre}h</td>
            <td>${odpHtml}</td>
          </tr>`;
      }).join("");
      return `
        <section class="reparto">
          <h2>${esc(reparto)}</h2>
          <table>
            <thead><tr><th>Operatore</th><th>Stato</th><th class="qty">Ore lav.</th><th>ODP</th></tr></thead>
            <tbody>${righeHtml}</tbody>
          </table>
        </section>`;
    }).join("");

    const logoUri = getLogoDataUri();
    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Rilevamento Ore ${esc(data)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918}
.hd{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:6mm;border-bottom:2px solid #1A1918;margin-bottom:5mm}
.hd .lbl{font-size:10px;letter-spacing:.15em;color:#A4A4A6;text-transform:uppercase}
.hd .title{font-size:26px;font-weight:700;margin-top:2mm;text-transform:capitalize}
.hd .logo{height:24mm;width:auto;object-fit:contain;flex-shrink:0}
.chiusura{background:#FEF2F2;border:1px solid #FECACA;color:#991B1B;border-radius:2mm;padding:2.5mm 4mm;font-size:11px;font-weight:700;margin-bottom:5mm}
.riepilogo{display:flex;gap:3mm;margin-bottom:6mm}
.riepilogo .box{flex:1;border:1px solid #E4E0DA;border-radius:2mm;padding:3mm;text-align:center}
.riepilogo .box .n{font-size:20px;font-weight:700}
.riepilogo .box .l{font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#6b6966;margin-top:1mm}
.reparto{margin-bottom:6mm}
.reparto h2{font-size:13px;text-transform:uppercase;letter-spacing:.08em;color:var(--brand,#C06A10);border-bottom:1px solid #E4E0DA;padding-bottom:1.5mm;margin-bottom:2mm}
table{width:100%;border-collapse:collapse}
th{text-align:left;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#A4A4A6;padding:2mm 2.5mm;border-bottom:1px solid #E4E0DA}
td{padding:2.5mm;border-bottom:1px solid #F0EFEC;font-size:11.5px;vertical-align:top}
.op-nome{font-weight:600}
.op-sub{font-size:9.5px;color:#A4A4A6}
.qty{text-align:right;font-weight:700;white-space:nowrap}
.badge{display:inline-block;padding:1mm 2.5mm;border-radius:99px;font-size:9.5px;font-weight:700;white-space:nowrap}
.odp-list{display:flex;flex-wrap:wrap;gap:1.5mm}
.odp-chip{background:#F5F2EE;border-radius:1.5mm;padding:0.8mm 2mm;font-size:10px;white-space:nowrap}
.odp-chip em{color:#991B1B;font-style:normal;font-weight:700}
.odp-vuoto{color:#A4A4A6}
.ft{margin-top:8mm;font-size:9px;color:#A4A4A6;display:flex;justify-content:space-between;border-top:1px solid #E4E0DA;padding-top:3mm}
.reparto{break-inside:avoid}
@media print{@page{size:A4;margin:14mm}}
</style>
</head>
<body>
<div class="hd">
  <div>
    <div class="lbl">Rilevamento Ore — Presenze giornaliere</div>
    <div class="title">${esc(fmtDataLunga(data))}</div>
  </div>
  ${logoUri ? `<img class="logo" src="${logoUri}" alt="Modar">` : ""}
</div>
${giornoChiuso ? `<div class="chiusura">⚠ Azienda chiusa — nessuna ora attesa per questa giornata</div>` : ""}
<div class="riepilogo">
  <div class="box"><div class="n">${presenti.length}</div><div class="l">Operatori</div></div>
  <div class="box"><div class="n" style="color:#166534">${nPresenti}</div><div class="l">Presenti</div></div>
  <div class="box"><div class="n" style="color:#92400E">${nParziali}</div><div class="l">Parziali</div></div>
  <div class="box"><div class="n" style="color:#991B1B">${nAssentiInteri}</div><div class="l">Assenti</div></div>
  <div class="box"><div class="n">${oreLavorateTotali}h</div><div class="l">Ore lavorate</div></div>
</div>
${sezioniHtml}
<div class="ft">
  <span>MES MODAR · RILEVAMENTO ORE</span>
  <span>Stampato il ${new Date().toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
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
          "Content-Disposition": `inline; filename="rilevamento-ore-${data}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[ore/presenti/pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
