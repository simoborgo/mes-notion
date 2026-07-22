const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Restituisce i bounds della pagina e una funzione normToPdf che converte
 * coordinate normalizzate (0-1, sistema pdf.js: origine top-left) in
 * coordinate pdf-lib (origine bottom-left), tenendo conto della rotazione.
 *
 * Per pagine ruotate pdf-lib vede W/H come se fossero scambiate (getSize() swap),
 * ma le coordinate di disegno restano nel sistema non-ruotato del MediaBox.
 * Le formule derivano dalla matrice di viewport di pdf.js per ogni angolo di rotazione.
 */
function getPageBounds(page) {
  let rotation = 0;
  try { rotation = (page.getRotation().angle ?? 0 + 360) % 360; } catch (_) {}

  // Dimensioni originali (non-ruotate) del CropBox
  let W, H, ox = 0, oy = 0;
  try {
    const mb = page.getMediaBox();
    const cb = page.getCropBox();
    if (rotation === 90 || rotation === 270) {
      W = cb.height; H = cb.width;
    } else {
      W = cb.width;  H = cb.height;
    }
    if (mb && cb) { ox = cb.x - mb.x; oy = cb.y - mb.y; }
  } catch (_) {
    const size = page.getSize();
    W = size.width; H = size.height;
  }

  function normToPdf(nx, ny) {
    switch (rotation) {
      case 90:  return { x: ox + ny * W,       y: oy + H * (1 - nx) };
      case 180: return { x: ox + W * (1 - nx), y: oy + ny * H       };
      case 270: return { x: ox + W * (1 - ny), y: oy + nx * H       };
      default:  return { x: ox + nx * W,       y: oy + H * (1 - ny) };
    }
  }

  return { ox, oy, W, H, normToPdf };
}

/**
 * Costruisce il PDF verificato server-side.
 *
 * @param {object} opts
 * @param {Buffer} opts.originalBytes  - PDF originale da Notion
 * @param {Record<number, Array<Array<{x,y}>>>} opts.strokes  - tratti per pagina (coord 0-1)
 * @param {Record<number, Array<{x,y,tipo}>>} opts.stamps   - bolli per pagina (coord 0-1)
 * @param {string} opts.userName   - nome operatore
 * @param {string} opts.schedaOdp  - ODP display (es. MP26-014)
 * @param {Buffer[]} opts.fotoBuffers - foto JPEG, una per pagina aggiuntiva
 * @returns {Promise<Buffer>}
 */
async function buildVerificaPdf({ originalBytes, strokes = {}, stamps = {}, userName, schedaOdp, fotoBuffers = [] }) {
  const pdfDocLib = await PDFDocument.load(originalBytes);
  const pages = pdfDocLib.getPages();
  const helvetica = await pdfDocLib.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDocLib.embedFont(StandardFonts.HelveticaBold);

  // Tratti di evidenziazione (giallo semitrasparente)
  for (const [pageNumStr, pageStrokes] of Object.entries(strokes)) {
    const pageNum = parseInt(pageNumStr, 10);
    if (pageNum < 1 || pageNum > pages.length) continue;
    const page = pages[pageNum - 1];
    const { W, normToPdf } = getPageBounds(page);
    const lw = Math.max(12, W * 0.020);

    for (const stroke of pageStrokes) {
      if (stroke.length < 2) continue;
      for (let i = 1; i < stroke.length; i++) {
        page.drawLine({
          start: normToPdf(stroke[i - 1].x, stroke[i - 1].y),
          end:   normToPdf(stroke[i].x,     stroke[i].y),
          thickness: lw,
          color: rgb(1, 0.87, 0.2),
          opacity: 0.60,
        });
      }
    }
  }

  // Bolli OK (verde) / MANCA (rosso)
  for (const [pageNumStr, pageStamps] of Object.entries(stamps)) {
    const pageNum = parseInt(pageNumStr, 10);
    if (pageNum < 1 || pageNum > pages.length) continue;
    const page = pages[pageNum - 1];
    const { W, normToPdf } = getPageBounds(page);
    const r = Math.max(18, W * 0.030);

    for (const s of pageStamps) {
      const { x: cx, y: cy } = normToPdf(s.x, s.y);
      const isOk = s.tipo === 'ok';
      page.drawEllipse({
        x: cx, y: cy, xScale: r, yScale: r,
        color: isOk ? rgb(0.12, 0.60, 0.27) : rgb(0.80, 0.15, 0.15),
        opacity: 0.95,
        borderColor: rgb(1, 1, 1), borderWidth: 2.5,
      });
      const label = isOk ? 'OK' : '!';
      const fs = Math.round(r * 0.72);
      const tw = helveticaBold.widthOfTextAtSize(label, fs);
      page.drawText(label, {
        x: cx - tw / 2, y: cy - fs * 0.36,
        size: fs, font: helveticaBold, color: rgb(1, 1, 1),
      });
    }
  }

  // Firma operatore nell'ultima pagina
  const lastPage = pages[pages.length - 1];
  const { width: lw2 } = lastPage.getSize();
  const now = new Date().toLocaleString('it-IT');
  const firma = `Verificato da: ${userName} — ${now}`;
  lastPage.drawRectangle({ x: 20, y: 10, width: lw2 - 40, height: 20, color: rgb(0.95, 0.95, 0.95), opacity: 0.8 });
  lastPage.drawText(firma, { x: 24, y: 15, size: 8, font: helvetica, color: rgb(0.3, 0.3, 0.3) });

  // Pagine foto (JPEG o PNG)
  for (let i = 0; i < fotoBuffers.length; i++) {
    try {
      const imgBytes = new Uint8Array(fotoBuffers[i]);
      let img;
      try { img = await pdfDocLib.embedJpg(imgBytes); }
      catch { img = await pdfDocLib.embedPng(imgBytes); }
      const pg = pdfDocLib.addPage([595, 842]);
      const margin = 40;
      const maxW = 595 - margin * 2;
      const maxH = 842 - margin * 2 - 20;
      const scale = Math.min(maxW / img.width, maxH / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      pg.drawText(`Foto ${i + 1} — ${schedaOdp}`, {
        x: margin, y: 842 - margin - 14,
        size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3),
      });
      pg.drawImage(img, { x: margin, y: (842 - margin - ih) / 2, width: iw, height: ih });
    } catch (e) {
      console.warn(`[pdfBuilder] foto ${i + 1} skip:`, e.message);
    }
  }

  return Buffer.from(await pdfDocLib.save());
}

module.exports = { buildVerificaPdf };
