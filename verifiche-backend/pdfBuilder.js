const { PDFDocument, rgb, StandardFonts, degrees } = require('pdf-lib');

/**
 * Restituisce i bounds della pagina e una funzione normToPdf che converte
 * coordinate normalizzate (0-1, sistema pdf.js: origine top-left) in
 * coordinate pdf-lib (origine bottom-left), tenendo conto della rotazione.
 *
 * W/H sono già le dimensioni VISIVE (scambiate rispetto al CropBox grezzo per
 * rotazione 90/270 — pdf-lib stesso non fa mai questo scambio, getSize() resta
 * sempre grezzo). Le coordinate di disegno restano nel sistema non-ruotato del
 * MediaBox: il compito di normToPdf è mappare un punto "come visto sullo schermo"
 * in quel sistema grezzo, così che il rendering finale (dopo il /Rotate del
 * viewer) torni al punto visivo originale.
 *
 * Le formule per i 4 casi sono derivate e verificate contro la matrice di
 * viewport di pdf.js (PageViewport, pdf.mjs) per ciascun angolo — i casi 90/270
 * erano storicamente sbagliati (assi scambiati), corretto il 2026-09-10 dopo
 * un bug segnalato sull'overlay ruotato in Verifica Spedizione.
 */
function getPageBounds(page) {
  let rotation = 0;
  try { rotation = ((page.getRotation().angle ?? 0) + 360) % 360; } catch (_) {}

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
      case 90:  return { x: ox + ny * H,       y: oy + nx * W       };
      case 180: return { x: ox + W * (1 - nx), y: oy + ny * H       };
      case 270: return { x: ox + H * (1 - ny), y: oy + W * (1 - nx) };
      default:  return { x: ox + nx * W,       y: oy + H * (1 - ny) };
    }
  }

  return { ox, oy, W, H, rotation, normToPdf };
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
    const { W, H, rotation, normToPdf } = getPageBounds(page);
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
      // Centratura calcolata in spazio normalizzato (non sull'offset raw cx/cy): su pagina
      // ruotata uno spostamento raw non corrisponde allo stesso spostamento visivo (vedi
      // commento sulla firma più sotto), e "rotate" raddrizza solo l'orientamento del glifo,
      // non la sua posizione.
      const { x: tx, y: ty } = normToPdf(s.x - (tw / 2) / W, s.y + (fs * 0.36) / H);
      page.drawText(label, {
        x: tx, y: ty,
        size: fs, font: helveticaBold, color: rgb(1, 1, 1),
        rotate: degrees(rotation),
      });
    }
  }

  // Firma operatore nell'ultima pagina — stessa correzione rotation-aware di tratti/timbri
  // sopra: usava lastPage.getSize() (dimensioni raw della MediaBox, mai la rotazione) e
  // coordinate fisse, quindi su una pagina con /Rotate 90/270 (es. scan orizzontale con
  // MediaBox verticale) la barra finiva sul lato sbagliato e il testo appariva ruotato di
  // 90°/270° rispetto al resto della pagina come visualizzata.
  const lastPage = pages[pages.length - 1];
  const { W: lastW, H: lastH, rotation: lastRotation, normToPdf: lastNormToPdf } = getPageBounds(lastPage);
  const now = new Date().toLocaleString('it-IT');
  const firma = `Verificato da: ${userName} — ${now}`;
  // Bordi della barra in spazio normalizzato (0-1, origine in alto a sinistra come lo schermo),
  // equivalenti ai margini raw originali (20pt laterali, 10-30pt dal basso) quando rotation=0 —
  // mappati poi in raw tramite normToPdf, che già gestisce lo scambio W/H per rotazione 90/270.
  const barCorners = [
    lastNormToPdf(20 / lastW, 1 - 30 / lastH),
    lastNormToPdf(1 - 20 / lastW, 1 - 30 / lastH),
    lastNormToPdf(20 / lastW, 1 - 10 / lastH),
    lastNormToPdf(1 - 20 / lastW, 1 - 10 / lastH),
  ];
  const barX = Math.min(...barCorners.map((c) => c.x));
  const barY = Math.min(...barCorners.map((c) => c.y));
  const barW = Math.max(...barCorners.map((c) => c.x)) - barX;
  const barH = Math.max(...barCorners.map((c) => c.y)) - barY;
  lastPage.drawRectangle({ x: barX, y: barY, width: barW, height: barH, color: rgb(0.95, 0.95, 0.95), opacity: 0.8 });
  const { x: firmaX, y: firmaY } = lastNormToPdf(24 / lastW, 1 - 15 / lastH);
  lastPage.drawText(firma, { x: firmaX, y: firmaY, size: 8, font: helvetica, color: rgb(0.3, 0.3, 0.3), rotate: degrees(lastRotation) });

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
