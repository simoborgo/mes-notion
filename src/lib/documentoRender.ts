import { getPdfjsLib } from "./pdfjsClient";

// Interfaccia minima di pdf.js usata dal rendering; le immagini la implementano con un adattatore.
export interface PaginaRender {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void>; cancel?: () => void };
}
export interface DocumentoRender { numPages: number; getPage: (n: number) => Promise<PaginaRender> }

// Scarica il file in streaming per mostrare l'avanzamento (progresso null se il server non
// dichiara la lunghezza), poi lo prepara per il rendering.
export async function caricaDocumento(url: string, mimeType: string, onProgress: (p: number | null) => void): Promise<DocumentoRender> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("File non trovato");
  const totale = Number(res.headers.get("content-length")) || 0;
  const pezzi: Uint8Array[] = [];
  let letti = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pezzi.push(value);
      letti += value.length;
      onProgress(totale ? Math.min(1, letti / totale) : null);
    }
  } else {
    pezzi.push(new Uint8Array(await res.arrayBuffer()));
  }
  const dati = new Uint8Array(pezzi.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of pezzi) { dati.set(p, off); off += p.length; }

  if (mimeType === "application/pdf") {
    const pdfjsLib = await getPdfjsLib();
    const pdf = await pdfjsLib.getDocument({ data: dati }).promise;
    return pdf as unknown as DocumentoRender;
  }
  const bmp = await createImageBitmap(new Blob([dati], { type: mimeType }));
  return {
    numPages: 1,
    getPage: async () => ({
      getViewport: ({ scale }) => ({ width: bmp.width * scale, height: bmp.height * scale }),
      render: ({ canvasContext, viewport }) => {
        canvasContext.drawImage(bmp, 0, 0, viewport.width, viewport.height);
        return { promise: Promise.resolve() };
      },
    }),
  };
}
