import { NextRequest, NextResponse } from "next/server";
import { PDFDocument, rgb, StandardFonts, PageSizes } from "pdf-lib";
import QRCode from "qrcode";
import { getRitiroById, getSchedaById } from "@/lib/notion";
import { getSessionFromRequest } from "@/lib/auth";

function hexToRgb(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function truncate(s: string, maxLen: number) {
  return s.length > maxLen ? s.slice(0, maxLen - 1) + "..." : s;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSessionFromRequest(req);
    if (!session) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });

    const { id } = await params;
    const ritiro = await getRitiroById(id);

    // Fetch scheda per cliente/commessa (non bloccante se non disponibile)
    let schedaOdp = ritiro.numeroOrdine;
    let nScheda = "";
    let cliente = "";
    let commessa = "";
    if (ritiro.numeroOrdineId) {
      try {
        const scheda = await getSchedaById(ritiro.numeroOrdineId);
        schedaOdp = scheda.odp || ritiro.numeroOrdine;
        nScheda = scheda.numeroScheda || "";
        cliente = scheda.clienteInfo || "";
        commessa = scheda.commessaNr || "";
      } catch { /* fallback ai dati ritiro */ }
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

    // ── Header ───────────────────────────────────────────────
    page.drawRectangle({ x: 0, y: height - 56, width, height: 56, color: hexToRgb("#111827") });
    page.drawText("MODAR", {
      x: margin, y: height - 38,
      size: 22, font: bold, color: rgb(1, 1, 1),
    });
    const dataStr = ritiro.dataTrasporto
      ? new Date(ritiro.dataTrasporto).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" })
      : "—";
    const dataW = helvetica.widthOfTextAtSize(dataStr, 13);
    page.drawText(dataStr, {
      x: width - margin - dataW, y: height - 36,
      size: 13, font: helvetica, color: rgb(0.7, 0.7, 0.7),
    });
    y = height - 56 - 20;

    // ── ODP ──────────────────────────────────────────────────
    const odpStr = schedaOdp || "—";
    const odpSize = 64;
    const odpW = bold.widthOfTextAtSize(odpStr, odpSize);
    page.drawText(odpStr, {
      x: (width - odpW) / 2, y: y - odpSize,
      size: odpSize, font: bold, color: hexToRgb("#111827"),
    });
    y = y - odpSize - 10;

    // ── N Scheda (sotto ODP, 20% più piccolo) ────────────────
    if (nScheda) {
      const nSchedaSize = Math.round(odpSize * 0.8);
      const nSchedaW = bold.widthOfTextAtSize(nScheda, nSchedaSize);
      page.drawText(nScheda, {
        x: (width - nSchedaW) / 2, y: y - nSchedaSize,
        size: nSchedaSize, font: bold, color: hexToRgb("#374151"),
      });
      y = y - nSchedaSize - 10;
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

    // ── Fornitore ────────────────────────────────────────────
    if (ritiro.fornitore) {
      page.drawText("FORNITORE", { x: margin, y, size: 9, font: helvetica, color: hexToRgb("#6B7280") });
      y -= 28;
      page.drawText(truncate(ritiro.fornitore.toUpperCase(), 40), {
        x: margin, y, size: 28, font: bold, color: hexToRgb("#111827"),
      });
      y -= 38;
    }

    // ── Cliente / Commessa ───────────────────────────────────
    if (cliente || commessa) {
      const clienteStr = [commessa, cliente].filter(Boolean).join(" — ");
      page.drawText("CLIENTE / COMMESSA", { x: margin, y, size: 9, font: helvetica, color: hexToRgb("#6B7280") });
      y -= 20;
      page.drawText(truncate(clienteStr, 50), {
        x: margin, y, size: 16, font: bold, color: hexToRgb("#374151"),
      });
      y -= 26;
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

    // ── Foto + QR (affiancati) ───────────────────────────────
    page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: hexToRgb("#E5E7EB") });
    y -= 16;

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

    // ── Footer ───────────────────────────────────────────────
    const footerY = 18;
    page.drawRectangle({ x: 0, y: 0, width, height: footerY + 6, color: hexToRgb("#F3F4F6") });
    const footerTxt = `MES Modar | ${ritiro.tipoMovimento} | ID: ${ritiro.id.slice(0, 8).toUpperCase()}`;
    page.drawText(footerTxt, {
      x: margin, y: footerY - 4,
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
