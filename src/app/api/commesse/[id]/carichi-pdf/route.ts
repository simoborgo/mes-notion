import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { getSessionFromRequest } from "@/lib/auth";
import { buildCarichiCommessaReport } from "@/lib/reportCarichiCommessa";
import { buildCarichiCommessaHtml } from "@/lib/pdf/carichiCommessaHtml";
import { getPrimoPdfAllegatoDriveFileId } from "@/lib/schedeRepository";
import { downloadDriveFile } from "@/lib/googleDriveSchede";

export const maxDuration = 300;

const CONCORRENZA = 5;
const PREFISSO_DRIVE = "/api/drive-file/";

async function inParallelo<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCORRENZA, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

function mimeDaBuffer(b: Buffer): string {
  return b[0] === 0x89 && b[1] === 0x50 ? "image/png" : "image/jpeg";
}

const ROSSO = rgb(0.86, 0.15, 0.15);

// Il font standard (WinAnsi) non codifica tutti i caratteri: meglio un "?" che un'eccezione che
// farebbe fallire l'intera stampa per un codice ODP anomalo.
function latin1(s: string): string {
  return s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

// Codice ODP in rosso nell'angolo in alto a destra *visivo* della pagina: con /Rotate 90/180/270 lo
// spazio utente è ruotato rispetto a ciò che si vede, quindi si converte (vx, vy dall'alto-sinistra
// visivo) in coordinate utente e si ruota il testo di conseguenza.
function stampaOdpInAltoADestra(page: PDFPage, font: PDFFont, testo: string) {
  const size = 16;
  const margine = 18;
  const t = latin1(testo);
  const larghezzaTesto = font.widthOfTextAtSize(t, size);
  const { x: X, y: Y, width: W, height: H } = page.getMediaBox();
  const rot = ((page.getRotation().angle % 360) + 360) % 360;
  const visW = rot === 90 || rot === 270 ? H : W;
  const vx = visW - margine - larghezzaTesto;
  const vy = margine + size * 0.75;
  let x: number, y: number;
  if (rot === 90) { x = X + vy; y = Y + vx; }
  else if (rot === 180) { x = X + W - vx; y = Y + vy; }
  else if (rot === 270) { x = X + W - vy; y = Y + H - vx; }
  else { x = X + vx; y = Y + H - vy; }
  page.drawText(t, { x, y, size, font, color: ROSSO, rotate: degrees(rot) });
}

function paginaErrore(doc: PDFDocument, font: PDFFont, odp: string) {
  const page = doc.addPage([595.28, 841.89]);
  const t = latin1(odp);
  const size = 48;
  const w = font.widthOfTextAtSize(t, size);
  page.drawText(t, { x: (595.28 - w) / 2, y: 841.89 / 2, size, font, color: ROSSO });
  const sub = "(Errore scaricamento PDF)";
  const subSize = 16;
  page.drawText(sub, { x: (595.28 - font.widthOfTextAtSize(sub, subSize)) / 2, y: 841.89 / 2 - 34, size: subSize, font, color: ROSSO });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const dettagliato = req.nextUrl.searchParams.get("tipo") === "dettagliato";
    const report = await buildCarichiCommessaReport(id);
    const odp = report.gruppi.flatMap((g) => g.odp);

    // Miniature copertina: l'URL a video (/api/drive-file/…) richiede la sessione, che puppeteer
    // non ha — si scarica da Drive e si incorpora come data URI. Best-effort, senza miniatura se fallisce.
    const copertine = new Map<string, string>();
    await inParallelo(odp.filter((s) => s.copertina?.startsWith(PREFISSO_DRIVE)), async (s) => {
      try {
        const buf = await downloadDriveFile(s.copertina!.slice(PREFISSO_DRIVE.length));
        copertine.set(s.id, `data:${mimeDaBuffer(buf)};base64,${buf.toString("base64")}`);
      } catch (e) {
        console.error("[carichi-pdf] copertina non scaricata:", s.odp, e instanceof Error ? e.message : String(e));
      }
    });

    // Prima pagina del PDF allegato di ogni ODP (solo dettagliata), scaricata prima di generare il
    // riepilogo così quest'ultimo può segnare quali ODP hanno davvero il disegno.
    const pagine = new Map<string, PDFDocument>();
    if (dettagliato) {
      await inParallelo(odp, async (s) => {
        try {
          const driveId = await getPrimoPdfAllegatoDriveFileId(s.id);
          if (!driveId) return;
          const doc = await PDFDocument.load(await downloadDriveFile(driveId));
          if (doc.getPageCount() > 0) pagine.set(s.id, doc);
        } catch (e) {
          console.error("[carichi-pdf] PDF allegato non disponibile:", s.odp, e instanceof Error ? e.message : String(e));
        }
      });
    }

    const html = buildCarichiCommessaHtml(report, { copertine, conPdf: new Set(pagine.keys()), dettagliato });

    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluateHandle("document.fonts.ready");
      const riepilogo = await page.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
      });

      let output = Buffer.from(riepilogo);
      if (dettagliato && odp.length > 0) {
        const finale = await PDFDocument.load(output);
        const font = await finale.embedFont(StandardFonts.HelveticaBold);
        for (const s of odp) {
          const src = pagine.get(s.id);
          if (!src) {
            paginaErrore(finale, font, s.odp);
            continue;
          }
          const [prima] = await finale.copyPages(src, [0]);
          finale.addPage(prima);
          stampaOdpInAltoADestra(prima, font, s.odp);
        }
        output = Buffer.from(await finale.save());
      }

      const nome = report.commessa.numeroCommessa.replace(/[^\w.-]+/g, "_");
      return new NextResponse(new Uint8Array(output), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="carichi-${nome}-${dettagliato ? "dettagliato" : "riepilogo"}.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[commesse/carichi-pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
