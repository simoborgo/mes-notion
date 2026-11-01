// pdf.js caricato una volta sola nel browser; il worker è servito da /public.
export async function getPdfjsLib(): Promise<typeof import("pdfjs-dist")> {
  // @ts-expect-error — cache globale condivisa con gli annotatori
  if (window.__pdfjsLib) return window.__pdfjsLib as typeof import("pdfjs-dist");
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
  // @ts-expect-error — cache globale
  window.__pdfjsLib = pdfjsLib;
  return pdfjsLib;
}
