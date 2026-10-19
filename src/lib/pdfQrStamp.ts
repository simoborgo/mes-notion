import { PDFDocument, rgb } from "pdf-lib";
import QRCode from "qrcode";
import type { QrPosizione } from "./schedaPdfLayoutParser";

// Timbra un QR code (vettoriale: nitido a qualsiasi stampa/zoom) sulle pagine di un PDF, nelle
// posizioni calcolate dal parser del cartiglio. Le posizioni sono in coordinate "viewport" di
// pdf.js (rotazione di pagina applicata, origine in alto a sinistra), mentre pdf-lib disegna nello
// spazio utente della pagina (non ruotato, origine in basso a sinistra): vedi vpAPdf.

type Angolo = 0 | 90 | 180 | 270;

// Inversa della trasformazione viewport di pdf.js per scale=1, con (x0,y0,x1,y1) = CropBox.
// Verificata empiricamente sui PDF reali (pagine a 0° e a 270°): un errore qui mette il QR in un
// angolo qualsiasi del foglio, quindi non va toccata senza riverificare a occhio.
function vpAPdf(rot: Angolo, box: { x0: number; y0: number; x1: number; y1: number }, vx: number, vy: number): [number, number] {
  switch (rot) {
    case 0: return [box.x0 + vx, box.y1 - vy];
    case 90: return [box.x0 + vy, box.y0 + vx];
    case 180: return [box.x1 - vx, box.y0 + vy];
    case 270: return [box.x1 - vy, box.y1 - vx];
  }
}

function normalizzaAngolo(a: number): Angolo {
  return ((((a % 360) + 360) % 360) as Angolo);
}

// posizioni[i] = posizione del QR sulla pagina i (0-based) del PDF, null = nessun QR su quella pagina.
// Restituisce il PDF timbrato e le pagine (1-based) rimaste senza QR perché senza posizione.
export async function timbraQr(
  pdf: Uint8Array | Buffer,
  url: string,
  posizioni: Array<QrPosizione | null | undefined>,
): Promise<{ bytes: Uint8Array; paginaSenzaQr: number[] }> {
  const doc = await PDFDocument.load(pdf);
  const qr = QRCode.create(url, { errorCorrectionLevel: "M" });
  const n = qr.modules.size;
  const paginaSenzaQr: number[] = [];

  doc.getPages().forEach((page, i) => {
    const pos = posizioni[i];
    if (!pos) { paginaSenzaQr.push(i + 1); return; }

    const rot = normalizzaAngolo(page.getRotation().angle);
    const cb = page.getCropBox();
    const box = { x0: cb.x, y0: cb.y, x1: cb.x + cb.width, y1: cb.y + cb.height };

    // Rettangolo (in coordinate viewport) → rettangolo nello spazio utente: con rotazioni multiple
    // di 90° resta allineato agli assi, bastano due angoli opposti.
    const disegnaRett = (vx: number, vy: number, w: number, h: number, colore: ReturnType<typeof rgb>) => {
      const [ax, ay] = vpAPdf(rot, box, vx, vy);
      const [bx, by] = vpAPdf(rot, box, vx + w, vy + h);
      page.drawRectangle({ x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay), color: colore, borderWidth: 0 });
    };

    // Zona bianca (quiet zone) attorno al QR: copre filetti e testo del disegno sottostante
    const modulo = pos.size / n;
    const margine = modulo * 2;
    disegnaRett(pos.x - margine, pos.y - margine, pos.size + 2 * margine, pos.size + 2 * margine, rgb(1, 1, 1));

    const nero = rgb(0.1, 0.1, 0.1);
    for (let r = 0; r < n; r++) {
      let c = 0;
      while (c < n) {
        if (!qr.modules.get(r, c)) { c++; continue; }
        let fine = c;
        while (fine < n && qr.modules.get(r, fine)) fine++; // unisce i moduli neri adiacenti della riga
        disegnaRett(pos.x + c * modulo, pos.y + r * modulo, (fine - c) * modulo, modulo, nero);
        c = fine;
      }
    }
  });

  return { bytes: await doc.save(), paginaSenzaQr };
}
