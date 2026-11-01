import { PDFDocument, PDFString } from "pdf-lib";
import { caricaDocumento } from "./documentoRender";
import { disegnaOverlay, type Point, type Stamp, type ZonaRender } from "./pianteOverlay";

const LARGHEZZA_MAX = 4000;
const PIXEL_MAX = 16_000_000;

const toJpeg = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine non generata"))), "image/jpeg", q));

// PDF "cotto" della pianta (restituisce i byte: il chiamante lo salva sul server): ogni pagina diventa un'immagine con zone, tratti e bolli già sopra,
// disegnati dallo stesso codice dello schermo. Il file è leggero, si apre ovunque e non richiede
// elaborazioni; le zone con un ODP sono link cliccabili alla scheda. Riflette lo stato degli ODP al momento dell'esportazione.
export async function generaPiantaPdf(o: {
  url: string;
  mimeType: string;
  strokes: Record<number, Point[][]>;
  stamps: Record<number, Stamp[]>;
  zone: ZonaRender[];
}): Promise<Uint8Array> {
  const doc = await caricaDocumento(o.url, o.mimeType, () => {});
  const out = await PDFDocument.create();
  const zone = o.zone.map((z) => ({ ...z, selezionata: false }));

  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vp0 = page.getViewport({ scale: 1 });
    const k = Math.min(LARGHEZZA_MAX / vp0.width, Math.sqrt(PIXEL_MAX / (vp0.width * vp0.height)));
    const vp = page.getViewport({ scale: k });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    disegnaOverlay(ctx, canvas.width, canvas.height, { pagina: n, strokes: o.strokes, stamps: o.stamps, zone, scala: canvas.width / 1400 });

    const jpg = await out.embedJpg(new Uint8Array(await (await toJpeg(canvas, 0.9)).arrayBuffer()));
    const w = canvas.width * 0.5, h = canvas.height * 0.5; // dimensione di pagina arbitraria, proporzioni invariate
    const pdfPage = out.addPage([w, h]);
    pdfPage.drawImage(jpg, { x: 0, y: 0, width: w, height: h });
    // ogni zona con un indirizzo diventa un link cliccabile sopra la sua area
    for (const z of zone) {
      if (z.pagina !== n || !z.href) continue;
      const annot = out.context.register(out.context.obj({
        Type: "Annot", Subtype: "Link", Border: [0, 0, 0],
        Rect: [z.x * w, h - (z.y + z.h) * h, (z.x + z.w) * w, h - z.y * h],
        A: { Type: "Action", S: "URI", URI: PDFString.of(z.href) },
      }));
      pdfPage.node.addAnnot(annot);
    }
  }

  return out.save();
}
