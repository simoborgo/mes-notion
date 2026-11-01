import { getPdfjsLib } from "./pdfjsClient";

// Immagini derivate dalla pianta, generate nel browser: miniatura per la tab e "vista" ad alta
// risoluzione per aprirla in fretta. La vista esiste solo per i PDF di una pagina e per le immagini
// (un PDF a più pagine si apre dall'originale).
const LARGHEZZA_VISTA = 4500;
const MAX_PIXEL_VISTA = 16_000_000;
export const ALTEZZA_MINIATURA = 400;

const toJpeg = (c: HTMLCanvasElement, q: number) => new Promise<Blob>((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("Immagine non generata"))), "image/jpeg", q));

function miniaturaDa(sorgente: HTMLCanvasElement): HTMLCanvasElement {
  const k = ALTEZZA_MINIATURA / sorgente.height;
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sorgente.width * k)); c.height = ALTEZZA_MINIATURA;
  c.getContext("2d")!.drawImage(sorgente, 0, 0, c.width, c.height);
  return c;
}

export async function generaDerivati(file: Blob, mimeType: string): Promise<{ vista: Blob | null; anteprima: Blob }> {
  if (mimeType === "application/pdf") {
    const pdfjsLib = await getPdfjsLib();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
    const page = await pdf.getPage(1);
    const vp0 = page.getViewport({ scale: 1 });
    const scala = pdf.numPages === 1
      ? Math.min(LARGHEZZA_VISTA / vp0.width, Math.sqrt(MAX_PIXEL_VISTA / (vp0.width * vp0.height)))
      : ALTEZZA_MINIATURA / vp0.height;
    const vp = page.getViewport({ scale: scala });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // niente sfondo trasparente nel JPEG
    await page.render({ canvas, canvasContext: ctx, viewport: vp }).promise;
    const anteprima = await toJpeg(pdf.numPages === 1 ? miniaturaDa(canvas) : canvas, 0.8);
    return { vista: pdf.numPages === 1 ? await toJpeg(canvas, 0.85) : null, anteprima };
  }
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, LARGHEZZA_VISTA / bmp.width, Math.sqrt(MAX_PIXEL_VISTA / (bmp.width * bmp.height)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k); canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { vista: await toJpeg(canvas, 0.85), anteprima: await toJpeg(miniaturaDa(canvas), 0.8) };
}

// Salva sul server le immagini derivate di una pianta già registrata.
export async function salvaDerivati(commessaId: string, piantaId: string, d: { vista: Blob | null; anteprima: Blob }): Promise<void> {
  const base = `/api/commesse/${commessaId}/piante/${piantaId}`;
  const put = (nome: string, b: Blob) => fetch(`${base}/${nome}`, { method: "PUT", body: b });
  await Promise.all([put("anteprima", d.anteprima), d.vista ? put("vista", d.vista) : Promise.resolve(null)]);
}
