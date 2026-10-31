import { PDFDocument, PDFFont, PDFPage, StandardFonts, degrees, rgb } from "pdf-lib";
import { normalizzaAngolo, vpAPdf } from "./pdfQrStamp";
import type { OdpPosizione } from "./schedaPdfLayoutParser";

// Numero ODP scritto sui PDF delle schede: in rosso in alto a destra di ogni pagina e, dove il
// cartiglio lo prevede, nella cella "ODP MODAR". La stessa scritta in alto a destra la ristampano
// anche le stampe con le prime pagine (carichi, vista /schede): stessa funzione, stessa posizione e
// dimensione, così sui PDF già timbrati all'import le due scritte coincidono invece di sdoppiarsi.

export const ROSSO_ODP = rgb(0.86, 0.15, 0.15);

// Il font standard (WinAnsi) non codifica tutti i caratteri: meglio un "?" che un'eccezione che
// farebbe fallire l'intera stampa per un codice ODP anomalo.
export function latin1(s: string): string {
  return s.replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");
}

// Codice ODP in rosso nell'angolo in alto a destra *visivo* della pagina: con /Rotate 90/180/270 lo
// spazio utente è ruotato rispetto a ciò che si vede, quindi si converte (vx, vy dall'alto-sinistra
// visivo) in coordinate utente e si ruota il testo di conseguenza. Fino all'A3 (1191pt) 16pt; sui
// fogli più grandi (A1, A0) cresce in proporzione, altrimenti stampato in riduzione sparirebbe.
export function scriviOdpInAltoADestra(page: PDFPage, font: PDFFont, testo: string) {
  const { x: X, y: Y, width: W, height: H } = page.getMediaBox();
  const rot = normalizzaAngolo(page.getRotation().angle);
  const visW = rot === 90 || rot === 270 ? H : W;
  const scala = Math.max(1, visW / 1191);
  const size = 16 * scala;
  const margine = 18 * scala;
  const t = latin1(testo);
  const larghezzaTesto = font.widthOfTextAtSize(t, size);
  const vx = visW - margine - larghezzaTesto;
  const vy = margine + size * 0.75;
  const aUtente = (px: number, py: number): [number, number] => {
    if (rot === 90) return [X + py, Y + px];
    if (rot === 180) return [X + W - px, Y + py];
    if (rot === 270) return [X + W - py, Y + H - px];
    return [X + px, Y + H - py];
  };
  // Fondo bianco sotto la scritta: l'angolo in alto a destra spesso ospita il logo del cliente.
  const pad = size * 0.25;
  const [ax, ay] = aUtente(vx - pad, vy - size * 0.8);
  const [bx, by] = aUtente(vx + larghezzaTesto + pad, vy + size * 0.3);
  page.drawRectangle({ x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), color: rgb(1, 1, 1), borderWidth: 0 });
  const [x, y] = aUtente(vx, vy);
  page.drawText(t, { x, y, size, font, color: ROSSO_ODP, rotate: degrees(rot) });
}

// Valore nella cella "ODP MODAR" del cartiglio: pos è in coordinate viewport di pdf.js (come il QR),
// con x = bordo destro del testo (i valori del cartiglio sono allineati a destra) e y = baseline.
function scriviOdpNelCartiglio(page: PDFPage, font: PDFFont, testo: string, pos: OdpPosizione) {
  const rot = normalizzaAngolo(page.getRotation().angle);
  const cb = page.getCropBox();
  const box = { x0: cb.x, y0: cb.y, x1: cb.x + cb.width, y1: cb.y + cb.height };
  const t = latin1(testo);
  const [x, y] = vpAPdf(rot, box, pos.x - font.widthOfTextAtSize(t, pos.size), pos.y);
  page.drawText(t, { x, y, size: pos.size, font, color: ROSSO_ODP, rotate: degrees(rot) });
}

// posizioniCartiglio[i] = cella ODP della pagina i (0-based), null = cartiglio senza cella ODP.
// Restituisce le pagine (1-based) in cui l'ODP è stato scritto anche nel cartiglio.
export async function timbraOdp(
  pdf: Uint8Array | Buffer,
  odp: string,
  posizioniCartiglio: Array<OdpPosizione | null | undefined>,
): Promise<{ bytes: Uint8Array; pagineCartiglio: number[] }> {
  const doc = await PDFDocument.load(pdf);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const pagineCartiglio: number[] = [];
  doc.getPages().forEach((page, i) => {
    scriviOdpInAltoADestra(page, font, odp);
    const pos = posizioniCartiglio[i];
    if (pos) {
      scriviOdpNelCartiglio(page, font, odp, pos);
      pagineCartiglio.push(i + 1);
    }
  });
  return { bytes: await doc.save(), pagineCartiglio };
}
