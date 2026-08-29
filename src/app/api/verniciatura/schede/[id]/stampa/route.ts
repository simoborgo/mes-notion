import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import QRCode from "qrcode";
import { google } from "googleapis";
import { getAuthClient } from "@/lib/googleDriveAuth";
import { getSchedaById } from "@/lib/schedeVerniciaturaRepository";
import { getVerniceById } from "@/lib/verniciRepository";
import { getSessionFromRequest } from "@/lib/auth";
import { getPublicBaseUrl } from "@/lib/url";
import type { Vernice } from "@/lib/types";

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const STATO_LABEL: Record<string, string> = { bozza: "Bozza", in_revisione: "In revisione", approvato: "Approvato", rifiutato: "Rifiutato" };
const RUOLO_LABEL: Record<string, string> = { vernice: "Vernice", catalizzatore: "Catalizzatore", diluente: "Diluente", indurente: "Indurente", additivo: "Additivo", altro: "Altro" };

function verniceLabel(v: Vernice | undefined): string {
  if (!v) return "—";
  const parti = [v.coloreCodice, v.descrizioneColore, v.tipologia].filter(Boolean);
  return parti.join(" · ") || "—";
}

function fmtData(iso: string): string {
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Scarica il file direttamente via Drive API e lo incorpora come data: URI, invece di puntare
// l'<img> al proxy /api/drive-file/... via HTTP: Puppeteer genera il PDF in un processo Chromium
// separato che deve poter raggiungere quell'URL in rete (getPublicBaseUrl) — causa più probabile
// del bug "le foto non compaiono in stampa". Incorporando i byte non c'è nessuna richiesta di
// rete da fare, stesso pattern usato dalla route /api/drive-file stessa per leggere da Drive.
async function fotoDataUri(driveFileId: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drive = google.drive({ version: "v3", auth: getAuthClient() as any });
    const meta = await drive.files.get({ fileId: driveFileId, fields: "mimeType" });
    const res = await drive.files.get({ fileId: driveFileId, alt: "media" }, { responseType: "arraybuffer" });
    const mime = meta.data.mimeType ?? "image/jpeg";
    const base64 = Buffer.from(res.data as ArrayBuffer).toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch (e) {
    console.error("[verniciatura/schede/stampa] foto non recuperabile:", driveFileId, e);
    return null;
  }
}

// Stampa A4 riassuntiva della scheda — layout scelto liberamente (l'utente non aveva un modello
// da seguire): testata con QR (in alto a destra, barcode sotto) per riaprire la scheda digitale,
// dati principali, fasi con vernici/ausiliari, foto campione.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const scheda = await getSchedaById(id);
    const baseUrl = getPublicBaseUrl(req);

    const verniceIds = Array.from(new Set((scheda.fasi ?? []).flatMap((f) => f.prodotti.map((p) => p.verniceId))));
    const vernici = new Map<string, Vernice>();
    await Promise.all(verniceIds.map(async (vid) => {
      try { vernici.set(vid, await getVerniceById(vid)); } catch { /* vernice non trovata, mostra solo id */ }
    }));

    const fotoUris = await Promise.all((scheda.foto ?? []).map((f) => fotoDataUri(f.driveFileId)));

    const qrSvg = await QRCode.toString(`${baseUrl}/verniciatura/schede/${scheda.id}`, {
      type: "svg", width: 130, margin: 0,
      color: { dark: "#1A1918", light: "#ffffff" },
    });

    const fasiHtml = (scheda.fasi ?? []).map((f) => `
      <div class="fase">
        <div class="fase-titolo">#${f.ordine} ${esc(f.nomeFase || "fase senza nome")}</div>
        <table class="prodotti">
          <thead><tr><th>Ruolo</th><th>Vernice / prodotto</th><th>Cod. Inv.</th><th>Qtà</th></tr></thead>
          <tbody>
            ${f.prodotti.map((p) => {
              const v = vernici.get(p.verniceId);
              return `<tr>
                <td>${esc(RUOLO_LABEL[p.ruoloInFase] ?? p.ruoloInFase)}</td>
                <td>${esc(verniceLabel(v))}</td>
                <td>${esc(v?.codiceInventario || "—")}</td>
                <td>${p.quantita != null ? esc(String(p.quantita)) : "—"} ${esc(p.unita || "")}</td>
              </tr>`;
            }).join("")}
          </tbody>
        </table>
      </div>
    `).join("");

    const fotoValide = fotoUris.filter((u): u is string => !!u);
    const fotoHtml = fotoValide.length > 0
      ? `<div class="foto-grid">${fotoValide.map((uri) => `<img src="${uri}" alt="foto campione" />`).join("")}</div>`
      : `<p class="muted">Nessuna foto campione caricata.</p>`;

    const html = `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<title>Scheda di Verniciatura ${esc(scheda.codicePubblico || scheda.id)}</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Jost',sans-serif;color:#1A1918;padding:14mm 12mm}
.header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:0.5mm solid #1A1918;padding-bottom:4mm;margin-bottom:6mm}
.titolo{font-size:22px;font-weight:800;letter-spacing:.02em}
.sottotitolo{font-size:12px;color:#6b6966;margin-top:1mm}
.badge{display:inline-block;padding:1mm 3mm;border-radius:2mm;font-size:11px;font-weight:700;margin-top:2mm}
.badge-bozza{background:#FEF3C7;color:#92400E}
.badge-in_revisione{background:#FEF9C3;color:#713F12}
.badge-approvato{background:#D1FAE5;color:#065F46}
.badge-rifiutato{background:#FEE2E2;color:#991B1B}
.cod-material{margin-top:3mm}
.cod-material-valore{font-size:18px;font-weight:800;margin-top:0.5mm}
.header-qr{display:flex;flex-direction:column;align-items:center;gap:1.5mm;max-width:32mm}
.header-qr .qrbox{line-height:0}
.header-qr .qrbox svg{display:block;width:24mm;height:24mm}
.header-qr .barcode{font-family:monospace;font-size:14px;font-weight:800}
.header-qr .nota{font-size:8px;color:#6b6966;text-align:center;line-height:1.3}
.campi{display:grid;grid-template-columns:1fr 1fr;gap:4mm 8mm;margin-bottom:7mm}
.campo-label{font-size:9px;font-weight:700;color:#6b6966;text-transform:uppercase;letter-spacing:.03em}
.campo-valore{font-size:15px;margin-top:0.5mm}
.sezione-titolo{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.03em;color:#6b6966;margin:6mm 0 2.5mm}
.fase{margin-bottom:5mm;page-break-inside:avoid}
.fase-titolo{font-size:14px;font-weight:700;margin-bottom:2mm}
table.prodotti{width:100%;border-collapse:collapse;font-size:12.5px}
table.prodotti th{text-align:left;border-bottom:0.3mm solid #ddd9d2;padding:2mm;color:#6b6966;font-weight:700;text-transform:uppercase;font-size:9.5px}
table.prodotti td{padding:2mm}
table.prodotti tr{border-bottom:0.3mm solid #f0ece5}
.foto-grid{display:flex;flex-wrap:wrap;gap:4mm}
.foto-grid img{width:55mm;height:55mm;object-fit:cover;border:0.3mm solid #ddd9d2;border-radius:2mm}
.muted{font-size:11px;color:#6b6966}
@media print{@page{size:A4;margin:0}}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="titolo">${esc(scheda.nome || "Scheda di Verniciatura")}</div>
      <div class="sottotitolo">v${scheda.versione}${scheda.schedaPadreId ? " (versione derivata)" : ""}</div>
      <div class="badge badge-${esc(scheda.stato)}">${esc(STATO_LABEL[scheda.stato] ?? scheda.stato)}</div>
      <div class="cod-material">
        <div class="campo-label">Cod. Material List</div>
        <div class="cod-material-valore">${esc(scheda.codiceCampioneMaterialista || "—")}</div>
      </div>
    </div>
    <div class="header-qr">
      <div class="qrbox">${qrSvg}</div>
      <div class="barcode">${esc(scheda.codicePubblico || "—")}</div>
      <div class="nota">Scansiona il QR per aprire la scheda digitale aggiornata.</div>
    </div>
  </div>

  <div class="campi">
    <div><div class="campo-label">Cliente</div><div class="campo-valore">${esc(scheda.cliente || "—")}</div></div>
    <div><div class="campo-label">Commessa</div><div class="campo-valore">${esc(scheda.numeroCommessa || "—")}</div></div>
    <div><div class="campo-label">Essenza</div><div class="campo-valore">${esc(scheda.essenza || "—")}</div></div>
    <div><div class="campo-label">Ignifuga</div><div class="campo-valore">${scheda.ignifuga === true ? "Sì" : scheda.ignifuga === false ? "No" : "—"}</div></div>
    <div><div class="campo-label">Data prova</div><div class="campo-valore">${fmtData(scheda.dataProva)}</div></div>
  </div>

  <div class="sezione-titolo">Fasi e vernici</div>
  ${fasiHtml || `<p class="muted">Nessuna fase.</p>`}

  <div class="sezione-titolo">Foto campione</div>
  ${fotoHtml}

  ${scheda.note ? `<div class="sezione-titolo">Note</div><p class="campo-valore">${esc(scheda.note)}</p>` : ""}
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
        margin: { top: "0mm", right: "0mm", bottom: "12mm", left: "0mm" },
        displayHeaderFooter: true,
        headerTemplate: `<span></span>`,
        // footerTemplate è renderizzato in un contesto isolato (niente CSS/font della pagina),
        // quindi stile inline minimale — compare su ogni pagina, non solo sull'ultima come
        // sarebbe stato con un div a fine contenuto.
        footerTemplate: `<div style="width:100%;font-family:Arial,sans-serif;font-size:8px;color:#6b6966;text-align:center;padding-top:2mm;">Stampato il ${fmtData(new Date().toISOString())}</div>`,
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="scheda-verniciatura-${(scheda.codicePubblico || scheda.id).replace(/\//g, "-")}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[verniciatura/schede/stampa]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
