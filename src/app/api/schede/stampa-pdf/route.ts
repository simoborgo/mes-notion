import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getSessionFromRequest } from "@/lib/auth";
import { getSchedeByIds } from "@/lib/schedeRepository";
import { buildSchedeVistaHtml } from "@/lib/pdf/schedeVistaHtml";
import { accodaPrimePagine, caricaPrimePagine } from "@/lib/pdf/primePagineAllegati";

export const maxDuration = 300;

// Stampa della vista corrente di /schede con la prima pagina del PDF allegato di ogni scheda in
// coda (come la stampa dettagliata dei carichi). Gli id arrivano già filtrati e ordinati dal client.
export async function POST(req: NextRequest) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const body = (await req.json().catch(() => null)) as { ids?: unknown; filtri?: unknown } | null;
    const ids = Array.isArray(body?.ids) ? body.ids.filter((x): x is string => typeof x === "string") : [];
    const filtri = typeof body?.filtri === "string" ? body.filtri : "";
    const schede = await getSchedeByIds(ids);

    const { pagine, errori } = await caricaPrimePagine(schede, "schede/stampa-pdf");
    const html = buildSchedeVistaHtml(schede, { filtri, conPdf: new Set(pagine.keys()), errori });

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
        margin: { top: "12mm", right: "10mm", bottom: "12mm", left: "10mm" },
      });

      // Schede senza PDF allegato: nessuna pagina (nella vista generale sono molte); PDF presente ma
      // non scaricabile: pagina d'errore rossa con l'ODP, come nei carichi.
      const output = await accodaPrimePagine(riepilogo, schede, pagine, (id) => errori.has(id));

      const oggi = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
      return new NextResponse(new Uint8Array(output), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="schede-${oggi}-con-disegni.pdf"`,
          "Cache-Control": "no-store",
        },
      });
    } finally {
      await browser.close();
    }
  } catch (e) {
    console.error("[schede/stampa-pdf]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
