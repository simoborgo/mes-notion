import type { QrPosizione } from "./schedaPdfLayoutParser";

// Ripiego per il QR quando il parser non sa dov'è il cartiglio (PDF col testo convertito in
// curve, cartigli di altro formato, distinte in tabella): cerca un quadrato bianco direttamente
// sull'immagine renderizzata della pagina. Senza sapere dov'è il cartiglio si privilegia l'angolo
// in basso a destra (posizione standard del cartiglio) e si resta dentro la cornice del disegno:
// un punto è "dentro" se in tutte e quattro le direzioni, prima del bordo del foglio, c'è inchiostro.
// Solo se dentro la cornice non c'è posto (o la pagina non ha cornice) si accetta anche il margine.
//
// pixels = RGBA della pagina renderizzata (stessa orientazione della viewport pdf.js), larga
// `w` px e alta `h`; scala = px per unità viewport (larghezza canvas / larghezza viewport a scale 1).
// Il risultato è in coordinate viewport, come le posizioni del parser del cartiglio.

const LATI = [56, 48, 40]; // lato del QR in punti, dal più grande al più piccolo
const ARIA = 6; // bianco richiesto attorno alla zona del QR (pt), oltre la zona bianca del timbro
const BORDO = 14; // distanza minima dal bordo del foglio (pt)

export function trovaSpazioQrDaImmagine(pixels: Uint8ClampedArray, w: number, h: number, scala: number): QrPosizione | null {
  // Immagine integrale dei pixel "con inchiostro" (tutto ciò che non è quasi bianco)
  const W = w + 1;
  const integ = new Uint32Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let riga = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = pixels[i + 3];
      const lum = (pixels[i] * 299 + pixels[i + 1] * 587 + pixels[i + 2] * 114) / 1000;
      if (a > 16 && lum < 235) riga++;
      integ[(y + 1) * W + x + 1] = integ[y * W + x + 1] + riga;
    }
  }
  const inchiostro = (x0: number, y0: number, x1: number, y1: number) =>
    integ[y1 * W + x1] - integ[y0 * W + x1] - integ[y1 * W + x0] + integ[y0 * W + x0];

  // Angolo in alto a destra riservato alla scritta ODP rossa (pdfOdpStamp)
  const odpX0 = w * 0.72;
  const odpY1 = h * 0.09;

  const bordo = Math.round(BORDO * scala);
  const passo = Math.max(2, Math.round(3 * scala));
  // Prima tutte le misure dentro la cornice, poi (ripiego del ripiego) anche nel margine
  for (const soloDentro of [true, false]) {
    for (const lato of LATI) {
      const foot = lato * 1.12; // QR + zona bianca disegnata dal timbro
      const lp = Math.ceil((foot + 2 * ARIA) * scala); // quadrato da trovare tutto bianco, in px
      if (lp + 2 * bordo > Math.min(w, h)) continue;
      let migliore: { x: number; y: number; d: number } | null = null;
      for (let y = bordo; y + lp <= h - bordo; y += passo) {
        for (let x = bordo; x + lp <= w - bordo; x += passo) {
          if (x + lp > odpX0 && y < odpY1) continue;
          if (inchiostro(x, y, x + lp, y + lp) > 0) continue;
          if (soloDentro && !(
            inchiostro(0, y, x, y + lp) > 0 && inchiostro(x + lp, y, w, y + lp) > 0 &&
            inchiostro(x, 0, x + lp, y) > 0 && inchiostro(x, y + lp, x + lp, h) > 0
          )) continue;
          const d = Math.hypot(w - (x + lp / 2), h - (y + lp / 2)); // distanza dall'angolo in basso a destra
          if (!migliore || d < migliore.d) migliore = { x, y, d };
        }
      }
      if (migliore) {
        const m = ARIA + (foot - lato) / 2;
        return { x: migliore.x / scala + m, y: migliore.y / scala + m, size: lato };
      }
    }
  }
  return null;
}
