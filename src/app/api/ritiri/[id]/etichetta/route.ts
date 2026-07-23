import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import QRCode from "qrcode";
import { getRitiroById, getSchedaById, getCommessaById } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function truncate(s: string, maxLen: number) {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "..." : s;
}

// Spezza il testo in righe che stanno dentro maxWidth (pt)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function wrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = current ? current + " " + word : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      // Se la singola parola è troppo larga, la tronca
      current = font.widthOfTextAtSize(word, size) > maxWidth
        ? truncate(word, Math.floor(word.length * maxWidth / font.widthOfTextAtSize(word, size)))
        : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const ritiro = await getRitiroById(id);

    // Fetch scheda / commessa per ODP, nScheda, clienteInfo
    let schedaOdp = ritiro.numeroOrdine;
    let nScheda = "";
    let clienteInfo = "";
    let schedaPadreOdp = "";
    let schedaPadreNr = "";

    if (ritiro.numeroOrdineId) {
      try {
        const scheda = await getSchedaById(ritiro.numeroOrdineId);
        schedaOdp = scheda.odp || ritiro.numeroOrdine;
        nScheda = scheda.numeroScheda || "";
        clienteInfo = scheda.clienteInfo || "";

        if (!clienteInfo && scheda.parentId) {
          const parent = await getSchedaById(scheda.parentId);
          clienteInfo = parent.clienteInfo || "";
          schedaPadreOdp = parent.odp || "";
          schedaPadreNr = parent.numeroScheda || "";
        }
      } catch { /* fallback ai dati ritiro */ }
    } else if (!schedaOdp && ritiro.commessaId) {
      // Nessun ODP: usa commessa come riferimento principale
      try {
        const commessa = await getCommessaById(ritiro.commessaId);
        schedaOdp = commessa.numeroCommessa;
        // nScheda mostra cliente + località + info
        const parts = [commessa.cliente, commessa.localita, commessa.info].filter(Boolean);
        nScheda = parts.join(" · ");
        clienteInfo = commessa.cliente || "";
      } catch { /* fallback */ }
    } else if (!schedaOdp && ritiro.commessaNr) {
      schedaOdp = ritiro.commessaNr;
    }

    // QR code verso Notion (PNG buffer)
    const qrPng = await QRCode.toBuffer(ritiro.notionUrl, {
      type: "png",
      width: 200,
      margin: 1,
      color: { dark: "#111111", light: "#ffffff" },
    });

    // Prima foto del ritiro (se presente)
    let firstPhoto: Uint8Array | null = null;
    if (ritiro.foto.length > 0) {
      try {
        const res = await fetch(ritiro.foto[0].url);
        if (res.ok) firstPhoto = new Uint8Array(await res.arrayBuffer());
      } catch { /* skip */ }
    }

    // PDF A4 portrait
    const doc = await PDFDocument.create();
    const page = doc.addPage(PageSizes.A4);
    const { width, height } = page.getSize(); // 595 x 842
    const helvetica = await doc.embedFont(StandardFonts.Helvetica);
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);

    const isRitiro = ritiro.tipoMovimento === "Ritiro";
    const badgeBg = isRitiro ? hexToRgb("#166534") : hexToRgb("#9A3412");
    const badgeText = isRitiro ? "<  RITIRO" : ">  CONSEGNA";
    const margin = 36;
    let y = height - margin;

    // ── Header grigio ────────────────────────────────────────
    const headerH = 60;
    page.drawRectangle({ x: 0, y: height - headerH, width, height: headerH, color: hexToRgb("#78716C") });
    page.drawText("MODAR", {
      x: margin, y: height - headerH + (headerH - 26) / 2 + 2,
      size: 26, font: bold, color: rgb(1, 1, 1),
    });
    const dataStr = (() => {
      if (!ritiro.dataTrasporto) return "—";
      const dt = new Date(ritiro.dataTrasporto);
      const dateStr = dt.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
      if (ritiro.dataTrasporto.includes("T")) {
        const h = dt.getHours(), m = dt.getMinutes();
        if (h !== 0 || m !== 0) return `${dateStr}  ${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
      }
      return dateStr;
    })();
    const dataLabel = `Data trasporto: ${dataStr}`;
    const dataW = helvetica.widthOfTextAtSize(dataLabel, 11);
    page.drawText(dataLabel, {
      x: width - margin - dataW, y: height - headerH + (headerH - 11) / 2 + 2,
      size: 11, font: helvetica, color: rgb(0.9, 0.88, 0.86),
    });
    y = height - headerH - 20;

    // ── ODP ──────────────────────────────────────────────────
    const odpStr = schedaOdp || "—";
    const odpSize = 64;
    const odpW = bold.widthOfTextAtSize(odpStr, odpSize);
    page.drawText(odpStr, {
      x: (width - odpW) / 2, y: y - odpSize,
      size: odpSize, font: bold, color: hexToRgb("#111827"),
    });
    y = y - odpSize - 10;

    // ── N Scheda (sotto ODP, -40% rispetto ODP, con a-capo automatico) ──
    if (nScheda) {
      const nSchedaSize = Math.round(odpSize * 0.64); // 0.8 * 0.8 = -20% aggiuntivo
      const maxW = width - margin * 2;
      const lines = wrapText(nScheda, bold, nSchedaSize, maxW);
      for (const line of lines) {
        const lw = bold.widthOfTextAtSize(line, nSchedaSize);
        page.drawText(line, {
          x: (width - lw) / 2, y: y - nSchedaSize,
          size: nSchedaSize, font: bold, color: hexToRgb("#374151"),
        });
        y = y - nSchedaSize - 6;
      }
      y -= 6;
    } else {
      y -= 4;
    }

    // ── Badge Tipo ────────────────────────────────────────────
    const badgeH = 48;
    const badgePadX = 32;
    const badgeTxtSize = 26;
    const badgeTxtW = bold.widthOfTextAtSize(badgeText, badgeTxtSize);
    const badgeW = badgeTxtW + badgePadX * 2;
    const badgeX = (width - badgeW) / 2;
    page.drawRectangle({ x: badgeX, y: y - badgeH, width: badgeW, height: badgeH, color: badgeBg });
    page.drawText(badgeText, {
      x: badgeX + badgePadX, y: y - badgeH + (badgeH - badgeTxtSize) / 2 + 2,
      size: badgeTxtSize, font: bold, color: rgb(1, 1, 1),
    });
    y = y - badgeH - 20;

    // ── Separatore ───────────────────────────────────────────
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: hexToRgb("#E5E7EB") });
    y -= 18;

    // ── Cliente Info ─────────────────────────────────────────
    if (clienteInfo) {
      page.drawText("CLIENTE", { x: margin, y, size: 9, font: helvetica, color: hexToRgb("#6B7280") });
      y -= 20;
      page.drawText(truncate(clienteInfo, 50), {
        x: margin, y, size: 18, font: bold, color: hexToRgb("#111827"),
      });
      y -= 28;
    }

    // ── Fornitore ────────────────────────────────────────────
    if (ritiro.fornitore) {
      page.drawText("FORNITORE", { x: margin, y, size: 9, font: helvetica, color: hexToRgb("#6B7280") });
      y -= 24;
      page.drawText(truncate(ritiro.fornitore.toUpperCase(), 38), {
        x: margin, y, size: 24, font: bold, color: hexToRgb("#111827"),
      });
      y -= 34;
    }

    // ── Descrizione ──────────────────────────────────────────
    const desc = ritiro.causale || ritiro.descrizioneMerce || "";
    if (desc) {
      page.drawText("DESCRIZIONE", { x: margin, y, size: 9, font: helvetica, color: hexToRgb("#6B7280") });
      y -= 18;
      page.drawText(truncate(desc, 60), {
        x: margin, y, size: 13, font: helvetica, color: hexToRgb("#374151"),
      });
      y -= 22;
    }

    // ── Note ─────────────────────────────────────────────────
    if (ritiro.note && ritiro.note !== ritiro.causale) {
      page.drawText("NOTE", { x: margin, y, size: 9, font: helvetica, color: hexToRgb("#6B7280") });
      y -= 16;
      page.drawText(truncate(ritiro.note, 70), {
        x: margin, y, size: 11, font: helvetica, color: hexToRgb("#6B7280"),
      });
      y -= 20;
    }

    // ── Separatore ───────────────────────────────────────────
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: hexToRgb("#E5E7EB") });
    y -= 16;

    // ── Foto + QR (affiancati) ───────────────────────────────
    const qrImg = await doc.embedPng(qrPng);
    const qrSize = 110;
    const qrX = width - margin - qrSize;

    if (firstPhoto) {
      try {
        let img;
        try { img = await doc.embedJpg(firstPhoto); } catch { img = await doc.embedPng(firstPhoto); }
        const maxPhotoW = qrX - margin - 16;
        const maxPhotoH = Math.max(qrSize, 130);
        const scale = Math.min(maxPhotoW / img.width, maxPhotoH / img.height);
        const pw = img.width * scale;
        const ph = img.height * scale;
        page.drawImage(img, { x: margin, y: y - ph, width: pw, height: ph });
      } catch { /* skip foto */ }
    }

    // QR code in basso a destra
    page.drawImage(qrImg, { x: qrX, y: y - qrSize, width: qrSize, height: qrSize });
    page.drawText("Apri in Notion", {
      x: qrX + (qrSize - helvetica.widthOfTextAtSize("Apri in Notion", 8)) / 2,
      y: y - qrSize - 10,
      size: 8, font: helvetica, color: hexToRgb("#9CA3AF"),
    });

    // ── Footer con riferimenti scheda padre ──────────────────
    const footerH = clienteInfo ? 52 : 36;
    page.drawRectangle({ x: 0, y: 0, width, height: footerH, color: hexToRgb("#F3F4F6") });

    // Sinistra: RIF. SCHEDA + clienteInfo
    const padreRef = schedaPadreOdp
      ? `Scheda: ${schedaPadreOdp}${schedaPadreNr ? " | " + schedaPadreNr : ""}`
      : schedaOdp
        ? `Scheda: ${schedaOdp}${nScheda ? " | " + nScheda : ""}`
        : "";
    let footerY = footerH - 10;
    page.drawText("RIF. SCHEDA", { x: margin, y: footerY, size: 6, font: bold, color: hexToRgb("#9CA3AF") });
    footerY -= 13;
    if (padreRef) {
      page.drawText(truncate(padreRef, 55), { x: margin, y: footerY, size: 9, font: bold, color: hexToRgb("#374151") });
      footerY -= 13;
    }
    if (clienteInfo) {
      page.drawText(truncate(clienteInfo, 55), { x: margin, y: footerY, size: 8, font: helvetica, color: hexToRgb("#6B7280") });
    }

    // Destra: MES info
    const footerTxt = `MES Modar | ${ritiro.tipoMovimento} | ID: ${ritiro.id.slice(0, 8).toUpperCase()}`;
    const footerTxtW = helvetica.widthOfTextAtSize(footerTxt, 7);
    page.drawText(footerTxt, {
      x: width - margin - footerTxtW, y: footerH - 20,
      size: 7, font: helvetica, color: hexToRgb("#9CA3AF"),
    });

    const pdfBytes = await doc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="etichetta-${schedaOdp?.replace(/\//g, "-") || id}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("[etichetta]", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
