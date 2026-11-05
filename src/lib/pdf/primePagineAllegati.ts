import { PDFDocument, PDFFont, StandardFonts } from "pdf-lib";
import { getPrimoPdfAllegatoDriveFileId } from "@/lib/schedeRepository";
import { downloadDriveFile } from "@/lib/googleDriveSchede";
import { ROSSO_ODP as ROSSO, latin1, scriviOdpInAltoADestra } from "@/lib/pdfOdpStamp";

// Prima pagina del PDF allegato di ogni ODP accodata a un riepilogo — usata dalla stampa
// dettagliata dei carichi e dalla stampa con disegni della vista /schede.

const CONCORRENZA = 5;

export async function inParallelo<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
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

export interface VoceOdp {
  id: string;
  odp: string;
}

export interface PrimePagine {
  // scheda.id → PDF allegato scaricato (con almeno una pagina)
  pagine: Map<string, PDFDocument>;
  // scheda.id con un PDF allegato che non è stato possibile scaricare/leggere
  errori: Set<string>;
}

// Scarica il primo PDF allegato di ogni scheda; chi non ne ha non finisce né in pagine né in errori.
export async function caricaPrimePagine(voci: VoceOdp[], tag: string): Promise<PrimePagine> {
  const pagine = new Map<string, PDFDocument>();
  const errori = new Set<string>();
  await inParallelo(voci, async (s) => {
    let driveId: string | null = null;
    try {
      driveId = await getPrimoPdfAllegatoDriveFileId(s.id);
      if (!driveId) return;
      const doc = await PDFDocument.load(await downloadDriveFile(driveId));
      if (doc.getPageCount() > 0) pagine.set(s.id, doc);
      else errori.add(s.id);
    } catch (e) {
      errori.add(s.id);
      console.error(`[${tag}] PDF allegato non disponibile:`, s.odp, e instanceof Error ? e.message : String(e));
    }
  });
  return { pagine, errori };
}

// Accoda al riepilogo la prima pagina di ogni voce (ODP in rosso in alto a destra). Le voci senza
// pagina ricevono una pagina d'errore se `conPaginaErrore` lo dice, altrimenti vengono saltate.
export async function accodaPrimePagine(
  riepilogo: Uint8Array,
  voci: VoceOdp[],
  pagine: Map<string, PDFDocument>,
  conPaginaErrore: (id: string) => boolean,
  // id delle voci (sottoschede) di cui accodare il PDF intero invece della sola prima pagina
  interi: Set<string> = new Set(),
): Promise<Uint8Array> {
  const finale = await PDFDocument.load(riepilogo);
  const font = await finale.embedFont(StandardFonts.HelveticaBold);
  for (const s of voci) {
    const src = pagine.get(s.id);
    if (!src) {
      if (conPaginaErrore(s.id)) paginaErrore(finale, font, s.odp);
      continue;
    }
    const indici = interi.has(s.id) ? src.getPageIndices() : [0];
    for (const pg of await finale.copyPages(src, indici)) {
      finale.addPage(pg);
      scriviOdpInAltoADestra(pg, font, s.odp);
    }
  }
  return finale.save();
}
