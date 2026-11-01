import { PDFDocument } from "pdf-lib";
import { caricaDocumento } from "./documentoRender";
import { disegnaOverlay, type Point, type Stamp, type ZonaRender } from "./pianteOverlay";

const LARGHEZZA_MAX = 4000;
const PIXEL_MAX = 16_000_000;

const toJpeg = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine non generata"))), "image/jpeg", q));

// PDF "cotto" della pianta: ogni pagina diventa un'immagine con zone, tratti e bolli già sopra,
// disegnati dallo stesso codice dello schermo. Il file è leggero, si apre ovunque e non richiede
// elaborazioni, ma le zone non sono cliccabili e riflette lo stato degli ODP al momento dell'esportazione.
export async function esportaPiantaPdf(o: {
  url: string;
  mimeType: string;
  strokes: Record<number, Point[][]>;
  stamps: Record<number, Stamp[]>;
  zone: ZonaRender[];
  nomeFile: string;
}): Promise<void> {
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
    out.addPage([w, h]).drawImage(jpg, { x: 0, y: 0, width: w, height: h });
  }

  const bytes = await out.save();
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url; a.download = o.nomeFile;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
