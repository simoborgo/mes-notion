import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getSessionFromRequest } from "@/lib/auth";
import { buildCarichiCommessaReport } from "@/lib/reportCarichiCommessa";
import { buildCarichiCommessaHtml } from "@/lib/pdf/carichiCommessaHtml";
import { getLogoDataUriByCommessa } from "@/lib/brandRepository";
import { downloadDriveFile } from "@/lib/googleDriveSchede";
import { accodaPrimePagine, caricaPrimePagine, inParallelo } from "@/lib/pdf/primePagineAllegati";

export const maxDuration = 300;

const PREFISSO_DRIVE = "/api/drive-file/";

function mimeDaBuffer(b: Buffer): string {
  return b[0] === 0x89 && b[1] === 0x50 ? "image/png" : "image/jpeg";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const dettagliato = req.nextUrl.searchParams.get("tipo") === "dettagliato";
    const report = await buildCarichiCommessaReport(id);
    const odp = report.gruppi.flatMap((g) => g.odp);
    // Ogni ODP è seguito dalle sue sottoschede, i cui PDF vanno accodati interi.
    const voci = odp.flatMap((s) => [s, ...(report.sottoschede[s.id] ?? [])]);
    const idSotto = new Set(odp.flatMap((s) => (report.sottoschede[s.id] ?? []).map((f) => f.id)));

    // Miniature copertina: l'URL a video (/api/drive-file/…) richiede la sessione, che puppeteer
    // non ha — si scarica da Drive e si incorpora come data URI. Best-effort, senza miniatura se fallisce.
    const copertine = new Map<string, string>();
    await inParallelo(voci.filter((s) => s.copertina?.startsWith(PREFISSO_DRIVE)), async (s) => {
      try {
        const buf = await downloadDriveFile(s.copertina!.slice(PREFISSO_DRIVE.length));
        copertine.set(s.id, `data:${mimeDaBuffer(buf)};base64,${buf.toString("base64")}`);
      } catch (e) {
        console.error("[carichi-pdf] copertina non scaricata:", s.odp, e instanceof Error ? e.message : String(e));
      }
    });

    // Prima pagina del PDF allegato di ogni ODP (solo dettagliata), scaricata prima di generare il
    // riepilogo così quest'ultimo può segnare quali ODP hanno davvero il disegno.
    const pagine = dettagliato ? (await caricaPrimePagine(voci.map((v) => ({ id: v.id, odp: v.odp || v.numeroScheda || "Sottoscheda" })), "carichi-pdf")).pagine : new Map();

    const html = buildCarichiCommessaHtml(report, { copertine, conPdf: new Set(pagine.keys()), dettagliato, logo: await getLogoDataUriByCommessa(id).catch(() => null) });

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

      let output: Uint8Array = riepilogo;
      if (dettagliato && odp.length > 0) {
        // Nei carichi ogni ODP deve avere il suo disegno: chi non ce l'ha riceve la pagina d'errore.
        output = await accodaPrimePagine(output, voci.map((v) => ({ id: v.id, odp: v.odp || v.numeroScheda || "Sottoscheda" })), pagine, () => true, idSotto);
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
