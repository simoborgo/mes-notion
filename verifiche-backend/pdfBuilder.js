const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

/**
 * Restituisce { x, y, width, height } del rettangolo di visualizzazione della pagina
 * come lo interpreta pdf.js (CropBox intersecato con MediaBox, con offset).
 * I coordinate di disegno in pdf-lib usano il sistema MediaBox (origine bottom-left),
 * quindi dobbiamo aggiungere l'offset del CropBox.
 */
function getPageBounds(page) {
  const size = page.getSize(); // { width, height } già gestisce rotazione e usa CropBox
  let ox = 0, oy = 0;
  try {
    const mb = page.getMediaBox();   // { x, y, width, height }
    const cb = page.getCropBox();    // { x, y, width, height }
    if (mb && cb) {
      ox = cb.x - mb.x;
      oy = cb.y - mb.y;
    }
  } catch (_) { /* fallback silenzioso */ }
  return { ox, oy, width: size.width, height: size.height };
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
    const { ox, oy, width, height } = getPageBounds(page);
    const lw = Math.max(12, width * 0.020);

    for (const stroke of pageStrokes) {
      if (stroke.length < 2) continue;
      for (let i = 1; i < stroke.length; i++) {
        page.drawLine({
          start: { x: ox + stroke[i - 1].x * width, y: oy + height - stroke[i - 1].y * height },
          end:   { x: ox + stroke[i].x * width,     y: oy + height - stroke[i].y * height },
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
    const { ox, oy, width, height } = getPageBounds(page);
    const r = Math.max(18, width * 0.030);

    for (const s of pageStamps) {
      const cx = ox + s.x * width;
      const cy = oy + height - s.y * height;
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
